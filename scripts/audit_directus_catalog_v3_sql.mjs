#!/usr/bin/env node

process.stdout.write(String.raw`
WITH expected(table_name) AS (
  VALUES
    ('products'),('product_brands'),('product_categories'),('device_models'),
    ('product_images'),('device_details'),('accessory_details'),('product_compatible_models')
)
SELECT 'catalog_v3.schema.tables_missing' AS check_name, count(*)::text AS value
FROM expected e
WHERE to_regclass('public.' || e.table_name) IS NULL
UNION ALL
SELECT 'catalog_v3.schema.product_fields_missing', count(*)::text
FROM (VALUES
  ('sku'),('product_type'),('condition'),('sale_mode'),('brand'),('category'),
  ('device_model'),('price'),('stock_quantity'),('stock_status'),('listing_file')
) AS expected(field)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='products' AND c.column_name=expected.field
)
UNION ALL
SELECT 'catalog_v3.schema.lead_fields_missing', count(*)::text
FROM (VALUES ('product'),('product_type')) AS expected(field)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='leads' AND c.column_name=expected.field
)
UNION ALL
SELECT 'catalog_v3.studio.collections_missing', count(*)::text
FROM (VALUES
  ('products'),('product_brands'),('product_categories'),('device_models'),
  ('product_images'),('device_details'),('accessory_details'),('product_compatible_models')
) AS expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections dc WHERE dc.collection=expected.collection
)
UNION ALL
SELECT 'catalog_v3.studio.product_groups_missing', count(*)::text
FROM (VALUES
  ('group_status'),('group_identity'),('group_sale'),('group_content'),('group_media'),
  ('group_device'),('group_accessory'),('group_passport'),('group_system')
) AS expected(field)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields df
  WHERE df.collection='products' AND df.field=expected.field
    AND df.special LIKE '%group%'
)
UNION ALL
SELECT 'catalog_v3.studio.presets_missing', count(*)::text
FROM (VALUES
  ('Требует заполнения'),('Нужен Passport или диагностика'),
  ('Готово к проверке'),('Опубликовано'),('Продано или скрыто'),
  ('Техника'),('Аксессуары'),('Аксессуары без совместимости')
) AS expected(bookmark)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_presets dp
  WHERE dp.collection='products' AND dp.bookmark=expected.bookmark
)
UNION ALL
SELECT 'catalog_v3.schema.relations_missing', count(*)::text
FROM (VALUES
  ('products','brand'),('products','category'),('products','device_model'),
  ('product_images','product'),('device_details','product'),('accessory_details','product'),
  ('product_compatible_models','product'),('product_compatible_models','device_models_id'),
  ('device_passports','product'),('trade_options','product'),('leads','product')
) AS expected(collection,field)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations dr
  WHERE dr.many_collection=expected.collection AND dr.many_field=expected.field
)
UNION ALL
SELECT 'catalog_v3.permissions.public_missing', count(*)::text
FROM (VALUES
  ('products'),('product_brands'),('product_categories'),('device_models'),
  ('product_images'),('device_details'),('accessory_details'),('product_compatible_models'),
  ('device_passports'),('trade_options')
) AS expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions dp
  JOIN directus_policies policy ON policy.id=dp.policy
  WHERE policy.name='ISVOI Public Read' AND dp.collection=expected.collection AND dp.action='read'
)
UNION ALL
SELECT 'catalog_v3.permissions.editor_missing', count(*)::text
FROM (VALUES
  ('products'),('product_images'),('device_details'),('accessory_details'),
  ('product_compatible_models')
) AS expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions dp
  JOIN directus_policies policy ON policy.id=dp.policy
  WHERE policy.name='ISVOI Editor' AND dp.collection=expected.collection AND dp.action='update'
)
UNION ALL
SELECT 'catalog_v3.permissions.advanced_reference_missing', count(*)::text
FROM (VALUES
  ('product_brands'),('product_categories'),('device_models')
) AS expected(collection)
CROSS JOIN (VALUES ('read'),('create'),('update'),('delete')) AS action(action)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Advanced Editor'
    AND permission.collection=expected.collection AND permission.action=action.action
)
UNION ALL
SELECT 'catalog_v3.permissions.importer_product_writes', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Importer' AND permission.collection='products'
  AND permission.action IN ('create','update','delete')
UNION ALL
SELECT 'catalog_v3.permissions.editor_publication_write', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Editor' AND permission.collection='products'
  AND (permission.fields='*' OR 'status'=ANY(string_to_array(permission.fields,',')))
  AND (
    permission.action='update'
    OR (
      permission.action='create'
      AND NOT coalesce(permission.validation::jsonb,'{}'::jsonb)
        @> '{"_and":[{"status":{"_eq":"draft"}}]}'::jsonb
    )
  )
UNION ALL
SELECT 'catalog_v3.integrity.category_type_mismatch', count(*)::text
FROM products p
JOIN product_categories c ON c.id=p.category
WHERE c.catalog_section IS DISTINCT FROM p.product_type
UNION ALL
SELECT 'catalog_v3.publication.invalid_required', count(*)::text
FROM products p
WHERE p.status='published' AND (
  p.content_status <> 'ready' OR NULLIF(p.sku,'') IS NULL OR p.brand IS NULL OR
  p.category IS NULL OR p.price <= 0 OR NULLIF(p.warranty,'') IS NULL OR
  p.listing_file IS NULL OR NULLIF(p.stock_status,'') IS NULL
)
UNION ALL
SELECT 'catalog_v3.publication.accessory_not_new', count(*)::text
FROM products WHERE product_type='accessory' AND condition <> 'new'
UNION ALL
SELECT 'catalog_v3.publication.device_details_missing', count(*)::text
FROM products p
WHERE p.status='published' AND p.product_type='device'
  AND (p.device_model IS NULL OR NOT EXISTS (SELECT 1 FROM device_details d WHERE d.product=p.id))
UNION ALL
SELECT 'catalog_v3.publication.used_passport_missing', count(*)::text
FROM products p
WHERE p.status='published' AND p.product_type='device' AND p.condition='used'
  AND NOT EXISTS (
    SELECT 1 FROM device_details d
    JOIN device_passports dp ON dp.product=p.id
    WHERE d.product=p.id AND NULLIF(d.grade,'') IS NOT NULL
  )
UNION ALL
SELECT 'catalog_v3.publication.new_items_missing_diagnostic_date', count(*)::text
FROM products p
JOIN device_details d ON d.product=p.id
WHERE p.status='published' AND p.product_type='device' AND p.condition='used'
  AND p.sku NOT LIKE 'LEGACY-%'
  AND d.diagnostic_date IS NULL
UNION ALL
SELECT 'catalog_v3.publication.used_items_missing_diagnostic_by', count(*)::text
FROM products p
JOIN device_details d ON d.product=p.id
WHERE p.status='published' AND p.product_type='device' AND p.condition='used'
  AND NULLIF(d.diagnostic_by,'') IS NULL
UNION ALL
SELECT 'catalog_v3.publication.inventory_unconfirmed', count(*)::text
FROM products p
WHERE p.status='published'
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_items inventory
    WHERE inventory.product=p.id
      AND inventory.for_sale=true
      AND inventory.quantity>0
      AND inventory.eligibility_status='eligible'
  )
UNION ALL
SELECT 'catalog_v3.readiness.ready_draft_blockers', count(*)::text
FROM products p
WHERE p.status='draft' AND p.content_status='ready' AND (
  NULLIF(p.sku,'') IS NULL OR p.brand IS NULL OR p.category IS NULL OR p.price<=0 OR
  NULLIF(p.warranty,'') IS NULL OR p.listing_file IS NULL OR
  p.stock_status='hidden' OR p.stock_quantity<=0 OR
  NOT EXISTS (
    SELECT 1
    FROM inventory_items inventory
    WHERE inventory.product=p.id
      AND inventory.for_sale=true
      AND inventory.quantity>0
      AND inventory.eligibility_status='eligible'
  ) OR (
    p.product_type='device' AND (
      p.device_model IS NULL OR
      NOT EXISTS (
        SELECT 1 FROM device_details d
        WHERE d.product=p.id
          AND (
            p.condition<>'used' OR (
              d.diagnostic_date IS NOT NULL AND NULLIF(d.diagnostic_by,'') IS NOT NULL AND
              NULLIF(d.grade,'') IS NOT NULL AND
              EXISTS (SELECT 1 FROM device_passports passport WHERE passport.product=p.id)
            )
          )
      )
    )
  )
)
UNION ALL
SELECT 'catalog_v3.transition.mixed_source_visibility', count(*)::text
FROM products p
JOIN devices legacy ON legacy.id=p.id
WHERE p.status<>'published' AND legacy.status='published'
UNION ALL
SELECT 'catalog_v3.transition.published_legacy_devices', count(*)::text
FROM devices WHERE status='published'
UNION ALL
SELECT 'catalog_v3.transition.published_offers_for_hidden_products', count(*)::text
FROM product_offers offer
JOIN products product ON product.id=offer.product
WHERE offer.status='published' AND product.status<>'published'
UNION ALL
SELECT 'catalog_v3.transition.legacy_missing_diagnostic_date', count(*)::text
FROM products p
JOIN device_details d ON d.product=p.id
WHERE p.status='published' AND p.product_type='device' AND p.condition='used'
  AND p.sku LIKE 'LEGACY-%'
  AND d.diagnostic_date IS NULL
UNION ALL
SELECT 'catalog_v3.publication.model_compatibility_missing', count(*)::text
FROM products p
JOIN accessory_details ad ON ad.product=p.id
WHERE p.status='published' AND p.product_type='accessory'
  AND ad.compatibility_mode='model_specific'
  AND NOT EXISTS (SELECT 1 FROM product_compatible_models pcm WHERE pcm.product=p.id)
UNION ALL
SELECT 'catalog_v3.migration.legacy_products_missing', GREATEST(
  (SELECT count(*) FROM devices) -
  (SELECT count(*) FROM products WHERE id IN (SELECT id FROM devices)),
  0
)::text
UNION ALL
SELECT 'catalog_v3.migration.passport_links_missing', count(*)::text
FROM device_passports WHERE device IS NOT NULL AND product IS NULL
UNION ALL
SELECT 'catalog_v3.migration.trade_links_missing', count(*)::text
FROM trade_options WHERE device IS NOT NULL AND product IS NULL
UNION ALL
SELECT 'catalog_v3.qa.drafts_missing', GREATEST(
  4 - (SELECT count(*) FROM products WHERE source_system='catalog_v3_qa' AND status='draft'),
  0
)::text
UNION ALL
SELECT 'catalog_v3.publication.guard_missing',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='products_publication_guard' AND NOT tgisinternal
  ) THEN '0' ELSE '1' END;
`);
