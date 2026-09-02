#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/isvoi}"
STACK_DIR="${STACK_DIR:-$REPO_ROOT/infra/directus-beget}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups/directus}"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
TARGET_DIR="$BACKUP_DIR/$STAMP"
OFFSITE_BACKUP_DEST="${OFFSITE_BACKUP_DEST:-}"
OFFSITE_BACKUP_DRY_RUN="${OFFSITE_BACKUP_DRY_RUN:-0}"
INDEXNOW_STATE_DIR="${INDEXNOW_STATE_DIR:-$REPO_ROOT/var/indexnow}"

if [ ! -f "$STACK_DIR/docker-compose.yml" ]; then
  echo "Directus compose file not found: $STACK_DIR/docker-compose.yml" >&2
  exit 1
fi

if [ ! -f "$STACK_DIR/.env" ]; then
  echo "Directus env file not found: $STACK_DIR/.env" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

cd "$STACK_DIR"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "${DB_USER:-}" ] || [ -z "${DB_DATABASE:-}" ]; then
  echo "DB_USER and DB_DATABASE must be set in $STACK_DIR/.env" >&2
  exit 1
fi

echo "Writing backup to $TARGET_DIR"

docker compose exec -T database \
  pg_dump -U "$DB_USER" -d "$DB_DATABASE" \
  | gzip -9 > "$TARGET_DIR/postgres.sql.gz"

tar -C "$STACK_DIR" -czf "$TARGET_DIR/uploads.tar.gz" uploads

sha256sum \
  "$TARGET_DIR/postgres.sql.gz" \
  "$TARGET_DIR/uploads.tar.gz" \
  > "$TARGET_DIR/SHA256SUMS"

# IndexNow stores public URL fingerprints outside the compiled app. Its state
# file is replaced atomically, so copying it cannot capture a partial JSON write.
# Never copy the worker lock, temporary files, application env or IndexNow key.
if [ -f "$INDEXNOW_STATE_DIR/state.json" ]; then
  cp "$INDEXNOW_STATE_DIR/state.json" "$TARGET_DIR/indexnow-state.json"
  sha256sum "$TARGET_DIR/indexnow-state.json" >> "$TARGET_DIR/SHA256SUMS"
fi

gzip -t "$TARGET_DIR/postgres.sql.gz"
tar -tzf "$TARGET_DIR/uploads.tar.gz" >/dev/null
(cd "$TARGET_DIR" && sha256sum -c SHA256SUMS)

cat > "$TARGET_DIR/RESTORE.md" <<EOF
# ISVOI Directus Backup

Created: $STAMP
Source: $STACK_DIR
Off-server copy: ${OFFSITE_BACKUP_DEST:-not configured}

Files:
- postgres.sql.gz
- uploads.tar.gz
- SHA256SUMS
- indexnow-state.json (optional; present after IndexNow initialization)

Verify:

\`\`\`bash
cd "$TARGET_DIR"
sha256sum -c SHA256SUMS
gzip -t postgres.sql.gz
tar -tzf uploads.tar.gz >/dev/null
\`\`\`

Restore rehearsal should be done on a separate host/container first. Do not
pipe this dump into production unless you intentionally want to overwrite the
current database state.

If indexnow-state.json is present, preserve it with the backup. Restore it only
with the IndexNow timer stopped, to the configured state directory as state.json
owned by deploy (mode 0600). Do not restore worker.lock. Start with an IndexNow
preview and verify changes before restarting the timer. No keys are in this file.
EOF

if [ -n "$OFFSITE_BACKUP_DEST" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "OFFSITE_BACKUP_DEST is set, but rclone is not installed or not in PATH" >&2
    exit 1
  fi

  OFFSITE_TARGET="${OFFSITE_BACKUP_DEST%/}/$STAMP"

  cat > "$TARGET_DIR/OFFSITE_REMOTE.txt" <<EOF
$OFFSITE_TARGET
EOF

  echo "Uploading backup to $OFFSITE_TARGET"
  if [ "$OFFSITE_BACKUP_DRY_RUN" = "1" ]; then
    rclone copy "$TARGET_DIR" "$OFFSITE_TARGET" --dry-run
    echo "Off-server backup dry run completed"
  else
    rclone mkdir "$OFFSITE_TARGET"
    rclone copy "$TARGET_DIR" "$OFFSITE_TARGET"
    rclone check "$TARGET_DIR" "$OFFSITE_TARGET" --one-way --size-only
    echo "Off-server backup verified at $OFFSITE_TARGET"
  fi
else
  echo "OFFSITE_BACKUP_DEST is not set; skipping off-server copy"
fi

ls -lh "$TARGET_DIR"
