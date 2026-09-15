#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ACTION=${1:-preflight}
ROOT=${ISVOI_ROOT:-/opt/isvoi}
STACK="$ROOT/infra/directus-beget"
DIRECTUS_ENV="$STACK/.env"
CONNECTION_ID=7c4123ea-3330-4c56-9b14-bdf72f49ae7f
BOT_ID=8694946838
TELEGRAM_ENV=/etc/isvoi/communications-telegram.env
LOCK="$ROOT/var/telegram-communications-cutover.lock"
STATE="$ROOT/var/telegram-communications-cutover.state"
PM2_HOME=/home/deploy/.pm2
PHASE=preflight
LOCKED=false
RECEIVE_STARTED=false
ENV_BACKUP=

fail() {
  printf '%s (%s)\n' "$1" "$PHASE" >&2
  return 1
}

compose() {
  docker compose -f "$STACK/docker-compose.yml" --project-directory "$STACK" "$@"
}

db_query() {
  compose exec -T database sh -c \
    'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XAtq -v ON_ERROR_STOP=1'
}

pm2_deploy() {
  runuser -u deploy -- env PM2_HOME="$PM2_HOME" pm2 "$@"
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
  ' "$file" >"$temporary"
  install -m 600 "$temporary" "$file"
  rm -f "$temporary"
}

wait_directus() {
  local attempt
  for attempt in $(seq 1 60); do
    if curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null; then
      return 0
    fi
    sleep 2
  done
  fail DIRECTUS_RESTART_TIMEOUT
}

new_work_count() {
  local since=$1
  [[ $since =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail CUTOVER_TIMESTAMP_INVALID
  cat <<SQL | db_query | sed '/^$/d' | tail -1
SELECT
 (SELECT count(*) FROM comm_inbound WHERE connection_id='$CONNECTION_ID' AND received_at >= '$since'::timestamptz) +
 (SELECT count(*) FROM comm_outbox WHERE connection_id='$CONNECTION_ID' AND created_at >= '$since'::timestamptz) +
 (SELECT count(*) FROM comm_messages WHERE thread_id IN
   (SELECT id FROM comm_threads WHERE connection_id='$CONNECTION_ID')
   AND received_at >= '$since'::timestamptz) +
 (SELECT count(*) FROM comm_consent_events WHERE identity_id IN
   (SELECT id FROM comm_identities WHERE connection_id='$CONNECTION_ID')
   AND created_at >= '$since'::timestamptz) +
 (SELECT count(*) FROM comm_subscriptions WHERE identity_id IN
   (SELECT id FROM comm_identities WHERE connection_id='$CONNECTION_ID')
   AND updated_at >= '$since'::timestamptz)
 AS work_count;
SQL
}

preflight() {
  local status row backup_age running_backups legacy_state env_mode
  [[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
  [[ -f $DIRECTUS_ENV ]] || fail DIRECTUS_ENV_REQUIRED
  [[ -f $TELEGRAM_ENV ]] || fail TELEGRAM_WORKER_ENV_REQUIRED
  [[ -f $ROOT/scripts/migrate_communications.mjs ]] || fail MIGRATION_SCRIPT_REQUIRED
  [[ -f /etc/systemd/system/isvoi-communications-telegram@.service ]] || fail TELEGRAM_UNIT_REQUIRED
  [[ $(stat -c '%a:%U:%G' "$TELEGRAM_ENV") == 600:root:root ]] || fail TELEGRAM_ENV_NOT_PRIVATE
  [[ -z $(runuser -u deploy -- git -C "$ROOT" status --porcelain 2>/dev/null) ]] || fail PRODUCTION_WORKTREE_DIRTY
  compose config --quiet
  compose ps --status running database directus | grep -q directus || fail DIRECTUS_STACK_NOT_RUNNING
  curl --fail --silent --max-time 2 http://127.0.0.1:8055/server/ping >/dev/null || fail DIRECTUS_UNHEALTHY

  status=$(pm2_deploy pid isvoi-telegram | tail -1)
  [[ $status =~ ^[1-9][0-9]*$ ]] || fail LEGACY_TELEGRAM_NOT_ONLINE
  for mode in receive process send media; do
    systemctl is-active --quiet "isvoi-communications-telegram@${mode}.service" &&
      fail TELEGRAM_NEW_WORKER_ALREADY_ACTIVE
  done
  for mode in process send media; do
    systemctl is-active --quiet "isvoi-communications@${mode}.service" || fail MAX_WORKER_NOT_ACTIVE
  done

  row=$(cat <<SQL | db_query | sed '/^$/d' | tail -1
SELECT concat_ws('|', enabled::text, mode, external_id, worker_user_id::text,
 settings->>'migration_state', settings->>'data_ready', settings->>'cutover_approved',
 marketing_enabled::text)
FROM comm_connections WHERE id='$CONNECTION_ID' AND platform='telegram';
SQL
  )
  [[ $row == "false|production|$BOT_ID|7449da36-9451-48c7-8577-c159b9554110|shadow_ready|true|false|false" ]] ||
    fail TELEGRAM_SHADOW_NOT_READY
  row=$(printf '%s\n' \
    "SELECT concat_ws('|',active::text,sending_enabled::text,recovery_hold::text) FROM comm_runtime WHERE id=1;" |
    db_query | sed '/^$/d' | tail -1)
  [[ $row == true\|true\|false ]] || fail COMMUNICATIONS_RUNTIME_NOT_LIVE
  running_backups=$(printf '%s\n' "SELECT count(*)::int FROM comm_backups WHERE state='running';" |
    db_query | sed '/^$/d' | tail -1)
  [[ $running_backups == 0 ]] || fail BACKUP_ALREADY_RUNNING
  backup_age=$(printf '%s\n' \
    "SELECT coalesce(extract(epoch FROM now()-max(completed_at))::bigint,999999) FROM comm_backups WHERE state='completed' AND external_verified;" |
    db_query | sed '/^$/d' | tail -1)
  [[ $backup_age =~ ^[0-9]+$ && $backup_age -le 3600 ]] || fail VERIFIED_BACKUP_TOO_OLD
  legacy_state=$(grep -E '^ISVOI_TELEGRAM_USE_COMMUNICATIONS=' "$DIRECTUS_ENV" | tail -1 | cut -d= -f2- || true)
  [[ -z $legacy_state || $legacy_state == false ]] || fail TELEGRAM_CUTOVER_FLAG_ALREADY_SET
  env_mode=$(grep -E '^COMM_PLATFORM=' "$TELEGRAM_ENV" | tail -1 | cut -d= -f2- || true)
  [[ $env_mode == telegram ]] || fail TELEGRAM_WORKER_ENV_INVALID
  printf 'TELEGRAM_CUTOVER_PREFLIGHT_OK backup_age_seconds=%s\n' "$backup_age"
}

rollback_before_ingress() {
  local work since
  PHASE=rollback
  [[ $EUID -eq 0 ]] || fail ROOT_REQUIRED
  [[ -f $STATE ]] || fail CUTOVER_STATE_REQUIRED
  [[ ! -e $LOCK ]] || fail CUTOVER_ALREADY_RUNNING
  mkdir "$LOCK" || fail CUTOVER_ALREADY_RUNNING
  LOCKED=true
  # Wait for the receiver to finish its current poll and journal write.
  systemctl stop isvoi-communications-telegram@receive.service >/dev/null
  since=$(sed -n 's/^CUTOVER_AT=//p' "$STATE" | tail -1)
  work=$(new_work_count "$since")
  if [[ $work != 0 ]]; then
    systemctl start isvoi-communications-telegram@receive.service >/dev/null
    rmdir "$LOCK"
    LOCKED=false
    fail ROLLBACK_REFUSED_AFTER_NEW_WORK
  fi
  systemctl disable --now \
    isvoi-communications-telegram@receive.service \
    isvoi-communications-telegram@process.service \
    isvoi-communications-telegram@send.service \
    isvoi-communications-telegram@media.service >/dev/null 2>&1 || true
  ENV_BACKUP=$(sed -n 's/^ENV_BACKUP=//p' "$STATE" | tail -1)
  [[ -n $ENV_BACKUP && -f $ENV_BACKUP ]] || fail CUTOVER_ENV_BACKUP_REQUIRED
  install -m 600 "$ENV_BACKUP" "$DIRECTUS_ENV"
  cat <<SQL | db_query >/dev/null
BEGIN;
UPDATE comm_connections SET enabled=false, name='Telegram · подготовка переноса',
 poll_owner=NULL, poll_until=NULL,
 settings=(settings-'cutover_at'-'cutover_journal_sequence') ||
   '{"migration_state":"shadow_ready","data_ready":true,"cutover_approved":false}'::jsonb
WHERE id='$CONNECTION_ID';
COMMIT;
SQL
  compose up -d --force-recreate --no-deps directus >/dev/null
  wait_directus
  pm2_deploy restart isvoi-telegram --update-env >/dev/null
  [[ $(pm2_deploy pid isvoi-telegram | tail -1) =~ ^[1-9][0-9]*$ ]] || fail LEGACY_TELEGRAM_RESTART_FAILED
  rm -f "$STATE"
  rmdir "$LOCK"
  LOCKED=false
  printf 'TELEGRAM_CUTOVER_ROLLED_BACK_BEFORE_INGRESS\n'
}

automatic_failure() {
  local code=$? work since
  trap - ERR EXIT
  if [[ $LOCKED == true ]]; then
    if [[ $RECEIVE_STARTED == false && -n $ENV_BACKUP && -f $ENV_BACKUP ]]; then
      set +e
      systemctl disable --now \
        isvoi-communications-telegram@receive.service \
        isvoi-communications-telegram@process.service \
        isvoi-communications-telegram@send.service \
        isvoi-communications-telegram@media.service >/dev/null 2>&1
      since=$(sed -n 's/^CUTOVER_AT=//p' "$STATE" 2>/dev/null | tail -1)
      if [[ -n $since ]]; then
        work=$(new_work_count "$since" 2>/dev/null)
      else
        work=0
      fi
      if [[ ! $work =~ ^[0-9]+$ || $work != 0 ]]; then
        printf 'TELEGRAM_CUTOVER_REQUIRES_FIX_FORWARD phase=%s\n' "$PHASE" >&2
        rmdir "$LOCK" >/dev/null 2>&1 || true
        exit "$code"
      fi
      install -m 600 "$ENV_BACKUP" "$DIRECTUS_ENV"
      cat <<SQL | db_query >/dev/null 2>&1
UPDATE comm_connections SET enabled=false, name='Telegram · подготовка переноса',
 poll_owner=NULL,poll_until=NULL,
 settings=(settings-'cutover_at'-'cutover_journal_sequence') ||
 '{"migration_state":"shadow_ready","data_ready":true,"cutover_approved":false}'::jsonb
WHERE id='$CONNECTION_ID';
SQL
      compose up -d --force-recreate --no-deps directus >/dev/null 2>&1
      wait_directus >/dev/null 2>&1
      pm2_deploy restart isvoi-telegram --update-env >/dev/null 2>&1
      rm -f "$STATE"
      printf 'TELEGRAM_CUTOVER_FAILED_AND_ROLLED_BACK phase=%s\n' "$PHASE" >&2
    else
      printf 'TELEGRAM_CUTOVER_REQUIRES_FIX_FORWARD phase=%s\n' "$PHASE" >&2
    fi
    rmdir "$LOCK" >/dev/null 2>&1 || true
  fi
  exit "$code"
}

apply_cutover() {
  local rehearsal journal_sequence cutover_at
  preflight
  install -d -m 700 "$ROOT/var" "$ROOT/backups"
  mkdir "$LOCK" || fail CUTOVER_ALREADY_RUNNING
  LOCKED=true
  trap automatic_failure ERR EXIT

  PHASE=backup
  # A full offsite copy is prepared before the agreed window. The 30-minute
  # timer keeps it fresh; do not spend the ten-minute cutover waiting for S3.
  /usr/local/sbin/isvoi-communications-backup-health >/dev/null || fail CUTOVER_BACKUP_NOT_VERIFIED
  ENV_BACKUP="$ROOT/backups/telegram-cutover-$(date -u +%Y%m%dT%H%M%SZ).env"
  install -m 600 "$DIRECTUS_ENV" "$ENV_BACKUP"

  PHASE=legacy-stop
  pm2_deploy stop isvoi-telegram >/dev/null
  [[ $(pm2_deploy pid isvoi-telegram | tail -1) == 0 ]] || fail LEGACY_TELEGRAM_STOP_FAILED
  rehearsal=$(printf '%s\n' \
    "SELECT count(*)::int FROM telegram_message_outbox WHERE bot_id=$BOT_ID AND state IN ('pending','in_flight','uncertain');" |
    db_query | sed '/^$/d' | tail -1)
  [[ $rehearsal == 0 ]] || fail LEGACY_OUTBOX_UNRESOLVED

  PHASE=final-backfill
  rehearsal=$(compose run --rm --no-deps -T \
    -v "$ROOT:/workspace:ro" -w /workspace \
    -e COMM_CONNECTION_ID="$CONNECTION_ID" -e COMM_REQUIRE_DATA_READY=true \
    directus node scripts/migrate_communications.mjs backfill)
  grep -q '"data_ready": true' <<<"$rehearsal" || fail FINAL_BACKFILL_NOT_READY
  journal_sequence=$(printf '%s\n' "SELECT coalesce(max(sequence),0) FROM comm_migration_changes;" |
    db_query | sed '/^$/d' | tail -1)
  [[ $journal_sequence =~ ^[0-9]+$ ]] || fail CHANGE_JOURNAL_INVALID

  PHASE=directus-switch
  set_env "$DIRECTUS_ENV" ISVOI_TELEGRAM_USE_COMMUNICATIONS true
  compose up -d --force-recreate --no-deps directus >/dev/null
  wait_directus
  [[ $(compose exec -T directus sh -lc 'printf %s "$ISVOI_TELEGRAM_USE_COMMUNICATIONS"') == true ]] ||
    fail TELEGRAM_CUTOVER_FLAG_NOT_APPLIED

  PHASE=connection-switch
  cutover_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf 'ENV_BACKUP=%s\n' "$ENV_BACKUP" >"$STATE"
  printf 'CUTOVER_AT=%s\n' "$cutover_at" >>"$STATE"
  cat <<SQL | db_query >/dev/null
BEGIN;
UPDATE comm_connections SET enabled=true, name='Telegram', error_code=NULL,
 poll_owner=NULL, poll_until=NULL, send_after=now(),
 settings=settings || jsonb_build_object(
   'migration_state','live','data_ready',true,'cutover_approved',true,
   'cutover_at','$cutover_at','cutover_journal_sequence',$journal_sequence)
WHERE id='$CONNECTION_ID' AND platform='telegram' AND enabled=false;
DO \$\$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM comm_connections WHERE id='$CONNECTION_ID' AND enabled=true) THEN
  RAISE EXCEPTION 'Telegram connection activation failed';
 END IF;
END \$\$;
COMMIT;
SQL

  PHASE=workers
  systemctl enable --now \
    isvoi-communications-telegram@process.service \
    isvoi-communications-telegram@send.service \
    isvoi-communications-telegram@media.service >/dev/null
  for mode in process send media; do
    systemctl is-active --quiet "isvoi-communications-telegram@${mode}.service" || fail TELEGRAM_WORKER_START_FAILED
  done
  systemctl enable --now isvoi-communications-telegram@receive.service >/dev/null
  RECEIVE_STARTED=true
  systemctl is-active --quiet isvoi-communications-telegram@receive.service || fail TELEGRAM_RECEIVER_START_FAILED
  sleep 3
  for mode in receive process send media; do
    systemctl is-active --quiet "isvoi-communications-telegram@${mode}.service" || fail TELEGRAM_WORKER_UNSTABLE
  done
  [[ $(pm2_deploy pid isvoi-telegram | tail -1) == 0 ]] || fail LEGACY_TELEGRAM_RESTARTED

  trap - ERR EXIT
  rmdir "$LOCK"
  LOCKED=false
  printf 'TELEGRAM_CUTOVER_LIVE cutover_at=%s journal_sequence=%s\n' "$cutover_at" "$journal_sequence"
}

case "$ACTION" in
  preflight) preflight ;;
  apply) apply_cutover ;;
  rollback-before-ingress) rollback_before_ingress ;;
  *) printf 'Use preflight | apply | rollback-before-ingress\n' >&2; exit 2 ;;
esac
