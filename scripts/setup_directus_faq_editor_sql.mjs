#!/usr/bin/env node
/**
 * Print idempotent SQL that makes FAQ editing comfortable and safer in
 * Directus Studio.
 *
 * Usage:
 *   node scripts/setup_directus_faq_editor_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
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
  p_translation text,
  p_validation json DEFAULT NULL,
  p_validation_message text DEFAULT NULL
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
      translations = v_translations,
      validation = p_validation,
      validation_message = p_validation_message
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, special, interface, display, options, display_options,
      readonly, hidden, sort, width, translations, note, required, "group",
      validation, validation_message
    ) VALUES (
      p_collection, p_field, p_special, p_interface, p_display, p_options,
      p_display_options, p_readonly, p_hidden, p_sort, p_width,
      v_translations, p_note, p_required, p_group, p_validation,
      p_validation_message
    );
  END IF;
END;
$$;

UPDATE directus_collections
SET icon = 'quiz',
  note = 'Переиспользуемые вопросы и ответы для сайта. Редактор обычно меняет вопрос, ответ, страницу, категорию, порядок и переключатель показа. Ключ нужен для явных связок с FAQ-секциями и должен оставаться стабильным.',
  display_template = '{{category}} · {{page.slug}} · {{question}}',
  hidden = false,
  singleton = false,
  sort_field = 'sort',
  accountability = 'all',
  sort = 24,
  color = '#ca8a04',
  translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', 'FAQ'))::json
WHERE collection = 'faq_items';

SELECT isvoi_upsert_directus_field('faq_items', 'group_answer', 'group-detail', NULL, '{"headerIcon":"quiz","start":"open"}'::json, NULL, 'full', 1, 'Основной текст FAQ. Это то, что видит посетитель сайта.', false, false, false, 'alias,no-data,group', NULL, 'Вопрос и ответ');
SELECT isvoi_upsert_directus_field('faq_items', 'group_placement', 'group-detail', NULL, '{"headerIcon":"filter_alt","start":"open"}'::json, NULL, 'full', 20, 'Где показывать вопрос: страница, категория, порядок и видимость.', false, false, false, 'alias,no-data,group', NULL, 'Показ на сайте');
SELECT isvoi_upsert_directus_field('faq_items', 'group_system', 'group-detail', NULL, '{"headerIcon":"key","start":"closed"}'::json, NULL, 'full', 90, 'Стабильные служебные поля. Меняйте ключ только если понимаете, какие FAQ-секции на него ссылаются.', false, false, false, 'alias,no-data,group', NULL, 'Служебное');

SELECT isvoi_upsert_directus_field('faq_items', 'question', 'input', NULL, '{"placeholder":"Например: Можно ли посмотреть диагностику?"}'::json, NULL, 'full', 2, 'Короткий вопрос одним предложением. Лучше писать так, как его задал бы клиент.', false, false, true, NULL, 'group_answer', 'Вопрос', '{"_nnull":true}'::json, 'Заполните вопрос.');
SELECT isvoi_upsert_directus_field('faq_items', 'answer', 'input-rich-text-html', NULL, '{"toolbar":["bold","italic","bullist","link","removeformat"],"folder":"ISVOI Editorial"}'::json, NULL, 'full', 3, 'Ответ обычным человеческим текстом. Не вставляйте сложную HTML-вёрстку, скрипты и стили.', false, false, true, NULL, 'group_answer', 'Ответ', '{"_nnull":true}'::json, 'Заполните ответ.');

SELECT isvoi_upsert_directus_field('faq_items', 'page', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{slug}}","filter":{"status":{"_eq":"published"}}}'::json, NULL, 'half', 21, 'Страница, к которой относится вопрос. Если вопрос общий, оставьте поле пустым и выберите категорию general.', false, false, false, 'm2o', 'group_placement', 'Страница');
SELECT isvoi_upsert_directus_field('faq_items', 'category', 'select-dropdown', 'labels', '{"choices":[{"text":"Общее","value":"general","color":"#6b7280"},{"text":"Каталог","value":"catalog","color":"#111827"},{"text":"Store","value":"store","color":"#2563eb"},{"text":"Trade","value":"trade","color":"#7c3aed"},{"text":"Passport","value":"passport","color":"#dc2626"},{"text":"Club","value":"club","color":"#ca8a04"}]}'::json, NULL, 'half', 22, 'Категория нужна для фильтров в Studio и автоматического подбора FAQ на странице.', false, false, true, NULL, 'group_placement', 'Категория', '{"_in":["general","catalog","store","trade","passport","club"]}'::json, 'Выберите одну из рабочих категорий FAQ.');
SELECT isvoi_upsert_directus_field('faq_items', 'sort', 'input', NULL, '{"min":1,"step":1}'::json, NULL, 'half', 23, 'Порядок показа внутри страницы или категории. Меньшее число будет выше.', false, false, false, NULL, 'group_placement', 'Порядок');
SELECT isvoi_upsert_directus_field('faq_items', 'is_active', 'boolean', 'boolean', NULL, NULL, 'half', 24, 'Выключите, чтобы временно скрыть вопрос с сайта без удаления.', false, false, false, NULL, 'group_placement', 'Показывать на сайте');

SELECT isvoi_upsert_directus_field('faq_items', 'key', 'input', NULL, '{"placeholder":"passport-warranty"}'::json, NULL, 'half', 91, 'Стабильный ключ латиницей. Используется в page_sections.content.faqKeys/faq_keys для ручного выбора конкретных вопросов.', false, false, true, NULL, 'group_system', 'Ключ', '{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}'::json, 'Используйте латиницу, цифры и дефисы, например passport-warranty.');
SELECT isvoi_upsert_directus_field('faq_items', 'id', 'input', NULL, NULL, NULL, 'half', 92, 'Системный ID.', true, true, false, 'uuid', 'group_system', 'ID');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, json, varchar, integer, text, boolean, boolean, boolean, varchar, varchar, text, json, text);

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

SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Все активные FAQ', 'quiz', '#10b981', '{"is_active":{"_eq":true}}'::json, '{"tabular":{"sort":["category","sort"],"fields":["is_active","category","page","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Общие FAQ', 'help', '#6b7280', '{"category":{"_eq":"general"}}'::json, '{"tabular":{"sort":["sort","question"],"fields":["is_active","category","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Каталог FAQ', 'inventory_2', '#111827', '{"category":{"_eq":"catalog"}}'::json, '{"tabular":{"sort":["sort","question"],"fields":["is_active","category","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Store FAQ', 'storefront', '#2563eb', '{"_or":[{"category":{"_eq":"store"}},{"page":{"slug":{"_eq":"store"}}}]}'::json, '{"tabular":{"sort":["sort","question"],"fields":["is_active","page","category","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Trade FAQ', 'sync_alt', '#7c3aed', '{"_or":[{"category":{"_eq":"trade"}},{"page":{"slug":{"_eq":"trade"}}}]}'::json, '{"tabular":{"sort":["sort","question"],"fields":["is_active","page","category","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Passport FAQ', 'verified_user', '#dc2626', '{"_or":[{"category":{"_eq":"passport"}},{"page":{"slug":{"_eq":"passport"}}}]}'::json, '{"tabular":{"sort":["sort","question"],"fields":["is_active","page","category","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Club FAQ', 'workspace_premium', '#ca8a04', '{"_or":[{"category":{"_eq":"club"}},{"page":{"slug":{"_eq":"club"}}}]}'::json, '{"tabular":{"sort":["sort","question"],"fields":["is_active","page","category","sort","question"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Скрытые FAQ', 'visibility_off', '#6b7280', '{"is_active":{"_eq":false}}'::json, '{"tabular":{"sort":["category","sort"],"fields":["is_active","category","page","sort","question"],"page":1}}'::json);

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

SELECT isvoi_upsert_permission('ISVOI Editor', 'faq_items', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'faq_items',
  'create',
  'key,question,answer,page,category,sort,is_active',
  NULL,
  '{"key":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"question":{"_nnull":true},"answer":{"_nnull":true},"category":{"_in":["general","catalog","store","trade","passport","club"]}}'::json,
  '{"category":"general","is_active":true,"sort":100}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'faq_items',
  'update',
  'key,question,answer,page,category,sort,is_active',
  NULL,
  '{"key":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"question":{"_nnull":true},"answer":{"_nnull":true},"category":{"_in":["general","catalog","store","trade","passport","club"]}}'::json
);
SELECT isvoi_delete_permission('ISVOI Editor', 'faq_items', 'delete');

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_delete_permission(text, varchar, varchar);

SELECT 'faq_editor.collection' AS check_name, count(*)::text AS value
FROM directus_collections
WHERE collection = 'faq_items'
  AND display_template = '{{category}} · {{page.slug}} · {{question}}'
UNION ALL
SELECT 'faq_editor.groups', count(*)::text
FROM directus_fields
WHERE collection = 'faq_items'
  AND field IN ('group_answer', 'group_placement', 'group_system')
UNION ALL
SELECT 'faq_editor.required_fields', count(*)::text
FROM directus_fields
WHERE collection = 'faq_items'
  AND field IN ('key', 'question', 'answer', 'category')
  AND required = true
UNION ALL
SELECT 'faq_editor.presets', count(*)::text
FROM directus_presets
WHERE collection = 'faq_items'
  AND bookmark IN ('Все активные FAQ', 'Общие FAQ', 'Каталог FAQ', 'Store FAQ', 'Trade FAQ', 'Passport FAQ', 'Club FAQ', 'Скрытые FAQ')
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'faq_editor.editor_permissions', count(*)::text
FROM directus_permissions
WHERE collection = 'faq_items'
  AND action IN ('read', 'create', 'update')
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'faq_editor.editor_delete_permissions', count(*)::text
FROM directus_permissions
WHERE collection = 'faq_items'
  AND action = 'delete'
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor');

COMMIT;
`);
