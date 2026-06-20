#!/usr/bin/env bash
set -euo pipefail

# Finish Directus Files image migration on the Beget production checkout.
# Run from /opt/isvoi after git pull.

cd "$(dirname "$0")/.."

set -a
. scripts/.env
. infra/directus-beget/.env
if [ -f apps/web/.env.local ]; then
  . apps/web/.env.local
fi
set +a

DIRECTUS_TOKEN="$(
  printf "%s\n" "select token from directus_users where email = 'catalog-import@isvoi.local' limit 1;" \
    | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
      psql -U "$DB_USER" -d "$DB_DATABASE" -At
)"
export DIRECTUS_TOKEN

if [ -z "$DIRECTUS_TOKEN" ]; then
  echo "catalog-import@isvoi.local token not found" >&2
  exit 1
fi

echo "Using catalog-import service token (${#DIRECTUS_TOKEN} chars)."

npm run directus:media
npm run directus:site-assets -- --replace
npm run directus:normalize-images -- --dry-run
npm run directus:normalize-images
npm run directus:audit-images \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
      psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1
