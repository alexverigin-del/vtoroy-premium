import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire("/repo/package.json");
const knex = require("knex");

if (process.env.COMM_DISPOSABLE_LOAD_DATABASE !== "true")
  throw Error("DISPOSABLE_LOAD_DATABASE_REQUIRED");

const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
  pool: { min: 1, max: 10 },
});

const store = "10000000-0000-4000-8000-000000000001";
const connection = "30000000-0000-4000-8000-000000000001";
const campaign = "40000000-0000-4000-8000-000000000001";
const workerIds = Array.from(
  { length: 5 },
  (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const claimLatencies = [];

function percentile(values, percent) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)] || 0;
}

try {
  await db.raw(`
    CREATE TABLE store_locations(id uuid PRIMARY KEY);
    CREATE TABLE directus_roles(id uuid PRIMARY KEY,parent uuid);
    CREATE TABLE directus_users(id uuid PRIMARY KEY,status text,role uuid);
    CREATE TABLE directus_policies(id uuid PRIMARY KEY,admin_access boolean);
    CREATE TABLE directus_access(id uuid PRIMARY KEY,"user" uuid,role uuid,policy uuid);
    CREATE TABLE leads(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text,status text,assigned_to uuid,
      store_location_id uuid,is_test boolean,reference_code text,contact text,
      contact_channel text,message text,source text,source_path text
    );
    CREATE TABLE lead_comments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead uuid,created_by uuid,comment text,outcome text
    );
  `);
  await db.raw(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  await db("store_locations").insert({ id: store });
  await db("directus_users").insert(
    workerIds.map((id) => ({ id, status: "active", role: null })),
  );
  await db("comm_connections").insert({
    id: connection,
    platform: "telegram",
    external_id: "load-test",
    name: "Disposable load test",
    enabled: true,
    mode: "test",
    store_id: store,
    worker_user_id: workerIds[0],
    secret_ref: "DISPOSABLE",
    marketing_enabled: true,
  });
  await db("comm_campaigns").insert({
    id: campaign,
    name: "10k disposable audience",
    topic_key: "news_promotions",
    state: "approved",
    created_by: workerIds[0],
    scheduled_at: new Date(0),
    is_test: true,
  });

  await db.raw(`
    INSERT INTO comm_contacts(id,name)
    SELECT md5('load-contact-' || n)::uuid, 'Recipient ' || n
    FROM generate_series(1,10000) AS n;
  `);
  await db.raw(`
    INSERT INTO comm_identities(
      id,contact_id,connection_id,external_user_id,availability,first_seen_at,last_active_at,is_test,preferred
    )
    SELECT md5('load-identity-' || n)::uuid,md5('load-contact-' || n)::uuid,?::uuid,
           'recipient-' || n,'allowed',now(),now(),true,true
    FROM generate_series(1,10000) AS n;
  `, [connection]);
  await db.raw(`
    INSERT INTO comm_subscriptions(identity_id,topic_key,consent,consent_version)
    SELECT md5('load-identity-' || n)::uuid,'news_promotions',true,'load-v1'
    FROM generate_series(1,10000) AS n;
  `);
  await db.raw(`
    INSERT INTO comm_outbox(
      id,connection_id,contact_id,identity_id,campaign_id,purpose,state,dedupe_key,due_at,created_at
    )
    SELECT md5('load-outbox-' || n)::uuid,?::uuid,md5('load-contact-' || n)::uuid,
           md5('load-identity-' || n)::uuid,?::uuid,'marketing','pending',
           'load-campaign-recipient-' || n,to_timestamp(0),now()
    FROM generate_series(1,10000) AS n;
  `, [connection, campaign]);
  await db.raw(`
    INSERT INTO comm_operations(id,outbox_id,position,method,payload,state)
    SELECT md5('load-operation-' || n)::uuid,md5('load-outbox-' || n)::uuid,0,'text',
           jsonb_build_object('peer_id','recipient-' || n,'text','Load test'),'pending'
    FROM generate_series(1,10000) AS n;
  `);

  for (let index = 0; index < 5; index += 1) {
    const outbox = `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const operation = `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    await db("comm_outbox").insert({
      id: outbox,
      connection_id: connection,
      purpose: "service",
      state: "pending",
      dedupe_key: `load-service-${index + 1}`,
      due_at: new Date(0),
      created_at: new Date(),
    });
    await db("comm_operations").insert({
      id: operation,
      outbox_id: outbox,
      method: "text",
      payload: { peer_id: `service-${index + 1}`, text: "Priority service reply" },
    });
  }

  await db.raw(`
    CREATE UNLOGGED TABLE load_claims(
      claim_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      operation_id uuid NOT NULL UNIQUE,
      worker_id uuid NOT NULL,
      purpose text NOT NULL,
      claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);

  let duplicateRejected = false;
  try {
    await db("comm_outbox").insert({
      connection_id: connection,
      contact_id: db.raw("md5('load-contact-1')::uuid"),
      identity_id: db.raw("md5('load-identity-1')::uuid"),
      campaign_id: campaign,
      purpose: "marketing",
      dedupe_key: "deliberately-different-dedupe-key",
    });
  } catch (error) {
    duplicateRejected = error.code === "23505";
  }
  assert.equal(duplicateRejected, true, "one campaign cannot target one contact twice");

  const started = performance.now();
  async function drain(workerId) {
    let claimed = 0;
    while (true) {
      const claimStarted = performance.now();
      const count = await db.transaction(async (trx) => {
        const result = await trx.raw(`
          SELECT o.id AS operation_id,o.outbox_id,b.purpose
          FROM comm_operations o
          JOIN comm_outbox b ON b.id=o.outbox_id
          WHERE o.state='pending' AND b.state IN ('pending','sending') AND b.due_at<=now()
          ORDER BY CASE WHEN b.purpose IN ('service','staff') THEN 0 ELSE 1 END,b.created_at,b.id
          LIMIT 200
          FOR UPDATE OF o SKIP LOCKED
        `);
        const rows = result.rows;
        if (!rows.length) return 0;
        const operationIds = rows.map((row) => row.operation_id);
        const outboxIds = rows.map((row) => row.outbox_id);
        await trx("comm_operations").whereIn("id", operationIds).update({
          state: "accepted",
          worker_id: workerId,
          external_id: trx.raw("'load-' || id::text"),
        });
        await trx("comm_outbox").whereIn("id", outboxIds).update({
          state: "accepted",
          accepted_at: trx.fn.now(),
        });
        await trx("load_claims").insert(
          rows.map((row) => ({
            operation_id: row.operation_id,
            worker_id: workerId,
            purpose: row.purpose,
          })),
        );
        return rows.length;
      });
      claimLatencies.push(performance.now() - claimStarted);
      if (!count) return claimed;
      claimed += count;
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  const workerCounts = await Promise.all(workerIds.map(drain));
  const elapsedMs = performance.now() - started;
  const totals = await db("load_claims")
    .count("* as claimed")
    .countDistinct("operation_id as distinct_claimed")
    .first();
  const firstWave = await db("load_claims").where("claim_order", "<=", 1000);
  const states = await db("comm_outbox").select("state").count("* as count").groupBy("state");
  const serviceClaims = await db("load_claims").where({ purpose: "service" });

  assert.equal(Number(totals.claimed), 10005);
  assert.equal(Number(totals.distinct_claimed), 10005);
  assert.equal(serviceClaims.length, 5);
  assert.equal(firstWave.filter((row) => row.purpose === "service").length, 5);
  assert.deepEqual(states.map((row) => [row.state, Number(row.count)]), [["accepted", 10005]]);
  assert.equal(workerCounts.reduce((sum, count) => sum + count, 0), 10005);
  assert.ok(workerCounts.filter((count) => count > 0).length >= 2, "work is shared across workers");

  console.log(JSON.stringify({
    result: "PASS",
    postgres: (await db.raw("show server_version")).rows[0].server_version,
    recipients: 10000,
    service_jobs: 5,
    workers: 5,
    worker_claims: workerCounts,
    duplicate_campaign_target_rejected: duplicateRejected,
    all_service_jobs_within_first_1000_claims: true,
    claims_unique: true,
    elapsed_ms: Math.round(elapsedMs),
    throughput_per_second: Number((10005 / (elapsedMs / 1000)).toFixed(1)),
    transaction_p95_ms: Number(percentile(claimLatencies, 0.95).toFixed(1)),
  }, null, 2));
} finally {
  await db.destroy();
}
