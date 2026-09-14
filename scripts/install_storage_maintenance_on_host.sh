#!/usr/bin/env bash
set -euo pipefail

ROOT="${ISVOI_ROOT:-/opt/isvoi}"

[[ "$EUID" -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
[[ -f "$ROOT/scripts/prune_isvoi_temp.sh" ]] || { echo "Missing temp retention script" >&2; exit 1; }

install -m 0750 "$ROOT/scripts/prune_isvoi_temp.sh" /usr/local/sbin/isvoi-prune-temp
install -m 0644 "$ROOT/infra/systemd/isvoi-storage-maintenance.service" /etc/systemd/system/
install -m 0644 "$ROOT/infra/systemd/isvoi-storage-maintenance.timer" /etc/systemd/system/
install -d -m 0755 /etc/systemd/journald.conf.d
install -m 0644 "$ROOT/infra/systemd/60-isvoi-journald.conf" /etc/systemd/journald.conf.d/

systemctl daemon-reload
systemctl enable --now isvoi-storage-maintenance.timer
systemctl restart systemd-journald

echo "ISVOI_STORAGE_MAINTENANCE_INSTALLED"
