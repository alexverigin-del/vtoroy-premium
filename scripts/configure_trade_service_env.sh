#!/usr/bin/env bash
set -euo pipefail

root_dir="${ISVOI_ROOT_DIR:-/opt/isvoi}"
stack_dir="${DIRECTUS_STACK_DIR:-${root_dir}/infra/directus-beget}"
env_file="${TRADE_SERVICE_ENV_FILE:-${root_dir}/apps/web/.env.local}"

if [[ ! -f "${env_file}" ]]; then
  echo "Trade-in env file is missing: ${env_file}" >&2
  exit 1
fi

trade_token="$({
  printf "%s\n" "SELECT token FROM directus_users WHERE email='trade-service@service.isvoi' AND status='active' LIMIT 1;"
} | (cd "${stack_dir}" && docker compose exec -T database psql -U isvoi -d isvoi -At -v ON_ERROR_STOP=1))"

if [[ ${#trade_token} -lt 64 ]]; then
  echo "Dedicated Directus Trade-in token is missing or invalid." >&2
  exit 1
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

upsert_env "DIRECTUS_TRADE_TOKEN" "${trade_token}"
upsert_env "TRADE_WIZARD_ENABLED" "0"

echo "DIRECTUS_TRADE_TOKEN: configured"
echo "TRADE_WIZARD_ENABLED: disabled"
