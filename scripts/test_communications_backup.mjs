import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [backup, health, restore, service, timer, schema, envExample, installer] = await Promise.all([
  read("scripts/backup_communications.sh"),
  read("scripts/check_communications_backup.sh"),
  read("scripts/rehearse_communications_restore.sh"),
  read("infra/communications/isvoi-communications-backup.service"),
  read("infra/communications/isvoi-communications-backup.timer"),
  read("packages/communications/schema.sql"),
  read("infra/communications/communications-backup.env.example"),
  read("scripts/install_communications_backup_on_host.sh"),
]);

assert.match(backup, /flock -n/);
assert.match(backup, /pg_dump[\s\S]*--format=custom/);
assert.match(backup, /pg_restore --list/);
assert.match(backup, /objects-v2\/private/);
assert.match(backup, /objects-v2\/directus/);
assert.match(backup, /stage_content_pool/);
assert.match(backup, /cp --reflink=auto/);
assert.match(backup, /--exclude '\/object-pool-\*\/\*\*'/);
assert.match(backup, /rclone check[\s\S]*--download/);
assert.ok(
  backup.indexOf("rclone check") < backup.indexOf("_COMPLETE"),
  "completion marker must be created after remote verification",
);
assert.ok(
  backup.lastIndexOf("_COMPLETE") < backup.indexOf("state='completed'"),
  "database state must be completed only after the remote marker",
);
assert.match(backup, /--immutable/);
assert.doesNotMatch(backup, /rclone copyto/);
assert.match(backup, /remote_completion="\$remote_root\/completed\/\$id"/);
assert.match(backup, /rclone copy "\$target\/_COMPLETE" "\$remote_completion"/);
assert.match(backup, /rclone cat "\$remote_completion\/_COMPLETE"/);
assert.doesNotMatch(backup, /access_key_id\s*=/i);
assert.doesNotMatch(backup, /secret_access_key\s*=/i);

assert.match(health, /COMM_BACKUP_WARN_MINUTES:-45/);
assert.match(health, /completed\/\$backup_id\/_COMPLETE/);
assert.match(health, /\^\[0-9a-f\]\{64\}\$/);
assert.match(restore, /--network none/);
assert.match(restore, /--memory 768m/);
assert.match(restore, /pg_restore[\s\S]*--exit-on-error/);
assert.match(restore, /sha256sum -c/);
assert.match(restore, /restore_manifest/);
assert.match(restore, /objects-v2\/directus/);
assert.match(restore, /completed\/\$COMM_RESTORE_BACKUP_ID/);
assert.match(service, /ProtectSystem=strict/);
assert.match(service, /ConditionPathExists=\/etc\/isvoi\/communications-backup\.env/);
assert.match(timer, /OnCalendar=\*-\*-\* \*:00,30:00/);
assert.match(timer, /Persistent=true/);
for (const column of [
  "verified_at",
  "remote_key",
  "database_bytes",
  "directus_file_count",
  "private_file_count",
  "error_code",
]) assert.match(schema, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
assert.match(envExample, /force_path_style = true/);
assert.doesNotMatch(envExample, /[A-Za-z0-9]{24,}:[A-Za-z0-9/+]{24,}/);
assert.match(installer, /apt-get install -y -qq rclone/);
assert.match(installer, /chmod 0600 "\$ENV_FILE" "\$RCLONE_FILE"/);
assert.match(installer, /COMM_BACKUP_INSTALLED_AWAITING_PROTECTED_CREDENTIALS/);

console.log("PASS communications S3 backup contract: immutable object pools, verified snapshots, completion marker, 30-minute timer, freshness check and isolated restore.");
