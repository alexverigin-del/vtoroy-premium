#!/usr/bin/env node
/**
 * Print idempotent SQL that removes prototype-era public device copy.
 *
 * Usage:
 *   node scripts/update_directus_device_public_copy_sql.mjs > /tmp/isvoi_device_public_copy.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_device_public_copy.sql
 */

process.stdout.write(String.raw`
BEGIN;

UPDATE devices
SET availability = replace(
  availability,
  'Иллюстративная карточка прототипа.',
  'Карточка проверена перед публикацией.'
)
WHERE availability LIKE '%Иллюстративная карточка прототипа.%';

COMMIT;
`);
