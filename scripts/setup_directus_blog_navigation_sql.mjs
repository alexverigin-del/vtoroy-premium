#!/usr/bin/env node
/**
 * Print idempotent SQL that launches Blog links in the managed navigation.
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_page uuid;
  v_footer_parent uuid;
  v_header uuid;
  v_footer uuid;
BEGIN
  SELECT id INTO v_page FROM site_pages WHERE slug='blog' AND status='published' LIMIT 1;
  IF v_page IS NULL THEN
    RAISE EXCEPTION 'Published site_pages.slug=blog is required';
  END IF;

  SELECT id INTO v_footer_parent
  FROM navigation_items
  WHERE location='footer' AND parent IS NULL AND label IN ('Клуб','Навигация')
  ORDER BY CASE WHEN label='Клуб' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_footer_parent IS NULL THEN
    RAISE EXCEPTION 'Footer group Клуб is required';
  END IF;

  SELECT id INTO v_header
  FROM navigation_items
  WHERE location='header'
    AND (lower(label)='блог' OR custom_url='/blog' OR url='/blog' OR page=v_page)
  ORDER BY is_active DESC, sort NULLS LAST
  LIMIT 1;
  IF v_header IS NULL THEN
    v_header := 'e2d4a482-55aa-4c98-bd37-0c84bf279d01'::uuid;
    INSERT INTO navigation_items (id,label,url,location,sort,is_active,open_in_new,link_type,page,custom_url,item_role)
    VALUES (v_header,'Блог','/blog','header',6,true,false,'page',v_page,'/blog','link');
  END IF;
  UPDATE navigation_items SET
    label='Блог', label_short='Блог', aria_label='Блог I СВОИ',
    link_type='page', page=v_page, section_anchor=NULL, custom_url='/blog', url='/blog',
    location='header', parent=NULL, sort=6, is_active=true, open_in_new=false, item_role='link'
  WHERE id=v_header;
  UPDATE navigation_items SET is_active=false
  WHERE id<>v_header AND location='header'
    AND (lower(label)='блог' OR custom_url='/blog' OR url='/blog' OR page=v_page);

  SELECT id INTO v_footer
  FROM navigation_items
  WHERE location='footer'
    AND (lower(label)='блог' OR custom_url='/blog' OR url='/blog' OR page=v_page)
  ORDER BY is_active DESC, sort NULLS LAST
  LIMIT 1;
  IF v_footer IS NULL THEN
    v_footer := 'e2d4a482-55aa-4c98-bd37-0c84bf279d02'::uuid;
    INSERT INTO navigation_items (id,label,url,location,parent,sort,is_active,open_in_new,link_type,page,custom_url,item_role)
    VALUES (v_footer,'Блог','/blog','footer',v_footer_parent,4,true,false,'page',v_page,'/blog','link');
  END IF;
  UPDATE navigation_items SET
    label='Блог', label_short='Блог', aria_label='Блог I СВОИ',
    link_type='page', page=v_page, section_anchor=NULL, custom_url='/blog', url='/blog',
    location='footer', parent=v_footer_parent, sort=4, is_active=true, open_in_new=false, item_role='link'
  WHERE id=v_footer;
  UPDATE navigation_items SET is_active=false
  WHERE id<>v_footer AND location='footer'
    AND (lower(label)='блог' OR custom_url='/blog' OR url='/blog' OR page=v_page);
END;
$$;

COMMIT;

SELECT 'blog_navigation.header' AS check_name, count(*)::text AS value
FROM navigation_items item
JOIN site_pages page ON page.id=item.page
WHERE item.location='header' AND item.is_active=true AND item.label='Блог'
  AND item.link_type='page' AND page.slug='blog'
UNION ALL
SELECT 'blog_navigation.footer', count(*)::text
FROM navigation_items item
JOIN site_pages page ON page.id=item.page
WHERE item.location='footer' AND item.is_active=true AND item.label='Блог'
  AND item.link_type='page' AND page.slug='blog';
`);
