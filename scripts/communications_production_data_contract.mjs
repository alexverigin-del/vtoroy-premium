// Runs only inside an isolated PostgreSQL restored from a production dump.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { backfillTelegram, reconcileTelegram } from "./core.mjs";

if (
  process.env.COMM_DISPOSABLE_PRODUCTION_COPY !== "true" ||
  process.env.DB_HOST !== "comm-production-copy-db" ||
  process.env.DB_DATABASE !== "communications_production_copy"
)
  throw Error("DISPOSABLE_PRODUCTION_COPY_REQUIRED");

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
  const before = await fingerprints();
  await db.raw(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));

  const candidates = await db("telegram_bot_settings as settings")
    .join("telegram_routes as route", "route.bot_id", "settings.bot_id")
    .where({ "route.is_test": false })
    .distinct("settings.bot_id", "route.store_id");
  assert.equal(candidates.length, 1, "EXACTLY_ONE_PRODUCTION_TELEGRAM_ROUTE_REQUIRED");
  const candidate = candidates[0];
  const ids = { connection: randomUUID(), worker: randomUUID(), service: randomUUID() };
  const runtimeBefore = await db("comm_runtime")
    .where({ id: 1 })
    .first(["active", "sending_enabled", "recovery_hold"]);

  await db.transaction(async (trx) => {
    await trx("directus_users").insert([
      { id: ids.worker, status: "active" },
      { id: ids.service, status: "active" },
    ]);
    await trx("comm_connections").insert({
      id: ids.connection,
      platform: "telegram",
      external_id: String(candidate.bot_id),
      name: "Telegram production-copy rehearsal",
      enabled: false,
      mode: "production",
      store_id: candidate.store_id,
      worker_user_id: ids.worker,
      service_user_id: ids.service,
      secret_ref: "DISPOSABLE_COPY_NO_SECRET",
      settings: { rehearsal: true },
    });
  });

  const first = await backfillTelegram(db, ids.connection);
  const second = await backfillTelegram(db, ids.connection);
  const { sessions: secondSessions, ...secondReport } = second;
  const reconciled = await reconcileTelegram(db, ids.connection);
  const after = await fingerprints();
  const runtimeAfter = await db("comm_runtime")
    .where({ id: 1 })
    .first(["active", "sending_enabled", "recovery_hold"]);

  assert.deepEqual(after, before, "LEGACY_SOURCE_CHANGED");
  assert.deepEqual(runtimeAfter, runtimeBefore, "GLOBAL_RUNTIME_CHANGED");
  assert.equal(secondSessions, first.sessions, "BACKFILL_NOT_IDEMPOTENT");
  assert.deepEqual(reconciled, secondReport, "RECONCILIATION_CHANGED_AFTER_SECOND_BACKFILL");
  assert.ok(Object.values(first.missing).every((value) => value === 0), "MIGRATION_ROWS_MISSING");
  assert.equal(first.legacy_unresolved, 0, "LEGACY_DELIVERY_STILL_ACTIVE");
  assert.equal(first.data_ready, true, "PRODUCTION_COPY_NOT_DATA_READY");
  assert.equal(first.ready, false);
  assert.equal(first.reason, "CUTOVER_REQUIRES_LIVE_PILOT");
  await db("comm_connections").where({ id: ids.connection }).update({ enabled: true });
  await assert.rejects(
    () => backfillTelegram(db, ids.connection),
    (error) => error?.code === "BACKFILL_REQUIRES_DISABLED_CONNECTION",
  );
  await db("comm_connections").where({ id: ids.connection }).update({ enabled: false });

  console.log(
    JSON.stringify(
      {
        pass: true,
        production_copy: true,
        source_unchanged: true,
        repeated_backfill: true,
        target_connection_enabled: false,
        global_runtime_preserved: true,
        sessions: first.sessions,
        legacy_counts: Object.fromEntries(
          Object.entries(before).map(([table, value]) => [table, value.count]),
        ),
        missing: first.missing,
        legacy_unresolved: first.legacy_unresolved,
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
