#!/usr/bin/env bash
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo TELEGRAM_WORKER_INSTALL_REQUIRES_ROOT >&2; exit 1; }
ROOT=/opt/isvoi
LEGACY_ENV=$ROOT/work/private/telegram.env
TARGET_ENV=/etc/isvoi/communications-telegram.env
UNIT=/etc/systemd/system/isvoi-communications-telegram@.service

[[ -f $LEGACY_ENV ]] || { echo LEGACY_TELEGRAM_ENV_REQUIRED >&2; exit 1; }
[[ -f $ROOT/scripts/run_communications_worker.mjs ]] || { echo COMMUNICATIONS_WORKER_REQUIRED >&2; exit 1; }
[[ -f $ROOT/scripts/prepare_telegram_communications_env.mjs ]] || { echo TELEGRAM_ENV_PREPARER_REQUIRED >&2; exit 1; }

install -d -m 0755 /etc/isvoi
node "$ROOT/scripts/prepare_telegram_communications_env.mjs" "$LEGACY_ENV" "$TARGET_ENV"
install -m 0644 "$ROOT/infra/communications/isvoi-communications-telegram@.service" "$UNIT"
systemd-analyze verify "$UNIT"
systemctl daemon-reload

for mode in receive process send media; do
  systemctl disable "isvoi-communications-telegram@${mode}.service" >/dev/null 2>&1 || true
  if systemctl is-active --quiet "isvoi-communications-telegram@${mode}.service"; then
    echo "TELEGRAM_${mode^^}_MUST_BE_INACTIVE" >&2
    exit 1
  fi
done

echo TELEGRAM_COMMUNICATIONS_WORKERS_READY_DISABLED
