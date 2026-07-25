#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
. infra/directus-beget/.env
if [ -f apps/web/.env.local ]; then
  . apps/web/.env.local
fi
set +a

if [ -n "${CATALOG_IMPORT_DIRECTUS_TOKEN:-}" ]; then
  DIRECTUS_TOKEN="$CATALOG_IMPORT_DIRECTUS_TOKEN"
else
  DIRECTUS_TOKEN="$(
    printf "%s\n" "select token from directus_users where email = 'catalog-import@isvoi.local' limit 1;" \
      | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
        psql -U "$DB_USER" -d "$DB_DATABASE" -At
  )"
fi

if [ -z "$DIRECTUS_TOKEN" ]; then
  echo "Catalog import token not found." >&2
  exit 1
fi

export DIRECTUS_TOKEN
export DIRECTUS_URL="${DIRECTUS_URL:-https://api.isvoi.ru}"

npm run directus:test:catalog-v3-editability
