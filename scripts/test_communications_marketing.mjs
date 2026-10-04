import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./lib/communications-test-db.mjs";
import { createDelivery } from "../packages/communications/dist/index.js";

test("marketing rechecks consent and enforces two logical sends per seven days", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db } = fixture;
  const store = randomUUID();
  const worker = randomUUID();
  const connection = randomUUID();
  const contact = randomUUID();
  const identity = randomUUID();

  await db("store_locations").insert({ id: store });
  await db("directus_users").insert({ id: worker, status: "active", role: null });
  await db("comm_connections").insert({
    id: connection,
    platform: "telegram",
    external_id: "marketing-test-bot",
    name: "Marketing contract",
    enabled: true,
    mode: "test",
    store_id: store,
    worker_user_id: worker,
    secret_ref: "TEST_ONLY",
    marketing_enabled: true,
  });
  await db("comm_contacts").insert({ id: contact, name: "Test" });
  await db("comm_identities").insert({
    id: identity,
    contact_id: contact,
    connection_id: connection,
    external_user_id: "recipient-1",
    availability: "allowed",
    is_test: true,
  });
  await db("comm_subscriptions").insert({
    identity_id: identity,
    topic_key: "news_promotions",
    consent: true,
    consent_version: "test-v1",
  });
  await db("comm_runtime").where({ id: 1 }).update({
    active: true,
    sending_enabled: true,
    recovery_hold: false,
  });

  const outboxes = [];
  for (let index = 0; index < 3; index += 1) {
    const campaign = randomUUID();
    await db("comm_campaigns").insert({
      id: campaign,
      name: `Campaign ${index}`,
      topic_key: "news_promotions",
      state: "approved",
      created_by: worker,
      scheduled_at: new Date(0),
      is_test: true,
    });
    const [outbox] = await db("comm_outbox")
      .insert({
        connection_id: connection,
        contact_id: contact,
        identity_id: identity,
        campaign_id: campaign,
        purpose: "marketing",
        state: "pending",
        dedupe_key: `campaign:${campaign}:contact:${contact}`,
        due_at: new Date(0),
      })
      .returning("*");
    await db("comm_operations").insert({
      outbox_id: outbox.id,
      method: "text",
      payload: { peer_id: "recipient-1", text: `Message ${index}` },
    });
    outboxes.push(outbox);
  }

  const delivery = createDelivery(
    {
      database: db,
      services: {},
      getSchema: async () => ({}),
      env: { ISVOI_COMMUNICATIONS_ENABLED: true },
      now: () => new Date("2026-09-15T09:00:00.000Z"),
    },
    {
      userAccountability: async () => ({ roles: [] }),
      event: async () => {},
    },
  );

  await db("comm_runtime").where({ id: 1 }).update({ recovery_hold: true });
  assert.equal(await delivery.next(connection, worker), null);
  assert.equal((await db("comm_outbox").where({ id: outboxes[0].id }).first()).state, "pending");
  assert.equal(Number((await db("comm_frequency").count("* as n").first()).n), 0);
  assert.equal((await db("comm_subscriptions").where({ identity_id: identity }).first()).consent, true);
  await db("comm_runtime").where({ id: 1 }).update({ recovery_hold: false });

  for (let index = 0; index < 2; index += 1) {
    await db("comm_connections").where({ id: connection }).update({ send_after: new Date(0) });
    const operation = await delivery.next(connection, worker);
    assert.ok(operation);
    await delivery.complete(connection, worker, {
      attempt_id: operation.attempt_id,
      lease_version: operation.lease_version,
      outcome: { type: "accepted", externalId: `accepted-${index}` },
    });
  }

  await db("comm_connections").where({ id: connection }).update({ send_after: new Date(0) });
  assert.equal(await delivery.next(connection, worker), null);
  assert.equal((await db("comm_outbox").where({ id: outboxes[2].id }).first()).state, "suppressed");
  assert.equal(
    (await db("comm_outbox").where({ id: outboxes[2].id }).first()).error_code,
    "FREQUENCY_LIMIT",
  );
  assert.equal(Number((await db("comm_frequency").count("* as n").first()).n), 2);

  await db("comm_frequency").delete();
  await db("comm_subscriptions").where({ identity_id: identity }).update({ consent: false });
  const withdrawnCampaign = randomUUID();
  await db("comm_campaigns").insert({
    id: withdrawnCampaign,
    name: "Withdrawn consent campaign",
    topic_key: "news_promotions",
    state: "approved",
    created_by: worker,
    scheduled_at: new Date(0),
    is_test: true,
  });
  const [withdrawnOutbox] = await db("comm_outbox")
    .insert({
      connection_id: connection,
      contact_id: contact,
      identity_id: identity,
      campaign_id: withdrawnCampaign,
      purpose: "marketing",
      state: "pending",
      dedupe_key: `campaign:${withdrawnCampaign}:contact:${contact}`,
      due_at: new Date(0),
    })
    .returning("*");
  await db("comm_operations").insert({
    outbox_id: withdrawnOutbox.id,
    method: "text",
    payload: { peer_id: "recipient-1", text: "Withdrawn" },
  });
  await db("comm_connections").where({ id: connection }).update({ send_after: new Date(0) });
  assert.equal(await delivery.next(connection, worker), null);
  assert.equal((await db("comm_outbox").where({ id: withdrawnOutbox.id }).first()).state, "suppressed");
  assert.equal(
    (await db("comm_outbox").where({ id: withdrawnOutbox.id }).first()).error_code,
    "CONSENT_WITHDRAWN",
  );
  // Contact-wide refusal wins over topic consent, including an explicit pilot test.
  await db("comm_subscriptions").where({ identity_id: identity }).update({ consent: true });
  await db("comm_contacts").where({ id: contact }).update({ marketing_opt_out: true });
  for (const testDelivery of [false, true]) {
    await db("comm_outbox").where({ id: withdrawnOutbox.id }).update({ state: "pending", test_delivery: testDelivery });
    await db("comm_operations").where({ outbox_id: withdrawnOutbox.id }).update({ state: "pending" });
    assert.equal(await delivery.next(connection, worker), null);
    assert.equal((await db("comm_outbox").where({ id: withdrawnOutbox.id }).first()).error_code, "GLOBAL_OPT_OUT");
  }
});
