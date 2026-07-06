#!/usr/bin/env node
/**
 * Print idempotent SQL that makes /catalog copy editable through Site Pages.
 *
 * Usage:
 *   node scripts/setup_directus_catalog_page_sql.mjs > /tmp/isvoi_setup_directus_catalog_page_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_catalog_page_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE directus_fields
SET options = '{"choices":[{"text":"Главная","value":"home","color":"#0f766e"},{"text":"Каталог","value":"catalog","color":"#111827"},{"text":"Store","value":"store","color":"#2563eb"},{"text":"Trade","value":"trade","color":"#7c3aed"},{"text":"Passport","value":"passport","color":"#dc2626"},{"text":"Club","value":"club","color":"#ca8a04"}]}'::json,
  note = 'Шаблон рендера в Next. Обычно не менять. Каталог использует template=catalog и секцию catalog.grid.'
WHERE collection = 'site_pages'
  AND field = 'template';

INSERT INTO site_pages (slug, template, status, title, meta_description)
VALUES (
  'catalog',
  'catalog',
  'published',
  'ISVOI Store — вещи в кругу',
  'Проверенные вещи с ISVOI Passport, гарантией и понятной ценой выхода. Сейчас в наличии в кругу ISVOI.'
)
ON CONFLICT (slug) DO UPDATE SET
  template = EXCLUDED.template,
  status = EXCLUDED.status,
  title = COALESCE(NULLIF(site_pages.title, ''), EXCLUDED.title),
  meta_description = COALESCE(NULLIF(site_pages.meta_description, ''), EXCLUDED.meta_description);

UPDATE page_sections ps
SET variant = 'catalog.grid',
  eyebrow = COALESCE(NULLIF(ps.eyebrow, ''), 'Store'),
  headline = COALESCE(NULLIF(ps.headline, ''), 'Вещи в кругу — сейчас в наличии.'),
  subheadline = COALESCE(NULLIF(ps.subheadline, ''), 'Фильтры каталога'),
  body = COALESCE(
    NULLIF(ps.body, ''),
    'Карточки загружаются из Directus: фото, грейд, цена, Passport и цена выхода обновляются без правки кода.'
  ),
  primary_cta_label = COALESCE(NULLIF(ps.primary_cta_label, ''), 'Подобрать под задачу'),
  primary_cta_url = COALESCE(NULLIF(ps.primary_cta_url, ''), '/#final'),
  secondary_cta_label = COALESCE(NULLIF(ps.secondary_cta_label, ''), 'Как устроен Store'),
  secondary_cta_url = COALESCE(NULLIF(ps.secondary_cta_url, ''), '/store'),
  sort_order = 1,
  is_active = true,
  content = ('{
    "headingTag": "h1",
    "filters": [
      { "label": "Все", "value": "all" },
      { "label": "iPhone", "value": "iphone" },
      { "label": "MacBook", "value": "macbook" },
      { "label": "iPad", "value": "ipad" },
      { "label": "Для Club", "value": "club" }
    ],
    "statusFilters": [
      { "label": "Все статусы", "value": "all" },
      { "label": "В наличии", "value": "available" },
      { "label": "Бронь", "value": "reserved" },
      { "label": "Продано", "value": "sold" }
    ],
    "filterAriaLabel": "Фильтры каталога",
    "statusFilterLabel": "Статус устройства",
    "sortLabel": "Сортировка",
    "sortAriaLabel": "Сортировка каталога",
    "sortOptions": [
      { "label": "По умолчанию", "value": "default" },
      { "label": "Цена: ниже", "value": "price-asc" },
      { "label": "Цена: выше", "value": "price-desc" },
      { "label": "Сначала обновленные", "value": "updated-desc" },
      { "label": "По статусу", "value": "status" }
    ],
    "emptyState": {
      "headline": "Каталог скоро обновится.",
      "body": "Сейчас нет опубликованных устройств. Оставьте заявку — подберём вещь под задачу.",
      "ctaLabel": "Оставить заявку",
      "ctaUrl": "/#final"
    }
  }'::jsonb || COALESCE(ps.content::jsonb, '{}'::jsonb))::json
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'catalog'
  AND ps.section_key = 'catalog_page_live';

INSERT INTO page_sections (
  page,
  section_key,
  variant,
  eyebrow,
  headline,
  subheadline,
  body,
  primary_cta_label,
  primary_cta_url,
  secondary_cta_label,
  secondary_cta_url,
  sort_order,
  is_active,
  content
)
SELECT
  sp.id,
  'catalog_page_live',
  'catalog.grid',
  'Store',
  'Вещи в кругу — сейчас в наличии.',
  'Фильтры каталога',
  'Карточки загружаются из Directus: фото, грейд, цена, Passport и цена выхода обновляются без правки кода.',
  'Подобрать под задачу',
  '/#final',
  'Как устроен Store',
  '/store',
  1,
  true,
  '{
    "headingTag": "h1",
    "filters": [
      { "label": "Все", "value": "all" },
      { "label": "iPhone", "value": "iphone" },
      { "label": "MacBook", "value": "macbook" },
      { "label": "iPad", "value": "ipad" },
      { "label": "Для Club", "value": "club" }
    ],
    "statusFilters": [
      { "label": "Все статусы", "value": "all" },
      { "label": "В наличии", "value": "available" },
      { "label": "Бронь", "value": "reserved" },
      { "label": "Продано", "value": "sold" }
    ],
    "filterAriaLabel": "Фильтры каталога",
    "statusFilterLabel": "Статус устройства",
    "sortLabel": "Сортировка",
    "sortAriaLabel": "Сортировка каталога",
    "sortOptions": [
      { "label": "По умолчанию", "value": "default" },
      { "label": "Цена: ниже", "value": "price-asc" },
      { "label": "Цена: выше", "value": "price-desc" },
      { "label": "Сначала обновленные", "value": "updated-desc" },
      { "label": "По статусу", "value": "status" }
    ],
    "emptyState": {
      "headline": "Каталог скоро обновится.",
      "body": "Сейчас нет опубликованных устройств. Оставьте заявку — подберём вещь под задачу.",
      "ctaLabel": "Оставить заявку",
      "ctaUrl": "/#final"
    }
  }'::json
FROM site_pages sp
WHERE sp.slug = 'catalog'
  AND NOT EXISTS (
    SELECT 1
    FROM page_sections existing
    WHERE existing.page = sp.id
      AND existing.section_key = 'catalog_page_live'
  );

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
    WHERE role = v_role AND collection = p_collection AND bookmark = p_bookmark AND "user" IS NULL
  ) THEN
    UPDATE directus_presets
    SET icon = p_icon,
      color = p_color,
      filter = p_filter,
      layout = 'tabular',
      layout_query = p_layout_query,
      layout_options = NULL,
      refresh_interval = NULL,
      search = NULL
    WHERE role = v_role AND collection = p_collection AND bookmark = p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets (
      bookmark, role, "user", collection, search, layout, layout_query,
      layout_options, refresh_interval, filter, icon, color
    ) VALUES (
      p_bookmark, v_role, NULL, p_collection, NULL, 'tabular', p_layout_query,
      NULL, NULL, p_filter, p_icon, p_color
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Каталог', 'storefront', '#111827', '{"page":{"slug":{"_eq":"catalog"}}}'::json, '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, varchar, json, json);

SELECT 'catalog_page.site_page' AS check_name, count(*)::text AS value
FROM site_pages
WHERE slug = 'catalog'
  AND status = 'published'
UNION ALL
SELECT 'catalog_page.section', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'catalog'
  AND ps.section_key = 'catalog_page_live'
  AND ps.variant = 'catalog.grid'
UNION ALL
SELECT 'catalog_page.editor_preset', count(*)::text
FROM directus_presets
WHERE collection = 'page_sections'
  AND bookmark = 'Каталог'
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor');

COMMIT;
`);
