#!/usr/bin/env node
/**
 * Print idempotent SQL that simplifies page editing in Directus Studio.
 *
 * It keeps the existing Site Pages / Page Sections schema, but makes the
 * editor workflow page-first:
 * - clear bookmarks for each managed page;
 * - compact section tables;
 * - technical renderer fields moved to a closed advanced group.
 * - editor permissions that allow safe content edits without creating or
 *   reshaping renderer sections.
 *
 * Usage:
 *   node scripts/setup_directus_site_pages_workflow_sql.mjs > /tmp/isvoi_setup_directus_site_pages_workflow_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_site_pages_workflow_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

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

UPDATE directus_collections
SET icon = 'web_asset',
  note = 'Страницы сайта для редактора. Обычный сценарий: открыть нужную страницу, поправить SEO и секции внутри поля "Секции страницы". Slug и template не менять без разработчика.',
  display_template = '{{title}} · {{slug}} · {{status}}',
  archive_field = 'status',
  archive_value = 'archived',
  unarchive_value = 'draft',
  sort = 20,
  color = '#0f766e',
  translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', 'Страницы сайта'))::json
WHERE collection = 'site_pages';

UPDATE directus_collections
SET icon = 'view_agenda',
  note = 'Секции страниц. Для обычной работы используйте закладки по страницам или редактируйте секции из карточки страницы. Поля "Ключ блока", "Тип блока" и JSON связаны с renderer.',
  display_template = '{{page.slug}} · {{sort_order}} · {{section_key}}',
  sort_field = 'sort_order',
  sort = 21,
  color = '#2563eb',
  translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', 'Секции страниц'))::json
WHERE collection = 'page_sections';

SELECT isvoi_upsert_directus_field(
  'site_pages',
  'sections',
  'list-o2m',
  NULL,
  '{"layout":"table","enableCreate":false,"enableSelect":false,"fields":["sort_order","is_active","headline","image","section_key"]}'::json,
  NULL,
  'full',
  41,
  'Основное место редактирования существующих блоков страницы. Новые секции добавляет разработчик или администратор, чтобы не сломать renderer.',
  false,
  false,
  false,
  'o2m',
  'group_sections',
  'Секции страницы'
);

SELECT isvoi_upsert_directus_field(
  'page_sections',
  'group_placement',
  'group-detail',
  NULL,
  '{"headerIcon":"low_priority","start":"open"}'::json,
  NULL,
  'full',
  1,
  'Публикация блока: страница, порядок и видимость.',
  false,
  false,
  false,
  'alias,no-data,group',
  NULL,
  'Публикация'
);

SELECT isvoi_upsert_directus_field(
  'page_sections',
  'group_advanced',
  'group-detail',
  NULL,
  '{"headerIcon":"data_object","start":"closed"}'::json,
  NULL,
  'full',
  90,
  'Технические поля renderer и структурные данные для сложных блоков. Обычно не менять без разработчика.',
  false,
  false,
  false,
  'alias,no-data,group',
  NULL,
  'Расширенные настройки'
);

SELECT isvoi_upsert_directus_field('page_sections', 'page', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{slug}}"}'::json, NULL, 'half', 3, 'Страница-владелец. При редактировании из карточки страницы подставляется автоматически.', false, false, true, 'm2o', 'group_placement', 'Страница');
SELECT isvoi_upsert_directus_field('page_sections', 'sort_order', 'input', NULL, '{"min":1,"step":1}'::json, NULL, 'half', 4, 'Порядок блока на странице: меньше число — выше блок.', false, false, true, NULL, 'group_placement', 'Порядок');
SELECT isvoi_upsert_directus_field('page_sections', 'is_active', 'boolean', 'boolean', NULL, NULL, 'half', 5, 'Выключите, чтобы временно скрыть блок без удаления.', false, false, false, NULL, 'group_placement', 'Показывать на сайте');
SELECT isvoi_upsert_directus_field('page_sections', 'section_key', 'input', NULL, NULL, NULL, 'half', 91, 'Стабильный ключ блока для кода и импорта. Не менять без разработчика.', true, false, true, NULL, 'group_advanced', 'Ключ блока');
SELECT isvoi_upsert_directus_field('page_sections', 'variant', 'select-dropdown', 'labels', '{"choices":[{"text":"Hero страницы","value":"page.hero","color":"#0f766e"},{"text":"Hero главной","value":"hero.static","color":"#0f766e"},{"text":"Полоса доверия","value":"trust.strip","color":"#10b981"},{"text":"Карточки 3","value":"cards.three","color":"#2563eb"},{"text":"Сетка карточек","value":"cards.grid","color":"#2563eb"},{"text":"Каталог","value":"catalog.grid","color":"#111827"},{"text":"Шаги","value":"steps","color":"#7c3aed"},{"text":"Store steps","value":"store.steps","color":"#7c3aed"},{"text":"Сравнение","value":"compare","color":"#dc2626"},{"text":"Диагностика","value":"diagnostics.compare","color":"#dc2626"},{"text":"Визуальная полоса","value":"visual.band","color":"#0891b2"},{"text":"FAQ","value":"faq","color":"#ca8a04"},{"text":"CTA","value":"page.cta","color":"#f97316"},{"text":"Форма","value":"final.form","color":"#f97316"},{"text":"Passport split","value":"passport.split","color":"#be123c"},{"text":"Trade choices","value":"trade.choices","color":"#7c3aed"},{"text":"Club levels","value":"club.levels","color":"#ca8a04"},{"text":"Levels","value":"levels","color":"#ca8a04"}]}'::json, NULL, 'half', 92, 'Тип блока, который выбирает Next renderer. Менять только вместе с проверкой сайта.', true, false, false, NULL, 'group_advanced', 'Тип блока');
SELECT isvoi_upsert_directus_field('page_sections', 'content', 'input-code', NULL, '{"language":"json","lineWrapping":true}'::json, NULL, 'full', 93, 'JSON-настройки для карточек, шагов, таблиц, FAQ и других сложных блоков. Редактор видит это поле только для диагностики; правки JSON проходят через setup/import.', true, false, false, 'json', 'group_advanced', 'JSON-настройки блока');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, json, varchar, integer, text, boolean, boolean, boolean, varchar, varchar, text);

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

SELECT isvoi_upsert_preset('ISVOI Editor', 'site_pages', 'Опубликованные страницы', 'published_with_changes', '#10b981', '{"status":{"_eq":"published"}}'::json, '{"tabular":{"sort":["slug"],"fields":["status","slug","title","template","meta_description"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'site_pages', 'Черновики страниц', 'draft', '#6b7280', '{"status":{"_eq":"draft"}}'::json, '{"tabular":{"sort":["slug"],"fields":["status","slug","title","template","meta_description"],"page":1}}'::json);

SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Главная', 'home', '#0f766e', '{"page":{"slug":{"_eq":"home"}}}'::json, '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Store', 'storefront', '#2563eb', '{"page":{"slug":{"_eq":"store"}}}'::json, '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Trade', 'sync_alt', '#7c3aed', '{"page":{"slug":{"_eq":"trade"}}}'::json, '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Passport', 'verified_user', '#dc2626', '{"page":{"slug":{"_eq":"passport"}}}'::json, '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Club', 'workspace_premium', '#ca8a04', '{"page":{"slug":{"_eq":"club"}}}'::json, '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'page_sections', 'Скрытые секции', 'visibility_off', '#6b7280', '{"is_active":{"_eq":false}}'::json, '{"tabular":{"sort":["page","sort_order"],"fields":["page","sort_order","is_active","headline","section_key"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, varchar, json, json);

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

CREATE OR REPLACE FUNCTION isvoi_delete_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar
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

  DELETE FROM directus_permissions
  WHERE policy = v_policy
    AND collection = p_collection
    AND action = p_action;
END;
$$;

SELECT isvoi_upsert_permission('ISVOI Editor', 'page_sections', 'read', '*', NULL);
SELECT isvoi_delete_permission('ISVOI Editor', 'page_sections', 'create');
SELECT isvoi_delete_permission('ISVOI Editor', 'page_sections', 'delete');
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'page_sections',
  'update',
  'sort_order,is_active,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,image',
  NULL
);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_delete_permission(text, varchar, varchar);

SELECT 'site_pages_workflow.presets' AS check_name, count(*)::text AS value
FROM directus_presets
WHERE collection IN ('site_pages', 'page_sections')
  AND bookmark IS NOT NULL
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'site_pages_workflow.advanced_fields', count(*)::text
FROM directus_fields
WHERE collection = 'page_sections'
  AND field IN ('section_key', 'variant', 'content')
  AND "group" = 'group_advanced'
  AND readonly = true
UNION ALL
SELECT 'site_pages_workflow.sections_table', count(*)::text
FROM directus_fields
WHERE collection = 'site_pages'
  AND field = 'sections'
  AND options::text LIKE '%"enableCreate":false%'
UNION ALL
SELECT 'site_pages_workflow.editor_no_create', count(*)::text
FROM directus_permissions
WHERE collection = 'page_sections'
  AND action = 'create'
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'site_pages_workflow.editor_update_fields', count(*)::text
FROM directus_permissions
WHERE collection = 'page_sections'
  AND action = 'update'
  AND fields = 'sort_order,is_active,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,image'
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor');

COMMIT;
`);
