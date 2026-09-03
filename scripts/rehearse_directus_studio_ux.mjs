#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { effectiveSectionContentSql } from "./lib/studio-section-content.mjs";

// A separate resource-limited PostgreSQL process holds the disposable copy.
// Never execute migration/audit SQL in the production PostgreSQL process.
const container = `isvoi-studio-ux-${randomBytes(6).toString("hex")}`;
const target = process.env.DIRECTUS_AUDIT_SSH_TARGET || "deploy@217.114.14.32";
if (target.endsWith("@217.114.14.32") && !process.argv.includes("--allow-production-host")) {
  console.error(
    "Set DIRECTUS_AUDIT_SSH_TARGET to a staging host. Same-host rehearsal requires an agreed maintenance window and --allow-production-host; never run alongside a deploy/build.",
  );
  process.exit(1);
}
const key = process.env.DIRECTUS_AUDIT_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
function generate(name) {
  const result = spawnSync(process.execPath, [`scripts/${name}.mjs`], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}
const workspace = generate("setup_directus_studio_workspace_sql");
const content = generate("setup_directus_studio_content_sql");
const capture = `
CREATE TEMP TABLE ux_business_before AS SELECT c.collection,t.id,t.row FROM directus_collections c
CROSS JOIN LATERAL (SELECT NULL::text id,NULL::jsonb row LIMIT 0) t WITH NO DATA;
DO $$ DECLARE c record; BEGIN
FOR c IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'directus_%' LOOP
 EXECUTE format('INSERT INTO ux_business_before SELECT %L, to_jsonb(t)->>''id'', to_jsonb(t)-ARRAY[''editor_label'',''editor_note'',''editor_disclaimer'',''editor_steps'',''editor_proof''] FROM %I t',c.tablename,c.tablename);
END LOOP; END $$;
CREATE TEMP TABLE ux_personal_before AS SELECT to_jsonb(p) row FROM directus_presets p WHERE "user" IS NOT NULL;
CREATE TEMP TABLE ux_permissions_before AS SELECT to_jsonb(p) row FROM directus_permissions p;
CREATE TEMP TABLE ux_access_before AS SELECT to_jsonb(p) row FROM directus_access p;
CREATE TEMP TABLE ux_content_before AS SELECT id,${effectiveSectionContentSql("s")} content FROM page_sections s;
`;
const assertBusiness = `DO $$ DECLARE c record; bad boolean; BEGIN
FOR c IN SELECT DISTINCT collection FROM ux_business_before LOOP
 EXECUTE format('SELECT EXISTS((SELECT to_jsonb(t)-ARRAY[''editor_label'',''editor_note'',''editor_disclaimer'',''editor_steps'',''editor_proof''] FROM %I t EXCEPT SELECT row FROM ux_business_before WHERE collection=%L) UNION ALL (SELECT row FROM ux_business_before WHERE collection=%L EXCEPT SELECT to_jsonb(t)-ARRAY[''editor_label'',''editor_note'',''editor_disclaimer'',''editor_steps'',''editor_proof''] FROM %I t))',c.collection,c.collection,c.collection,c.collection) INTO bad;
 IF bad THEN RAISE EXCEPTION 'Business data changed: %',c.collection; END IF;
END LOOP;
IF EXISTS((SELECT to_jsonb(p) FROM directus_presets p WHERE "user" IS NOT NULL EXCEPT SELECT row FROM ux_personal_before) UNION ALL (SELECT row FROM ux_personal_before EXCEPT SELECT to_jsonb(p) FROM directus_presets p WHERE "user" IS NOT NULL)) THEN RAISE EXCEPTION 'Personal presets changed'; END IF;
IF EXISTS((SELECT to_jsonb(p) FROM directus_access p EXCEPT SELECT row FROM ux_access_before) UNION ALL (SELECT row FROM ux_access_before EXCEPT SELECT to_jsonb(p) FROM directus_access p)) THEN RAISE EXCEPTION 'Policy membership changed'; END IF;
END $$;`;
const assertContent = `DO $$ BEGIN
IF EXISTS(SELECT 1 FROM page_sections s JOIN ux_content_before b ON b.id=s.id WHERE ${effectiveSectionContentSql("s")} IS DISTINCT FROM coalesce(b.content,'{}'::jsonb)) THEN
 RAISE EXCEPTION 'Rendered content changed after backfill';
END IF; END $$;`;
const described = spawnSync(
  process.execPath,
  ["scripts/run_directus_sql_audit.mjs", "--describe"],
  { encoding: "utf8" },
);
if (described.status !== 0) throw new Error(described.stderr);
const { definitions, order } = JSON.parse(described.stdout);
const checks = order
  .map((name) => generate(definitions[name].script.replace(/^scripts\//, "").replace(/\.mjs$/, "")))
  .join("\n");
const sql = `\\set ON_ERROR_STOP on
SET statement_timeout='45s';
SET lock_timeout='3s';
SET jit=off;
SET work_mem='4MB';
SET max_parallel_workers_per_gather=0;
${capture}
${workspace}
DO $$ BEGIN IF EXISTS((SELECT to_jsonb(p) FROM directus_permissions p EXCEPT SELECT row FROM ux_permissions_before) UNION ALL (SELECT row FROM ux_permissions_before EXCEPT SELECT to_jsonb(p) FROM directus_permissions p)) THEN RAISE EXCEPTION 'Permissions changed in UX wave 1'; END IF; END $$;
${assertBusiness}
${content}
${assertBusiness}
${assertContent}
${workspace}
${content}
${assertBusiness}
${assertContent}
${checks}
DROP TABLE IF EXISTS pg_temp.page_sections;
BEGIN;
UPDATE page_sections SET editor_proof=NULL,editor_steps=NULL,editor_note=NULL,editor_disclaimer=NULL WHERE id=(SELECT id FROM page_sections ORDER BY id LIMIT 1);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM page_sections WHERE id=(SELECT id FROM page_sections ORDER BY id LIMIT 1) AND (editor_proof::jsonb IS DISTINCT FROM '[]'::jsonb OR editor_steps::jsonb IS DISTINCT FROM '[]'::jsonb OR editor_note IS DISTINCT FROM '' OR editor_disclaimer IS DISTINCT FROM '')) THEN RAISE EXCEPTION 'Native repeater clear did not persist'; END IF;
END $$;
${content.replace(/\\set ON_ERROR_STOP on\s*BEGIN;/, "\n").replace(/COMMIT;\s*$/, "")}
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM page_sections WHERE id=(SELECT id FROM page_sections ORDER BY id LIMIT 1) AND (editor_proof::jsonb IS DISTINCT FROM '[]'::jsonb OR editor_note IS DISTINCT FROM '')) THEN RAISE EXCEPTION 'Repeated setup restored cleared content'; END IF;
END $$;
ROLLBACK;
SELECT 'studio_rehearsal.business_content_personal_presets' AS check_name,'0' AS value;
`;
const command = `set -euo pipefail
cd /opt/isvoi/infra/directus-beget
docker image inspect postgres:16-alpine >/dev/null
test "$(awk '/MemAvailable/ {print $2}' /proc/meminfo)" -gt 1572864
cleanup() { docker rm -f ${container} </dev/null >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker run --pull=never --rm -d --name ${container} --network none --memory=512m --memory-swap=512m --cpus=0.5 --pids-limit=128 --tmpfs /var/lib/postgresql/data:rw,size=256m -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=isvoi -e POSTGRES_DB=isvoi postgres:16-alpine postgres -c shared_buffers=32MB -c work_mem=4MB -c jit=off -c statement_timeout=45000 -c max_parallel_workers_per_gather=0 </dev/null >/dev/null
ready=0
for attempt in $(seq 1 30); do
  # The bootstrap server accepts Unix sockets before initdb finishes; wait for the final TCP listener.
  if docker exec ${container} pg_isready -h 127.0.0.1 -U isvoi -d isvoi </dev/null >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" -eq 1
docker compose exec -T database pg_dump -U isvoi -d isvoi --no-owner --no-acl </dev/null | docker exec -i ${container} psql -U isvoi -d isvoi -q -v ON_ERROR_STOP=1 >/dev/null
docker exec -i ${container} psql -U isvoi -d isvoi -qAt -v ON_ERROR_STOP=1`;
const result = spawnSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ServerAliveInterval=10",
    "-o",
    "ServerAliveCountMax=2",
    "-i",
    key,
    target,
    command,
  ],
  {
    input: sql,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 240000,
  },
);
if (result.status !== 0) {
  console.error(
    `Rehearsal failed for ${container}: ${result.error?.message || result.stderr || "SSH process failed"}`,
  );
  process.exit(1);
}
const rows = result.stdout
  .split(/\r?\n/)
  .filter((line) => /^[a-z][a-z0-9_]*\.[a-z0-9_.]+\|/.test(line));
const byName = new Map(rows.map((line) => line.split("|")));
const failures = [];
for (const name of order) {
  const definition = definitions[name];
  const expected = {
    ...Object.fromEntries((definition.zero ?? []).map((key) => [key, "0"])),
    ...definition.equals,
  };
  const failed = Object.entries(expected).filter(
    ([key, value]) => byName.get(key) !== String(value),
  );
  failures.push(
    ...failed.map(
      ([key, value]) => `${key}: expected ${value}, got ${byName.get(key) ?? "missing"}`,
    ),
  );
  console.log(
    `${name}: ${failed.length ? "FAIL" : "PASS"} (${Object.keys(expected).length} checks)`,
  );
}
if (byName.get("studio_rehearsal.business_content_personal_presets") !== "0")
  failures.push("Rehearsal invariant result missing");
if (failures.length) {
  console.error("Studio rehearsal audit failed", failures);
  process.exit(1);
}
console.log("Isolated PostgreSQL container removed. Source production database was not modified.");
