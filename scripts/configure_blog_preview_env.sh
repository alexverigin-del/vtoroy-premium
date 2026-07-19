#!/usr/bin/env bash
set -euo pipefail

root_dir="${ISVOI_ROOT_DIR:-/opt/isvoi}"
stack_dir="${DIRECTUS_STACK_DIR:-${root_dir}/infra/directus-beget}"
env_file="${BLOG_PREVIEW_ENV_FILE:-${root_dir}/apps/web/.env.local}"

if [[ ! -f "${env_file}" ]]; then
  echo "Blog preview env file is missing: ${env_file}" >&2
  exit 1
fi

preview_token="$({
  printf "%s\n" "SELECT token FROM directus_users WHERE email='blog-preview@service.isvoi' AND status='active' LIMIT 1;"
} | (cd "${stack_dir}" && docker compose exec -T database psql -U isvoi -d isvoi -At -v ON_ERROR_STOP=1))"

if [[ ${#preview_token} -lt 64 ]]; then
  echo "Dedicated Directus preview token is missing or invalid." >&2
  exit 1
fi

preview_secret="$(sed -n 's/^BLOG_PREVIEW_SECRET=//p' "${env_file}" | tail -1)"
if [[ ${#preview_secret} -lt 64 ]]; then
  preview_secret="$(openssl rand -hex 32)"
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

upsert_env "DIRECTUS_PREVIEW_TOKEN" "${preview_token}"
upsert_env "BLOG_PREVIEW_SECRET" "${preview_secret}"

echo "DIRECTUS_PREVIEW_TOKEN: configured"
echo "BLOG_PREVIEW_SECRET: configured"
