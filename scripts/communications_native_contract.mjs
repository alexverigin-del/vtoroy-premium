// Real Directus 11.17.4 services and PostgreSQL 16; disposable network/database only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  createService,
  createDelivery,
  createAttachments,
  createStaff,
  reconcileTelegram,
} from "./core.mjs";
if (
  process.env.COMM_DISPOSABLE_FIXTURE !== "true" ||
  process.env.DB_HOST !== "comm-db" ||
  process.env.DB_DATABASE !== "communications_test"
)
  throw Error("DISPOSABLE_FIXTURE_REQUIRED");
const path = "/directus/node_modules/@directus/api/dist";
const { default: getDatabase } = await import(`${path}/database/index.js`),
  { ItemsService } = await import(`${path}/services/items.js`),
  { getSchema } = await import(`${path}/utils/get-schema.js`);
const db = getDatabase(),
  store = randomUUID(),
  otherStore = randomUUID(),
  worker = randomUUID(),
  intake = randomUUID(),
  connection = randomUUID(),
  deniedManager = randomUUID();
const managers = Array.from({ length: 5 }, () => randomUUID());
try {
  await db.raw(`CREATE TABLE store_locations(id uuid PRIMARY KEY,city text);
 CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text NOT NULL DEFAULT 'new',assigned_to uuid REFERENCES directus_users(id),kind text,reference_code text,contact text,contact_channel text,message text,source text,source_path text,store_location_id uuid REFERENCES store_locations(id),is_test boolean NOT NULL DEFAULT false);
 CREATE TABLE lead_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead uuid REFERENCES leads(id),created_by uuid REFERENCES directus_users(id),comment text,outcome text);
 CREATE TABLE lead_conversations(id uuid PRIMARY KEY,lead_id uuid,bot_id text);
 CREATE TABLE lead_messages(id uuid PRIMARY KEY,conversation_id uuid,direction text,text text,telegram_message_id bigint,photo_file_id text);
 CREATE TABLE telegram_routes(id uuid PRIMARY KEY,bot_id text,store_id uuid,is_test boolean,chat_id bigint);
 CREATE TABLE telegram_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id uuid,telegram_user_id bigint,directus_user uuid,enabled boolean);
 CREATE TABLE telegram_client_sessions(id uuid PRIMARY KEY,bot_id text,user_id bigint,chat_id bigint);
 CREATE TABLE telegram_subscriptions(id uuid PRIMARY KEY,bot_id text,session_id uuid,topic_key text,status text,consented_at timestamptz,revoked_at timestamptz);
 CREATE TABLE telegram_subscription_events(id uuid PRIMARY KEY,subscription_id uuid,event text);
 CREATE TABLE telegram_link_tokens(token_hash char(64),bot_id text,lead_id uuid,expires_at timestamptz);
 CREATE TABLE telegram_deliveries(id uuid PRIMARY KEY,route_id uuid,lead_id uuid);
 CREATE TABLE telegram_reply_drafts(id uuid PRIMARY KEY,conversation_id uuid);
 CREATE TABLE telegram_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bot_id text,update_id bigint);
 CREATE TABLE telegram_runtime(bot_id text,update_offset bigint);
 CREATE TABLE telegram_message_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bot_id text,destination text,state text);`);
  for (const collection of ["store_locations", "leads", "lead_comments"]) {
    await db("directus_collections").insert({ collection, accountability: "all" });
    await db("directus_fields").insert({ collection, field: "id", special: "uuid" });
  }
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await db.raw(sql);
  await db.raw(sql);
  await db("store_locations").insert([
    { id: store, city: "Test" },
    { id: otherStore, city: "Other" },
  ]);
  await db("directus_users").insert(
    [worker, intake, deniedManager, ...managers].map((id) => ({
      id,
      status: "active",
      first_name: "Fixture",
    })),
  );
  const policy = async (user, permissions) => {
    const id = randomUUID();
    await db("directus_policies").insert({
      id,
      name: "Fixture",
      admin_access: false,
      app_access: true,
    });
    await db("directus_access").insert({ id: randomUUID(), user, policy: id });
    await db("directus_permissions").insert(
      permissions.map((p) => ({
        ...p,
        policy: id,
        permissions: JSON.stringify(p.permissions || {}),
        validation: JSON.stringify(p.validation || {}),
      })),
    );
    return id;
  };
  await policy(intake, [
    {
      collection: "leads",
      action: "create",
      fields: "*",
      validation: { _and: [{ store_location_id: { _eq: store } }, { is_test: { _eq: true } }] },
    },
  ]);
  for (const user of managers)
    await policy(user, [
        {
          collection: "leads",
          action: "read",
          fields: "*",
          permissions: { store_location_id: { _eq: store } },
        },
        {
          collection: "leads",
          action: "update",
          fields: "status,assigned_to",
          permissions: { store_location_id: { _eq: store } },
        },
        {
          collection: "lead_comments",
          action: "create",
          fields: "*",
          validation: { created_by: { _eq: "$CURRENT_USER" } },
        },
      ]);
  await policy(deniedManager, [
    {
      collection: "leads",
      action: "read",
      fields: "*",
      permissions: { store_location_id: { _eq: store } },
    },
    {
      collection: "leads",
      action: "update",
      fields: "status,assigned_to",
      permissions: { store_location_id: { _eq: store } },
    },
  ]);
  await db("comm_staff").insert(
    [...managers, deniedManager].map((user) => ({
      user_id: user,
      store_id: store,
      can_manage: true,
    })),
  );
  await db("comm_connections").insert({
    id: connection,
    platform: "telegram",
    external_id: "123456",
    name: "Fixture",
    enabled: true,
    store_id: store,
    worker_user_id: worker,
    service_user_id: intake,
    secret_ref: "FIXTURE",
    settings: { pilot_user_ids: ["123", "124"] },
  });
  assert.deepEqual(await reconcileTelegram(db, connection), {
    missing: {
      routes: 0,
      staff: 0,
      sessions: 0,
      conversations: 0,
      messages: 0,
      message_attachments: 0,
      subscriptions: 0,
      consent_events: 0,
      tokens: 0,
      staff_cards: 0,
      staff_drafts: 0,
      receipts: 0,
      accepted_staff_outbox: 0,
      cursor: 0,
    },
    legacy_unresolved: 0,
    data_ready: true,
    ready: false,
    reason: "CUTOVER_REQUIRES_LIVE_PILOT",
  });
  await db("telegram_message_outbox").insert({ bot_id: "123456", state: "pending" });
  const unresolvedMigration = await reconcileTelegram(db, connection);
  assert.equal(unresolvedMigration.data_ready, false);
  assert.equal(unresolvedMigration.ready, false);
  assert.equal(unresolvedMigration.legacy_unresolved, 1);
  assert.equal(unresolvedMigration.reason, "CUTOVER_DATA_NOT_RECONCILED");
  await db("telegram_message_outbox").delete();
  await db("comm_runtime").update({ active: true, sending_enabled: true, recovery_hold: false });
  const context = {
    database: db,
    services: { ItemsService },
    getSchema: () => getSchema({ bypassCache: true }),
    env: {
      ISVOI_COMMUNICATIONS_ENABLED: true,
      ISVOI_COMMUNICATIONS_PRIVATE_DIR: "/tmp/communications-private-fixture",
    },
  };
  const service = createService(context),
    delivery = createDelivery(context, service),
    files = createAttachments(context, service);
  createStaff(context, service);
  const raw = (id, actor = 123, text = "Вопрос клиента") => ({
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      from: { id: actor, is_bot: false },
      chat: { id: actor, type: "private" },
      text,
    },
  });
  await service.ingest(connection, raw(1));
  await service.ingest(connection, raw(1));
  await service.processIncoming(connection);
  const c = await db("comm_conversations").first();
  assert.ok(c);
  assert.equal(Number((await db("leads").count("* as n").first()).n), 1);
  const actors = await Promise.all(managers.map((id) => service.actor(id)));
  const claims = await Promise.allSettled(
    actors.map((a) =>
      service.commands(a, {
        type: "claim",
        key: randomUUID(),
        conversation_id: c.id,
        expected_version: c.version,
        payload: {},
      }),
    ),
  );
  assert.equal(
    claims.filter((r) => r.status === "fulfilled").length,
    1,
    "one winner among five operators",
  );
  const lead = await db("leads").where({ id: c.lead_id }).first(),
    owner = actors.find((a) => a.user === lead.assigned_to);
  assert.equal(
    (
      await db("directus_activity")
        .where({ collection: "leads", action: "update", item: lead.id })
        .first()
    ).user,
    owner.user,
  );
  const current = await db("comm_conversations").where({ id: c.id }).first();
  const reply = {
    type: "reply",
    key: randomUUID(),
    conversation_id: c.id,
    expected_version: current.version,
    payload: { text: "Ответ менеджера" },
  };
  const replyResult = await service.commands(owner, reply);
  assert.deepEqual(await service.commands(owner, reply), replyResult);
  assert.equal(
    Number((await db("comm_messages").where({ direction: "out" }).count("* as n").first()).n),
    1,
  );
  const legacyLead = randomUUID();
  await db("leads").insert({
    id: legacyLead,
    status: "in_progress",
    assigned_to: null,
    kind: "support",
    reference_code: "LEGACY-NULL-STORE",
    store_location_id: null,
  });
  await db("comm_conversations").insert({
    id: randomUUID(),
    thread_id: c.thread_id,
    lead_id: legacyLead,
    handling: "queued",
  });
  await db("leads").where({ id: legacyLead }).update({ assigned_to: owner.user });
  await db("lead_comments").insert({
    lead: legacyLead,
    created_by: owner.user,
    comment: "Legacy lead reply audit",
    outcome: "note",
  });
  assert.equal(
    Number((await db("lead_comments").where({ lead: legacyLead }).count("* as n").first()).n),
    1,
    "legacy communication lead inherits its connection store for assignment and comments",
  );
  const deniedActor = await service.actor(deniedManager);
  const deny = {
    type: "note",
    key: randomUUID(),
    conversation_id: c.id,
    expected_version: replyResult.version,
    payload: { text: "Must roll back" },
  };
  await assert.rejects(service.commands(deniedActor, deny));
  assert.equal(
    Number((await db("comm_messages").where({ text: "Must roll back" }).count("* as n").first()).n),
    0,
  );
  // Link flow uses real PostgreSQL locks and Directus permissions; no provider API calls.
  const targetConnection = randomUUID(), targetContact = randomUUID(), targetIdentity = randomUUID(), targetThread = randomUUID();
  await db("comm_connections").where({ id: connection }).update({ bot_username: "fixture_bot" });
  await db("comm_connections").insert({ id: targetConnection, platform: "max", external_id: "fixture-max",
    name: "MAX fixture", enabled: true, mode: "production", store_id: store,
    worker_user_id: worker, secret_ref: "UNUSED_FIXTURE", bot_username: "fixture_max_bot" });
  await db("comm_contacts").insert({ id: targetContact });
  const sourceIdentity = (await db("comm_threads").where({ id: c.thread_id }).first()).identity_id;
  const source = await db("comm_identities").where({ id: sourceIdentity }).first();
  await db("comm_identities").insert({ id: targetIdentity, contact_id: targetContact, connection_id: targetConnection,
    external_user_id: "max-fixture", is_test: source.is_test, availability: "allowed" });
  await db("comm_threads").insert({ id: targetThread, connection_id: targetConnection,
    identity_id: targetIdentity, external_peer_id: "max-fixture-chat" });
  assert.equal((await service.linkOptions(owner, c.id))[0].id, targetConnection);
  const invitation = { type: "link_start", key: randomUUID(), conversation_id: c.id,
    expected_version: (await db("comm_conversations").where({ id: c.id }).first()).version,
    payload: { target_connection_id: targetConnection } };
  const issued = await service.commands(owner, invitation);
  assert.deepEqual(await service.commands(owner, invitation), issued);
  assert.equal("url" in issued, false, "Studio command receipt never reveals the capability");
  const notice = await db("comm_operations").whereRaw("payload->>'text' like '%/link link_%'").first();
  const token = notice.payload.text.match(/\/link (link_[A-Za-z0-9_-]{43})/)[1];
  assert.equal(notice.payload.reply_markup.inline_keyboard[0][0].url, `https://max.ru/fixture_max_bot?start=${token}`);
  const link = await db("comm_link_tokens").where({ source_identity_id: sourceIdentity, state: "pending" }).first();
  const hash = Buffer.from(link.hash, "hex").toString("base64url");
  const postIdentity = async (identityId, text, kind = "callback") => {
    const identity = await db("comm_identities").where({ id: identityId }).first();
    const n = await db("comm_connections").where({ id: identity.connection_id }).first();
    const t = await db("comm_threads").where({ identity_id: identityId }).first();
    const id = randomUUID();
    await db("comm_inbound").insert({ connection_id: n.id, external_id: id,
      event: { id, kind, text, platform: n.platform, actorId: identity.external_user_id,
        peerId: t.external_peer_id, callbackData: kind === "callback" ? text : null,
        attachments: [], externalMessageId: id, occurredAt: new Date().toISOString() } });
    await service.processIncoming(n.id);
    assert.equal((await db("comm_inbound").where({ external_id: id }).first()).state, "done");
  };
  await postIdentity(targetIdentity, `/start ${token}`, "message");
  await postIdentity(targetIdentity, `link:t:${hash}`);
  const confirmation = await db("comm_link_tokens").where({ hash: link.hash }).first();
  assert.ok(new Date(confirmation.expires_at).getTime() > Date.now() + 14 * 60000);
  await postIdentity(targetIdentity, `link:t:${hash}`);
  assert.equal(new Date((await db("comm_link_tokens").where({ hash: link.hash }).first()).expires_at).getTime(),
    new Date(confirmation.expires_at).getTime(), "repeated confirmation does not renew the deadline");
  assert.equal(Number((await db("comm_operations").whereRaw("payload->>'text' like 'Аккаунт % подтвердил связь.%'").count("* as n").first()).n), 1);
  assert.equal((await db("comm_identities").where({ id: targetIdentity }).first()).contact_id, targetContact);
  await postIdentity(sourceIdentity, `link:s:${hash}`);
  await postIdentity(sourceIdentity, `link:s:${hash}`);
  await postIdentity(targetIdentity, `link:t:${hash}`);
  assert.equal(Number((await db("comm_identity_links").where({ hash: link.hash }).count("* as n").first()).n), 1);
  const card = await service.audienceContact(owner, source.contact_id);
  assert.equal(card.identities.length, 2);
  assert.equal(await db("comm_access_grants").where({ identity_id: targetIdentity, lead_id: legacyLead }).first(), undefined);
  const changes = await Promise.allSettled(actors.map(actor => service.contactAction(actor, source.contact_id, {
    key: randomUUID(), expected_version: card.contact.version, identity_id: targetIdentity, action: "prefer",
  })));
  assert.equal(changes.filter(result => result.status === "fulfilled").length, 1, "one preference update wins among five operators");
  const latestCard = await service.audienceContact(owner, source.contact_id);
  const split = await service.contactAction(owner, source.contact_id, { key: randomUUID(),
    expected_version: latestCard.contact.version, identity_id: targetIdentity, action: "unlink" });
  assert.ok(split.detached_contact_id);
  assert.ok((await db("comm_access_grants").where({ identity_id: targetIdentity, lead_id: c.lead_id }).first()).revoked_at);
  await postIdentity(targetIdentity, "/dialogs", "message");
  const menu = await db("comm_operations as op").join("comm_outbox as out", "out.id", "op.outbox_id")
    .where("out.thread_id", targetThread).orderBy("out.created_at", "desc").select("op.payload").first();
  assert.equal(JSON.stringify(menu.payload).includes(c.lead_id), false, "revoked shared case is hidden from bot dialog picker");
  await db("comm_staff").where({ user_id: owner.user }).update({ enabled: false });
  await assert.rejects(service.messages(owner, c.thread_id, { conversation_id: c.id }));
  await assert.rejects(service.commands(owner, reply));
  await assert.rejects(
    files.upload(
      owner,
      c.id,
      (async function* () {
        yield Buffer.from("hello");
      })(),
      { name: "x.txt", mime: "text/plain", size: 5 },
    ),
  );
  for (const accountability of [
    { user: null, role: null, roles: [], admin: false },
    { user: worker, role: null, roles: [], admin: false },
  ]) {
    const items = new ItemsService("leads", {
      knex: db,
      schema: await getSchema({ bypassCache: true }),
      accountability,
    });
    await assert.rejects(items.readByQuery({ fields: ["id"], limit: 1 }));
  }
  const first = await delivery.next(connection, worker);
  assert.ok(first);
  await db("comm_operations")
    .where({ id: first.id })
    .update({ lease_until: new Date(0) });
  await db("comm_connections")
    .where({ id: connection })
    .update({ send_after: new Date(0) });
  await delivery.next(connection, worker);
  assert.equal((await db("comm_operations").where({ id: first.id }).first()).state, "uncertain");
  await delivery.complete(connection, worker, {
    attempt_id: first.attempt_id,
    lease_version: first.lease_version,
    outcome: { type: "accepted", externalId: "500" },
  });
  assert.equal((await db("comm_operations").where({ id: first.id }).first()).state, "accepted");
  console.log(
    "PASS native Directus/PostgreSQL: repeat migration, cutover gate, intake dedupe, five-operator claim and preference races, two-party identity link, scoped grant, unlink, replay, permission rollback, private upload, worker/public denied, unknown lease and late receipt.",
  );
} finally {
  await db.destroy();
}
