#!/usr/bin/env bash
# Production backup: PostgreSQL snapshot plus immutable Directus/private file pools.
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

for command_name in docker rclone sha256sum flock find sort xargs cp; do
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

# PostgreSQL custom format is validated before any upload.
compose exec -T database sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' >"$target/database.dump"
compose exec -T database sh -c 'exec pg_restore --list' <"$target/database.dump" >/dev/null

write_manifest() {
  local source_dir="$1" output_file="$2"
  (
    cd "$source_dir"
    find . -type f -print0 | sort -z | xargs -0 -r sha256sum
  ) >"$output_file"
}
write_manifest "$COMM_PRIVATE_DIR" "$target/private-media.sha256"
write_manifest "$COMM_DIRECTUS_UPLOADS_DIR" "$target/directus-uploads.sha256"

stage_content_pool() {
  local source_dir="$1" manifest="$2" pool_dir="$3"
  mkdir -p "$pool_dir"
  while read -r digest relative_path; do
    test -n "${digest:-}" || continue
    relative_path="${relative_path#./}"
    test -f "$source_dir/$relative_path"
    if test ! -e "$pool_dir/$digest"; then
      cp --reflink=auto -- "$source_dir/$relative_path" "$pool_dir/$digest"
    fi
  done <"$manifest"
}
stage_content_pool "$COMM_PRIVATE_DIR" "$target/private-media.sha256" "$target/object-pool-private"
stage_content_pool "$COMM_DIRECTUS_UPLOADS_DIR" "$target/directus-uploads.sha256" "$target/object-pool-directus"

private_count="$(wc -l <"$target/private-media.sha256" | tr -d ' ')"
directus_count="$(wc -l <"$target/directus-uploads.sha256" | tr -d ' ')"
database_bytes="$(stat -c %s "$target/database.dump")"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$target/metadata.json" <<EOF
{"version":1,"backup_id":"$id","created_at":"$created_at","database_format":"postgresql-custom","database_bytes":$database_bytes,"private_file_count":$private_count,"directus_file_count":$directus_count}
EOF

(
  cd "$target"
  sha256sum database.dump private-media.sha256 directus-uploads.sha256 metadata.json >SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)
manifest_sha256="$(sha256sum "$target/SHA256SUMS" | cut -d' ' -f1)"

# Content-addressing keeps mutable operational filenames from overwriting an old object.
rclone copy "$target/object-pool-private" "$remote_root/objects-v2/private" --config "$RCLONE_CONFIG" --immutable --checksum
rclone copy "$target/object-pool-directus" "$remote_root/objects-v2/directus" --config "$RCLONE_CONFIG" --immutable --checksum
rclone check "$target/object-pool-private" "$remote_root/objects-v2/private" --config "$RCLONE_CONFIG" --one-way --checksum
rclone check "$target/object-pool-directus" "$remote_root/objects-v2/directus" --config "$RCLONE_CONFIG" --one-way --checksum

# A snapshot only exists for recovery after its marker is uploaded last.
rclone copy "$target" "$remote_snapshot" --config "$RCLONE_CONFIG" --immutable --checksum --exclude '/object-pool-*/**'
rclone check "$target" "$remote_snapshot" --config "$RCLONE_CONFIG" --one-way --download --exclude '/object-pool-*/**'
printf '%s  SHA256SUMS\n' "$manifest_sha256" >"$target/_COMPLETE"
# Beget/Ceph may return 403 for a HEAD request on a missing object. Directory
# copy discovers the destination through ListObjects and remains immutable.
rclone copy "$target/_COMPLETE" "$remote_snapshot" --config "$RCLONE_CONFIG" --immutable
remote_complete="$(rclone cat "$remote_snapshot/_COMPLETE" --config "$RCLONE_CONFIG")"
test "$remote_complete" = "$manifest_sha256  SHA256SUMS"

printf "UPDATE comm_backups SET state='completed',completed_at=now(),external_verified=true,verified_at=now(),manifest_sha256='%s',remote_key='snapshots/%s',database_bytes=%s,directus_file_count=%s,private_file_count=%s,error_code=NULL WHERE id='%s'; UPDATE comm_runtime SET last_backup_at=now() WHERE id=1;\n" \
  "$manifest_sha256" "$id" "$database_bytes" "$directus_count" "$private_count" "$id" | db_query >/dev/null
trap - EXIT

# Local staging is disposable after the offsite snapshot is verified.
find "$COMM_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mmin "+$((COMM_LOCAL_RETENTION_HOURS * 60))" -exec rm -rf -- {} +
printf 'COMM_BACKUP_VERIFIED %s database_bytes=%s directus_files=%s private_files=%s\n' "$id" "$database_bytes" "$directus_count" "$private_count"
