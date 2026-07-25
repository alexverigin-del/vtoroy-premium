#!/usr/bin/env node
/**
 * Print idempotent SQL for public lead-form hardening copy.
 *
 * The product form fields live in device_page_settings and are created by
 * setup_directus_device_page_settings_sql.mjs. This script handles flexible
 * page-section forms such as the homepage final CTA.
 */

const consentNote =
  "Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке.";

function sql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

process.stdout.write(String.raw`
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE page_sections
SET content = jsonb_set(
    COALESCE(content::jsonb, '{}'::jsonb),
    '{form}',
    COALESCE(content::jsonb -> 'form', '{}'::jsonb)
      || jsonb_build_object('consent_note', ${sql(consentNote)}::text),
    true
  )::json
WHERE section_key = 'final_cta'
  AND COALESCE(is_active, false) = true
  AND (
    content IS NULL
    OR NULLIF(content::jsonb #>> '{form,consent_note}', '') IS NULL
  );

UPDATE directus_fields
SET note = CASE
    WHEN note LIKE '%consent_note%' THEN note
    ELSE concat_ws(E'\n\n', note, 'Для формы final_cta в JSON-настройках можно редактировать form.consent_note — короткий текст согласия под кнопкой заявки.')
  END
WHERE collection = 'page_sections'
  AND field = 'content';

SELECT 'lead_hardening.final_cta_consent_copy' AS check_name, count(*)::text AS value
FROM page_sections
WHERE section_key = 'final_cta'
  AND COALESCE(is_active, false) = true
  AND NULLIF(content::jsonb #>> '{form,consent_note}', '') IS NOT NULL
UNION ALL
SELECT 'lead_hardening.device_consent_fields', count(*)::text
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'device_page_settings'
  AND column_name IN (
    'lead_available_consent_note',
    'lead_reserved_consent_note',
    'lead_sold_consent_note'
  );

COMMIT;
`);
