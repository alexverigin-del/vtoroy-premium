#!/usr/bin/env bash
# Execute on the Linux server. Credentials come from its protected environment.
set -euo pipefail
umask 077
: "${COMM_BACKUP_ROOT:?}" "${COMM_PRIVATE_DIR:?}" "${COMM_OFFSITE_REMOTE:?}" "${COMM_DATABASE_URL:?}"
command -v rclone >/dev/null
command -v pg_dump >/dev/null
mkdir -p "$COMM_BACKUP_ROOT"
exec 9>"$COMM_BACKUP_ROOT/.backup.lock"
flock -n 9 || exit 0
id="$(psql "$COMM_DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(73119,1);
INSERT INTO comm_backups DEFAULT VALUES RETURNING id;
COMMIT;
SQL
)"
id="$(printf '%s\n' "$id" | sed '/^$/d' | tail -1)"
[[ "$id" =~ ^[0-9a-f-]{36}$ ]] || exit 1
target="$COMM_BACKUP_ROOT/$id"
mkdir "$target"
fail_backup(){ psql "$COMM_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -c "UPDATE comm_backups SET state='failed' WHERE id='$id' AND state='running'" >/dev/null || true; }
trap fail_backup EXIT
# Retention refuses deletion while a running backup exists. Files are immutable.
pg_dump "$COMM_DATABASE_URL" --format=custom --no-owner --no-acl --file="$target/database.dump"
psql "$COMM_DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -c "SELECT storage_key FROM comm_attachments WHERE storage_key IS NOT NULL ORDER BY storage_key" >"$target/media.list"
tar -C "$COMM_PRIVATE_DIR" -cf "$target/private-media.tar" --verbatim-files-from -T "$target/media.list"
(cd "$target" && sha256sum database.dump private-media.tar media.list >SHA256SUMS)
manifest="$(sha256sum "$target/SHA256SUMS" | cut -d' ' -f1)"
rclone copy "$target" "$COMM_OFFSITE_REMOTE/$id" --immutable
# Download comparison verifies content even when the remote exposes no compatible hash.
rclone check "$target" "$COMM_OFFSITE_REMOTE/$id" --download --one-way
psql "$COMM_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -c "UPDATE comm_backups SET state='completed',completed_at=now(),external_verified=true,manifest_sha256='$manifest' WHERE id='$id'; UPDATE comm_runtime SET last_backup_at=now() WHERE id=1" >/dev/null
trap - EXIT
printf 'COMM_BACKUP_VERIFIED %s\n' "$id"
