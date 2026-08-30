#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-production");
const sshKey = process.env.DIRECTUS_AUDIT_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
const sshTarget = process.env.DIRECTUS_AUDIT_SSH_TARGET || "deploy@217.114.14.32";
const remotePsql =
  process.env.DIRECTUS_AUDIT_REMOTE_PSQL ||
  "cd /opt/isvoi/infra/directus-beget && docker compose exec -T database psql -U isvoi -d isvoi -v ON_ERROR_STOP=1";

if (apply && !confirmed)
  throw new Error("Production publication requires --apply --confirm-production");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}

const governedFiles = [
  "scripts/trade_pricing_v3_data.mjs",
  "scripts/publish_directus_trade_pricing_v3_sql.mjs",
  "scripts/audit_directus_trade_pricing_v3_sql.mjs",
  "scripts/audit_directus_trade_mvp_sql.mjs",
  "scripts/run_directus_trade_pricing_v3_publish.mjs",
];
if (apply) {
  for (const file of governedFiles) run("git", ["ls-files", "--error-unmatch", file]);
  run("git", ["diff", "--exit-code", "--", ...governedFiles]);
}

const sql = run(process.execPath, [
  path.join(root, "scripts", "publish_directus_trade_pricing_v3_sql.mjs"),
  ...(apply ? [] : ["--rehearse"]),
]);

let backupPath = "not required for rehearsal";
if (apply) {
  const backupOutput = run("ssh", [
    "-i",
    sshKey,
    sshTarget,
    "cd /opt/isvoi && bash scripts/backup_beget_directus.sh",
  ]);
  backupPath = backupOutput.match(/Writing backup to\s+([^\r\n]+)/u)?.[1]?.trim() ?? "";
  if (!backupPath) throw new Error("Backup completed without a recognizable backup path");
}

run("ssh", ["-i", sshKey, sshTarget, remotePsql], { input: sql });

if (apply) {
  run(process.execPath, [
    path.join(root, "scripts", "run_directus_sql_audit.mjs"),
    "trade-pricing-v2",
    "trade-pricing-v3",
    "trade-mvp",
    "trade-governance",
    "trade-legal",
    "trade-runtime",
    "trade-studio",
  ]);
}

console.log(`Trade-in pricing v3 publication: ${apply ? "APPLIED" : "REHEARSED"}`);
console.log(`Backup: ${backupPath}`);
