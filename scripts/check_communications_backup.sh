#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${COMM_STACK_DIR:?COMM_STACK_DIR is required}"
: "${COMM_OFFSITE_REMOTE:?COMM_OFFSITE_REMOTE is required}"
: "${RCLONE_CONFIG:?RCLONE_CONFIG is required}"
COMM_BACKUP_WARN_MINUTES="${COMM_BACKUP_WARN_MINUTES:-45}"
COMPOSE_FILE="$COMM_STACK_DIR/docker-compose.yml"
compose() { docker compose -f "$COMPOSE_FILE" --project-directory "$COMM_STACK_DIR" "$@"; }
db_query() { compose exec -T database sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtq -F "|" -v ON_ERROR_STOP=1'; }
row="$(printf "%s\n" "SELECT id,extract(epoch FROM now()-completed_at)::bigint,remote_key,manifest_sha256 FROM comm_backups WHERE state='completed' AND external_verified ORDER BY completed_at DESC LIMIT 1;" | db_query)"
IFS='|' read -r backup_id age_seconds remote_key expected_sha256 <<<"$row"
test -n "${backup_id:-}" || { echo 'COMM_BACKUP_CRITICAL no verified backup' >&2; exit 2; }
[[ "$backup_id" =~ ^[0-9a-f-]{36}$ ]]
[[ "$age_seconds" =~ ^[0-9]+$ ]]
[[ "$expected_sha256" =~ ^[0-9a-f]{64}$ ]]
test "$remote_key" = "snapshots/$backup_id"
actual_sha256="$(rclone cat "${COMM_OFFSITE_REMOTE%/}/$remote_key/snapshot.tar" --config "$RCLONE_CONFIG" | sha256sum | cut -d' ' -f1)"
test "$actual_sha256" = "$expected_sha256"
age_minutes="$((age_seconds / 60))"
if (( age_minutes >= COMM_BACKUP_WARN_MINUTES )); then
  echo "COMM_BACKUP_WARNING age_minutes=$age_minutes backup_id=$backup_id" >&2
  exit 2
fi
echo "COMM_BACKUP_HEALTHY age_minutes=$age_minutes backup_id=$backup_id"
