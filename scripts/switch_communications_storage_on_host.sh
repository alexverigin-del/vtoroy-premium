#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=/opt/isvoi
STACK="$ROOT/infra/directus-beget"
DIRECTUS_ENV="$STACK/.env"
TARGET=${1:-}
BACKUP_ENV=/etc/isvoi/communications-backup.env
HOST_ACCESS_SECRET=/etc/isvoi/secrets/communications_s3_access_key
HOST_SECRET_SECRET=/etc/isvoi/secrets/communications_s3_secret_key
ROLLBACK_ENV="$(mktemp /tmp/isvoi-directus-env.XXXXXX)"
CHANGED=false

fail() { printf '%s\n' "$1; secret details suppressed." >&2; exit 1; }
compose() { docker compose -f "$STACK/docker-compose.yml" --project-directory "$STACK" "$@"; }
set_env() {
  local file=$1 key=$2 value=$3 temporary
  temporary=$(mktemp)
  awk -v key="$key" -v line="$key=$value" '
    BEGIN { found=0 }
    index($0, key "=")==1 { if (!found) print line; found=1; next }
    { print }
    END { if (!found) print line }
  ' "$file" >"$temporary"
  install -m 600 "$temporary" "$file"
  rm -f "$temporary"
}
rollback() {
  local status=$?
  trap - ERR EXIT
  if [[ $status -ne 0 && $CHANGED == true ]]; then
    install -m 600 "$ROLLBACK_ENV" "$DIRECTUS_ENV"
    compose up -d --force-recreate --no-deps directus >/dev/null 2>&1 || true
  fi
  rm -f "$ROLLBACK_ENV"
  exit "$status"
}
trap rollback ERR EXIT

[[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
[[ $TARGET == local || $TARGET == s3 ]] || fail TARGET_DRIVER_MUST_BE_LOCAL_OR_S3
[[ -f $DIRECTUS_ENV ]] || fail DIRECTUS_ENV_MISSING
cp "$DIRECTUS_ENV" "$ROLLBACK_ENV"

if [[ $TARGET == s3 ]]; then
  [[ -f $BACKUP_ENV ]] || fail BACKUP_ENV_MISSING
  live_remote="$(sed -n 's/^COMM_LIVE_S3_REMOTE=//p' "$BACKUP_ENV" | tail -n 1)"
  live_config="$(sed -n 's/^COMM_LIVE_S3_RCLONE_CONFIG=//p' "$BACKUP_ENV" | tail -n 1)"
  [[ $live_remote == *:* && -f $live_config ]] || fail LIVE_S3_BACKUP_NOT_CONFIGURED
  for secret in "$HOST_ACCESS_SECRET" "$HOST_SECRET_SECRET"; do
    [[ -f $secret && $(stat -c %a "$secret") == 600 ]] || fail STORAGE_SECRET_NOT_PRIVATE
  done
  systemctl start isvoi-communications-backup.service
  [[ $(systemctl show isvoi-communications-backup.service -p Result --value) == success ]] \
    || fail PRE_SWITCH_BACKUP_FAILED
  systemctl start isvoi-communications-backup-health.service
fi

CHANGED=true
set_env "$DIRECTUS_ENV" ISVOI_COMMUNICATIONS_STORAGE_DRIVER "$TARGET"
compose config --quiet
compose up -d --force-recreate --no-deps directus >/dev/null
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null; then break; fi
  sleep 2
done
curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null \
  || fail DIRECTUS_RESTART_TIMEOUT
actual="$(compose exec -T directus sh -lc 'printf %s "$ISVOI_COMMUNICATIONS_STORAGE_DRIVER"')"
[[ $actual == "$TARGET" ]] || fail STORAGE_DRIVER_NOT_APPLIED
if [[ $TARGET == s3 ]]; then
  compose exec -T directus sh -lc \
    'test -r /run/secrets/communications_s3_access_key && test -r /run/secrets/communications_s3_secret_key' \
    || fail DIRECTUS_SECRETS_NOT_READABLE
fi
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
  http://127.0.0.1:8055/isvoi-communications/v1/inbox) == 403 ]] \
  || fail PUBLIC_INBOX_NOT_DENIED

CHANGED=false
rm -f "$ROLLBACK_ENV"
trap - ERR EXIT
printf '{"status":"COMMUNICATIONS_STORAGE_SWITCHED","write_driver":"%s"}\n' "$TARGET"
