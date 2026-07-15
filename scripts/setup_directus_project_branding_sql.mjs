#!/usr/bin/env node
/**
 * Print idempotent SQL that applies ISVOI project branding to Directus Studio.
 *
 * Usage:
 *   node scripts/setup_directus_project_branding_sql.mjs > /tmp/isvoi_setup_directus_project_branding.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_project_branding.sql
 */

const utf8Text = (value) => `convert_from(decode('${Buffer.from(value, "utf8").toString("hex")}', 'hex'), 'UTF8')`;

process.stdout.write(`
BEGIN;

UPDATE directus_settings
SET
  project_name = 'ISVOI',
  project_descriptor = ${utf8Text("Клуб разумного владения")},
  project_color = '#1d1d1f',
  project_logo = COALESCE(
    (
      SELECT id
      FROM directus_files
      WHERE filename_download = 'favicon.svg'
         OR title = 'isvoi:site:favicon'
      ORDER BY
        CASE WHEN title = 'isvoi:site:favicon' THEN 0 ELSE 1 END,
        uploaded_on DESC
      LIMIT 1
    ),
    project_logo
  ),
  public_favicon = COALESCE(
    (
      SELECT id
      FROM directus_files
      WHERE filename_download = 'favicon.ico'
         OR title = 'isvoi:site:favicon-gold'
         OR filename_download = 'favicon.svg'
         OR title = 'isvoi:site:favicon'
      ORDER BY
        CASE
          WHEN title = 'isvoi:site:favicon-gold' THEN 0
          WHEN filename_download = 'favicon.ico' THEN 1
          WHEN title = 'isvoi:site:favicon' THEN 2
          ELSE 3
        END,
        uploaded_on DESC
      LIMIT 1
    ),
    public_favicon
  ),
  public_note = ${utf8Text("ISVOI Studio: контент сайта, каталог устройств, заявки и импорт.")},
  default_language = 'ru-RU',
  public_registration = false,
  public_registration_verify_email = true;

COMMIT;

SELECT
  'directus_project_branding='
  || project_name || '|'
  || COALESCE(project_descriptor, '') || '|'
  || COALESCE(project_color, '') || '|'
  || COALESCE(project_logo::text, '') || '|'
  || COALESCE(public_favicon::text, '') || '|'
  || COALESCE(public_note, '')
FROM directus_settings
LIMIT 1;
`);
