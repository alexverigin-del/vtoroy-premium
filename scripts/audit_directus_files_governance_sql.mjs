#!/usr/bin/env node
/**
 * Print SQL that audits Directus Files governance for catalog growth.
 */

process.stdout.write(String.raw`
WITH folders AS (
  SELECT id, name
  FROM directus_folders
  WHERE name IN ('ISVOI Device Photos', 'ISVOI Site Assets', 'ISVOI Editorial', 'ISVOI File Review', 'ISVOI Catalog Imports')
),
used_files(id) AS (
  SELECT listing_file::uuid FROM devices WHERE listing_file IS NOT NULL
  UNION
  SELECT image::uuid FROM device_images WHERE image IS NOT NULL
  UNION
  SELECT defect_photo::uuid FROM device_passports WHERE defect_photo IS NOT NULL
  UNION
  SELECT image::uuid FROM page_sections WHERE image IS NOT NULL
  UNION
  SELECT og_image::uuid FROM site_pages WHERE og_image IS NOT NULL
  UNION
  SELECT logo_file::uuid FROM site_settings WHERE logo_file IS NOT NULL
  UNION
  SELECT default_og_image::uuid FROM site_settings WHERE default_og_image IS NOT NULL
  UNION
  SELECT workbook::uuid FROM catalog_import_batches WHERE workbook IS NOT NULL
  UNION
  SELECT photos_archive::uuid FROM catalog_import_batches WHERE photos_archive IS NOT NULL
)
SELECT 'files.review_folder_count' AS check_name, count(*)::text AS value
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI File Review'
UNION ALL
SELECT 'files.used_without_folder', count(*)::text
FROM directus_files f
JOIN used_files u ON u.id = f.id
WHERE f.folder IS NULL
UNION ALL
SELECT 'files.device_non_images', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Device Photos'
  AND coalesce(f.type, '') NOT LIKE 'image/%'
UNION ALL
SELECT 'files.site_non_images', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Site Assets'
  AND coalesce(f.type, '') NOT LIKE 'image/%'
UNION ALL
SELECT 'files.editorial_non_images', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Editorial'
  AND coalesce(f.type, '') NOT LIKE 'image/%'
UNION ALL
SELECT 'files.device_originals_over_10mb', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Device Photos'
  AND coalesce(f.filesize, 0) > 10485760
UNION ALL
SELECT 'files.duplicate_isvoi_titles', count(*)::text
FROM (
  SELECT title
  FROM directus_files
  WHERE title LIKE 'isvoi:%'
  GROUP BY title
  HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'files.orphan_isvoi_files.warning', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
LEFT JOIN used_files u ON u.id = f.id
WHERE folder.name IN ('ISVOI Device Photos', 'ISVOI Site Assets', 'ISVOI Editorial', 'ISVOI Catalog Imports')
  AND u.id IS NULL
UNION ALL
SELECT 'files.hero_editorial_missing_focal_point.warning', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name IN ('ISVOI Site Assets', 'ISVOI Editorial')
  AND coalesce(f.type, '') LIKE 'image/%'
  AND coalesce(f.type, '') <> 'image/svg+xml'
  AND (f.focal_point_x IS NULL OR f.focal_point_y IS NULL)
UNION ALL
SELECT 'files.device_photos', count(*)::text
FROM directus_files f
JOIN folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Device Photos';
`);
