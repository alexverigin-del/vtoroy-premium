#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=/opt/isvoi
STACK="$ROOT/infra/directus-beget"
BASE_COMMIT=7989dba3035a577c9a4d5249a8e2aaec9d373017
CONNECTION_ID=5e1320ad-9392-4dda-9719-ea388eae49c3
SECRETS_FILE=${MAX_RELEASE_SECRETS_FILE:-/root/.isvoi-max-release.env}
BUNDLE=${MAX_RELEASE_BUNDLE:-}
RELEASE_COMMIT=${MAX_RELEASE_COMMIT:-}
RELEASE_SHA256=${MAX_RELEASE_SHA256:-}
LOCK="$ROOT/var/max-release-lock"
UNIT=/etc/systemd/system/isvoi-communications@.service
WORKER_ENV=/etc/isvoi/communications.env
DIRECTUS_ENV="$STACK/.env"
PHASE=validate
MERGED=false
ENV_CHANGED=false
LOCK_ACQUIRED=false
BACKUP=

fail() {
  printf '%s\n' "$1 ($PHASE); secret details suppressed." >&2
  return 1
}

valid_uuid() {
  [[ $1 =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
}

set_env() {
  local file=$1 key=$2 value=$3 temporary
  [[ $key =~ ^[A-Z][A-Z0-9_]*$ ]] || fail INVALID_ENV_KEY
  [[ $value != *$'\n'* && $value != *$'\r'* ]] || fail INVALID_ENV_VALUE
  temporary=$(mktemp)
  awk -v key="$key" -v line="$key=$value" '
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

psql_file() {
  compose exec -T database sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1"
}

rollback() {
  local original_status=${1:-1}
  trap - ERR EXIT
  set +e
  if [[ $LOCK_ACQUIRED == true ]]; then
    systemctl disable --now isvoi-communications@process.service isvoi-communications@send.service isvoi-communications@media.service >/dev/null 2>&1
    if [[ $ENV_CHANGED == true && -n $BACKUP && -f $BACKUP/directus.env ]]; then
      install -m 600 "$BACKUP/directus.env" "$DIRECTUS_ENV"
      compose up -d --force-recreate --no-deps directus >/dev/null 2>&1
    fi
    if [[ -n $BACKUP ]]; then
      if [[ -f $BACKUP/communications.env ]]; then
        install -m 600 "$BACKUP/communications.env" "$WORKER_ENV"
      else
        rm -f "$WORKER_ENV"
      fi
      if [[ -f $BACKUP/isvoi-communications@.service ]]; then
        install -m 644 "$BACKUP/isvoi-communications@.service" "$UNIT"
      else
        rm -f "$UNIT"
      fi
      systemctl daemon-reload >/dev/null 2>&1
    fi
    printf "DO \\$\\$ BEGIN IF to_regclass('public.comm_connections') IS NOT NULL THEN UPDATE comm_connections SET enabled=false WHERE id='%s'; UPDATE comm_runtime SET sending_enabled=false,recovery_hold=true WHERE id=1; END IF; END \\$\\$;\n" "$CONNECTION_ID" |
      compose exec -T database sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1
    if [[ $MERGED == true ]]; then
      git -C "$ROOT" reset --hard "$BASE_COMMIT" >/dev/null 2>&1
    fi
    rmdir "$LOCK" >/dev/null 2>&1
  fi
  rm -f "$SECRETS_FILE"
  exit "$original_status"
}
trap 'rollback $?' EXIT

[[ -n $BUNDLE && -f $BUNDLE ]] || fail RELEASE_BUNDLE_REQUIRED
[[ $RELEASE_COMMIT =~ ^[0-9a-f]{40}$ ]] || fail RELEASE_COMMIT_INVALID
[[ $RELEASE_SHA256 =~ ^[0-9a-f]{64}$ ]] || fail RELEASE_HASH_INVALID
[[ $(sha256sum "$BUNDLE" | awk '{print $1}') == "$RELEASE_SHA256" ]] || fail RELEASE_HASH_MISMATCH
git -C "$ROOT" bundle verify "$BUNDLE" >/dev/null 2>&1 || fail RELEASE_BUNDLE_INVALID
[[ $(git -C "$ROOT" rev-parse HEAD) == "$BASE_COMMIT" ]] || fail PRODUCTION_BASE_CHANGED
[[ -z $(git -C "$ROOT" status --porcelain) ]] || fail PRODUCTION_WORKTREE_DIRTY
[[ -f $SECRETS_FILE && $(stat -c %a "$SECRETS_FILE") == 600 ]] || fail SECRETS_FILE_NOT_PRIVATE

MAX_BOT_TOKEN=$(sed -n 's/^MAX_BOT_TOKEN=//p' "$SECRETS_FILE" | tail -n 1)
MAX_WEBHOOK_SECRET=$(sed -n 's/^MAX_WEBHOOK_SECRET=//p' "$SECRETS_FILE" | tail -n 1)
[[ $MAX_BOT_TOKEN =~ ^[A-Za-z0-9._-]{20,512}$ ]] || fail MAX_TOKEN_INVALID
[[ ${MAX_WEBHOOK_SECRET:-} =~ ^[A-Za-z0-9_-]{16,256}$ ]] || fail MAX_WEBHOOK_SECRET_INVALID
valid_uuid "$CONNECTION_ID" || fail CONNECTION_ID_INVALID

mkdir -p "$ROOT/var"
mkdir "$LOCK" || fail RELEASE_ALREADY_RUNNING
LOCK_ACQUIRED=true
mkdir -p "$ROOT/backups" /etc/isvoi
BACKUP="$ROOT/backups/max-release-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$BACKUP"

PHASE=backup
compose exec -T database sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP/postgres.dump"
compose exec -T database pg_restore --list < "$BACKUP/postgres.dump" >/dev/null
cp "$DIRECTUS_ENV" "$BACKUP/directus.env"
[[ ! -f $WORKER_ENV ]] || cp "$WORKER_ENV" "$BACKUP/communications.env"
[[ ! -f $UNIT ]] || cp "$UNIT" "$BACKUP/isvoi-communications@.service"

PHASE=code
git -C "$ROOT" fetch "$BUNDLE" "$RELEASE_COMMIT" >/dev/null
git -C "$ROOT" merge-base --is-ancestor "$BASE_COMMIT" "$RELEASE_COMMIT" || fail RELEASE_NOT_DESCENDANT_OF_BASE
git -C "$ROOT" merge --ff-only "$RELEASE_COMMIT" >/dev/null
MERGED=true
[[ $(git -C "$ROOT" rev-parse HEAD) == "$RELEASE_COMMIT" ]] || fail RELEASE_CODE_MISMATCH
[[ -z $(git -C "$ROOT" status --porcelain) ]] || fail RELEASE_CODE_DIRTY

PHASE=dependencies
cd "$ROOT"
npm ci --ignore-scripts --no-audit --no-fund >/dev/null
npm run communications:build >/dev/null
npm run communications:test >/dev/null
npm run telegram:test >/dev/null

PHASE=schema
node scripts/setup_directus_communications_sql.mjs > "$BACKUP/communications-schema.sql"
psql_file "$BACKUP/communications-schema.sql"
WORKER_TOKEN=$(openssl rand -hex 32)
[[ $WORKER_TOKEN =~ ^[A-Fa-f0-9]{64}$ ]] || fail WORKER_TOKEN_GENERATION_FAILED
compose exec -T database sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v worker_token="$1"' sh "$WORKER_TOKEN" < scripts/setup_max_production.sql
psql_file scripts/audit_max_production.sql | tee "$BACKUP/max-audit.txt"

PHASE=configuration
mkdir -p "$STACK/private-communications"
chown isvoi:isvoi "$STACK/private-communications"
chmod 700 "$STACK/private-communications"
ENV_CHANGED=true
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_ENABLED true
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_CLAMAV_HOST clamav
set_env "$DIRECTUS_ENV" ISVOI_MAX_SUPPORT_WEBHOOK_SECRET "$MAX_WEBHOOK_SECRET"
cat > "$WORKER_ENV" <<EOF
COMM_DIRECTUS_URL=http://127.0.0.1:8055
COMM_CONNECTION_ID=$CONNECTION_ID
COMM_WORKER_TOKEN=$WORKER_TOKEN
COMM_PLATFORM=max
COMM_PLATFORM_TOKEN=$MAX_BOT_TOKEN
COMM_MAX_TLS_CA_PATH=$ROOT/infra/communications/certificates/russian_trusted_root_ca.crt
COMM_MEDIA_HOSTS=
EOF
chmod 600 "$WORKER_ENV"
install -m 644 "$ROOT/infra/communications/isvoi-communications@.service" "$UNIT"
systemctl daemon-reload

PHASE=directus
compose up -d --force-recreate --no-deps directus >/dev/null
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null; then break; fi
  sleep 2
done
curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null || fail DIRECTUS_RESTART_TIMEOUT

PHASE=smoke
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 http://127.0.0.1:8055/isvoi-communications/v1/inbox) == 403 ]] || fail PUBLIC_INBOX_NOT_DENIED
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 -X POST -H 'content-type: application/json' -H 'x-max-bot-api-secret: invalid-test-secret' --data '{}' "http://127.0.0.1:8055/isvoi-communications/v1/webhooks/$CONNECTION_ID") == 403 ]] || fail WEBHOOK_SECRET_CHECK_FAILED
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $WORKER_TOKEN" -H 'content-type: application/json' --data '{}' "http://127.0.0.1:8055/isvoi-communications/v1/workers/$CONNECTION_ID/process") == 200 ]] || fail WORKER_SCOPE_CHECK_FAILED
systemctl enable --now isvoi-communications@process.service >/dev/null
systemctl is-active --quiet isvoi-communications@process.service || fail PROCESS_WORKER_NOT_ACTIVE

PHASE=complete
rm -f "$SECRETS_FILE"
rmdir "$LOCK"
LOCK_ACQUIRED=false
trap - EXIT
printf '{"status":"MAX_SERVER_READY_FOR_PILOT","connection_id":"%s","sending_enabled":false,"recovery_hold":true,"backup":"%s"}\n' "$CONNECTION_ID" "$BACKUP"
