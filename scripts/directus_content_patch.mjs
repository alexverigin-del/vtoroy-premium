#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  applyPatchToRow,
  assertLockMatches,
  buildDiff,
  buildSelectorSql,
  buildUpdateSql,
  captureLock,
  quoteIdentifier,
  validatePatch,
} from "./lib/directus-content-patch.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}
if (!args.file) throw new Error("Missing --file <patch.json>");
if (args.apply && args.captureLock)
  throw new Error("--apply and --capture-lock cannot be combined");

const patchPath = path.resolve(root, args.file);
const patch = validatePatch(JSON.parse(fs.readFileSync(patchPath, "utf8")), {
  requireLock: args.apply,
});
if (args.apply && args.confirm !== patch.id) {
  throw new Error(`Apply requires --confirm ${patch.id}`);
}
if (args.apply) assertCommittedPatchFile(patchPath);

const connection = createConnection();
const schema = fetchSchema(connection, patch.collection);
const current = fetchSingleRow(connection, patch.collection, patch.selector);
const { row, snapshotHash: currentHash } = current;

if (args.captureLock) {
  const prepared = captureLock(patch, row, currentHash);
  fs.writeFileSync(patchPath, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");
  console.log(`Lock captured in ${path.relative(root, patchPath)}`);
  console.log(`snapshotHash: ${prepared.lock.snapshotHash}`);
  if (prepared.lock.versionField) {
    console.log(`${prepared.lock.versionField}: ${prepared.lock.versionValue}`);
  }
  process.exit(0);
}

assertLockMatches(patch, row, currentHash);
const { desired, touchedRoots } = applyPatchToRow(row, patch, schema);
const diff = buildDiff(row, desired, patch);
printSummary(patch, row, currentHash, diff);

if (diff.every((item) => JSON.stringify(item.before) === JSON.stringify(item.after))) {
  throw new Error("Patch is a no-op; no production values would change");
}

const rehearsalSql = buildUpdateSql({
  patch,
  desired,
  touchedRoots,
  currentHash,
  commit: false,
});
expectMarker(connection.runPsql(rehearsalSql), "content_patch.rehearsal|ok");
console.log("SQL rehearsal: passed and rolled back");

if (!args.apply) {
  console.log(`Preview complete. Apply with --apply --confirm ${patch.id}`);
  process.exit(0);
}

const backupOutput = connection.runRemote("cd /opt/isvoi && bash scripts/backup_beget_directus.sh");
const backupPath = backupOutput.match(/Writing backup to\s+([^\r\n]+)/u)?.[1]?.trim();
if (!backupPath) throw new Error("Backup completed without a recognizable backup path");
console.log(`Backup verified: ${backupPath}`);

const fresh = fetchSingleRow(connection, patch.collection, patch.selector);
const { row: freshRow, snapshotHash: freshHash } = fresh;
assertLockMatches(patch, freshRow, freshHash);

const applySql = buildUpdateSql({
  patch,
  desired,
  touchedRoots,
  currentHash: freshHash,
  commit: true,
});
expectMarker(connection.runPsql(applySql), "content_patch.apply|ok");

connection.runRemote(
  "cd /opt/isvoi/infra/directus-beget && docker compose restart directus >/dev/null && for i in $(seq 1 30); do curl -fsS https://api.isvoi.ru/server/health >/dev/null && exit 0; sleep 2; done; exit 1",
);
if ((patch.revalidate ?? "site-content") === "site-content") {
  connection.runRemote(
    'cd /opt/isvoi && set -a && . apps/web/.env.local && set +a && curl -fsS -X POST -H "x-isvoi-revalidate-secret: $SITE_REVALIDATION_SECRET" https://isvoi.ru/api/revalidate/site-content >/dev/null',
  );
}

const verifiedRow = fetchSingleRow(connection, patch.collection, patch.selector).row;
for (const item of buildDiff(freshRow, verifiedRow, patch)) {
  const expected = diff.find((candidate) => candidate.path === item.path)?.after;
  if (JSON.stringify(item.after) !== JSON.stringify(expected)) {
    throw new Error(`Post-apply verification failed for ${item.path}`);
  }
}
console.log(`Content patch applied: ${patch.id}`);
console.log(`Backup: ${backupPath}`);

function parseArgs(values) {
  const parsed = { apply: false, captureLock: false, help: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--apply") parsed.apply = true;
    else if (value === "--capture-lock") parsed.captureLock = true;
    else if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--file" || value === "--confirm") {
      const next = values[index + 1];
      if (!next) throw new Error(`${value} requires a value`);
      parsed[value.slice(2)] = next;
      index += 1;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run directus:content-patch -- --file directus/content-patches/<patch>.json --capture-lock
  npm run directus:content-patch -- --file directus/content-patches/<patch>.json
  npm run directus:content-patch -- --file directus/content-patches/<patch>.json --apply --confirm <patch-id>

Default mode reads production, prints a field-level diff and runs SQL inside a rolled-back transaction.
Apply mode requires a committed, unchanged patch file and creates a verified Directus backup first.`);
}

function createConnection() {
  const sshKey = process.env.DIRECTUS_PATCH_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
  const sshTarget = process.env.DIRECTUS_PATCH_SSH_TARGET || "deploy@217.114.14.32";
  const remotePsql =
    process.env.DIRECTUS_PATCH_REMOTE_PSQL ||
    "cd /opt/isvoi/infra/directus-beget && docker compose exec -T database psql -U isvoi -d isvoi -v ON_ERROR_STOP=1 -qAt";
  const local =
    process.env.DIRECTUS_PATCH_LOCAL === "1" ||
    (process.platform !== "win32" && root.startsWith("/opt/isvoi"));

  function runProgram(command, programArgs, input) {
    const result = spawnSync(command, programArgs, {
      input,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `${command} failed`);
    }
    return result.stdout;
  }

  return {
    runPsql(sql) {
      return local
        ? runProgram("bash", ["-lc", remotePsql], sql)
        : runProgram("ssh", ["-i", sshKey, sshTarget, remotePsql], sql);
    },
    runRemote(command) {
      return local
        ? runProgram("bash", ["-lc", command])
        : runProgram("ssh", ["-i", sshKey, sshTarget, command]);
    },
  };
}

function fetchSchema(connection, collection) {
  const sql = `SELECT COALESCE(jsonb_object_agg(column_name, jsonb_build_object('dataType', data_type, 'udtName', udt_name)), '{}'::jsonb)::text
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '${collection}';`;
  const schema = parseSingleJson(connection.runPsql(sql));
  if (Object.keys(schema).length === 0)
    throw new Error(`Collection table does not exist: ${collection}`);
  return schema;
}

function fetchSingleRow(connection, collection, selector) {
  const sql = `SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
FROM (
  SELECT jsonb_build_object(
    'row', to_jsonb(t),
    'snapshotHash', encode(digest(convert_to(to_jsonb(t)::text, 'UTF8'), 'sha256'), 'hex')
  ) AS row_data
  FROM public.${quoteIdentifier(collection)} AS t
  WHERE ${buildSelectorSql(selector, "t")}
  LIMIT 2
) AS selected;`;
  const rows = parseSingleJson(connection.runPsql(sql));
  if (rows.length !== 1) {
    throw new Error(`Selector must match exactly one row; matched ${rows.length}`);
  }
  return rows[0];
}

function parseSingleJson(output) {
  const value = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("{") || line.startsWith("["));
  if (!value) throw new Error(`Expected JSON from psql, got: ${output.trim()}`);
  return JSON.parse(value);
}

function expectMarker(output, marker) {
  if (!output.includes(marker)) throw new Error(`Missing SQL success marker ${marker}: ${output}`);
}

function printSummary(patch, row, hash, diff) {
  console.log(`Patch: ${patch.id}`);
  console.log(`Collection: ${patch.collection}`);
  console.log(`Selector: ${JSON.stringify(patch.selector)}`);
  console.log(`Snapshot: ${hash}`);
  console.log(`Matched id: ${row.id ?? "<no id field>"}`);
  console.log("Diff:");
  for (const item of diff) {
    console.log(`- ${item.path}`);
    console.log(`  before: ${JSON.stringify(item.before)}`);
    console.log(`  after:  ${JSON.stringify(item.after)}`);
  }
}

function assertCommittedPatchFile(filePath) {
  const relative = path.relative(root, filePath).replaceAll("\\", "/");
  if (relative.startsWith("../") || !relative.startsWith("directus/content-patches/")) {
    throw new Error("Apply requires a patch file under directus/content-patches/");
  }
  for (const gitArgs of [
    ["ls-files", "--error-unmatch", "--", relative],
    ["diff", "--quiet", "--", relative],
    ["diff", "--cached", "--quiet", "--", relative],
  ]) {
    const result = spawnSync("git", gitArgs, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`Patch file must be tracked, committed and unchanged: ${relative}`);
    }
  }

  const fileCommit = spawnSync("git", ["log", "-1", "--format=%H", "--", relative], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  if (!fileCommit) throw new Error(`Patch file has no commit: ${relative}`);
  const published = spawnSync("git", ["merge-base", "--is-ancestor", fileCommit, "origin/master"], {
    cwd: root,
    encoding: "utf8",
  });
  if (published.status !== 0) {
    throw new Error(`Patch commit ${fileCommit.slice(0, 7)} is not present in origin/master`);
  }
}
