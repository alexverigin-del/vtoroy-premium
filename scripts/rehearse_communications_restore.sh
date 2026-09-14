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
for command_name in docker rclone sha256sum; do command -v "$command_name" >/dev/null; done
compose() { docker compose -f "$COMPOSE_FILE" --project-directory "$COMM_STACK_DIR" "$@"; }
db_query() { compose exec -T database sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtq -v ON_ERROR_STOP=1'; }
if test -z "$COMM_RESTORE_BACKUP_ID"; then
  COMM_RESTORE_BACKUP_ID="$(printf "%s\n" "SELECT id FROM comm_backups WHERE state='completed' AND external_verified ORDER BY completed_at DESC LIMIT 1;" | db_query)"
fi
[[ "$COMM_RESTORE_BACKUP_ID" =~ ^[0-9a-f-]{36}$ ]]

started_epoch="$(date +%s)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/isvoi-communications-restore.XXXXXX")"
snapshot_dir="$work_dir/snapshot"
directus_dir="$work_dir/directus"
private_dir="$work_dir/private"
container="isvoi-communications-restore-${COMM_RESTORE_BACKUP_ID:0:8}"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if test "$KEEP_REHEARSAL" != 1; then
    case "$work_dir" in /tmp/isvoi-communications-restore.*) rm -rf "$work_dir" ;; esac
  fi
}
trap cleanup EXIT
mkdir -p "$snapshot_dir" "$directus_dir" "$private_dir"
remote_root="${COMM_OFFSITE_REMOTE%/}"
remote_snapshot="$remote_root/snapshots/$COMM_RESTORE_BACKUP_ID"
rclone copy "$remote_snapshot" "$snapshot_dir" --config "$RCLONE_CONFIG"
test -s "$snapshot_dir/_COMPLETE"
test -s "$snapshot_dir/database.dump"
(
  cd "$snapshot_dir"
  expected="$(cut -d' ' -f1 <_COMPLETE)"
  actual="$(sha256sum SHA256SUMS | cut -d' ' -f1)"
  test "$expected" = "$actual"
  sha256sum -c SHA256SUMS >/dev/null
)

rclone copy "$remote_root/objects/directus" "$directus_dir" --config "$RCLONE_CONFIG"
rclone copy "$remote_root/objects/private" "$private_dir" --config "$RCLONE_CONFIG"
(cd "$directus_dir" && sha256sum -c "$snapshot_dir/directus-uploads.sha256" >/dev/null)
if test -s "$snapshot_dir/private-media.sha256"; then
  (cd "$private_dir" && sha256sum -c "$snapshot_dir/private-media.sha256" >/dev/null)
fi

docker rm -f "$container" >/dev/null 2>&1 || true
docker run -d --name "$container" --network none --memory 768m --cpus 0.75 \
  -e POSTGRES_USER=isvoi -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_DB=isvoi "$POSTGRES_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U isvoi -d isvoi >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U isvoi -d isvoi >/dev/null
docker exec -i "$container" pg_restore -U isvoi -d isvoi --no-owner --no-acl --exit-on-error <"$snapshot_dir/database.dump" >/dev/null
table_count="$(docker exec "$container" psql -U isvoi -d isvoi -XAtq -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
test "$table_count" -gt 20
elapsed="$(( $(date +%s) - started_epoch ))"
printf 'COMM_RESTORE_REHEARSAL_PASSED backup_id=%s tables=%s seconds=%s\n' "$COMM_RESTORE_BACKUP_ID" "$table_count" "$elapsed"
