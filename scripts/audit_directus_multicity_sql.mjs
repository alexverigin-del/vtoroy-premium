#!/usr/bin/env node

process.stdout.write(String.raw`
SELECT 'multicity.schema.tables_missing' AS check_name,
  (3-count(*))::text AS value
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('store_locations','store_location_images','product_offers')
UNION ALL
SELECT 'multicity.schema.relations_missing',(5-count(*))::text
FROM directus_relations
WHERE (many_collection,many_field) IN (
  ('store_locations','hero_file'),('store_location_images','location'),
  ('store_location_images','image'),('product_offers','product'),('product_offers','location')
)
UNION ALL
SELECT 'multicity.studio.collection_layout',count(*)::text
FROM directus_collections
WHERE (collection='store_locations' AND ("group"<>'isvoi_site_content' OR coalesce(hidden,false)))
   OR (collection='store_location_images' AND ("group"<>'isvoi_site_content' OR NOT coalesce(hidden,false)))
   OR (collection='product_offers' AND ("group"<>'isvoi_catalog' OR coalesce(hidden,false)))
UNION ALL
SELECT 'multicity.content.belgorod_missing',CASE WHEN EXISTS (
  SELECT 1 FROM store_locations WHERE slug='belgorod' AND status='published' AND city='Белгород'
) THEN '0' ELSE '1' END
UNION ALL
SELECT 'multicity.migration.products_without_offer',count(*)::text
FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_offers o WHERE o.product=p.id)
UNION ALL
SELECT 'multicity.offers.invalid_published',count(*)::text
FROM product_offers
WHERE status='published' AND (price<=0 OR NULLIF(local_sku,'') IS NULL OR stock_status='hidden'
  OR NOT (pickup_enabled OR local_delivery_enabled OR intercity_delivery_enabled))
UNION ALL
SELECT 'multicity.offers.split_without_pay',count(*)::text
FROM product_offers WHERE yandex_split_enabled AND NOT yandex_pay_enabled
UNION ALL
SELECT 'multicity.permissions.public_missing',(3-count(*))::text
FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Public Read' AND permission.action='read'
  AND permission.collection IN ('store_locations','store_location_images','product_offers')
UNION ALL
SELECT 'multicity.permissions.public_writes',count(*)::text
FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Public Read' AND permission.action<>'read'
  AND permission.collection IN ('store_locations','store_location_images','product_offers')
UNION ALL
SELECT 'multicity.permissions.editor_actions_missing',(18-count(*))::text
FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.action IN ('read','create','update')
  AND permission.collection IN ('store_locations','store_location_images','product_offers')
UNION ALL
SELECT 'multicity.studio.presets_missing',(10-count(*))::text
FROM directus_presets preset JOIN directus_roles role ON role.id=preset.role
WHERE role.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND preset.collection='product_offers' AND preset."user" IS NULL
  AND preset.bookmark IN ('Белгород','В наличии локально','Доступно с доставкой','Без цены','Остаток устарел')
UNION ALL
SELECT 'multicity.content.old_city_mentions',
  ((SELECT count(*) FROM site_settings WHERE city ILIKE '%Северодвин%' OR footer_brand_text ILIKE '%Северодвин%') +
   (SELECT count(*) FROM navigation_items WHERE label ILIKE '%Северодвин%' OR label_short ILIKE '%Северодвин%') +
   (SELECT count(*) FROM site_pages WHERE title ILIKE '%Северодвин%' OR meta_description ILIKE '%Северодвин%') +
   (SELECT count(*) FROM page_sections WHERE eyebrow ILIKE '%Северодвин%' OR headline ILIKE '%Северодвин%' OR subheadline ILIKE '%Северодвин%' OR body ILIKE '%Северодвин%' OR content::text ILIKE '%Северодвин%'))::text
UNION ALL
SELECT 'multicity.guard.missing',CASE WHEN EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgname='product_offers_publication_guard' AND NOT tgisinternal
) THEN '0' ELSE '1' END;
`);
