#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/isvoi}"
STACK_DIR="${STACK_DIR:-$REPO_ROOT/infra/directus-beget}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups/directus}"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
TARGET_DIR="$BACKUP_DIR/$STAMP"

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

gzip -t "$TARGET_DIR/postgres.sql.gz"
tar -tzf "$TARGET_DIR/uploads.tar.gz" >/dev/null
(cd "$TARGET_DIR" && sha256sum -c SHA256SUMS)

cat > "$TARGET_DIR/RESTORE.md" <<EOF
# ISVOI Directus Backup

Created: $STAMP
Source: $STACK_DIR

Files:
- postgres.sql.gz
- uploads.tar.gz
- SHA256SUMS

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
EOF

ls -lh "$TARGET_DIR"
