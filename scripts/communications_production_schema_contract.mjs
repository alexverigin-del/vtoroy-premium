// Runs against a schema-only production export populated exclusively with synthetic rows.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { backfillTelegram, reconcileTelegram } from "./core.mjs";

if (
  process.env.COMM_DISPOSABLE_SCHEMA !== "true" ||
  process.env.DB_HOST !== "comm-schema-db" ||
  process.env.DB_DATABASE !== "communications_schema"
)
  throw Error("DISPOSABLE_SCHEMA_REQUIRED");

const apiPath = "/directus/node_modules/@directus/api/dist";
const { default: getDatabase } = await import(`${apiPath}/database/index.js`);
const db = getDatabase();
const legacyTables = [
  "lead_conversations",
  "lead_messages",
  "telegram_bot_settings",
  "telegram_client_sessions",
  "telegram_deliveries",
  "telegram_link_tokens",
  "telegram_message_outbox",
  "telegram_notification_topics",
  "telegram_receipts",
  "telegram_reply_drafts",
  "telegram_routes",
  "telegram_runtime",
  "telegram_staff",
  "telegram_subscription_events",
  "telegram_subscriptions",
];

async function fingerprints() {
  const result = {};
  for (const table of legacyTables) {
    const value = await db.raw(
      `SELECT count(*)::int AS count,
       md5(coalesce(string_agg(row_hash,'' ORDER BY row_hash),'')) AS fingerprint
       FROM (SELECT md5(to_jsonb(source_row)::text) AS row_hash FROM ?? source_row) rows`,
      [table],
    );
    result[table] = value.rows[0];
  }
  return result;
}

try {
  const ids = {
    manager: randomUUID(),
    worker: randomUUID(),
    service: randomUUID(),
    store: randomUUID(),
    lead: randomUUID(),
    route: randomUUID(),
    delivery: randomUUID(),
    session: randomUUID(),
    conversation: randomUUID(),
    incoming: randomUUID(),
    outgoing: randomUUID(),
    draft: randomUUID(),
    subscription: randomUUID(),
    consentEvent: randomUUID(),
    outbox: randomUUID(),
    receipt: randomUUID(),
  };
  const botId = 8908725708,
    clientId = 900001;
  await db.transaction(async (trx) => {
    await trx("directus_users").insert(
      [ids.manager, ids.worker, ids.service].map((id) => ({ id, status: "active" })),
    );
    await trx("store_locations").insert({
      id: ids.store,
      slug: "synthetic-store",
      name: "Synthetic Store",
      city: "Synthetic",
    });
    await trx("leads").insert({
      id: ids.lead,
      contact: "synthetic-contact",
      status: "new",
      store_location_id: ids.store,
      assigned_to: ids.manager,
      is_test: false,
    });
    await trx("telegram_bot_settings").insert({ bot_id: botId });
    await trx("telegram_routes").insert({
      id: ids.route,
      store_id: ids.store,
      bot_id: botId,
      chat_id: -900001,
      is_test: false,
      enabled: true,
    });
    await trx("telegram_staff").insert({
      route_id: ids.route,
      telegram_user_id: 900002,
      directus_user: ids.manager,
      enabled: true,
    });
    await trx("telegram_runtime").insert({ bot_id: botId, update_offset: 44 });
    await trx("telegram_deliveries").insert({
      id: ids.delivery,
      lead_id: ids.lead,
      route_id: ids.route,
      topic_id: 700001,
      message_id: 700002,
      state: "done",
    });
    await trx("telegram_client_sessions").insert({
      id: ids.session,
      bot_id: botId,
      user_id: clientId,
      chat_id: clientId,
      entry_source: "synthetic",
      subscription_draft: JSON.stringify(["news"]),
    });
    await trx("lead_conversations").insert({
      id: ids.conversation,
      lead_id: ids.lead,
      route_id: ids.route,
      bot_id: botId,
      client_user_id: clientId,
      client_chat_id: clientId,
    });
    await trx("telegram_client_sessions")
      .where({ id: ids.session })
      .update({ conversation_id: ids.conversation });
    await trx("lead_messages").insert([
      {
        id: ids.incoming,
        conversation_id: ids.conversation,
        direction: "in",
        text: "Synthetic incoming",
        photo_file_id: "synthetic-photo-ref",
        telegram_message_id: 800001,
      },
      {
        id: ids.outgoing,
        conversation_id: ids.conversation,
        direction: "out",
        text: "Synthetic reply",
        created_by: ids.manager,
        telegram_message_id: 800002,
      },
    ]);
    await trx("telegram_reply_drafts").insert({
      id: ids.draft,
      conversation_id: ids.conversation,
      staff_user: ids.manager,
      telegram_user_id: 900002,
      state: "preview",
      text: "Synthetic draft",
      photo_file_id: "synthetic-draft-photo-ref",
      prompt_message_id: 810001,
      preview_message_id: 810002,
      expires_at: new Date(Date.now() + 600_000),
    });
    await trx("telegram_link_tokens").insert({
      token_hash: "a".repeat(64),
      lead_id: ids.lead,
      bot_id: botId,
      expires_at: new Date(Date.now() + 600_000),
    });
    await trx("telegram_notification_topics").insert({ key: "news", label: "News" });
    await trx("telegram_subscriptions").insert({
      id: ids.subscription,
      bot_id: botId,
      session_id: ids.session,
      topic_key: "news",
      status: "active",
      consent_version: "synthetic-v1",
      consented_at: trx.fn.now(),
      source: "synthetic",
    });
    await trx("telegram_subscription_events").insert({
      id: ids.consentEvent,
      subscription_id: ids.subscription,
      event: "subscribed",
      source: "synthetic",
      consent_version: "synthetic-v1",
    });
    await trx("telegram_message_outbox").insert({
      id: ids.outbox,
      bot_id: botId,
      route_id: ids.route,
      conversation_id: ids.conversation,
      destination: "group",
      purpose: "card",
      payload: { text: "Synthetic staff card" },
      state: "done",
      telegram_message_id: 820001,
      sent_at: trx.fn.now(),
      is_test: false,
    });
    await trx("telegram_receipts").insert({
      id: ids.receipt,
      bot_id: botId,
      update_id: 44,
      result_code: "handled",
    });
  });

  const before = await fingerprints();
  await db.raw(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  await db("comm_connections").insert({
    id: randomUUID(),
    platform: "telegram",
    external_id: String(botId),
    name: "Production schema fixture",
    enabled: false,
    mode: "production",
    store_id: ids.store,
    worker_user_id: ids.worker,
    service_user_id: ids.service,
    secret_ref: "SCHEMA_FIXTURE_NO_SECRET",
  });
  const connection = await db("comm_connections").first();
  const first = await backfillTelegram(db, connection.id);
  assert.equal(first.data_ready, true);
  assert.equal(first.ready, false);
  assert.equal(first.reason, "CUTOVER_REQUIRES_LIVE_PILOT");
  assert.ok(Object.values(first.missing).every((value) => value === 0));
  const second = await backfillTelegram(db, connection.id);
  const { sessions: secondSessions, ...secondReport } = second;
  assert.equal(secondSessions, first.sessions);
  assert.deepEqual(await reconcileTelegram(db, connection.id), secondReport);
  const after = await fingerprints();
  assert.deepEqual(after, before, "LEGACY_SOURCE_CHANGED");
  const runtime = await db("comm_runtime").where({ id: 1 }).first();
  assert.equal(runtime.active, false);
  assert.equal(runtime.sending_enabled, false);
  assert.equal(runtime.recovery_hold, true);
  console.log(
    JSON.stringify(
      {
        pass: true,
        production_rows_copied: 0,
        synthetic_sessions: first.sessions,
        source_unchanged: true,
        external_sends_enabled: false,
        missing: first.missing,
        data_ready: first.data_ready,
        ready: first.ready,
        reason: first.reason,
      },
      null,
      2,
    ),
  );
} finally {
  await db.destroy();
}
