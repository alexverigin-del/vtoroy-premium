#!/usr/bin/env node
/**
 * Print SQL that audits the Directus Studio editor experience and operational
 * guardrails for ISVOI.
 *
 * Usage:
 *   node scripts/audit_directus_studio_sql.mjs > /tmp/isvoi_studio_audit.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_studio_audit.sql
 */

process.stdout.write(String.raw`
CREATE OR REPLACE FUNCTION pg_temp.isvoi_json_string_values(p_value jsonb)
RETURNS TABLE(value text)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p_value
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT e.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END) AS e
      UNION ALL
      SELECT a.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.node) = 'array' THEN walk.node ELSE '[]'::jsonb END) AS a
    ) AS child
  )
  SELECT node #>> '{}'
  FROM walk
  WHERE jsonb_typeof(node) = 'string';
$$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_json_keys(p_value jsonb)
RETURNS TABLE(key text)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p_value
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT e.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END) AS e
      UNION ALL
      SELECT a.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.node) = 'array' THEN walk.node ELSE '[]'::jsonb END) AS a
    ) AS child
  )
  SELECT e.key
  FROM walk
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END
  ) AS e;
$$;

WITH expected_collections(collection) AS (
  VALUES
    ('devices'),
    ('device_images'),
    ('device_passports'),
    ('trade_options'),
    ('site_pages'),
    ('page_sections'),
    ('site_settings'),
    ('device_page_settings'),
    ('navigation_items'),
    ('faq_items'),
    ('leads'),
    ('lead_comments'),
    ('catalog_import_batches')
),
expected_bookmarks(role_name, collection, bookmark) AS (
  VALUES
    ('ISVOI Editor', 'devices', 'Нужны фото'),
    ('ISVOI Editor', 'devices', 'Нужен текст'),
    ('ISVOI Editor', 'devices', 'На проверке'),
    ('ISVOI Editor', 'devices', 'Готово к публикации'),
    ('ISVOI Editor', 'device_images', 'Фото на проверке'),
    ('ISVOI Editor', 'device_images', 'Опубликованные фото'),
    ('ISVOI Editor', 'site_pages', 'Опубликованные страницы'),
    ('ISVOI Editor', 'site_pages', 'Черновики страниц'),
    ('ISVOI Editor', 'page_sections', 'Главная'),
    ('ISVOI Editor', 'page_sections', 'Store'),
    ('ISVOI Editor', 'page_sections', 'Trade'),
    ('ISVOI Editor', 'page_sections', 'Passport'),
    ('ISVOI Editor', 'page_sections', 'Club'),
    ('ISVOI Editor', 'page_sections', 'Скрытые секции'),
    ('ISVOI Editor', 'navigation_items', 'Header menu'),
    ('ISVOI Editor', 'navigation_items', 'Header CTA'),
    ('ISVOI Editor', 'navigation_items', 'Footer links'),
    ('ISVOI Editor', 'navigation_items', 'Hidden links'),
    ('ISVOI Editor', 'faq_items', 'Все активные FAQ'),
    ('ISVOI Editor', 'faq_items', 'Скрытые FAQ'),
    ('ISVOI Editor', 'leads', 'Новые заявки'),
    ('ISVOI Editor', 'leads', 'В работе'),
    ('ISVOI Editor', 'leads', 'Без ответственного'),
    ('ISVOI Editor', 'leads', 'Просрочены'),
    ('ISVOI Editor', 'leads', 'Без источника'),
    ('ISVOI Editor', 'leads', 'Закрытые заявки'),
    ('ISVOI Editor', 'leads', 'Обработка заявок'),
    ('ISVOI Editor', 'catalog_import_batches', 'Новые партии'),
    ('ISVOI Editor', 'catalog_import_batches', 'В работе'),
    ('ISVOI Editor', 'catalog_import_batches', 'Проверены к импорту'),
    ('ISVOI Editor', 'catalog_import_batches', 'Ошибки'),
    ('ISVOI Editor', 'catalog_import_batches', 'Импортировано'),
    ('ISVOI Importer', 'catalog_import_batches', 'Новые партии'),
    ('ISVOI Importer', 'catalog_import_batches', 'В работе'),
    ('ISVOI Importer', 'catalog_import_batches', 'Проверены к импорту'),
    ('ISVOI Importer', 'catalog_import_batches', 'Ошибки'),
    ('ISVOI Importer', 'catalog_import_batches', 'Импортировано')
),
expected_file_folders(name) AS (
  VALUES
    ('ISVOI Device Photos'),
    ('ISVOI Site Assets'),
    ('ISVOI Editorial'),
    ('ISVOI File Review'),
    ('ISVOI Catalog Imports')
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
SELECT 'studio.collections.missing_ux_metadata' AS check_name, count(*)::text AS value
FROM expected_collections ec
LEFT JOIN directus_collections dc ON dc.collection = ec.collection
WHERE dc.collection IS NULL
   OR nullif(dc.note, '') IS NULL
   OR nullif(dc.display_template, '') IS NULL
   OR nullif(dc.icon, '') IS NULL
UNION ALL
SELECT 'studio.fields.missing_notes', count(*)::text
FROM directus_fields df
WHERE df.collection IN (SELECT collection FROM expected_collections)
  AND nullif(df.note, '') IS NULL
UNION ALL
SELECT 'studio.fields.required_without_note', count(*)::text
FROM directus_fields df
WHERE df.collection IN (SELECT collection FROM expected_collections)
  AND coalesce(df.required, false) = true
  AND nullif(df.note, '') IS NULL
UNION ALL
SELECT 'studio.faq.invalid_validation_shape', count(*)::text
FROM directus_fields df
WHERE df.collection = 'faq_items'
  AND df.field IN ('question', 'answer', 'category', 'key')
  AND (
    df.validation IS NULL
    OR jsonb_typeof(df.validation::jsonb) <> 'object'
    OR NOT (df.validation::jsonb ? df.field)
  )
UNION ALL
SELECT 'studio.site_settings.singleton_not_one', (
  CASE
    WHEN EXISTS (
      SELECT 1 FROM directus_collections
      WHERE collection = 'site_settings' AND coalesce(singleton, false) = true
    )
    AND (SELECT count(*) FROM site_settings) = 1
    THEN '0'
    ELSE '1'
  END
)
UNION ALL
SELECT 'studio.device_page_settings.singleton_not_one', (
  CASE
    WHEN EXISTS (
      SELECT 1 FROM directus_collections
      WHERE collection = 'device_page_settings' AND coalesce(singleton, false) = true
    )
    AND (SELECT count(*) FROM device_page_settings) = 1
    THEN '0'
    ELSE '1'
  END
)
UNION ALL
SELECT 'studio.bookmarks.missing', count(*)::text
FROM expected_bookmarks eb
LEFT JOIN directus_roles r ON r.name = eb.role_name
LEFT JOIN directus_presets p
  ON p.role = r.id
  AND p.collection = eb.collection
  AND p.bookmark = eb.bookmark
  AND p."user" IS NULL
WHERE p.id IS NULL
UNION ALL
SELECT 'studio.page_sections.advanced_json_editable_by_editor', count(*)::text
FROM directus_permissions pe
JOIN directus_policies po ON po.id = pe.policy
WHERE po.name = 'ISVOI Editor'
  AND pe.collection = 'page_sections'
  AND pe.action IN ('create', 'update')
  AND (
    pe.fields = '*'
    OR concat(',', pe.fields, ',') LIKE '%,content,%'
    OR concat(',', pe.fields, ',') LIKE '%,variant,%'
    OR concat(',', pe.fields, ',') LIKE '%,section_key,%'
  )
UNION ALL
SELECT 'studio.page_sections.content.local_assets', count(*)::text
FROM page_sections ps
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.isvoi_json_string_values(ps.content::jsonb) s
  WHERE s.value LIKE '/assets/%' OR s.value LIKE 'assets/%'
)
UNION ALL
SELECT 'studio.page_sections.content.direct_asset_urls.warning', count(*)::text
FROM page_sections ps
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.isvoi_json_string_values(ps.content::jsonb) s
  WHERE s.value LIKE '%api.isvoi.ru/assets/%'
)
UNION ALL
SELECT 'studio.page_sections.content.image_src_keys', count(*)::text
FROM page_sections ps
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.isvoi_json_keys(ps.content::jsonb) k
  WHERE lower(k.key) IN ('image_src', 'imagesrc')
)
UNION ALL
SELECT 'studio.import_batches.count', count(*)::text
FROM catalog_import_batches
UNION ALL
SELECT 'studio.import_batches.missing_files', count(*)::text
FROM catalog_import_batches
WHERE workbook IS NULL OR photos_archive IS NULL
UNION ALL
SELECT 'studio.import_batches.invalid_last_run_status', count(*)::text
FROM catalog_import_batches
WHERE last_run_status IS NOT NULL
  AND last_run_status NOT IN ('running', 'success', 'failed')
UNION ALL
SELECT 'studio.import_batches.failed_without_log', count(*)::text
FROM catalog_import_batches
WHERE last_run_status = 'failed'
  AND nullif(last_run_log, '') IS NULL
UNION ALL
SELECT 'studio.destructive_editor_permissions', count(*)::text
FROM directus_permissions pe
JOIN directus_policies po ON po.id = pe.policy
WHERE po.name IN ('ISVOI Editor', 'ISVOI Importer')
  AND pe.collection IN ('device_images', 'trade_options', 'catalog_import_batches')
  AND pe.action = 'delete'
UNION ALL
SELECT 'studio.files.required_folders_missing', count(*)::text
FROM expected_file_folders expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_folders f WHERE f.name = expected.name AND f.parent IS NULL
)
UNION ALL
SELECT 'studio.files.review_folder_count', count(*)::text
FROM directus_files f
JOIN directus_folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI File Review'
UNION ALL
SELECT 'studio.files.used_without_folder', count(*)::text
FROM directus_files f
JOIN used_files u ON u.id = f.id
WHERE f.folder IS NULL
UNION ALL
SELECT 'studio.files.device_originals_over_10mb.warning', count(*)::text
FROM directus_files f
JOIN directus_folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Device Photos'
  AND coalesce(f.filesize, 0) > 10485760
UNION ALL
SELECT 'studio.files.non_image_in_device_photos', count(*)::text
FROM directus_files f
JOIN directus_folders folder ON folder.id = f.folder
WHERE folder.name = 'ISVOI Device Photos'
  AND coalesce(f.type, '') NOT LIKE 'image/%'
UNION ALL
SELECT 'studio.device_images.missing_alt_or_label', count(*)::text
FROM device_images
WHERE image IS NOT NULL
  AND (nullif(label, '') IS NULL OR nullif(alt, '') IS NULL)
UNION ALL
SELECT 'studio.leads.open_without_source_context', count(*)::text
FROM leads
WHERE status IN ('new', 'in_progress', 'waiting')
  AND (
    nullif(source_path, '') IS NULL
    OR nullif(source_url, '') IS NULL
  )
UNION ALL
SELECT 'studio.leads.in_progress_without_assignee.warning', count(*)::text
FROM leads
WHERE status IN ('in_progress', 'waiting')
  AND assigned_to IS NULL
UNION ALL
SELECT 'studio.leads.invalid_status', count(*)::text
FROM leads
WHERE status NOT IN ('new', 'in_progress', 'waiting', 'won', 'closed');
`);
