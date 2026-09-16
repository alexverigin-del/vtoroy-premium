import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./lib/communications-test-db.mjs";
import {
  createManagement,
  createService,
  validRemoteImageURL,
} from "../packages/communications/dist/index.js";

test("omnichannel management protects settings and creates a pilot campaign without enabling bulk marketing", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db } = fixture;
  const store = randomUUID(), manager = randomUUID(), worker = randomUUID();
  const telegram = randomUUID(), max = randomUUID(), contact = randomUUID();
  const telegramIdentity = randomUUID(), maxIdentity = randomUUID();
  await db("store_locations").insert({ id: store });
  await db("directus_users").insert([
    { id: manager, status: "active", role: null },
    { id: worker, status: "active", role: null },
  ]);
  await db("comm_staff").insert({
    user_id: manager,
    store_id: store,
    enabled: true,
    can_manage: true,
    can_publish: true,
  });
  await db("comm_connections").insert([
    {
      id: telegram,
      platform: "telegram",
      external_id: "telegram-management",
      name: "Telegram",
      enabled: true,
      mode: "production",
      store_id: store,
      worker_user_id: worker,
      secret_ref: "TEST_TELEGRAM",
      settings: { pilot_user_ids: ["tg-pilot"], config_version: 1 },
      marketing_enabled: false,
    },
    {
      id: max,
      platform: "max",
      external_id: "max-management",
      name: "MAX",
      enabled: true,
      mode: "test",
      store_id: store,
      worker_user_id: worker,
      secret_ref: "TEST_MAX",
      settings: { pilot_user_ids: ["max-pilot"], config_version: 1 },
      marketing_enabled: false,
    },
  ]);
  await db("directus_files").insert({
    id: "00000000-0000-4000-8000-000000000001",
    type: "image/jpeg",
    filesize: 1000,
    filename_download: "welcome.jpg",
  });
  await db("comm_contacts").insert({ id: contact, name: "Пилот" });
  await db("comm_identities").insert([
    {
      id: telegramIdentity,
      contact_id: contact,
      connection_id: telegram,
      external_user_id: "tg-pilot",
      availability: "allowed",
      preferred: true,
    },
    {
      id: maxIdentity,
      contact_id: contact,
      connection_id: max,
      external_user_id: "max-pilot",
      availability: "allowed",
    },
  ]);
  await db("comm_threads").insert([
    { connection_id: telegram, identity_id: telegramIdentity, external_peer_id: "tg-pilot" },
    { connection_id: max, identity_id: maxIdentity, external_peer_id: "max-chat" },
  ]);
  await db("comm_subscriptions").insert([
    { identity_id: telegramIdentity, topic_key: "news_promotions", consent: true, consent_version: "v1" },
    { identity_id: maxIdentity, topic_key: "news_promotions", consent: true, consent_version: "v1" },
  ]);
  const context = {
    database: db,
    services: {},
    getSchema: async () => ({}),
    env: { ISVOI_COMMUNICATIONS_ENABLED: true, PUBLIC_URL: "https://api.isvoi.ru" },
  };
  const management = createManagement(context);
  const actor = { user: manager, accountability: {} };
  const overview = await management.overview(actor);
  assert.equal(overview.connections.length, 2);
  assert.equal(overview.test_recipients.length, 2);
  const settings = await management.updateConnection(actor, telegram, {
    key: randomUUID(),
    expected_version: 1,
    welcome_text: "Добро пожаловать",
    welcome_file_id: "00000000-0000-4000-8000-000000000001",
    consent_text: "Согласие",
    consent_version: "v2",
    subscriptions_enabled: true,
    subscriptions_pilot_only: true,
  });
  assert.equal(settings.settings.config_version, 2);
  assert.equal((await db("comm_connections").where({ id: telegram }).first()).marketing_enabled, false);
  const saved = await management.saveCampaign(actor, {
    key: randomUUID(),
    name: "Новости недели",
    topic_key: "news_promotions",
    connection_ids: [telegram, max],
    is_test: true,
    variants: [
      { platform: "telegram", text: "Новости в Telegram", cta_label: "Открыть", cta_url: "https://isvoi.ru/news" },
      { platform: "max", text: "Новости в MAX" },
    ],
  });
  const listed = await management.listCampaigns(actor);
  assert.equal(listed[0].estimated_recipients, 1, "one linked contact is counted once across channels");
  assert.equal(listed[0].version, 1);
  await management.action(actor, saved.id, {
    key: randomUUID(),
    action: "test",
    identity_id: telegramIdentity,
  });
  const testOutbox = await db("comm_outbox").where({ campaign_id: saved.id, test_delivery: true }).first();
  assert.ok(testOutbox);
  assert.equal(Number((await db("comm_frequency").count("* as count").first()).count), 0);
  await management.action(actor, saved.id, { key: randomUUID(), action: "review" });
  await assert.rejects(
    management.action(actor, saved.id, { key: randomUUID(), action: "approve", confirm: true }),
    /MARKETING_DISABLED/,
  );
  assert.equal((await db("comm_campaigns").where({ id: saved.id }).first()).state, "review");
});

test("audience directory opens a scoped subscriber card", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db } = fixture;
  const store = randomUUID(), manager = randomUUID(), worker = randomUUID();
  const connection = randomUUID(), contact = randomUUID(), identity = randomUUID();
  await db("store_locations").insert({ id: store });
  await db("directus_users").insert([
    { id: manager, status: "active", role: null },
    { id: worker, status: "active", role: null },
  ]);
  await db("comm_staff").insert({ user_id: manager, store_id: store, enabled: true, can_manage: true });
  await db("comm_connections").insert({
    id: connection, platform: "telegram", external_id: "audience", name: "Telegram",
    enabled: true, mode: "production", store_id: store, worker_user_id: worker, secret_ref: "TEST",
  });
  await db("comm_contacts").insert({ id: contact, name: "Подписчик" });
  await db("comm_identities").insert({
    id: identity, contact_id: contact, connection_id: connection, external_user_id: "12345",
    availability: "allowed", first_seen_at: new Date(), last_active_at: new Date(),
  });
  await db("comm_subscriptions").insert({ identity_id: identity, topic_key: "news_promotions", consent: true, consent_version: "v1" });
  const service = createService({ database: db, services: {}, getSchema: async () => ({}), env: { ISVOI_COMMUNICATIONS_ENABLED: true } });
  const actor = { user: manager, accountability: {} };
  const contacts = await service.audienceContacts(actor, { status: "subscribed" });
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].subscribed, true);
  const card = await service.audienceContact(actor, contact);
  assert.equal(card.contact.name, "Подписчик");
  assert.equal(card.identities.length, 1);
  assert.equal(card.subscriptions.length, 1);
});

test("remote campaign images accept only exact ISVOI asset URLs", () => {
  assert.equal(
    validRemoteImageURL(
      "https://api.isvoi.ru/assets/00000000-0000-4000-8000-000000000001",
    ),
    true,
  );
  assert.equal(validRemoteImageURL("https://example.com/asset"), false);
  assert.equal(validRemoteImageURL("https://api.isvoi.ru/assets/../../admin"), false);
});
