#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=/opt/isvoi
STACK="$ROOT/infra/directus-beget"
DIRECTUS_ENV="$STACK/.env"
STORAGE_ENV=${ISVOI_COMMUNICATIONS_STORAGE_ENV:-/etc/isvoi/communications-media-s3.env}
ACCESS_SECRET=/etc/isvoi/secrets/communications_s3_access_key
SECRET_SECRET=/etc/isvoi/secrets/communications_s3_secret_key
ACCESS_CONTAINER_SECRET=/etc/isvoi/secrets/communications_s3_access_key.directus
SECRET_CONTAINER_SECRET=/etc/isvoi/secrets/communications_s3_secret_key.directus
BACKUP="$ROOT/backups/communications-storage-$(date -u +%Y%m%dT%H%M%SZ)"
ENV_BACKUP="$BACKUP/directus.env"
ENV_CHANGED=false

fail() {
  printf '%s\n' "$1; secret details suppressed." >&2
  exit 1
}

value() {
  sed -n "s/^$1=//p" "$STORAGE_ENV" | tail -n 1
}

set_env() {
  local file=$1 key=$2 new_value=$3 temporary
  [[ $key =~ ^[A-Z][A-Z0-9_]*$ ]] || fail INVALID_ENV_KEY
  [[ $new_value != *$'\n'* && $new_value != *$'\r'* ]] || fail INVALID_ENV_VALUE
  temporary=$(mktemp)
  awk -v key="$key" -v line="$key=$new_value" '
    BEGIN { found=0 }
    index($0, key "=")==1 { if (!found) print line; found=1; next }
    { print }
    END { if (!found) print line }
  ' "$file" > "$temporary"
  install -m 600 "$temporary" "$file"
  rm -f "$temporary"
}

compose() {
  docker compose -f "$STACK/docker-compose.yml" --project-directory "$STACK" "$@"
}

rollback() {
  local status=$?
  trap - ERR EXIT
  if [[ $status -ne 0 && $ENV_CHANGED == true && -f $ENV_BACKUP ]]; then
    install -m 600 "$ENV_BACKUP" "$DIRECTUS_ENV"
    compose up -d --force-recreate --no-deps directus >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap rollback ERR EXIT

[[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
[[ -f $DIRECTUS_ENV && -f $STORAGE_ENV ]] || fail CONFIG_MISSING
[[ $(stat -c %a "$STORAGE_ENV") == 600 ]] || fail STORAGE_CONFIG_NOT_PRIVATE
for secret in "$ACCESS_SECRET" "$SECRET_SECRET"; do
  [[ -f $secret && $(stat -c %a "$secret") == 600 ]] || fail STORAGE_SECRET_NOT_PRIVATE
done
DIRECTUS_UID=$(compose exec -T directus id -u)
DIRECTUS_GID=$(compose exec -T directus id -g)
[[ $DIRECTUS_UID =~ ^[1-9][0-9]*$ && $DIRECTUS_GID =~ ^[1-9][0-9]*$ ]] \
  || fail DIRECTUS_IDENTITY_INVALID
install -o "$DIRECTUS_UID" -g "$DIRECTUS_GID" -m 400 \
  "$ACCESS_SECRET" "$ACCESS_CONTAINER_SECRET"
install -o "$DIRECTUS_UID" -g "$DIRECTUS_GID" -m 400 \
  "$SECRET_SECRET" "$SECRET_CONTAINER_SECRET"

ENDPOINT=$(value ISVOI_COMMUNICATIONS_S3_ENDPOINT)
REGION=$(value ISVOI_COMMUNICATIONS_S3_REGION)
BUCKET=$(value ISVOI_COMMUNICATIONS_S3_BUCKET)
PREFIX=$(value ISVOI_COMMUNICATIONS_S3_PREFIX)
FORCE_PATH_STYLE=$(value ISVOI_COMMUNICATIONS_S3_FORCE_PATH_STYLE)
[[ $ENDPOINT == https://* ]] || fail S3_ENDPOINT_INVALID
[[ $REGION =~ ^[a-z0-9-]{2,32}$ ]] || fail S3_REGION_INVALID
[[ $BUCKET =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || fail S3_BUCKET_INVALID
[[ $PREFIX =~ ^[A-Za-z0-9._/-]{1,200}$ && $PREFIX != /* && $PREFIX != */ ]] || fail S3_PREFIX_INVALID
[[ "/$PREFIX/" != *"/../"* && "/$PREFIX/" != *"/./"* && "$PREFIX" != *"//"* ]] \
  || fail S3_PREFIX_INVALID
[[ $FORCE_PATH_STYLE == true || $FORCE_PATH_STYLE == false ]] || fail S3_PATH_STYLE_INVALID

install -d -m 700 "$BACKUP"
cp "$DIRECTUS_ENV" "$ENV_BACKUP"
compose exec -T database sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP/postgres.dump"
compose exec -T database pg_restore --list < "$BACKUP/postgres.dump" >/dev/null

cd "$ROOT"
runuser -u deploy -- npm ci --ignore-scripts --no-audit --no-fund >/dev/null
runuser -u deploy -- npm run communications:build >/dev/null
runuser -u deploy -- npm run communications:test >/dev/null
runuser -u deploy -- node scripts/setup_directus_communications_sql.mjs \
  > "$BACKUP/communications-schema.sql"
compose exec -T database sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$BACKUP/communications-schema.sql" >/dev/null

env ISVOI_COMMUNICATIONS_STORAGE_DRIVER=s3 \
  ISVOI_COMMUNICATIONS_S3_ENDPOINT="$ENDPOINT" \
  ISVOI_COMMUNICATIONS_S3_REGION="$REGION" \
  ISVOI_COMMUNICATIONS_S3_BUCKET="$BUCKET" \
  ISVOI_COMMUNICATIONS_S3_PREFIX="$PREFIX" \
  ISVOI_COMMUNICATIONS_S3_FORCE_PATH_STYLE="$FORCE_PATH_STYLE" \
  ISVOI_COMMUNICATIONS_S3_ACCESS_KEY_FILE="$ACCESS_SECRET" \
  ISVOI_COMMUNICATIONS_S3_SECRET_KEY_FILE="$SECRET_SECRET" \
  node scripts/test_communications_s3_live.mjs --confirm-live-s3 >/dev/null

ENV_CHANGED=true
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_STORAGE_DRIVER local
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_ENDPOINT "$ENDPOINT"
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_REGION "$REGION"
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_BUCKET "$BUCKET"
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_PREFIX "$PREFIX"
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_FORCE_PATH_STYLE "$FORCE_PATH_STYLE"
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_ACCESS_KEY_HOST_FILE "$ACCESS_CONTAINER_SECRET"
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_S3_SECRET_KEY_HOST_FILE "$SECRET_CONTAINER_SECRET"

compose config --quiet
compose up -d --force-recreate --no-deps directus >/dev/null
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null; then break; fi
  sleep 2
done
curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null \
  || fail DIRECTUS_RESTART_TIMEOUT
compose exec -T directus sh -lc \
  'test -r /run/secrets/communications_s3_access_key && test -r /run/secrets/communications_s3_secret_key' \
  || fail DIRECTUS_SECRETS_NOT_READABLE
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
  http://127.0.0.1:8055/isvoi-communications/v1/inbox) == 403 ]] \
  || fail PUBLIC_INBOX_NOT_DENIED

ENV_CHANGED=false
trap - ERR EXIT
printf '{"status":"COMMUNICATIONS_STORAGE_ADAPTER_DEPLOYED","write_driver":"local","backup":"%s"}\n' "$BACKUP"
