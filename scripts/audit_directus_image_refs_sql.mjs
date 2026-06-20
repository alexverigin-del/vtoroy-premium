#!/usr/bin/env node
/**
 * Print SQL that checks Directus content for legacy local image references.
 *
 * Usage:
 *   node scripts/audit_directus_image_refs_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
SELECT 'devices.listing_image.local' AS check_name, count(*)::text AS value
FROM devices
WHERE coalesce(listing_image, '') LIKE 'assets/%'
   OR coalesce(listing_image, '') LIKE '/assets/%'
UNION ALL
SELECT 'devices.gallery.local', count(*)::text
FROM devices
WHERE gallery::text LIKE '%assets/%'
UNION ALL
SELECT 'devices.passport.local', count(*)::text
FROM devices
WHERE passport::text LIKE '%assets/%'
UNION ALL
SELECT 'page_sections.content.local', count(*)::text
FROM page_sections
WHERE content::text LIKE '%assets/%'
UNION ALL
SELECT 'devices.with_listing_file', count(*)::text
FROM devices
WHERE listing_file IS NOT NULL
UNION ALL
SELECT 'device_images.with_file', count(*)::text
FROM device_images
WHERE image IS NOT NULL;
`);
