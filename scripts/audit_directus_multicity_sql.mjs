#!/usr/bin/env node

process.stdout.write(String.raw`
SELECT 'multicity.schema.tables_missing' AS check_name,
  (3-count(*))::text AS value
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('store_locations','store_location_images','product_offers')
UNION ALL
SELECT 'multicity.schema.location_footer_fields_missing',(5-count(*))::text
FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_locations'
  AND column_name IN ('legal_name','inn','ogrn','legal_address','footer_eyebrow')
UNION ALL
SELECT 'multicity.schema.site_footer_copy_fields_missing',(13-count(*))::text
FROM information_schema.columns
WHERE table_schema='public' AND table_name='site_settings'
  AND column_name IN (
    'footer_contact_eyebrow','footer_map_label','footer_store_label',
    'footer_contact_heading','footer_hours_heading','footer_seller_label',
    'footer_legal_address_label','footer_contacts_fallback','footer_hours_fallback',
    'footer_network_eyebrow','footer_network_title','footer_network_body',
    'footer_all_stores_label'
  )
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
WHERE (collection='store_locations' AND ("group"<>'isvoi_locations' OR coalesce(hidden,false)))
   OR (collection='store_location_images' AND ("group"<>'isvoi_locations' OR NOT coalesce(hidden,false)))
   OR (collection='product_offers' AND ("group"<>'isvoi_locations' OR coalesce(hidden,false)))
UNION ALL
SELECT 'multicity.content.belgorod_missing',CASE WHEN EXISTS (
  SELECT 1 FROM store_locations WHERE slug='belgorod' AND status='published' AND city='Белгород'
) THEN '0' ELSE '1' END
UNION ALL
SELECT 'multicity.content.published_footer_incomplete',count(*)::text
FROM store_locations
WHERE status='published' AND (
  NULLIF(address,'') IS NULL OR NULLIF(phone,'') IS NULL
  OR NULLIF(business_hours,'') IS NULL OR NULLIF(map_url,'') IS NULL
  OR NULLIF(legal_name,'') IS NULL OR NULLIF(inn,'') IS NULL
  OR NULLIF(ogrn,'') IS NULL
)
UNION ALL
SELECT 'multicity.content.invalid_map_url',count(*)::text
FROM store_locations
WHERE status='published' AND NULLIF(map_url,'') IS NOT NULL
  AND map_url !~* '^https://'
UNION ALL
SELECT 'multicity.content.site_footer_copy_incomplete',count(*)::text
FROM site_settings settings
WHERE NULLIF(to_jsonb(settings)->>'footer_contact_eyebrow','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_map_label','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_store_label','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_contact_heading','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_hours_heading','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_seller_label','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_legal_address_label','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_contacts_fallback','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_hours_fallback','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_network_eyebrow','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_network_title','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_network_body','') IS NULL
   OR NULLIF(to_jsonb(settings)->>'footer_all_stores_label','') IS NULL
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
SELECT 'multicity.permissions.location_footer_fields_missing',count(*)::text
FROM (VALUES
  ('ISVOI Public Read','read'),
  ('ISVOI Editor','read'),('ISVOI Editor','create'),('ISVOI Editor','update'),
  ('ISVOI Advanced Editor','read'),('ISVOI Advanced Editor','create'),
  ('ISVOI Advanced Editor','update')
) expected(policy_name,action_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name=expected.policy_name
    AND permission.collection='store_locations'
    AND permission.action=expected.action_name
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,legal_name,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,inn,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,ogrn,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,legal_address,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_eyebrow,%'
)
UNION ALL
SELECT 'multicity.permissions.site_footer_copy_fields_missing',count(*)::text
FROM (VALUES
  ('ISVOI Public Read','read'),
  ('ISVOI Editor','read'),('ISVOI Editor','update'),
  ('ISVOI Advanced Editor','read'),('ISVOI Advanced Editor','update')
) expected(policy_name,action_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name=expected.policy_name
    AND permission.collection='site_settings'
    AND permission.action=expected.action_name
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,group_footer_contacts,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_contact_eyebrow,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_map_label,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_store_label,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_contact_heading,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_hours_heading,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_seller_label,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_legal_address_label,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_contacts_fallback,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_hours_fallback,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_network_eyebrow,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_network_title,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_network_body,%'
    AND (','||coalesce(permission.fields,'')||',') LIKE '%,footer_all_stores_label,%'
)
UNION ALL
SELECT 'multicity.permissions.editor_actions_missing',(18-count(*))::text
FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.action IN ('read','create','update')
  AND permission.collection IN ('store_locations','store_location_images','product_offers')
UNION ALL
SELECT 'multicity.studio.presets_missing',(12-count(*))::text
FROM directus_presets preset JOIN directus_roles role ON role.id=preset.role
WHERE role.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND preset.collection='product_offers' AND preset."user" IS NULL
  AND preset.bookmark IN ('Все предложения','Требуют внимания','Белгород','В наличии','Доступно с доставкой','Архив')
UNION ALL
SELECT 'multicity.revalidation.collections_missing',(3-count(DISTINCT collection_name))::text
FROM directus_flows flow
CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(flow.options::jsonb->'collections','[]'::jsonb)) collection_name
WHERE flow.name='ISVOI: обновить кэш контента сайта' AND flow.status='active'
  AND collection_name IN ('store_locations','store_location_images','product_offers')
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
