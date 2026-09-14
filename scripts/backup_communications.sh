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
COMM_LOCAL_RETENTION_HOURS="${COMM_LOCAL_RETENTION_HOURS:-48}"
COMPOSE_FILE="$COMM_STACK_DIR/docker-compose.yml"

for command_name in docker rclone sha256sum flock find sort xargs tar stat wc; do
  command -v "$command_name" >/dev/null || { echo "Missing command: $command_name" >&2; exit 1; }
done
test -f "$COMPOSE_FILE"
test -f "$RCLONE_CONFIG"
test -d "$COMM_DIRECTUS_UPLOADS_DIR"
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

fail_backup() {
  local code="${1:-BACKUP_FAILED}"
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
    tar --null --files-from=- --no-recursion --mtime='@0' --owner=0 --group=0 --numeric-owner -cf "$output_file"
  )
  tar -tf "$output_file" >/dev/null
}

write_manifest "$COMM_PRIVATE_DIR" "$target/private-media.sha256" 0
write_manifest "$COMM_DIRECTUS_UPLOADS_DIR" "$target/directus-uploads.sha256" 1
write_bundle "$COMM_PRIVATE_DIR" "$target/private-media.tar" 0
write_bundle "$COMM_DIRECTUS_UPLOADS_DIR" "$target/directus-media.tar" 1

private_bundle_sha256="$(sha256sum "$target/private-media.tar" | cut -d' ' -f1)"
directus_bundle_sha256="$(sha256sum "$target/directus-media.tar" | cut -d' ' -f1)"
printf '%s  private-media.tar\n' "$private_bundle_sha256" >"$target/private-bundle.sha256"
printf '%s  directus-media.tar\n' "$directus_bundle_sha256" >"$target/directus-bundle.sha256"

private_count="$(wc -l <"$target/private-media.sha256" | tr -d ' ')"
directus_count="$(wc -l <"$target/directus-uploads.sha256" | tr -d ' ')"
database_bytes="$(stat -c %s "$target/database.dump")"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$target/metadata.json" <<EOF
{"version":2,"backup_id":"$id","created_at":"$created_at","database_format":"postgresql-custom","database_bytes":$database_bytes,"private_file_count":$private_count,"directus_file_count":$directus_count,"private_bundle_sha256":"$private_bundle_sha256","directus_bundle_sha256":"$directus_bundle_sha256"}
EOF

(
  cd "$target"
  sha256sum database.dump private-media.sha256 directus-uploads.sha256 private-bundle.sha256 directus-bundle.sha256 metadata.json >SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
  tar --mtime='@0' --owner=0 --group=0 --numeric-owner -cf snapshot.tar \
    database.dump private-media.sha256 directus-uploads.sha256 private-bundle.sha256 directus-bundle.sha256 metadata.json SHA256SUMS
)
snapshot_sha256="$(sha256sum "$target/snapshot.tar" | cut -d' ' -f1)"

mkdir "$target/bundle-private" "$target/bundle-directus"
mv "$target/private-media.tar" "$target/bundle-private/$private_bundle_sha256.tar"
mv "$target/directus-media.tar" "$target/bundle-directus/$directus_bundle_sha256.tar"
rclone copy "$target/bundle-private" "$remote_root/bundles-v1/private" --config "$RCLONE_CONFIG" --immutable --checksum
rclone copy "$target/bundle-directus" "$remote_root/bundles-v1/directus" --config "$RCLONE_CONFIG" --immutable --checksum
rclone check "$target/bundle-private" "$remote_root/bundles-v1/private" --config "$RCLONE_CONFIG" --one-way --checksum
rclone check "$target/bundle-directus" "$remote_root/bundles-v1/directus" --config "$RCLONE_CONFIG" --one-way --checksum

rclone copy "$target/snapshot.tar" "$remote_snapshot" --config "$RCLONE_CONFIG" --immutable --checksum
rclone check "$target/snapshot.tar" "$remote_snapshot" --config "$RCLONE_CONFIG" --one-way --download
remote_snapshot_sha256="$(rclone cat "$remote_snapshot/snapshot.tar" --config "$RCLONE_CONFIG" | sha256sum | cut -d' ' -f1)"
test "$remote_snapshot_sha256" = "$snapshot_sha256"

printf "UPDATE comm_backups SET state='completed',completed_at=now(),external_verified=true,verified_at=now(),manifest_sha256='%s',remote_key='snapshots/%s',database_bytes=%s,directus_file_count=%s,private_file_count=%s,error_code=NULL WHERE id='%s'; UPDATE comm_runtime SET last_backup_at=now() WHERE id=1;\n" \
  "$snapshot_sha256" "$id" "$database_bytes" "$directus_count" "$private_count" "$id" | db_query >/dev/null
trap - EXIT

find "$COMM_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mmin "+$((COMM_LOCAL_RETENTION_HOURS * 60))" -exec rm -rf -- {} +
printf 'COMM_BACKUP_VERIFIED %s snapshot_sha256=%s database_bytes=%s directus_files=%s private_files=%s\n' \
  "$id" "$snapshot_sha256" "$database_bytes" "$directus_count" "$private_count"
