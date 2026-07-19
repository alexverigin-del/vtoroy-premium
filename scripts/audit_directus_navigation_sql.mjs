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
WITH active_header AS (
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
UNION ALL
SELECT 'navigation.header.too_many', count(*)::text
FROM (
  SELECT 1
  FROM active_header
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
);
`);
