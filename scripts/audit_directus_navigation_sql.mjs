#!/usr/bin/env node
/**
 * Print SQL checks for ISVOI site navigation and Directus menu hygiene.
 *
 * Usage:
 *   node scripts/audit_directus_navigation_sql.mjs > /tmp/isvoi_audit_navigation.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_audit_navigation.sql
 */

process.stdout.write(String.raw`
WITH canonical_main(id,location,parent,label,url,item_role,sort) AS (
  VALUES
    ('3eaf7a0d-13a5-4a0e-a729-518f4c6db201'::uuid,'header'::varchar,NULL::uuid,'Каталог'::varchar,'/catalog'::varchar,'link'::varchar,1),
    ('4b65c9e1-1f90-4f7d-9f89-3c8b8a001001'::uuid,'header','3eaf7a0d-13a5-4a0e-a729-518f4c6db201'::uuid,'Все устройства','/catalog','link',1),
    ('8e8217b9-6331-40c3-96f4-a98e8a1a69e4'::uuid,'header','3eaf7a0d-13a5-4a0e-a729-518f4c6db201'::uuid,'Техника','/catalog/tech','link',2),
    ('afa57d77-9c2f-4b65-9798-7ebe9b5bfdab'::uuid,'header','3eaf7a0d-13a5-4a0e-a729-518f4c6db201'::uuid,'Аксессуары','/catalog/accessories','link',3),
    ('64cf08a2-06fe-4a34-a6f2-7f264562d543'::uuid,'header',NULL::uuid,'Магазин в Белгороде','/belgorod','link',2),
    ('39c1e80f-c497-48ef-8665-1ac2f53ddb85'::uuid,'header',NULL::uuid,'Как мы проверяем','/passport','link',3),
    ('0cc75f59-e244-458c-86e0-e86b4b31b3b4'::uuid,'header',NULL::uuid,'Продать или обменять','/trade','link',4),
    ('e2d4a482-55aa-4c98-bd37-0c84bf279d01'::uuid,'header',NULL::uuid,'Блог','/blog','link',5),
    ('9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8'::uuid,'footer',NULL::uuid,'Покупка','/','group',1),
    ('dd29ad40-2d90-4a92-8143-b8a9d22136ce'::uuid,'footer',NULL::uuid,'Сервисы','/','group',2),
    ('0c0ea292-7eb0-4983-af42-cd78f24d0a4b'::uuid,'footer',NULL::uuid,'I СВОИ','/','group',3),
    ('fc94d8fa-4bbb-44b6-8f30-e5e927fe2b50'::uuid,'footer','9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8'::uuid,'Каталог','/catalog','link',1),
    ('1d837c49-616e-4562-ae2f-f0dfec3ad32d'::uuid,'footer','9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8'::uuid,'Техника','/catalog/tech','link',2),
    ('3c7a7c09-b8cc-4c48-b271-d161dca6a73a'::uuid,'footer','9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8'::uuid,'Аксессуары','/catalog/accessories','link',3),
    ('5a465d6f-8a34-4654-9206-a4656219c5d3'::uuid,'footer','dd29ad40-2d90-4a92-8143-b8a9d22136ce'::uuid,'Как мы проверяем','/passport','link',1),
    ('747f3fb7-3c3e-4477-850d-8b833b7658f5'::uuid,'footer','dd29ad40-2d90-4a92-8143-b8a9d22136ce'::uuid,'Продать или обменять','/trade','link',2),
    ('98310275-35d5-4e2e-a248-5ddf871b68be'::uuid,'footer','dd29ad40-2d90-4a92-8143-b8a9d22136ce'::uuid,'Club — пилот','/club','link',3),
    ('5a2a6b8d-73e6-4b15-9dfc-1b91c7f16001'::uuid,'footer','0c0ea292-7eb0-4983-af42-cd78f24d0a4b'::uuid,'Магазин в Белгороде','/belgorod','link',1),
    ('e2d4a482-55aa-4c98-bd37-0c84bf279d02'::uuid,'footer','0c0ea292-7eb0-4983-af42-cd78f24d0a4b'::uuid,'Блог','/blog','link',2)
), expected_bookmarks(role_name,bookmark) AS (
  SELECT role_name,bookmark
  FROM (VALUES ('Administrator'),('ISVOI Editor'),('ISVOI Advanced Editor')) roles(role_name)
  CROSS JOIN (VALUES
    ('Шапка сайта'),('Подменю каталога'),('Группы подвала'),('Ссылки подвала'),('Скрытые / архив')
  ) bookmarks(bookmark)
), active_header AS (
  SELECT *
  FROM navigation_items
  WHERE location = 'header'
    AND is_active = true
    AND COALESCE(item_role, 'link') <> 'cta'
),
active_footer AS (
  SELECT *
  FROM navigation_items
  WHERE location = 'footer'
    AND is_active = true
)
SELECT 'navigation.header.active_count' AS check_name, count(*)::text AS value
FROM active_header
WHERE parent IS NULL
UNION ALL
SELECT 'navigation.header.too_many', count(*)::text
FROM (
  SELECT 1
  FROM active_header
  WHERE parent IS NULL
  HAVING count(*) > 6
) x
UNION ALL
SELECT 'navigation.header.duplicate_labels', count(*)::text
FROM (
  SELECT lower(label)
  FROM active_header
  GROUP BY lower(label)
  HAVING count(*) > 1
) x
UNION ALL
SELECT 'navigation.header.club_store_confusion', count(*)::text
FROM active_header
WHERE lower(label) IN ('клуб', 'club')
  AND COALESCE(custom_url, url, '') = '/store'
UNION ALL
SELECT 'navigation.page_links_without_page', count(*)::text
FROM navigation_items
WHERE is_active = true
  AND link_type = 'page'
  AND page IS NULL
UNION ALL
SELECT 'navigation.external_without_new_tab', count(*)::text
FROM navigation_items
WHERE is_active = true
  AND link_type = 'external'
  AND COALESCE(open_in_new, false) = false
UNION ALL
SELECT 'navigation.footer_relative_anchors', count(*)::text
FROM active_footer
WHERE COALESCE(custom_url, url, '') LIKE '#%'
UNION ALL
SELECT 'navigation.site_logo_file_missing', count(*)::text
FROM site_settings
WHERE logo_file IS NULL
UNION ALL
SELECT 'navigation.header_cta_missing', count(*)::text
FROM site_settings
WHERE COALESCE(header_cta_label, '') = ''
   OR COALESCE(header_cta_url, '') = ''
UNION ALL
SELECT 'navigation.blog.header_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items item
  JOIN site_pages page ON page.id=item.page
  WHERE item.location='header' AND item.is_active=true AND item.label='Блог'
    AND item.link_type='page' AND page.slug='blog' AND page.status='published'
)
UNION ALL
SELECT 'navigation.blog.footer_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items item
  JOIN site_pages page ON page.id=item.page
  WHERE item.location='footer' AND item.is_active=true AND item.label='Блог'
    AND item.link_type='page' AND page.slug='blog' AND page.status='published'
)
UNION ALL
SELECT 'navigation.main.canonical_mismatch', count(*)::text
FROM canonical_main expected
LEFT JOIN navigation_items item ON item.id=expected.id
WHERE item.id IS NULL
   OR item.location IS DISTINCT FROM expected.location
   OR item.parent IS DISTINCT FROM expected.parent
   OR item.label IS DISTINCT FROM expected.label
   OR item.url IS DISTINCT FROM expected.url
   OR (expected.url='/belgorod' AND (
     item.custom_url IS DISTINCT FROM '/belgorod' OR item.link_type IS DISTINCT FROM 'custom' OR item.page IS NOT NULL
   ))
   OR item.item_role IS DISTINCT FROM expected.item_role
   OR item.sort IS DISTINCT FROM expected.sort
   OR item.is_active IS DISTINCT FROM true
   OR COALESCE(item.label_short,'') <> ''
UNION ALL
SELECT 'navigation.main.unmanaged_active', count(*)::text
FROM navigation_items item
WHERE item.location IN ('header','footer') AND item.is_active=true
  AND NOT EXISTS (SELECT 1 FROM canonical_main expected WHERE expected.id=item.id)
UNION ALL
SELECT 'navigation.main.legacy_rows', count(*)::text
FROM navigation_items
WHERE id IN (
  'e6f7327c-f4b2-4888-8ac5-c610f20adfe7','7e56f158-a55e-4a69-8c10-73042aa95d28',
  '72dbe57d-e60b-4144-8c06-d52cdd364629','acce4ec0-50cf-40b1-9d36-403d7c0e9b0c',
  'a6d2b5b2-f459-4560-9eff-0ef046a28990','c4436209-36b4-40c1-896d-b91829d62a0a',
  '2c6f7852-1b74-4858-8c73-455e5f6296ee','34a16a77-bb5a-46bc-bbc7-f7715ab03878',
  '8efba434-4a48-4f9e-94a4-99758ce3bb88','8cd9dd69-dbd6-4a4b-8e1f-b7e73061ed93',
  'ec5de379-bb65-49c9-a6de-c44ad4df5984','2cd0c485-4df5-4fc5-bfd0-b1c12ac5c1b5'
)
UNION ALL
SELECT 'navigation.footer.duplicate_destinations', count(*)::text
FROM (
  SELECT COALESCE(NULLIF(custom_url,''),NULLIF(url,'')) destination
  FROM navigation_items
  WHERE location='footer' AND is_active=true AND item_role<>'group'
  GROUP BY COALESCE(NULLIF(custom_url,''),NULLIF(url,''))
  HAVING count(*)>1
) duplicates
UNION ALL
SELECT 'navigation.footer.invalid_structure', count(*)::text
FROM navigation_items item
LEFT JOIN navigation_items parent ON parent.id=item.parent
WHERE item.location='footer' AND item.is_active=true
  AND (
    (item.item_role='group' AND item.parent IS NOT NULL)
    OR (item.item_role<>'group' AND (item.parent IS NULL OR parent.item_role<>'group' OR parent.location<>'footer'))
  )
UNION ALL
SELECT 'navigation.site_city_mismatch', count(*)::text
FROM site_settings
WHERE COALESCE(city,'')<>'Белгород'
UNION ALL
SELECT 'navigation.studio.bookmarks_missing', count(*)::text
FROM expected_bookmarks expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_presets preset
  JOIN directus_roles role ON role.id=preset.role
  WHERE role.name=expected.role_name AND preset.collection='navigation_items'
    AND preset.bookmark=expected.bookmark AND preset."user" IS NULL
)
UNION ALL
SELECT 'navigation.info.active_main_rows', count(*)::text
FROM navigation_items WHERE location IN ('header','footer') AND is_active=true;
`);
