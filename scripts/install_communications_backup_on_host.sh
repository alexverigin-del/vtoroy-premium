#!/usr/bin/env bash
# Installs code and timers. Credentials must already exist in protected server files.
set -euo pipefail
test "$(id -u)" -eq 0 || { echo "Run as root" >&2; exit 1; }
ROOT="${ROOT:-/opt/isvoi}"
STACK="$ROOT/infra/directus-beget"
ENV_FILE="/etc/isvoi/communications-backup.env"
RCLONE_FILE="/etc/isvoi/rclone.conf"
LIVE_RCLONE_FILE="/etc/isvoi/communications-media-rclone.conf"
LIVE_STORAGE_ENV="/etc/isvoi/communications-media-s3.env"

set_env() {
  local file=$1 key=$2 value=$3 temporary
  [[ $key =~ ^[A-Z][A-Z0-9_]*$ ]] || exit 1
  [[ $value != *$'\n'* && $value != *$'\r'* ]] || exit 1
  temporary=$(mktemp)
  awk -v key="$key" -v line="$key=$value" '
    BEGIN { found=0 }
    index($0, key "=")==1 { if (!found) print line; found=1; next }
    { print }
    END { if (!found) print line }
  ' "$file" >"$temporary"
  install -m 600 "$temporary" "$file"
  rm -f "$temporary"
}

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone >/dev/null
install -d -m 0700 /etc/isvoi "$ROOT/backups/communications" "$STACK/private-communications"
install -m 0750 "$ROOT/scripts/backup_communications.sh" /usr/local/sbin/isvoi-communications-backup
install -m 0750 "$ROOT/scripts/check_communications_backup.sh" /usr/local/sbin/isvoi-communications-backup-health
install -m 0750 "$ROOT/scripts/rehearse_communications_restore.sh" /usr/local/sbin/isvoi-communications-restore-rehearsal
install -m 0644 "$ROOT/infra/communications/isvoi-communications-backup.service" /etc/systemd/system/
install -m 0644 "$ROOT/infra/communications/isvoi-communications-backup.timer" /etc/systemd/system/
install -m 0644 "$ROOT/infra/communications/isvoi-communications-backup-health.service" /etc/systemd/system/
install -m 0644 "$ROOT/infra/communications/isvoi-communications-backup-health.timer" /etc/systemd/system/

# Apply only additive/idempotent schema changes before a backup can be registered.
docker compose -f "$STACK/docker-compose.yml" --project-directory "$STACK" exec -T database \
  sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Xq -v ON_ERROR_STOP=1' \
  <"$ROOT/packages/communications/schema.sql" >/dev/null
systemctl daemon-reload

if test -f "$ENV_FILE" && test -f "$RCLONE_FILE"; then
  if test -f "$LIVE_RCLONE_FILE" && test -f "$LIVE_STORAGE_ENV"; then
    live_bucket="$(sed -n 's/^ISVOI_COMMUNICATIONS_S3_BUCKET=//p' "$LIVE_STORAGE_ENV" | tail -n 1)"
    live_prefix="$(sed -n 's/^ISVOI_COMMUNICATIONS_S3_PREFIX=//p' "$LIVE_STORAGE_ENV" | tail -n 1)"
    live_remote="$(/usr/local/bin/rclone listremotes --config "$LIVE_RCLONE_FILE")"
    [[ $live_bucket =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]
    [[ $live_prefix =~ ^[A-Za-z0-9._/-]{1,200}$ && $live_prefix != /* && $live_prefix != */ ]]
    [[ $live_remote =~ ^[A-Za-z0-9._-]+:$ ]]
    set_env "$ENV_FILE" COMM_LIVE_S3_REMOTE "$live_remote$live_bucket/$live_prefix"
    set_env "$ENV_FILE" COMM_LIVE_S3_RCLONE_CONFIG "$LIVE_RCLONE_FILE"
    chown root:root "$LIVE_RCLONE_FILE" "$LIVE_STORAGE_ENV"
    chmod 0600 "$LIVE_RCLONE_FILE" "$LIVE_STORAGE_ENV"
  fi
  chown root:root "$ENV_FILE" "$RCLONE_FILE"
  chmod 0600 "$ENV_FILE" "$RCLONE_FILE"
  systemd-analyze verify /etc/systemd/system/isvoi-communications-backup.service /etc/systemd/system/isvoi-communications-backup.timer /etc/systemd/system/isvoi-communications-backup-health.service /etc/systemd/system/isvoi-communications-backup-health.timer
  systemctl enable --now isvoi-communications-backup.timer isvoi-communications-backup-health.timer
  echo "COMM_BACKUP_INSTALLED_AND_SCHEDULED"
else
  systemctl disable --now isvoi-communications-backup.timer isvoi-communications-backup-health.timer >/dev/null 2>&1 || true
  echo "COMM_BACKUP_INSTALLED_AWAITING_PROTECTED_CREDENTIALS"
fi
