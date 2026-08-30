#!/usr/bin/env bash
set -euo pipefail

root_dir="${ISVOI_ROOT_DIR:-/opt/isvoi}"
env_file="${TRADE_QA_ENV_FILE:-${root_dir}/apps/web/.env.local}"

if [[ ! -f "${env_file}" ]]; then
  echo "Trade-in env file is missing: ${env_file}" >&2
  exit 1
fi

qa_secret="${TRADE_QA_SECRET_VALUE:-$(sed -n 's/^TRADE_QA_SECRET=//p' "${env_file}" | tail -1)}"
if [[ -n "${TRADE_QA_SECRET_VALUE:-}" && ${#qa_secret} -lt 32 ]]; then
  echo "TRADE_QA_SECRET_VALUE must contain at least 32 characters." >&2
  exit 1
fi
if [[ ${#qa_secret} -lt 32 ]]; then
  qa_secret="$(openssl rand -hex 32)"
fi

upsert_env() {
  local key="$1"
  local value="$2"
  local temp_file

  temp_file="$(mktemp "${env_file}.tmp.XXXXXX")"
  grep -v "^${key}=" "${env_file}" > "${temp_file}" || true
  printf '%s=%s\n' "${key}" "${value}" >> "${temp_file}"
  chmod --reference="${env_file}" "${temp_file}"
  chown --reference="${env_file}" "${temp_file}"
  mv "${temp_file}" "${env_file}"
}

upsert_env "TRADE_QA_SECRET" "${qa_secret}"
upsert_env "TRADE_QA_ENABLED" "1"

echo "TRADE_QA_SECRET: configured"
echo "TRADE_QA_ENABLED: enabled"
echo "TRADE_WIZARD_ENABLED: preserved"
