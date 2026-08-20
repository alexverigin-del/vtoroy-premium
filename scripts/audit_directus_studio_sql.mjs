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
    ('products'),
    ('product_brands'),
    ('product_categories'),
    ('device_models'),
    ('product_images'),
    ('device_details'),
    ('accessory_details'),
    ('product_compatible_models'),
    ('store_locations'),
    ('store_location_images'),
    ('product_offers'),
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
    ('catalog_import_batches'),
    ('blog_posts'),
    ('blog_authors'),
    ('blog_categories'),
    ('blog_tags'),
    ('club_page_settings'),
    ('club_plans'),
    ('club_offers'),
    ('club_rule_items'),
    ('club_process_items'),
    ('club_legal_documents'),
    ('inventory_import_batches'),
    ('inventory_items'),
    ('inventory_receipt_lines'),
    ('inventory_import_issues'),
    ('channel_cost_profiles'),
    ('channel_category_mappings'),
    ('product_channel_listings')
),
expected_bookmarks(role_name, collection, bookmark) AS (
  VALUES
    ('ISVOI Editor', 'products', 'Требует заполнения'),
    ('ISVOI Editor', 'products', 'Нужен Passport или диагностика'),
    ('ISVOI Editor', 'products', 'Готово к проверке'),
    ('ISVOI Editor', 'products', 'Опубликовано'),
    ('ISVOI Editor', 'products', 'Продано или скрыто'),
    ('ISVOI Editor', 'products', 'Техника'),
    ('ISVOI Editor', 'products', 'Аксессуары'),
    ('ISVOI Editor', 'products', 'Аксессуары без совместимости'),
    ('ISVOI Advanced Editor', 'products', 'Требует заполнения'),
    ('ISVOI Advanced Editor', 'products', 'Нужен Passport или диагностика'),
    ('ISVOI Advanced Editor', 'products', 'Готово к проверке'),
    ('ISVOI Advanced Editor', 'products', 'Опубликовано'),
    ('ISVOI Advanced Editor', 'products', 'Продано или скрыто'),
    ('ISVOI Advanced Editor', 'products', 'Техника'),
    ('ISVOI Advanced Editor', 'products', 'Аксессуары'),
    ('ISVOI Advanced Editor', 'products', 'Аксессуары без совместимости'),
    ('ISVOI Editor', 'site_pages', 'Опубликованные страницы'),
    ('ISVOI Editor', 'site_pages', 'Черновики страниц'),
    ('ISVOI Editor', 'page_sections', 'Главная'),
    ('ISVOI Editor', 'page_sections', 'Store'),
    ('ISVOI Editor', 'page_sections', 'Trade'),
    ('ISVOI Editor', 'page_sections', 'Passport'),
    ('ISVOI Editor', 'page_sections', 'Club'),
    ('ISVOI Editor', 'page_sections', 'Скрытые секции'),
    ('ISVOI Editor', 'navigation_items', 'Шапка сайта'),
    ('ISVOI Editor', 'navigation_items', 'Подменю каталога'),
    ('ISVOI Editor', 'navigation_items', 'Группы подвала'),
    ('ISVOI Editor', 'navigation_items', 'Ссылки подвала'),
    ('ISVOI Editor', 'navigation_items', 'Скрытые / архив'),
    ('ISVOI Editor', 'faq_items', 'Все активные FAQ'),
    ('ISVOI Editor', 'faq_items', 'Скрытые FAQ'),
    ('ISVOI Editor', 'leads', 'Обработка заявок'),
    ('ISVOI Editor', 'leads', 'Новые заявки'),
    ('ISVOI Editor', 'leads', 'В работе'),
    ('ISVOI Editor', 'leads', 'Просрочены'),
    ('ISVOI Editor', 'leads', 'Без ответственного'),
    ('ISVOI Editor', 'leads', 'Club: новые'),
    ('ISVOI Editor', 'leads', 'Club: без ответственного'),
    ('ISVOI Editor', 'leads', 'Club: расчёт отправлен'),
    ('ISVOI Editor', 'leads', 'Club: просрочен SLA'),
    ('ISVOI Editor', 'leads', 'Блог: заявки'),
    ('ISVOI Editor', 'leads', 'Блог: устройства'),
    ('ISVOI Editor', 'leads', 'Закрытые заявки'),
    ('ISVOI Advanced Editor', 'leads', 'Обработка заявок'),
    ('ISVOI Advanced Editor', 'leads', 'Новые заявки'),
    ('ISVOI Advanced Editor', 'leads', 'В работе'),
    ('ISVOI Advanced Editor', 'leads', 'Просрочены'),
    ('ISVOI Advanced Editor', 'leads', 'Без ответственного'),
    ('ISVOI Advanced Editor', 'leads', 'Club: новые'),
    ('ISVOI Advanced Editor', 'leads', 'Club: без ответственного'),
    ('ISVOI Advanced Editor', 'leads', 'Club: расчёт отправлен'),
    ('ISVOI Advanced Editor', 'leads', 'Club: просрочен SLA'),
    ('ISVOI Advanced Editor', 'leads', 'Блог: заявки'),
    ('ISVOI Advanced Editor', 'leads', 'Блог: устройства'),
    ('ISVOI Advanced Editor', 'leads', 'Закрытые заявки'),
    ('ISVOI Editor', 'product_offers', 'Все предложения'),
    ('ISVOI Editor', 'product_offers', 'Требуют внимания'),
    ('ISVOI Editor', 'product_offers', 'Белгород'),
    ('ISVOI Editor', 'product_offers', 'В наличии'),
    ('ISVOI Editor', 'product_offers', 'Доступно с доставкой'),
    ('ISVOI Editor', 'product_offers', 'Архив'),
    ('ISVOI Advanced Editor', 'product_offers', 'Все предложения'),
    ('ISVOI Advanced Editor', 'product_offers', 'Требуют внимания'),
    ('ISVOI Advanced Editor', 'product_offers', 'Белгород'),
    ('ISVOI Advanced Editor', 'product_offers', 'В наличии'),
    ('ISVOI Advanced Editor', 'product_offers', 'Доступно с доставкой'),
    ('ISVOI Advanced Editor', 'product_offers', 'Архив'),
    ('ISVOI Editor', 'store_locations', 'Опубликованные магазины'),
    ('ISVOI Editor', 'store_locations', 'Черновики магазинов'),
    ('ISVOI Editor', 'store_locations', 'Архив магазинов'),
    ('ISVOI Advanced Editor', 'store_locations', 'Опубликованные магазины'),
    ('ISVOI Advanced Editor', 'store_locations', 'Черновики магазинов'),
    ('ISVOI Advanced Editor', 'store_locations', 'Архив магазинов'),
    ('ISVOI Editor', 'catalog_import_batches', 'Новые партии'),
    ('ISVOI Editor', 'catalog_import_batches', 'В работе'),
    ('ISVOI Editor', 'catalog_import_batches', 'Проверены к импорту'),
    ('ISVOI Editor', 'catalog_import_batches', 'Ошибки'),
    ('ISVOI Editor', 'catalog_import_batches', 'Импортировано'),
    ('ISVOI Editor', 'blog_posts', 'Черновики'),
    ('ISVOI Editor', 'blog_posts', 'На проверке'),
    ('ISVOI Editor', 'blog_posts', 'Запланированные'),
    ('ISVOI Editor', 'blog_posts', 'Опубликованные'),
    ('ISVOI Editor', 'blog_posts', 'Неполные материалы'),
    ('ISVOI Importer', 'catalog_import_batches', 'Новые партии'),
    ('ISVOI Importer', 'catalog_import_batches', 'В работе'),
    ('ISVOI Importer', 'catalog_import_batches', 'Проверены к импорту'),
    ('ISVOI Importer', 'catalog_import_batches', 'Ошибки'),
    ('ISVOI Importer', 'catalog_import_batches', 'Импортировано'),
    ('ISVOI Inventory Manager', 'inventory_import_issues', 'Открытые блокеры'),
    ('ISVOI Inventory Manager', 'inventory_import_issues', 'Открытые предупреждения'),
    ('ISVOI Inventory Manager', 'inventory_import_issues', 'Проблемы последних партий'),
    ('ISVOI Inventory Manager', 'inventory_items', 'Требует проверки происхождения'),
    ('ISVOI Inventory Manager', 'inventory_items', 'Конфликт идентичности'),
    ('ISVOI Inventory Manager', 'inventory_items', 'Можно передать в каталог'),
    ('ISVOI Inventory Manager', 'inventory_receipt_lines', 'Требует сверки места'),
    ('ISVOI Inventory Manager', 'channel_category_mappings', 'Avito: нет подтверждённой категории'),
    ('ISVOI Inventory Manager', 'product_channel_listings', 'Avito: готово к QA')
),
expected_file_folders(name) AS (
  VALUES
    ('ISVOI Device Photos'),
    ('ISVOI Site Assets'),
    ('ISVOI Editorial'),
    ('ISVOI File Review'),
    ('ISVOI Catalog Imports'),
    ('ISVOI Blog')
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
  UNION
  SELECT avatar::uuid FROM blog_authors WHERE avatar IS NOT NULL
  UNION
  SELECT cover_image::uuid FROM blog_posts WHERE cover_image IS NOT NULL
  UNION
  SELECT og_image::uuid FROM blog_posts WHERE og_image IS NOT NULL
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
SELECT 'studio.editor_layout_groups_missing', count(*)::text
FROM (
  VALUES
    ('site_pages', 'group_page'),
    ('site_pages', 'group_seo'),
    ('site_pages', 'group_sections'),
    ('page_sections', 'group_placement'),
    ('page_sections', 'group_copy'),
    ('page_sections', 'group_actions'),
    ('page_sections', 'group_media'),
    ('page_sections', 'group_advanced'),
    ('site_settings', 'group_brand'),
    ('site_settings', 'group_contacts'),
    ('site_settings', 'group_footer'),
    ('site_settings', 'group_technical')
) AS expected(collection, field)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions pe
  JOIN directus_policies po ON po.id = pe.policy
  WHERE po.name = 'ISVOI Editor'
    AND pe.collection = expected.collection
    AND pe.action = 'read'
    AND (
      pe.fields = '*'
      OR concat(',', pe.fields, ',') LIKE '%,' || expected.field || ',%'
    )
)
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
WHERE status NOT IN ('new', 'in_progress', 'waiting', 'won', 'closed')
UNION ALL
SELECT 'studio.native_groups.missing', count(*)::text
FROM (VALUES
  ('site_pages','isvoi_site_content'),('site_settings','isvoi_site_content'),
  ('navigation_items','isvoi_site_content'),('faq_items','isvoi_site_content'),
  ('products','isvoi_catalog'),('device_page_settings','isvoi_catalog'),
  ('store_locations','isvoi_locations'),('store_location_images','isvoi_locations'),
  ('product_offers','isvoi_locations'),
  ('device_passports','isvoi_catalog'),('trade_options','isvoi_catalog'),
  ('leads','isvoi_sales'),('blog_posts','isvoi_blog'),
  ('catalog_import_batches','isvoi_imports'),
  ('inventory_import_batches','isvoi_inventory'),('inventory_items','isvoi_inventory'),
  ('inventory_import_issues','isvoi_inventory'),('product_channel_listings','isvoi_inventory')
) expected(collection,group_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections collection
  WHERE collection.collection=expected.collection AND collection."group"=expected.group_name
)
UNION ALL
SELECT 'studio.technical_children.visible_in_navigation', count(*)::text
FROM directus_collections collection
WHERE collection.collection IN (
  'page_sections','product_images','device_details','accessory_details',
  'product_compatible_models','lead_comments','blog_posts_tags',
  'blog_posts_devices','blog_post_blocks','store_location_images'
) AND coalesce(collection.hidden,false)=false
UNION ALL
SELECT 'studio.human_collections.missing_ru_labels', count(*)::text
FROM directus_collections collection
WHERE collection.collection IN (SELECT collection FROM expected_collections)
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(collection.translations,'[]'::json)::jsonb) translation
    WHERE translation->>'language'='ru-RU' AND nullif(translation->>'translation','') IS NOT NULL
  )
UNION ALL
SELECT 'studio.human_fields.missing_ru_labels', count(*)::text
FROM directus_fields field
WHERE field.collection IN (SELECT collection FROM expected_collections)
  AND coalesce(field.hidden,false)=false
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(field.translations,'[]'::json)::jsonb) translation
    WHERE translation->>'language'='ru-RU' AND nullif(translation->>'translation','') IS NOT NULL
  )
UNION ALL
SELECT 'studio.human_fields.fallback_ru_labels', count(*)::text
FROM directus_fields field
WHERE field.collection IN (SELECT collection FROM expected_collections)
  AND coalesce(field.hidden,false)=false
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(field.translations,'[]'::json)::jsonb) translation
    WHERE translation->>'language'='ru-RU'
      AND translation->>'translation' LIKE 'Служебное поле:%'
  )
UNION ALL
SELECT 'studio.legacy_catalog.human_permissions', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name IN ('ISVOI Editor','ISVOI Advanced Editor','ISVOI Importer','ISVOI Inventory Manager')
  AND permission.collection IN ('devices','device_images')
UNION ALL
SELECT 'studio.importer.product_write_or_delete', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Importer' AND permission.collection='products'
  AND permission.action IN ('create','update','delete')
UNION ALL
SELECT 'studio.editor.system_product_fields_writable', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
CROSS JOIN LATERAL unnest(ARRAY['source_system','source_id','import_batch','imported_at','created_at','updated_at']) field_name
WHERE policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.collection='products' AND permission.action IN ('create','update')
  AND (permission.fields='*' OR field_name=ANY(string_to_array(permission.fields,',')))
UNION ALL
SELECT 'studio.products.type_conditions_missing', count(*)::text
FROM (VALUES ('group_device'),('group_accessory')) expected(field_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection='products' AND field.field=expected.field_name
    AND field.conditions IS NOT NULL AND jsonb_array_length(field.conditions::jsonb)>0
)
UNION ALL
SELECT 'studio.inventory.computed_fields_not_readonly',
  count(*) FILTER (WHERE coalesce(field.readonly,false)=false)::text
FROM directus_fields field
WHERE (
    field.collection='inventory_import_batches'
    AND field.field IN ('status','inventory_rows','inventory_units','receipt_rows','blocker_count','warning_count','last_run_mode','last_run_status','last_run_at','last_run_log')
  ) OR (
    field.collection='inventory_items'
    AND field.field NOT IN ('authenticity_status','eligibility_status','review_override','review_note')
  ) OR (
    field.collection='inventory_import_issues'
    AND field.field NOT IN ('resolved','resolution_note')
  ) OR field.collection='inventory_receipt_lines'
UNION ALL
SELECT 'studio.inventory.manager_unexpected_update_fields', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Inventory Manager' AND permission.action='update'
  AND (
    (permission.collection='inventory_items' AND permission.fields<>'authenticity_status,eligibility_status,review_override,review_note')
    OR (permission.collection='inventory_import_issues' AND permission.fields<>'resolved,resolution_note')
    OR permission.collection='inventory_receipt_lines'
  )
UNION ALL
SELECT 'studio.fields.orphan_group_references', count(*)::text
FROM directus_fields field
LEFT JOIN directus_fields parent
  ON parent.collection=field.collection AND parent.field=field."group"
WHERE field."group" IS NOT NULL AND parent.field IS NULL
UNION ALL
SELECT 'studio.locations.group_missing', count(*)::text
FROM (VALUES
  ('isvoi_locations',NULL::text),
  ('store_locations','isvoi_locations'),
  ('store_location_images','isvoi_locations'),
  ('product_offers','isvoi_locations')
) expected(collection,group_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections collection
  WHERE collection.collection=expected.collection
    AND (expected.group_name IS NULL OR collection."group"=expected.group_name)
    AND (expected.collection='store_location_images' OR coalesce(collection.hidden,false)=false)
    AND (
      expected.collection<>'isvoi_locations'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(collection.translations,'[]'::json)::jsonb) translation
        WHERE translation->>'language'='ru-RU' AND translation->>'translation'='Магазины и наличие'
      )
    )
)
UNION ALL
SELECT 'studio.locations.form_groups_missing', count(*)::text
FROM (VALUES
  ('store_locations','group_publication'),('store_locations','group_contacts'),
  ('store_locations','group_fulfillment'),('store_locations','group_content'),
  ('store_locations','group_relations'),('store_locations','group_system'),
  ('product_offers','group_identity'),('product_offers','group_stock'),
  ('product_offers','group_fulfillment'),('product_offers','group_payment'),
  ('product_offers','group_source'),('product_offers','group_system')
) expected(collection,field_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection=expected.collection AND field.field=expected.field_name
    AND field.interface='group-detail'
)
UNION ALL
SELECT 'studio.locations.ungrouped_business_fields', count(*)::text
FROM directus_fields field
WHERE field.collection IN ('store_locations','product_offers')
  AND field.field<>'id' AND field."group" IS NULL
  AND coalesce(field.special,'') NOT LIKE '%group%'
UNION ALL
SELECT 'studio.navigation.permission_location_mismatch', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.collection='navigation_items' AND permission.action IN ('create','update')
  AND (
    permission.validation IS NULL
    OR permission.validation::text NOT LIKE '%club_header%'
    OR permission.validation::text NOT LIKE '%club_footer%'
    OR permission.validation::text LIKE '%"mobile"%'
    OR permission.validation::text LIKE '%"utility"%'
    OR permission.validation::text LIKE '%"cta"%'
  )
UNION ALL
SELECT 'studio.leads.club_context_group_missing', count(*)::text
FROM (VALUES ('group_context')) expected(field_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection='leads' AND field.field=expected.field_name
    AND field.interface='group-detail' AND field.conditions::text LIKE '%club%'
)
UNION ALL
SELECT 'studio.leads.club_context_fields_misgrouped', count(*)::text
FROM (VALUES
  ('club_offer'),('club_plan'),('club_term_months'),('club_budget_text'),
  ('club_device_request'),('club_consent_version'),('club_consent_at')
) expected(field_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection='leads' AND field.field=expected.field_name
    AND field."group"='group_context'
)
UNION ALL
SELECT 'studio.club.settings_groups_missing', count(*)::text
FROM (VALUES
  ('group_story'),('group_passport'),('group_plans'),('group_rules'),
  ('group_participation'),('group_final')
) expected(field_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection='club_page_settings' AND field.field=expected.field_name
    AND field.interface='group-detail'
)
UNION ALL
SELECT 'studio.bookmarks.too_many', count(*)::text
FROM (
  SELECT preset.role,preset.collection
  FROM directus_presets preset
  JOIN directus_roles role ON role.id=preset.role
  WHERE preset."user" IS NULL AND preset.bookmark IS NOT NULL
    AND role.name IN ('ISVOI Editor','ISVOI Advanced Editor')
    AND preset.collection IN ('products','leads','product_offers','store_locations')
  GROUP BY preset.role,preset.collection
  HAVING count(*)>CASE WHEN preset.collection='leads' THEN 12 ELSE 8 END
) excessive
UNION ALL
SELECT 'studio.bookmarks.duplicates', count(*)::text
FROM (
  SELECT preset.role,preset.collection,preset.bookmark
  FROM directus_presets preset
  WHERE preset."user" IS NULL AND preset.bookmark IS NOT NULL
  GROUP BY preset.role,preset.collection,preset.bookmark
  HAVING count(*)>1
) duplicate;
`);
