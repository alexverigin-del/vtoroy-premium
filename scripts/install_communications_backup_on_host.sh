#!/usr/bin/env bash
# Installs code and timers. Credentials must already exist in protected server files.
set -euo pipefail
test "$(id -u)" -eq 0 || { echo "Run as root" >&2; exit 1; }
ROOT="${ROOT:-/opt/isvoi}"
STACK="$ROOT/infra/directus-beget"
ENV_FILE="/etc/isvoi/communications-backup.env"
RCLONE_FILE="/etc/isvoi/rclone.conf"

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
  chown root:root "$ENV_FILE" "$RCLONE_FILE"
  chmod 0600 "$ENV_FILE" "$RCLONE_FILE"
  systemd-analyze verify /etc/systemd/system/isvoi-communications-backup.service /etc/systemd/system/isvoi-communications-backup.timer /etc/systemd/system/isvoi-communications-backup-health.service /etc/systemd/system/isvoi-communications-backup-health.timer
  systemctl enable --now isvoi-communications-backup.timer isvoi-communications-backup-health.timer
  echo "COMM_BACKUP_INSTALLED_AND_SCHEDULED"
else
  systemctl disable --now isvoi-communications-backup.timer isvoi-communications-backup-health.timer >/dev/null 2>&1 || true
  echo "COMM_BACKUP_INSTALLED_AWAITING_PROTECTED_CREDENTIALS"
fi
