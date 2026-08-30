#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
root_dir="${ISVOI_ROOT_DIR:-/opt/isvoi}"
env_file="${TRADE_PUBLIC_ENV_FILE:-${root_dir}/apps/web/.env.local}"

case "${mode}" in
  enable) value="1" ;;
  disable) value="0" ;;
  *) echo "Usage: $0 enable|disable" >&2; exit 2 ;;
esac

if [[ ! -f "${env_file}" ]]; then
  echo "Trade-in env file is missing: ${env_file}" >&2
  exit 1
fi

current_count="$(grep -c '^TRADE_WIZARD_ENABLED=' "${env_file}" || true)"
if [[ "${current_count}" != "1" ]]; then
  echo "Expected exactly one TRADE_WIZARD_ENABLED entry, found ${current_count}." >&2
  exit 1
fi

backup_file="${env_file}.trade-wizard.$(date -u +%Y%m%dT%H%M%SZ).bak"
cp --preserve=mode,ownership,timestamps "${env_file}" "${backup_file}"

temp_file="$(mktemp "${env_file}.tmp.XXXXXX")"
trap 'rm -f "${temp_file}"' EXIT
sed "s/^TRADE_WIZARD_ENABLED=.*/TRADE_WIZARD_ENABLED=${value}/" "${env_file}" > "${temp_file}"
chmod --reference="${env_file}" "${temp_file}"
chown --reference="${env_file}" "${temp_file}"
mv "${temp_file}" "${env_file}"
trap - EXIT

echo "TRADE_WIZARD_ENABLED=${value}"
echo "Backup: ${backup_file}"
