#!/usr/bin/env bash
set -euo pipefail

# Production catalog batch runner.
#
# Safe default: validate/dry-run only. Pass --apply to write to Directus.
#
# Example:
#   bash scripts/run_catalog_import_batch.sh \
#     --file /opt/isvoi/imports/2026-06-stock.xlsx \
#     --assets-root /opt/isvoi/imports/optimized \
#     --batch 2026-06-stock \
#     --apply

cd "$(dirname "$0")/.."

APPLY=0
FILE=""
ASSETS_ROOT=""
BATCH=""
SHEET=""
REPLACE_MEDIA=0
SKIP_MEDIA=0
DEFAULT_STATUS="draft"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --file)
      FILE="${2:-}"
      shift 2
      ;;
    --assets-root)
      ASSETS_ROOT="${2:-}"
      shift 2
      ;;
    --batch)
      BATCH="${2:-}"
      shift 2
      ;;
    --sheet)
      SHEET="${2:-}"
      shift 2
      ;;
    --replace-media)
      REPLACE_MEDIA=1
      shift
      ;;
    --skip-media)
      SKIP_MEDIA=1
      shift
      ;;
    --default-status)
      DEFAULT_STATUS="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$FILE" ]; then
  echo "--file is required" >&2
  exit 2
fi
if [ -z "$ASSETS_ROOT" ]; then
  echo "--assets-root is required" >&2
  exit 2
fi
if [ -z "$BATCH" ]; then
  BATCH="$(basename "$FILE" .xlsx)"
fi

if [ -f scripts/.env ]; then
  set -a
  . scripts/.env
  set +a
fi
if [ -f infra/directus-beget/.env ]; then
  set -a
  . infra/directus-beget/.env
  set +a
fi
if [ -f apps/web/.env.local ]; then
  set -a
  . apps/web/.env.local
  set +a
fi

if [ -z "${DIRECTUS_TOKEN:-}" ] && command -v docker >/dev/null 2>&1 && [ -f infra/directus-beget/docker-compose.yml ]; then
  DIRECTUS_TOKEN="$(
    printf "%s\n" "select token from directus_users where email = 'catalog-import@isvoi.local' limit 1;" \
      | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
          psql -U "$DB_USER" -d "$DB_DATABASE" -At
  )"
  export DIRECTUS_TOKEN
fi

if [ -z "${DIRECTUS_URL:-}" ] || [ -z "${DIRECTUS_TOKEN:-}" ]; then
  echo "DIRECTUS_URL and DIRECTUS_TOKEN are required." >&2
  exit 2
fi

PYTHON_BIN="python"
if [ -x .venv/bin/python ]; then
  PYTHON_BIN=".venv/bin/python"
fi

COMMON_ARGS=(
  --file "$FILE"
  --assets-root "$ASSETS_ROOT"
  --import-batch "$BATCH"
  --default-status "$DEFAULT_STATUS"
)
if [ -n "$SHEET" ]; then
  COMMON_ARGS+=(--sheet "$SHEET")
fi
if [ "$REPLACE_MEDIA" -eq 1 ]; then
  COMMON_ARGS+=(--replace-media)
fi
if [ "$SKIP_MEDIA" -eq 1 ]; then
  COMMON_ARGS+=(--skip-media)
fi

echo "Catalog batch: $BATCH"
echo "Workbook: $FILE"
echo "Assets root: $ASSETS_ROOT"
echo "Mode: $([ "$APPLY" -eq 1 ] && echo apply || echo dry-run)"

node scripts/setup_directus_file_folders_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
      psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1

"$PYTHON_BIN" scripts/import_devices_from_excel.py "${COMMON_ARGS[@]}" --dry-run

if [ "$APPLY" -ne 1 ]; then
  echo "Dry-run complete. Re-run with --apply to import this batch."
  exit 0
fi

"$PYTHON_BIN" scripts/import_devices_from_excel.py "${COMMON_ARGS[@]}"

node scripts/audit_directus_image_refs_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
      psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1

node scripts/audit_directus_catalog_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database \
      psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1
