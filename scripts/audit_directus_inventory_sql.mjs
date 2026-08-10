#!/usr/bin/env node

process.stdout.write(String.raw`
WITH expected(table_name) AS (
  VALUES
    ('inventory_import_batches'),('inventory_items'),('inventory_receipt_lines'),
    ('inventory_import_issues'),('channel_cost_profiles'),('product_channel_listings')
)
SELECT 'inventory.schema.tables_missing' AS check_name, count(*)::text AS value
FROM expected WHERE to_regclass('public.' || table_name) IS NULL
UNION ALL
SELECT 'inventory.schema.unit_view_missing', count(*)::text
FROM (VALUES ('product_unit_economics')) expected(view_name)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.views
  WHERE table_schema='public' AND table_name=expected.view_name
)
UNION ALL
SELECT 'inventory.studio.collections_missing', count(*)::text
FROM (VALUES
  ('inventory_import_batches'),('inventory_items'),('inventory_receipt_lines'),
  ('inventory_import_issues'),('channel_cost_profiles'),('product_channel_listings'),
  ('product_unit_economics')
) expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections collection WHERE collection.collection=expected.collection
)
UNION ALL
SELECT 'inventory.schema.relations_missing', count(*)::text
FROM (VALUES
  ('inventory_import_batches','inventory_workbook'),
  ('inventory_import_batches','receipts_workbook'),
  ('inventory_items','product'),('inventory_items','last_seen_batch'),
  ('inventory_receipt_lines','batch'),('inventory_receipt_lines','inventory_item'),
  ('inventory_import_issues','batch'),('channel_cost_profiles','category'),
  ('product_channel_listings','product')
) expected(collection,field)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations relation
  WHERE relation.many_collection=expected.collection AND relation.many_field=expected.field
)
UNION ALL
SELECT 'inventory.studio.aliases_missing', count(*)::text
FROM (VALUES
  ('inventory_import_batches','items'),
  ('inventory_import_batches','receipt_lines'),
  ('inventory_import_batches','issues'),
  ('inventory_items','receipt_lines'),
  ('products','inventory_item'),
  ('products','channel_listings')
) expected(collection,field)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection=expected.collection AND field.field=expected.field
    AND field.special LIKE '%o2m%'
)
UNION ALL
SELECT 'inventory.security.manager_policy_missing', count(*)::text
FROM (VALUES (1)) marker(value)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_policies policy
  WHERE policy.name='ISVOI Inventory Manager' AND policy.app_access=true AND policy.admin_access=false
)
UNION ALL
SELECT 'inventory.security.manager_permissions_missing', count(*)::text
FROM (VALUES
  ('inventory_import_batches'),('inventory_items'),('inventory_receipt_lines'),
  ('inventory_import_issues'),('channel_cost_profiles'),('product_channel_listings'),
  ('product_unit_economics')
) expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Inventory Manager'
    AND permission.collection=expected.collection AND permission.action='read'
)
UNION ALL
SELECT 'inventory.security.public_or_editor_access', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE permission.collection IN (
  'inventory_import_batches','inventory_items','inventory_receipt_lines',
  'inventory_import_issues','channel_cost_profiles','product_channel_listings',
  'product_unit_economics'
) AND policy.name IN ('ISVOI Public Read','ISVOI Editor','ISVOI Importer')
UNION ALL
SELECT 'inventory.security.wildcard_fields', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name IN ('ISVOI Inventory Manager','ISVOI Catalog Import')
  AND permission.collection IN (
    'inventory_import_batches','inventory_items','inventory_receipt_lines',
    'inventory_import_issues','channel_cost_profiles','product_channel_listings',
    'product_unit_economics'
  ) AND permission.fields='*'
UNION ALL
SELECT 'inventory.security.service_batch_delete_permissions_missing', count(*)::text
FROM (VALUES ('inventory_receipt_lines'),('inventory_import_issues')) expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Catalog Import'
    AND permission.collection=expected.collection
    AND permission.action='delete'
    AND permission.fields='id,batch'
)
UNION ALL
SELECT 'inventory.flows.missing', count(*)::text
FROM (VALUES
  ('ISVOI: проверить товарный snapshot'),('ISVOI: применить товарный snapshot')
) expected(name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_flows flow
  WHERE flow.name=expected.name AND flow.status='active' AND flow.trigger='manual'
)
UNION ALL
SELECT 'inventory.data.invalid_item_values', count(*)::text
FROM inventory_items
WHERE quantity < 0 OR purchase_price < 0 OR retail_price < 0
  OR eligibility_status NOT IN ('pending','eligible','blocked')
  OR identity_status NOT IN ('not_applicable','matched','unmatched','conflict')
UNION ALL
SELECT 'inventory.data.eligible_without_review', count(*)::text
FROM inventory_items
WHERE eligibility_status='eligible'
  AND (review_override=false OR NULLIF(review_note,'') IS NULL
    OR authenticity_status NOT IN ('verified','not_required'))
UNION ALL
SELECT 'inventory.channels.active_invalid', count(*)::text
FROM product_channel_listings listing
JOIN products product ON product.id=listing.product
LEFT JOIN inventory_items item ON item.product=product.id
WHERE listing.status='active' AND (
  product.status <> 'published' OR product.content_status <> 'ready'
  OR product.stock_status <> 'available' OR product.stock_quantity <= 0
  OR item.id IS NULL OR item.eligibility_status <> 'eligible'
  OR NOT EXISTS (
    SELECT 1 FROM product_images image
    WHERE image.product=product.id AND image.status='published' AND image.image IS NOT NULL
  )
)
UNION ALL
SELECT 'inventory.security.identifiers_in_batch_logs', count(*)::text
FROM inventory_items item
JOIN inventory_import_batches batch ON batch.id=item.last_seen_batch
WHERE (
  NULLIF(item.serial_full,'') IS NOT NULL
  AND position(item.serial_full IN coalesce(batch.last_run_log,'')) > 0
) OR (
  NULLIF(item.imei_full,'') IS NOT NULL
  AND position(item.imei_full IN coalesce(batch.last_run_log,'')) > 0
)
UNION ALL
SELECT 'inventory.info.items', count(*)::text FROM inventory_items
UNION ALL
SELECT 'inventory.info.receipt_lines', count(*)::text FROM inventory_receipt_lines
UNION ALL
SELECT 'inventory.info.issues', count(*)::text FROM inventory_import_issues
UNION ALL
SELECT 'inventory.info.synced_products', count(*)::text
FROM products WHERE source_system='store_inventory'
UNION ALL
SELECT 'inventory.info.open_blockers', count(*)::text
FROM inventory_import_issues WHERE severity='blocker' AND resolved=false
UNION ALL
SELECT 'inventory.info.unconfirmed_cost_profiles', count(*)::text
FROM channel_cost_profiles WHERE is_active=true AND is_confirmed=false;
`);
