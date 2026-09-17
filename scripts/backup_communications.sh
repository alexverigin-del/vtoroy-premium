#!/usr/bin/env bash
# Production backup: PostgreSQL snapshot plus deterministic Directus/private media bundles.
set -euo pipefail
umask 077

: "${COMM_BACKUP_ROOT:?COMM_BACKUP_ROOT is required}"
: "${COMM_STACK_DIR:?COMM_STACK_DIR is required}"
: "${COMM_OFFSITE_REMOTE:?COMM_OFFSITE_REMOTE is required}"
: "${RCLONE_CONFIG:?RCLONE_CONFIG is required}"

COMM_PRIVATE_DIR="${COMM_PRIVATE_DIR:-$COMM_STACK_DIR/private-communications}"
COMM_DIRECTUS_UPLOADS_DIR="${COMM_DIRECTUS_UPLOADS_DIR:-$COMM_STACK_DIR/uploads}"
COMM_LOCAL_RETENTION_HOURS="${COMM_LOCAL_RETENTION_HOURS:-6}"
COMM_LIVE_S3_REMOTE="${COMM_LIVE_S3_REMOTE:-}"
COMM_LIVE_S3_RCLONE_CONFIG="${COMM_LIVE_S3_RCLONE_CONFIG:-}"
COMPOSE_FILE="$COMM_STACK_DIR/docker-compose.yml"

if test -n "$COMM_LIVE_S3_REMOTE" || test -n "$COMM_LIVE_S3_RCLONE_CONFIG"; then
  test -n "$COMM_LIVE_S3_REMOTE" && test -n "$COMM_LIVE_S3_RCLONE_CONFIG" \
    || { echo "Live S3 backup configuration is incomplete" >&2; exit 1; }
fi

for command_name in docker rclone sha256sum flock find sort xargs tar stat wc; do
  command -v "$command_name" >/dev/null || { echo "Missing command: $command_name" >&2; exit 1; }
done
test -f "$COMPOSE_FILE"
test -f "$RCLONE_CONFIG"
test -z "$COMM_LIVE_S3_RCLONE_CONFIG" || test -f "$COMM_LIVE_S3_RCLONE_CONFIG"
test -d "$COMM_DIRECTUS_UPLOADS_DIR"
[[ "$COMM_LOCAL_RETENTION_HOURS" =~ ^[1-9][0-9]*$ ]] \
  || { echo "COMM_LOCAL_RETENTION_HOURS must be a positive integer" >&2; exit 1; }
mkdir -p "$COMM_BACKUP_ROOT" "$COMM_PRIVATE_DIR"

exec 9>"$COMM_BACKUP_ROOT/.backup.lock"
flock -n 9 || { echo "COMM_BACKUP_SKIPPED_LOCKED"; exit 0; }

compose() {
  docker compose -f "$COMPOSE_FILE" --project-directory "$COMM_STACK_DIR" "$@"
}
db_query() {
  compose exec -T database sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtq -v ON_ERROR_STOP=1'
}

id="$(cat <<'SQL' | db_query | sed '/^$/d' | tail -1
BEGIN;
SELECT pg_advisory_xact_lock(73119,1);
INSERT INTO comm_backups DEFAULT VALUES RETURNING id;
COMMIT;
SQL
)"
[[ "$id" =~ ^[0-9a-f-]{36}$ ]] || { echo "Could not register backup" >&2; exit 1; }

target="$COMM_BACKUP_ROOT/$id"
remote_root="${COMM_OFFSITE_REMOTE%/}"
remote_snapshot="$remote_root/snapshots/$id"
mkdir "$target"
combined_rclone_config=""

fail_backup() {
  local code="${1:-BACKUP_FAILED}"
  test -z "$combined_rclone_config" || rm -f "$combined_rclone_config"
  if [[ "$id" =~ ^[0-9a-f-]{36}$ ]]; then
    printf "UPDATE comm_backups SET state='failed',error_code='%s' WHERE id='%s' AND state='running';\n" "$code" "$id" | db_query >/dev/null || true
  fi
}
trap 'fail_backup BACKUP_FAILED' EXIT

compose exec -T database sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' >"$target/database.dump"
compose exec -T database sh -c 'exec pg_restore --list' <"$target/database.dump" >/dev/null

file_list() {
  local source_dir="$1" exclude_directus_health="$2"
  cd "$source_dir"
  if test "$exclude_directus_health" = 1; then
    find . -type f ! -path './directus-health-file' -print0
  else
    find . -type f -print0
  fi
}
write_manifest() {
  local source_dir="$1" output_file="$2" exclude_directus_health="$3"
  file_list "$source_dir" "$exclude_directus_health" | sort -z | (
    cd "$source_dir"
    xargs -0 -r sha256sum
  ) >"$output_file"
}
write_bundle() {
  local source_dir="$1" output_file="$2" exclude_directus_health="$3"
  file_list "$source_dir" "$exclude_directus_health" | sort -z | (
    cd "$source_dir"
    tar --null --no-recursion --mtime='@0' --owner=0 --group=0 --numeric-owner -cf "$output_file" --files-from=-
  )
  tar -tf "$output_file" >/dev/null
}

write_manifest "$COMM_PRIVATE_DIR" "$target/private-media.sha256" 0
write_manifest "$COMM_DIRECTUS_UPLOADS_DIR" "$target/directus-uploads.sha256" 1
write_bundle "$COMM_PRIVATE_DIR" "$target/private-media.tar" 0
write_bundle "$COMM_DIRECTUS_UPLOADS_DIR" "$target/directus-media.tar" 1
cat <<'SQL' | db_query | sed '/^$/d' >"$target/s3-media.sha256"
SELECT sha256 || '  ' || storage_key
FROM comm_attachments
WHERE storage_driver='s3' AND storage_key IS NOT NULL AND sha256 IS NOT NULL
ORDER BY storage_key;
SQL

private_bundle_sha256="$(sha256sum "$target/private-media.tar" | cut -d' ' -f1)"
directus_bundle_sha256="$(sha256sum "$target/directus-media.tar" | cut -d' ' -f1)"
printf '%s  private-media.tar\n' "$private_bundle_sha256" >"$target/private-bundle.sha256"
printf '%s  directus-media.tar\n' "$directus_bundle_sha256" >"$target/directus-bundle.sha256"

private_count="$(wc -l <"$target/private-media.sha256" | tr -d ' ')"
directus_count="$(wc -l <"$target/directus-uploads.sha256" | tr -d ' ')"
s3_count="$(wc -l <"$target/s3-media.sha256" | tr -d ' ')"
database_bytes="$(stat -c %s "$target/database.dump")"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$target/metadata.json" <<EOF
{"version":3,"backup_id":"$id","created_at":"$created_at","database_format":"postgresql-custom","database_bytes":$database_bytes,"private_file_count":$private_count,"s3_file_count":$s3_count,"directus_file_count":$directus_count,"private_bundle_sha256":"$private_bundle_sha256","directus_bundle_sha256":"$directus_bundle_sha256"}
EOF

(
  cd "$target"
  sha256sum database.dump private-media.sha256 s3-media.sha256 directus-uploads.sha256 private-bundle.sha256 directus-bundle.sha256 metadata.json >SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
  tar --mtime='@0' --owner=0 --group=0 --numeric-owner -cf snapshot.tar \
    database.dump private-media.sha256 s3-media.sha256 directus-uploads.sha256 private-bundle.sha256 directus-bundle.sha256 metadata.json SHA256SUMS
)
snapshot_sha256="$(sha256sum "$target/snapshot.tar" | cut -d' ' -f1)"

mkdir "$target/bundle-private" "$target/bundle-directus"
mv "$target/private-media.tar" "$target/bundle-private/$private_bundle_sha256.tar"
mv "$target/directus-media.tar" "$target/bundle-directus/$directus_bundle_sha256.tar"
rclone copy "$target/bundle-private" "$remote_root/bundles-v1/private" --config "$RCLONE_CONFIG" --immutable --checksum
rclone copy "$target/bundle-directus" "$remote_root/bundles-v1/directus" --config "$RCLONE_CONFIG" --immutable --checksum
rclone check "$target/bundle-private" "$remote_root/bundles-v1/private" --config "$RCLONE_CONFIG" --one-way --checksum
rclone check "$target/bundle-directus" "$remote_root/bundles-v1/directus" --config "$RCLONE_CONFIG" --one-way --checksum

if test -n "$COMM_LIVE_S3_REMOTE"; then
  combined_rclone_config="$(mktemp "${TMPDIR:-/tmp}/isvoi-rclone.XXXXXX")"
  { cat "$RCLONE_CONFIG"; printf '\n'; cat "$COMM_LIVE_S3_RCLONE_CONFIG"; } \
    >"$combined_rclone_config"
  chmod 600 "$combined_rclone_config"
  backup_remote_name="${COMM_OFFSITE_REMOTE%%:*}:"
  live_remote_name="${COMM_LIVE_S3_REMOTE%%:*}:"
  test "$backup_remote_name" != "$live_remote_name"
  rclone listremotes --config "$combined_rclone_config" | grep -Fx "$backup_remote_name" >/dev/null
  rclone listremotes --config "$combined_rclone_config" | grep -Fx "$live_remote_name" >/dev/null
  rclone copy "${COMM_LIVE_S3_REMOTE%/}" "$remote_root/objects-v1/private-s3" \
    --config "$combined_rclone_config" --immutable --size-only
  rclone check "${COMM_LIVE_S3_REMOTE%/}" "$remote_root/objects-v1/private-s3" \
    --config "$combined_rclone_config" --one-way --size-only
elif test "$s3_count" -ne 0; then
  echo "S3 attachments exist but live S3 backup is not configured" >&2
  exit 1
fi

rclone copy "$target/snapshot.tar" "$remote_snapshot" --config "$RCLONE_CONFIG" --immutable --checksum
rclone check "$target/snapshot.tar" "$remote_snapshot" --config "$RCLONE_CONFIG" --one-way --download
remote_snapshot_sha256="$(rclone cat "$remote_snapshot/snapshot.tar" --config "$RCLONE_CONFIG" | sha256sum | cut -d' ' -f1)"
test "$remote_snapshot_sha256" = "$snapshot_sha256"

printf "UPDATE comm_backups SET state='completed',completed_at=now(),external_verified=true,verified_at=now(),manifest_sha256='%s',remote_key='snapshots/%s',database_bytes=%s,directus_file_count=%s,private_file_count=%s,s3_file_count=%s,error_code=NULL WHERE id='%s'; UPDATE comm_runtime SET last_backup_at=now() WHERE id=1;\n" \
  "$snapshot_sha256" "$id" "$database_bytes" "$directus_count" "$private_count" "$s3_count" "$id" | db_query >/dev/null
test -z "$combined_rclone_config" || rm -f "$combined_rclone_config"
trap - EXIT

# Keep incomplete or unverified local snapshots for investigation. Only a directory whose
# database receipt confirms successful S3 readback may leave the fast local restore window.
while IFS= read -r expired_id; do
  [[ "$expired_id" =~ ^[0-9a-f-]{36}$ ]] || { echo "Invalid backup id during pruning" >&2; exit 1; }
  expired_target="$COMM_BACKUP_ROOT/$expired_id"
  if test -d "$expired_target" && ! test -L "$expired_target"; then
    rm -rf -- "$expired_target"
  fi
done < <(
  printf "SELECT id FROM comm_backups WHERE external_verified AND completed_at < now()-make_interval(hours => %s);\n" \
    "$COMM_LOCAL_RETENTION_HOURS" | db_query
)
printf 'COMM_BACKUP_VERIFIED %s snapshot_sha256=%s database_bytes=%s directus_files=%s private_files=%s s3_files=%s\n' \
  "$id" "$snapshot_sha256" "$database_bytes" "$directus_count" "$private_count" "$s3_count"
