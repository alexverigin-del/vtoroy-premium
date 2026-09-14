#!/usr/bin/env bash
# Downloads one completed S3 snapshot and restores it into an isolated PostgreSQL container.
set -euo pipefail
umask 077
: "${COMM_STACK_DIR:?COMM_STACK_DIR is required}"
: "${COMM_OFFSITE_REMOTE:?COMM_OFFSITE_REMOTE is required}"
: "${RCLONE_CONFIG:?RCLONE_CONFIG is required}"
COMM_RESTORE_BACKUP_ID="${COMM_RESTORE_BACKUP_ID:-}"
KEEP_REHEARSAL="${KEEP_REHEARSAL:-0}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
COMPOSE_FILE="$COMM_STACK_DIR/docker-compose.yml"
for command_name in docker rclone sha256sum tar; do command -v "$command_name" >/dev/null; done
compose() { docker compose -f "$COMPOSE_FILE" --project-directory "$COMM_STACK_DIR" "$@"; }
db_query() { compose exec -T database sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtq -v ON_ERROR_STOP=1'; }
if test -z "$COMM_RESTORE_BACKUP_ID"; then
  COMM_RESTORE_BACKUP_ID="$(printf "%s\n" "SELECT id FROM comm_backups WHERE state='completed' AND external_verified ORDER BY completed_at DESC LIMIT 1;" | db_query)"
fi
[[ "$COMM_RESTORE_BACKUP_ID" =~ ^[0-9a-f-]{36}$ ]]

expected_snapshot_sha256="$(printf "%s\n" "SELECT coalesce(manifest_sha256,'') FROM comm_backups WHERE id='$COMM_RESTORE_BACKUP_ID' AND state='completed' AND external_verified;" | db_query)"
[[ "$expected_snapshot_sha256" =~ ^[0-9a-f]{64}$ ]]
started_epoch="$(date +%s)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/isvoi-communications-restore.XXXXXX")"
snapshot_dir="$work_dir/snapshot"
directus_dir="$work_dir/directus"
private_dir="$work_dir/private"
s3_dir="$work_dir/s3"
container="isvoi-communications-restore-${COMM_RESTORE_BACKUP_ID:0:8}"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if test "$KEEP_REHEARSAL" != 1; then
    case "$work_dir" in /tmp/isvoi-communications-restore.*) rm -rf "$work_dir" ;; esac
  fi
}
trap cleanup EXIT
mkdir -p "$snapshot_dir" "$directus_dir" "$private_dir" "$s3_dir"
remote_root="${COMM_OFFSITE_REMOTE%/}"
remote_snapshot="$remote_root/snapshots/$COMM_RESTORE_BACKUP_ID"
rclone copy "$remote_snapshot/snapshot.tar" "$snapshot_dir" --config "$RCLONE_CONFIG"
test -s "$snapshot_dir/snapshot.tar"
actual_snapshot_sha256="$(sha256sum "$snapshot_dir/snapshot.tar" | cut -d' ' -f1)"
test "$actual_snapshot_sha256" = "$expected_snapshot_sha256"
tar -tf "$snapshot_dir/snapshot.tar" >/dev/null
tar -xf "$snapshot_dir/snapshot.tar" -C "$snapshot_dir"
test -s "$snapshot_dir/database.dump"
(
  cd "$snapshot_dir"
  sha256sum -c SHA256SUMS >/dev/null
)

directus_bundle_sha256="$(cut -d' ' -f1 <"$snapshot_dir/directus-bundle.sha256")"
private_bundle_sha256="$(cut -d' ' -f1 <"$snapshot_dir/private-bundle.sha256")"
[[ "$directus_bundle_sha256" =~ ^[0-9a-f]{64}$ ]]
[[ "$private_bundle_sha256" =~ ^[0-9a-f]{64}$ ]]
rclone copy "$remote_root/bundles-v1/directus/$directus_bundle_sha256.tar" "$work_dir/bundle-directus" --config "$RCLONE_CONFIG"
rclone copy "$remote_root/bundles-v1/private/$private_bundle_sha256.tar" "$work_dir/bundle-private" --config "$RCLONE_CONFIG"
test "$(sha256sum "$work_dir/bundle-directus/$directus_bundle_sha256.tar" | cut -d' ' -f1)" = "$directus_bundle_sha256"
test "$(sha256sum "$work_dir/bundle-private/$private_bundle_sha256.tar" | cut -d' ' -f1)" = "$private_bundle_sha256"
tar -xf "$work_dir/bundle-directus/$directus_bundle_sha256.tar" -C "$directus_dir"
tar -xf "$work_dir/bundle-private/$private_bundle_sha256.tar" -C "$private_dir"
(cd "$directus_dir" && sha256sum -c "$snapshot_dir/directus-uploads.sha256" >/dev/null)
if test -s "$snapshot_dir/private-media.sha256"; then
  (cd "$private_dir" && sha256sum -c "$snapshot_dir/private-media.sha256" >/dev/null)
fi
if test -f "$snapshot_dir/s3-media.sha256" && test -s "$snapshot_dir/s3-media.sha256"; then
  awk '{print $2}' "$snapshot_dir/s3-media.sha256" >"$work_dir/s3-files.txt"
  grep -Eqv '^[0-9a-f-]{36}$' "$work_dir/s3-files.txt" && exit 1
  rclone copy "$remote_root/objects-v1/private-s3" "$s3_dir" \
    --config "$RCLONE_CONFIG" --files-from "$work_dir/s3-files.txt"
  (cd "$s3_dir" && sha256sum -c "$snapshot_dir/s3-media.sha256" >/dev/null)
fi

docker rm -f "$container" >/dev/null 2>&1 || true
docker run -d --name "$container" --network none --memory 768m --cpus 0.75 \
  -e POSTGRES_USER=isvoi -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_DB=isvoi "$POSTGRES_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" psql -U isvoi -d isvoi -XAtqc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" psql -U isvoi -d isvoi -XAtqc 'SELECT 1' >/dev/null
docker exec -i "$container" pg_restore -U isvoi -d isvoi --no-owner --no-acl --exit-on-error <"$snapshot_dir/database.dump" >/dev/null
table_count="$(docker exec "$container" psql -U isvoi -d isvoi -XAtq -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
test "$table_count" -gt 20
elapsed="$(( $(date +%s) - started_epoch ))"
s3_count=0
test ! -f "$snapshot_dir/s3-media.sha256" || s3_count="$(wc -l <"$snapshot_dir/s3-media.sha256" | tr -d ' ')"
printf 'COMM_RESTORE_REHEARSAL_PASSED backup_id=%s tables=%s directus_files=%s private_files=%s s3_files=%s seconds=%s\n' \
  "$COMM_RESTORE_BACKUP_ID" "$table_count" "$(wc -l <"$snapshot_dir/directus-uploads.sha256")" "$(wc -l <"$snapshot_dir/private-media.sha256")" "$s3_count" "$elapsed"
