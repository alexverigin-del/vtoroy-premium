#!/usr/bin/env node
/**
 * Print idempotent SQL that upgrades ISVOI navigation and site branding fields.
 *
 * It adds editor-friendly logo/header CTA fields to `site_settings`, structured
 * link fields to `navigation_items`, keeps legacy `url` as fallback, and seeds a
 * clean production menu.
 *
 * Usage:
 *   node scripts/setup_directus_navigation_branding_sql.mjs > /tmp/isvoi_navigation_branding.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_navigation_branding.sql
 */

process.stdout.write(String.raw`
BEGIN;

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS logo_file uuid,
  ADD COLUMN IF NOT EXISTS logo_alt varchar,
  ADD COLUMN IF NOT EXISTS logo_href varchar DEFAULT '/',
  ADD COLUMN IF NOT EXISTS logo_width integer,
  ADD COLUMN IF NOT EXISTS logo_height integer DEFAULT 22,
  ADD COLUMN IF NOT EXISTS logo_caption varchar,
  ADD COLUMN IF NOT EXISTS show_brand_name boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_cta_label varchar DEFAULT 'Войти в круг',
  ADD COLUMN IF NOT EXISTS header_cta_url varchar DEFAULT '/#final';

ALTER TABLE navigation_items
  ADD COLUMN IF NOT EXISTS link_type varchar DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS page uuid,
  ADD COLUMN IF NOT EXISTS section_anchor varchar,
  ADD COLUMN IF NOT EXISTS custom_url varchar,
  ADD COLUMN IF NOT EXISTS label_short varchar,
  ADD COLUMN IF NOT EXISTS aria_label varchar,
  ADD COLUMN IF NOT EXISTS item_role varchar DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS icon varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'site_settings'
      AND constraint_name = 'site_settings_logo_file_fkey'
  ) THEN
    ALTER TABLE site_settings
      ADD CONSTRAINT site_settings_logo_file_fkey
      FOREIGN KEY (logo_file) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'navigation_items'
      AND constraint_name = 'navigation_items_page_fkey'
  ) THEN
    ALTER TABLE navigation_items
      ADD CONSTRAINT navigation_items_page_fkey
      FOREIGN KEY (page) REFERENCES site_pages(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_upsert_directus_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_display_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_readonly boolean,
  p_hidden boolean,
  p_required boolean,
  p_special varchar,
  p_group varchar,
  p_translation text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_translations json;
BEGIN
  v_translations := CASE
    WHEN p_translation IS NULL THEN NULL
    ELSE json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json
  END;

  IF EXISTS (
    SELECT 1 FROM directus_fields WHERE collection = p_collection AND field = p_field
  ) THEN
    UPDATE directus_fields
    SET interface = p_interface,
      display = p_display,
      options = p_options,
      display_options = p_display_options,
      width = p_width,
      sort = p_sort,
      note = p_note,
      readonly = p_readonly,
      hidden = p_hidden,
      required = p_required,
      special = p_special,
      "group" = p_group,
      translations = v_translations
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, special, interface, display, options, display_options,
      readonly, hidden, sort, width, translations, note, required, "group"
    ) VALUES (
      p_collection, p_field, p_special, p_interface, p_display, p_options,
      p_display_options, p_readonly, p_hidden, p_sort, p_width,
      v_translations, p_note, p_required, p_group
    );
  END IF;
END;
$$;

-- Site settings: logo and header CTA.
SELECT isvoi_upsert_directus_field('site_settings', 'group_header', 'group-detail', NULL, '{"headerIcon":"web_asset","start":"open"}'::json, NULL, 'full', 10, 'Header logo, brand name and CTA button.', false, false, false, 'alias,no-data,group', NULL, 'Шапка сайта');
SELECT isvoi_upsert_directus_field('site_settings', 'logo_file', 'file-image', 'file', '{"folder":"ISVOI Site Assets"}'::json, NULL, 'half', 11, 'Logo shown in the site header/footer. Use ISVOI Site Assets.', false, false, false, 'm2o', 'group_header', 'Логотип');
SELECT isvoi_upsert_directus_field('site_settings', 'logo_alt', 'input', NULL, NULL, NULL, 'half', 12, 'Accessible alt text for the logo image.', false, false, false, NULL, 'group_header', 'Alt логотипа');
SELECT isvoi_upsert_directus_field('site_settings', 'logo_href', 'input', NULL, NULL, NULL, 'half', 13, 'Logo link, usually /.', false, false, false, NULL, 'group_header', 'Ссылка логотипа');
SELECT isvoi_upsert_directus_field('site_settings', 'logo_width', 'input', NULL, '{"min":28,"max":360,"step":1}'::json, NULL, 'half', 14, 'Optional rendered logo width in pixels. Leave empty to preserve image proportions from height.', false, false, false, NULL, 'group_header', 'Ширина логотипа, px');
SELECT isvoi_upsert_directus_field('site_settings', 'logo_height', 'input', NULL, '{"min":16,"max":120,"step":1}'::json, NULL, 'half', 15, 'Rendered logo height in pixels. Default header height is 22.', false, false, false, NULL, 'group_header', 'Высота логотипа, px');
SELECT isvoi_upsert_directus_field('site_settings', 'logo_caption', 'input', NULL, NULL, NULL, 'full', 16, 'Optional text shown directly under the logo image. Leave empty when the uploaded logo already includes the caption.', false, false, false, NULL, 'group_header', 'Подпись под логотипом');
SELECT isvoi_upsert_directus_field('site_settings', 'show_brand_name', 'boolean', 'boolean', NULL, NULL, 'half', 17, 'Show text brand name next to the logo.', false, false, false, NULL, 'group_header', 'Показывать название');
SELECT isvoi_upsert_directus_field('site_settings', 'header_cta_label', 'input', NULL, NULL, NULL, 'half', 18, 'Header CTA button text.', false, false, false, NULL, 'group_header', 'CTA в шапке');
SELECT isvoi_upsert_directus_field('site_settings', 'header_cta_url', 'input', NULL, NULL, NULL, 'half', 19, 'Header CTA URL, for example /#final.', false, false, false, NULL, 'group_header', 'Ссылка CTA');

-- Navigation: structured links with legacy URL fallback.
SELECT isvoi_upsert_directus_field('navigation_items', 'label_short', 'input', NULL, NULL, NULL, 'half', 5, 'Optional shorter label for compact/mobile navigation.', false, false, false, NULL, 'group_link', 'Короткое название');
SELECT isvoi_upsert_directus_field('navigation_items', 'aria_label', 'input', NULL, NULL, NULL, 'half', 6, 'Accessible label if the visible text is short.', false, false, false, NULL, 'group_link', 'ARIA label');
SELECT isvoi_upsert_directus_field('navigation_items', 'link_type', 'select-dropdown', 'labels', '{"choices":[{"text":"Страница","value":"page","color":"#2563eb"},{"text":"Секция","value":"section","color":"#0f766e"},{"text":"Внешняя ссылка","value":"external","color":"#f97316"},{"text":"Произвольный URL","value":"custom","color":"#6b7280"}]}'::json, NULL, 'half', 7, 'How the final URL is built. Prefer Page for managed pages.', false, false, true, NULL, 'group_link', 'Тип ссылки');
SELECT isvoi_upsert_directus_field('navigation_items', 'page', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · /{{slug}}"}'::json, NULL, 'half', 8, 'Managed page for page links.', false, false, false, 'm2o', 'group_link', 'Страница');
SELECT isvoi_upsert_directus_field('navigation_items', 'section_anchor', 'input', NULL, NULL, NULL, 'half', 9, 'Section id without #. For example final or diagnostics.', false, false, false, NULL, 'group_link', 'Секция');
SELECT isvoi_upsert_directus_field('navigation_items', 'custom_url', 'input', NULL, NULL, NULL, 'half', 10, 'Manual URL for catalog, anchors, external links or legacy routes.', false, false, false, NULL, 'group_link', 'Произвольный URL');
SELECT isvoi_upsert_directus_field('navigation_items', 'url', 'input', NULL, NULL, NULL, 'half', 11, 'Legacy fallback URL. Prefer link_type/page/custom_url for new links.', false, false, false, NULL, 'group_link', 'URL fallback');
SELECT isvoi_upsert_directus_field('navigation_items', 'location', 'select-dropdown', 'labels', '{"choices":[{"text":"Шапка","value":"header","color":"#2563eb"},{"text":"Footer","value":"footer","color":"#0f766e"},{"text":"Mobile","value":"mobile","color":"#0891b2"},{"text":"Utility","value":"utility","color":"#6b7280"}]}'::json, NULL, 'half', 21, 'Navigation area.', false, false, true, NULL, 'group_placement', 'Где показывать');
SELECT isvoi_upsert_directus_field('navigation_items', 'item_role', 'select-dropdown', 'labels', '{"choices":[{"text":"Ссылка","value":"link","color":"#2563eb"},{"text":"CTA","value":"cta","color":"#f97316"},{"text":"Группа","value":"group","color":"#6b7280"}]}'::json, NULL, 'half', 43, 'Role in the navigation UI. Footer parents are usually Group.', false, false, true, NULL, 'group_behavior', 'Роль');
SELECT isvoi_upsert_directus_field('navigation_items', 'icon', 'input', NULL, NULL, NULL, 'half', 44, 'Optional icon key for future UI.', false, false, false, NULL, 'group_behavior', 'Иконка');
SELECT isvoi_upsert_directus_field('navigation_items', 'children', 'list-o2m', NULL, '{"layout":"table","enableCreate":true,"enableSelect":true,"fields":["sort","is_active","label","link_type","page","custom_url","location"]}'::json, NULL, 'full', 23, 'Nested footer/mobile links.', false, false, false, 'o2m', 'group_placement', 'Дочерние ссылки');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, json, varchar, integer, text, boolean, boolean, boolean, varchar, varchar, text);

CREATE OR REPLACE FUNCTION isvoi_upsert_relation(
  p_many_collection varchar,
  p_many_field varchar,
  p_one_collection varchar,
  p_one_field varchar,
  p_one_deselect_action varchar
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_relations
    WHERE many_collection = p_many_collection AND many_field = p_many_field
  ) THEN
    UPDATE directus_relations
    SET one_collection = p_one_collection,
      one_field = p_one_field,
      one_deselect_action = p_one_deselect_action
    WHERE many_collection = p_many_collection AND many_field = p_many_field;
  ELSE
    INSERT INTO directus_relations (
      many_collection, many_field, one_collection, one_field, one_deselect_action
    ) VALUES (
      p_many_collection, p_many_field, p_one_collection, p_one_field, p_one_deselect_action
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_relation('site_settings', 'logo_file', 'directus_files', NULL, 'nullify');
SELECT isvoi_upsert_relation('navigation_items', 'page', 'site_pages', NULL, 'nullify');
DROP FUNCTION isvoi_upsert_relation(varchar, varchar, varchar, varchar, varchar);

CREATE OR REPLACE FUNCTION isvoi_upsert_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar,
  p_fields text,
  p_permissions json DEFAULT NULL,
  p_validation json DEFAULT NULL,
  p_presets json DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy = v_policy AND collection = p_collection AND action = p_action
  ) THEN
    UPDATE directus_permissions
    SET fields = p_fields,
      permissions = p_permissions,
      validation = p_validation,
      presets = p_presets
    WHERE policy = v_policy AND collection = p_collection AND action = p_action;
  ELSE
    INSERT INTO directus_permissions (
      policy, collection, action, fields, permissions, validation, presets
    ) VALUES (
      v_policy, p_collection, p_action, p_fields, p_permissions, p_validation, p_presets
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'site_settings',
  'read',
  'id,brand_name,tagline,city,logo_file,logo_alt,logo_href,logo_width,logo_height,logo_caption,show_brand_name,header_cta_label,header_cta_url,phone,telegram,email,address,default_og_image,footer_legal,maintenance_mode,footer_note,footer_brand_text,footer_copyright',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'site_settings',
  'update',
  'brand_name,tagline,city,logo_file,logo_alt,logo_href,logo_width,logo_height,logo_caption,show_brand_name,header_cta_label,header_cta_url,phone,telegram,email,address,default_og_image,footer_legal,footer_note,footer_brand_text,footer_copyright,maintenance_mode',
  NULL
);

SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'navigation_items',
  'read',
  'id,label,label_short,aria_label,link_type,page,section_anchor,custom_url,url,location,parent,children,sort,is_active,open_in_new,item_role,icon',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'navigation_items',
  'create',
  'label,label_short,aria_label,link_type,page,section_anchor,custom_url,url,location,parent,sort,is_active,open_in_new,item_role,icon',
  NULL,
  '{"label":{"_nnull":true},"link_type":{"_in":["page","section","external","custom"]},"location":{"_in":["header","footer","mobile","utility"]},"item_role":{"_in":["link","cta","group"]}}'::json,
  '{"location":"footer","link_type":"custom","item_role":"link","is_active":true,"open_in_new":false}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'navigation_items',
  'update',
  'label,label_short,aria_label,link_type,page,section_anchor,custom_url,url,location,parent,sort,is_active,open_in_new,item_role,icon',
  NULL,
  '{"link_type":{"_in":["page","section","external","custom"]},"location":{"_in":["header","footer","mobile","utility"]},"item_role":{"_in":["link","cta","group"]}}'::json
);

SELECT isvoi_upsert_permission(
  '$t:public_label',
  'site_settings',
  'read',
  'id,brand_name,tagline,city,logo_file,logo_alt,logo_href,logo_width,logo_height,logo_caption,show_brand_name,header_cta_label,header_cta_url,phone,telegram,email,address,default_og_image,footer_legal,maintenance_mode,footer_note,footer_brand_text,footer_copyright',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Public Read',
  'site_settings',
  'read',
  'id,brand_name,tagline,city,logo_file,logo_alt,logo_href,logo_width,logo_height,logo_caption,show_brand_name,header_cta_label,header_cta_url,phone,telegram,email,address,default_og_image,footer_legal,maintenance_mode,footer_note,footer_brand_text,footer_copyright',
  NULL
);
SELECT isvoi_upsert_permission(
  '$t:public_label',
  'navigation_items',
  'read',
  'id,label,label_short,aria_label,link_type,page,section_anchor,custom_url,url,location,parent,sort,is_active,open_in_new,item_role,icon',
  '{"is_active":{"_eq":true}}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Public Read',
  'navigation_items',
  'read',
  'id,label,label_short,aria_label,link_type,page,section_anchor,custom_url,url,location,parent,sort,is_active,open_in_new,item_role,icon',
  '{"is_active":{"_eq":true}}'::json
);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);

CREATE OR REPLACE FUNCTION isvoi_upsert_preset(
  p_role_name text,
  p_collection varchar,
  p_bookmark varchar,
  p_icon varchar,
  p_color varchar,
  p_filter json,
  p_layout_query json
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_role uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name = p_role_name LIMIT 1;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_presets
    WHERE role = v_role AND collection = p_collection AND bookmark = p_bookmark
  ) THEN
    UPDATE directus_presets
    SET icon = p_icon,
      color = p_color,
      filter = p_filter,
      layout = 'tabular',
      layout_query = p_layout_query
    WHERE role = v_role AND collection = p_collection AND bookmark = p_bookmark;
  ELSE
    INSERT INTO directus_presets (
      bookmark, role, collection, icon, color, filter, layout, layout_query
    ) VALUES (
      p_bookmark, v_role, p_collection, p_icon, p_color, p_filter, 'tabular', p_layout_query
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Header menu', 'web_asset', '#2563eb', '{"location":{"_eq":"header"},"item_role":{"_neq":"cta"}}'::json, '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","link_type","page","custom_url","item_role"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Header CTA', 'touch_app', '#f97316', '{"location":{"_eq":"header"},"item_role":{"_eq":"cta"}}'::json, '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","link_type","page","custom_url"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Footer groups', 'view_column', '#0f766e', '{"location":{"_eq":"footer"},"item_role":{"_eq":"group"}}'::json, '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","children"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Footer links', 'vertical_align_bottom', '#0f766e', '{"location":{"_eq":"footer"},"item_role":{"_neq":"group"}}'::json, '{"tabular":{"sort":["parent","sort","label"],"fields":["parent","sort","is_active","label","link_type","page","custom_url"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Hidden links', 'visibility_off', '#6b7280', '{"is_active":{"_eq":false}}'::json, '{"tabular":{"sort":["location","sort","label"],"fields":["location","sort","label","link_type","custom_url","item_role"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, varchar, json, json);

-- Backfill link_type from legacy URL.
UPDATE navigation_items
SET link_type = CASE
    WHEN COALESCE(custom_url, url, '') ~* '^https?://' THEN 'external'
    WHEN COALESCE(custom_url, url, '') LIKE '#%' THEN 'section'
    WHEN COALESCE(custom_url, url, '') LIKE '/%' THEN 'custom'
    ELSE COALESCE(link_type, 'custom')
  END,
  custom_url = COALESCE(NULLIF(custom_url, ''), NULLIF(url, '')),
  item_role = COALESCE(NULLIF(item_role, ''), CASE WHEN parent IS NULL AND location = 'footer' THEN 'group' ELSE 'link' END)
WHERE link_type IS NULL OR custom_url IS NULL OR item_role IS NULL;

-- Global header branding and CTA.
UPDATE site_settings
SET logo_file = COALESCE(
    logo_file,
    (SELECT id FROM directus_files WHERE title = 'isvoi:site:favicon' OR filename_download = 'favicon.svg' ORDER BY uploaded_on DESC LIMIT 1)
  ),
  logo_alt = COALESCE(NULLIF(logo_alt, ''), 'ISVOI'),
  logo_href = COALESCE(NULLIF(logo_href, ''), '/'),
  logo_height = COALESCE(logo_height, 22),
  show_brand_name = COALESCE(show_brand_name, true),
  header_cta_label = COALESCE(NULLIF(header_cta_label, ''), 'Войти в круг'),
  header_cta_url = COALESCE(NULLIF(header_cta_url, ''), '/#final');

-- Clean header menu: no duplicate Клуб/Club; CTA is controlled by site_settings.
UPDATE navigation_items
SET label = 'Каталог',
  label_short = 'Каталог',
  link_type = 'custom',
  page = NULL,
  section_anchor = NULL,
  custom_url = '/catalog',
  url = '/catalog',
  item_role = 'link',
  sort = 1,
  is_active = true
WHERE location = 'header' AND url = '/catalog';

UPDATE navigation_items
SET label = 'Store',
  label_short = 'Store',
  link_type = 'page',
  page = (SELECT id FROM site_pages WHERE slug = 'store' LIMIT 1),
  section_anchor = NULL,
  custom_url = NULL,
  url = '/store',
  item_role = 'link',
  sort = 2,
  is_active = true
WHERE location = 'header' AND (url = '/store' OR label = 'Клуб');

UPDATE navigation_items
SET link_type = 'page',
  page = (SELECT id FROM site_pages WHERE slug = 'passport' LIMIT 1),
  custom_url = NULL,
  url = '/passport',
  item_role = 'link',
  sort = 3,
  is_active = true
WHERE location = 'header' AND url = '/passport';

UPDATE navigation_items
SET link_type = 'page',
  page = (SELECT id FROM site_pages WHERE slug = 'trade' LIMIT 1),
  custom_url = NULL,
  url = '/trade',
  item_role = 'link',
  sort = 4,
  is_active = true
WHERE location = 'header' AND url = '/trade';

UPDATE navigation_items
SET link_type = 'page',
  page = (SELECT id FROM site_pages WHERE slug = 'club' LIMIT 1),
  custom_url = NULL,
  url = '/club',
  item_role = 'link',
  sort = 5,
  is_active = true
WHERE location = 'header' AND url = '/club';

UPDATE navigation_items
SET is_active = false
WHERE location = 'header'
  AND (url = '#diagnostics' OR label = 'Проверка');

-- Footer uses absolute URLs so links work from every route.
UPDATE navigation_items SET custom_url = '/', url = '/', item_role = 'group' WHERE location = 'footer' AND parent IS NULL AND label IN ('Клуб', 'Навигация');
UPDATE navigation_items SET custom_url = '/', url = '/', item_role = 'group' WHERE location = 'footer' AND parent IS NULL AND label = 'Сервисы';
UPDATE navigation_items SET custom_url = '/', url = '/', item_role = 'group' WHERE location = 'footer' AND parent IS NULL AND label = 'Контакты';

UPDATE navigation_items
SET label = 'Каталог', label_short = 'Каталог', link_type = 'custom', custom_url = '/catalog', url = '/catalog', sort = 1, item_role = 'link'
WHERE location = 'footer' AND label = 'Store' AND url IN ('#store', '/catalog');

INSERT INTO navigation_items (
  id, label, url, location, parent, sort, is_active, open_in_new,
  link_type, page, custom_url, item_role
)
SELECT
  '5a2a6b8d-73e6-4b15-9dfc-1b91c7f16001'::uuid,
  'Store',
  '/store',
  'footer',
  p.id,
  2,
  true,
  false,
  'page',
  (SELECT id FROM site_pages WHERE slug = 'store' LIMIT 1),
  NULL,
  'link'
FROM navigation_items p
WHERE p.location = 'footer' AND p.parent IS NULL AND p.label IN ('Клуб', 'Навигация')
  AND NOT EXISTS (
    SELECT 1 FROM navigation_items n WHERE n.location = 'footer' AND n.label = 'Store' AND n.url = '/store'
  )
LIMIT 1;

UPDATE navigation_items
SET link_type = 'page', page = (SELECT id FROM site_pages WHERE slug = 'passport' LIMIT 1), custom_url = NULL, url = '/passport', sort = 3, item_role = 'link'
WHERE location = 'footer' AND label = 'ISVOI Passport';

UPDATE navigation_items
SET link_type = 'page', page = (SELECT id FROM site_pages WHERE slug = 'trade' LIMIT 1), custom_url = NULL, url = '/trade', sort = 1, item_role = 'link'
WHERE location = 'footer' AND label = 'Trade';

UPDATE navigation_items
SET link_type = 'page', page = (SELECT id FROM site_pages WHERE slug = 'club' LIMIT 1), custom_url = NULL, url = '/club', sort = 2, item_role = 'link'
WHERE location = 'footer' AND label = 'Club';

UPDATE navigation_items
SET link_type = 'custom', page = NULL, section_anchor = NULL, custom_url = '/store#diagnostics', url = '/store#diagnostics', sort = 3, item_role = 'link',
  parent = COALESCE((SELECT id FROM navigation_items WHERE location = 'footer' AND parent IS NULL AND label = 'Сервисы' LIMIT 1), parent)
WHERE location = 'footer' AND label = 'Открытая проверка';

UPDATE navigation_items
SET link_type = 'custom', custom_url = '/#top', url = '/#top'
WHERE location = 'footer' AND label = 'Северодвинск';

UPDATE navigation_items
SET link_type = 'custom', custom_url = '/#final', url = '/#final'
WHERE location = 'footer' AND label IN ('Записаться на проверку', 'Передать вещь дальше', 'Найти вещь в кругу');

COMMIT;

SELECT 'navigation_branding.site_settings' AS check_name,
  brand_name || '|' || COALESCE(logo_file::text, '') || '|' || COALESCE(header_cta_label, '') || '|' || COALESCE(header_cta_url, '') AS value
FROM site_settings
LIMIT 1;

SELECT 'navigation_branding.header_links' AS check_name,
  string_agg(label || '->' || COALESCE(custom_url, url, '/' || COALESCE((SELECT slug FROM site_pages WHERE id = navigation_items.page), '')), ', ' ORDER BY sort) AS value
FROM navigation_items
WHERE location = 'header' AND is_active = true AND COALESCE(item_role, 'link') <> 'cta';
`);
