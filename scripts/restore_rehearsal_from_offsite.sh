#!/usr/bin/env bash
set -euo pipefail

OFFSITE_BACKUP_DEST="${OFFSITE_BACKUP_DEST:-isvoi-backups:directus}"
OFFSITE_BACKUP_STAMP="${OFFSITE_BACKUP_STAMP:-}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
KEEP_REHEARSAL="${KEEP_REHEARSAL:-0}"

if ! command -v "$RCLONE_BIN" >/dev/null 2>&1; then
  echo "rclone not found. Set RCLONE_BIN or add rclone to PATH." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found. Restore rehearsal requires Docker." >&2
  exit 1
fi

if [ -z "$OFFSITE_BACKUP_STAMP" ]; then
  OFFSITE_BACKUP_STAMP="$("$RCLONE_BIN" lsf "$OFFSITE_BACKUP_DEST" --dirs-only | sed 's#/$##' | sort | tail -n 1)"
fi

if [ -z "$OFFSITE_BACKUP_STAMP" ]; then
  echo "Could not determine OFFSITE_BACKUP_STAMP from $OFFSITE_BACKUP_DEST" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/isvoi-restore-rehearsal.XXXXXX")"
BACKUP_DIR="$WORK_DIR/backup"
UPLOADS_DIR="$WORK_DIR/uploads-check"
CONTAINER="isvoi-restore-rehearsal-${OFFSITE_BACKUP_STAMP//[^a-zA-Z0-9]/-}"

cleanup() {
  if [ "$KEEP_REHEARSAL" = "1" ]; then
    echo "Keeping rehearsal workspace: $WORK_DIR"
    echo "Keeping rehearsal container: $CONTAINER"
    return
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  case "$WORK_DIR" in
    /tmp/isvoi-restore-rehearsal.*) rm -rf "$WORK_DIR" ;;
  esac
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR" "$UPLOADS_DIR"

echo "Copying off-server backup $OFFSITE_BACKUP_DEST/$OFFSITE_BACKUP_STAMP"
"$RCLONE_BIN" copy "${OFFSITE_BACKUP_DEST%/}/$OFFSITE_BACKUP_STAMP" "$BACKUP_DIR"

test -s "$BACKUP_DIR/postgres.sql.gz"
test -s "$BACKUP_DIR/uploads.tar.gz"
test -s "$BACKUP_DIR/SHA256SUMS"

(cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)
gzip -t "$BACKUP_DIR/postgres.sql.gz"
tar -tzf "$BACKUP_DIR/uploads.tar.gz" >/dev/null

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  -e POSTGRES_USER=isvoi \
  -e POSTGRES_PASSWORD=rehearsal \
  -e POSTGRES_DB=directus \
  "$POSTGRES_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U isvoi -d directus >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$CONTAINER" pg_isready -U isvoi -d directus >/dev/null

gunzip -c "$BACKUP_DIR/postgres.sql.gz" \
  | docker exec -i "$CONTAINER" psql -U isvoi -d directus -v ON_ERROR_STOP=1 >/dev/null

TABLE_COUNT="$(docker exec "$CONTAINER" psql -U isvoi -d directus -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('devices','device_images','directus_files','leads');")"
DEVICE_COUNT="$(docker exec "$CONTAINER" psql -U isvoi -d directus -Atc "SELECT count(*) FROM devices;")"
FILE_COUNT="$(docker exec "$CONTAINER" psql -U isvoi -d directus -Atc "SELECT count(*) FROM directus_files;")"

tar -C "$UPLOADS_DIR" -xzf "$BACKUP_DIR/uploads.tar.gz"
UPLOAD_COUNT="$(find "$UPLOADS_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"

if [ "$TABLE_COUNT" -lt 4 ]; then
  echo "Expected core tables were not restored; table count: $TABLE_COUNT" >&2
  exit 1
fi

if [ "$UPLOAD_COUNT" -lt 1 ]; then
  echo "Expected at least one uploaded file in uploads archive" >&2
  exit 1
fi

cat <<EOF
Restore rehearsal passed
Backup stamp: $OFFSITE_BACKUP_STAMP
Core tables found: $TABLE_COUNT
Devices: $DEVICE_COUNT
Directus files: $FILE_COUNT
Upload files: $UPLOAD_COUNT
EOF
