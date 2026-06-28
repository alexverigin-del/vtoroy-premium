#!/usr/bin/env node
/**
 * Print SQL that snapshots remaining legacy catalog fallback usage.
 *
 * Usage on Beget:
 *   node scripts/audit_directus_legacy_fallback_sql.mjs > /tmp/isvoi_audit_legacy_fallback.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_audit_legacy_fallback.sql
 */

process.stdout.write(String.raw`
CREATE TEMP TABLE isvoi_legacy_usage AS
WITH visible_devices AS (
  SELECT *
  FROM devices
  WHERE status = 'published'
    AND coalesce(stock_status, 'available') <> 'hidden'
),
published_images AS (
  SELECT *
  FROM device_images
  WHERE status = 'published'
    AND coalesce(shot_status, 'approved') = 'approved'
),
legacy_usage AS (
  SELECT
    d.id,
    d.title,
    d.listing_file IS NULL
      AND coalesce(d.listing_image, '') <> '' AS uses_listing_image,
    NOT EXISTS (
      SELECT 1
      FROM published_images i
      WHERE i.device = d.id
        AND i.role = 'card'
        AND i.image IS NOT NULL
    ) AS missing_card_image,
    NOT EXISTS (
      SELECT 1
      FROM published_images i
      WHERE i.device = d.id
        AND i.image IS NOT NULL
    )
      AND d.gallery IS NOT NULL
      AND d.gallery::text NOT IN ('null', '[]', '{}') AS uses_gallery_json,
    NOT EXISTS (
      SELECT 1
      FROM device_passports p
      WHERE p.device = d.id
    )
      AND d.passport IS NOT NULL
      AND d.passport::text NOT IN ('null', '[]', '{}') AS uses_passport_json,
    NOT EXISTS (
      SELECT 1
      FROM trade_options t
      WHERE t.device = d.id
    )
      AND d.trade IS NOT NULL
      AND d.trade::text NOT IN ('null', '[]', '{}') AS uses_trade_json
  FROM visible_devices d
)
SELECT *
FROM legacy_usage;

SELECT 'visible_devices.total' AS check_name, count(*)::text AS value
FROM isvoi_legacy_usage
UNION ALL
SELECT 'legacy.listing_image_fallback', count(*)::text
FROM isvoi_legacy_usage
WHERE uses_listing_image
UNION ALL
SELECT 'legacy.missing_card_image', count(*)::text
FROM isvoi_legacy_usage
WHERE missing_card_image
UNION ALL
SELECT 'legacy.gallery_json_fallback', count(*)::text
FROM isvoi_legacy_usage
WHERE uses_gallery_json
UNION ALL
SELECT 'legacy.passport_json_fallback', count(*)::text
FROM isvoi_legacy_usage
WHERE uses_passport_json
UNION ALL
SELECT 'legacy.trade_json_fallback', count(*)::text
FROM isvoi_legacy_usage
WHERE uses_trade_json
UNION ALL
SELECT 'legacy.any_fallback', count(*)::text
FROM isvoi_legacy_usage
WHERE uses_listing_image
   OR missing_card_image
   OR uses_gallery_json
   OR uses_passport_json
   OR uses_trade_json;

SELECT id, title
FROM isvoi_legacy_usage
WHERE uses_listing_image
   OR missing_card_image
   OR uses_gallery_json
   OR uses_passport_json
   OR uses_trade_json
ORDER BY id;
`);
