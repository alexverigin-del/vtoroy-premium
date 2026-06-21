#!/usr/bin/env node

/**
 * Print idempotent SQL that normalizes legacy static-site URLs stored in Directus.
 *
 * Usage:
 *   node scripts/normalize_directus_site_urls_sql.mjs > /tmp/isvoi_normalize_directus_site_urls_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_normalize_directus_site_urls_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE OR REPLACE FUNCTION isvoi_normalize_site_url_text(input text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  value text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  value := btrim(input);

  IF value = '' OR value ~* '^(https?:|mailto:|tel:|#)' THEN
    RETURN value;
  END IF;

  value := regexp_replace(value, '^(\.\./)+', '/');

  IF left(value, 1) <> '/' THEN
    value := '/' || value;
  END IF;

  IF value = '/index.html' THEN
    RETURN '/';
  END IF;

  value := regexp_replace(value, '^/(catalog|store|passport|trade|club)/index\.html$', '/\1');
  value := regexp_replace(value, '^/device/([^/]+)/index\.html$', '/device/\1');

  RETURN value;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_normalize_site_url_json_text(input text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT CASE
    WHEN input IS NULL THEN input
    ELSE regexp_replace(
      regexp_replace(
        input,
        '"(?:\.\./)?/?(catalog|store|passport|trade|club)/index\.html"',
        '"/\1"',
        'g'
      ),
      '"(?:\.\./)?/?device/([^"/]+)/index\.html"',
      '"/device/\1"',
      'g'
    )
  END;
$$;

UPDATE navigation_items
SET url = isvoi_normalize_site_url_text(url)
WHERE url IS DISTINCT FROM isvoi_normalize_site_url_text(url);

UPDATE page_sections
SET
  primary_cta_url = isvoi_normalize_site_url_text(primary_cta_url),
  secondary_cta_url = isvoi_normalize_site_url_text(secondary_cta_url)
WHERE
  primary_cta_url IS DISTINCT FROM isvoi_normalize_site_url_text(primary_cta_url)
  OR secondary_cta_url IS DISTINCT FROM isvoi_normalize_site_url_text(secondary_cta_url);

DO $$
DECLARE
  content_type text;
BEGIN
  SELECT data_type INTO content_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'page_sections'
    AND column_name = 'content';

  IF content_type = 'jsonb' THEN
    UPDATE page_sections
    SET content = isvoi_normalize_site_url_json_text(content::text)::jsonb
    WHERE content IS NOT NULL
      AND content::text IS DISTINCT FROM isvoi_normalize_site_url_json_text(content::text);
  ELSIF content_type = 'json' THEN
    UPDATE page_sections
    SET content = isvoi_normalize_site_url_json_text(content::text)::json
    WHERE content IS NOT NULL
      AND content::text IS DISTINCT FROM isvoi_normalize_site_url_json_text(content::text);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.cta_links') IS NOT NULL THEN
    UPDATE cta_links
    SET url = isvoi_normalize_site_url_text(url)
    WHERE url IS DISTINCT FROM isvoi_normalize_site_url_text(url);
  END IF;

  IF to_regclass('public.devices') IS NOT NULL THEN
    UPDATE devices
    SET detail_href = isvoi_normalize_site_url_text(detail_href)
    WHERE detail_href IS DISTINCT FROM isvoi_normalize_site_url_text(detail_href);
  END IF;
END;
$$;

DROP FUNCTION isvoi_normalize_site_url_json_text(text);
DROP FUNCTION isvoi_normalize_site_url_text(text);

COMMIT;

SELECT 'legacy_url_remaining' AS check_name, count(*)::text AS value
FROM (
  SELECT url AS value FROM navigation_items
  UNION ALL SELECT primary_cta_url FROM page_sections
  UNION ALL SELECT secondary_cta_url FROM page_sections
  UNION ALL SELECT content::text FROM page_sections
  UNION ALL SELECT detail_href FROM devices
) source
WHERE value ~ '(^|/)(catalog|store|passport|trade|club)/index\.html'
   OR value ~ '(^|/)device/[^/]+/index\.html';
`);
