import knex from "knex";
if (!process.env.COMM_HEALTH_DATABASE_URL) throw Error("READ_ONLY_DATABASE_URL_REQUIRED");
const db = knex({
  client: "pg",
  connection: process.env.COMM_HEALTH_DATABASE_URL,
  pool: { min: 0, max: 1 },
});
try {
  const r = (
    await db.raw(`SELECT (SELECT extract(epoch FROM now()-max(started_at))/60 FROM comm_backups WHERE state='completed' AND external_verified) AS backup_age_minutes,
 (SELECT count(*) FROM comm_outbox WHERE state IN ('uncertain','partial')) AS delivery_attention,
 (SELECT count(*) FROM comm_inbound WHERE state='failed') AS failed_events,
 (SELECT extract(epoch FROM now()-min(received_at)) FROM comm_inbound WHERE state='pending') AS oldest_inbound_seconds,
 (SELECT count(*) FROM comm_attachments WHERE state='quarantine' AND created_at<now()-interval '5 minutes') AS scanner_backlog`)
  ).rows[0];
  const alert =
    r.backup_age_minutes === null ||
    Number(r.backup_age_minutes) >= 45 ||
    Number(r.delivery_attention) > 0 ||
    Number(r.failed_events) > 0 ||
    Number(r.oldest_inbound_seconds) > 30 ||
    Number(r.scanner_backlog) > 0;
  console.log(JSON.stringify({ state: alert ? "attention" : "ok", ...r }));
  if (alert) process.exitCode = 2;
} finally {
  await db.destroy();
}
