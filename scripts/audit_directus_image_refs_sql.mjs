#!/usr/bin/env node
/**
 * Print SQL that checks Directus content for legacy local image references.
 *
 * Usage:
 *   node scripts/audit_directus_image_refs_sql.mjs > /tmp/isvoi_audit_directus_image_refs_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_audit_directus_image_refs_sql.sql
 */

process.stdout.write(String.raw`
CREATE OR REPLACE FUNCTION pg_temp.isvoi_is_local_asset(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_value, '') LIKE 'assets/%'
      OR coalesce(p_value, '') LIKE '/assets/%';
$$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_json_has_local_asset(p_value jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk(value) AS (
    SELECT p_value
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT e.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value ELSE '{}'::jsonb END) AS e
      UNION ALL
      SELECT a.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.value) = 'array' THEN walk.value ELSE '[]'::jsonb END) AS a
    ) AS child
  )
  SELECT EXISTS (
    SELECT 1
    FROM walk
    WHERE jsonb_typeof(value) = 'string'
      AND pg_temp.isvoi_is_local_asset(value #>> '{}')
  );
$$;

SELECT 'devices.listing_image.local' AS check_name, count(*)::text AS value
FROM devices
WHERE pg_temp.isvoi_is_local_asset(listing_image)
UNION ALL
SELECT 'devices.gallery.local', count(*)::text
FROM devices
WHERE pg_temp.isvoi_json_has_local_asset(gallery::jsonb)
UNION ALL
SELECT 'devices.passport.local', count(*)::text
FROM devices
WHERE pg_temp.isvoi_json_has_local_asset(passport::jsonb)
UNION ALL
SELECT 'page_sections.content.local', count(*)::text
FROM page_sections
WHERE pg_temp.isvoi_json_has_local_asset(content::jsonb)
UNION ALL
SELECT 'devices.with_listing_file', count(*)::text
FROM devices
WHERE listing_file IS NOT NULL
UNION ALL
SELECT 'device_images.with_file', count(*)::text
FROM device_images
WHERE image IS NOT NULL;
`);
