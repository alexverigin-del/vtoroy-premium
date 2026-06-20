#!/usr/bin/env node
/**
 * Print SQL that checks catalog readiness for commercial production imports.
 *
 * Usage:
 *   node scripts/audit_directus_catalog_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
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
)
SELECT 'devices.total' AS check_name, count(*)::text AS value
FROM devices
UNION ALL
SELECT 'devices.visible', count(*)::text
FROM visible_devices
UNION ALL
SELECT 'devices.visible.available', count(*)::text
FROM visible_devices
WHERE stock_status = 'available'
UNION ALL
SELECT 'devices.visible.reserved', count(*)::text
FROM visible_devices
WHERE stock_status = 'reserved'
UNION ALL
SELECT 'devices.visible.sold', count(*)::text
FROM visible_devices
WHERE stock_status = 'sold'
UNION ALL
SELECT 'devices.visible.missing_required_copy', count(*)::text
FROM visible_devices
WHERE coalesce(title, '') = ''
   OR coalesce(category, '') = ''
   OR price IS NULL
   OR coalesce(price_text, '') = ''
   OR coalesce(short_description, '') = ''
UNION ALL
SELECT 'devices.visible.not_ready', count(*)::text
FROM visible_devices
WHERE coalesce(content_status, '') <> 'ready'
UNION ALL
SELECT 'devices.visible.no_listing_file', count(*)::text
FROM visible_devices
WHERE listing_file IS NULL
UNION ALL
SELECT 'devices.visible.no_card_image', count(*)::text
FROM visible_devices d
WHERE NOT EXISTS (
  SELECT 1
  FROM published_images i
  WHERE i.device = d.id
    AND i.role = 'card'
    AND i.image IS NOT NULL
)
UNION ALL
SELECT 'devices.visible.no_gallery_image', count(*)::text
FROM visible_devices d
WHERE NOT EXISTS (
  SELECT 1
  FROM published_images i
  WHERE i.device = d.id
    AND i.role <> 'card'
    AND i.image IS NOT NULL
)
UNION ALL
SELECT 'device_images.total', count(*)::text
FROM device_images
UNION ALL
SELECT 'device_images.published_approved', count(*)::text
FROM published_images
UNION ALL
SELECT 'device_images.without_file', count(*)::text
FROM device_images
WHERE image IS NULL
UNION ALL
SELECT 'device_images.orphan_device', count(*)::text
FROM device_images i
LEFT JOIN devices d ON d.id = i.device
WHERE d.id IS NULL
UNION ALL
SELECT 'directus_files.device_folder', count(*)::text
FROM directus_files f
JOIN directus_folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Device Photos'
  AND f.title LIKE 'isvoi:%'
  AND f.title NOT LIKE 'isvoi:site:%'
  AND f.title NOT LIKE 'isvoi:editorial:%';
`);
