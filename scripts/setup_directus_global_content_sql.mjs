#!/usr/bin/env node
/**
 * Print idempotent SQL that organizes global content editing in Directus Studio:
 * site settings, navigation and reusable FAQ items.
 *
 * Usage:
 *   node scripts/setup_directus_global_content_sql.mjs > /tmp/isvoi_setup_directus_global_content_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_global_content_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'site_settings'
      AND constraint_name = 'site_settings_default_og_image_fkey'
  ) THEN
    ALTER TABLE site_settings
      ADD CONSTRAINT site_settings_default_og_image_fkey
      FOREIGN KEY (default_og_image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_upsert_collection_metadata(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_singleton boolean,
  p_sort_field varchar,
  p_sort integer,
  p_color varchar,
  p_translation text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE directus_collections
  SET icon = p_icon,
    note = p_note,
    display_template = p_display_template,
    hidden = false,
    singleton = p_singleton,
    sort_field = p_sort_field,
    accountability = 'all',
    sort = p_sort,
    color = p_color,
    translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json
  WHERE collection = p_collection;
END;
$$;

SELECT isvoi_upsert_collection_metadata(
  'site_settings',
  'tune',
  'Глобальные настройки сайта: бренд, контакты, footer и технические переключатели. Это singleton-запись; не создавайте дополнительные строки.',
  '{{brand_name}} · {{city}}',
  true,
  NULL,
  22,
  '#0f766e',
  'Настройки сайта'
);

SELECT isvoi_upsert_collection_metadata(
  'navigation_items',
  'menu_open',
  'Ссылки шапки и футера. Для временного скрытия выключайте "Показывать", а не удаляйте строку.',
  '{{location}} · {{sort}} · {{label}}',
  false,
  'sort',
  23,
  '#2563eb',
  'Навигация'
);

SELECT isvoi_upsert_collection_metadata(
  'faq_items',
  'quiz',
  'Переиспользуемые вопросы и ответы. FAQ можно привязать к странице или категории; на сайте выводятся только активные строки.',
  '{{category}} · {{question}}',
  false,
  'sort',
  24,
  '#ca8a04',
  'FAQ'
);

DROP FUNCTION isvoi_upsert_collection_metadata(varchar, varchar, text, varchar, boolean, varchar, integer, varchar, text);

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

-- Site settings.
SELECT isvoi_upsert_directus_field('site_settings', 'group_brand', 'group-detail', NULL, '{"headerIcon":"storefront","start":"open"}'::json, NULL, 'full', 1, 'Название, позиционирование и базовый город.', false, false, false, 'alias,no-data,group', NULL, 'Бренд');
SELECT isvoi_upsert_directus_field('site_settings', 'group_contacts', 'group-detail', NULL, '{"headerIcon":"contact_phone","start":"open"}'::json, NULL, 'full', 20, 'Публичные контакты сайта.', false, false, false, 'alias,no-data,group', NULL, 'Контакты');
SELECT isvoi_upsert_directus_field('site_settings', 'group_footer', 'group-detail', NULL, '{"headerIcon":"vertical_align_bottom","start":"open"}'::json, NULL, 'full', 40, 'Тексты подвала сайта.', false, false, false, 'alias,no-data,group', NULL, 'Footer');
SELECT isvoi_upsert_directus_field('site_settings', 'group_technical', 'group-detail', NULL, '{"headerIcon":"settings","start":"closed"}'::json, NULL, 'full', 70, 'Технические переключатели и изображения по умолчанию.', false, false, false, 'alias,no-data,group', NULL, 'Техническое');
SELECT isvoi_upsert_directus_field('site_settings', 'id', 'input', NULL, NULL, NULL, 'half', 2, 'Системный singleton id.', true, true, false, NULL, 'group_brand', 'ID');
SELECT isvoi_upsert_directus_field('site_settings', 'brand_name', 'input', NULL, NULL, NULL, 'half', 3, 'Название бренда в шапке и footer.', false, false, true, NULL, 'group_brand', 'Название бренда');
SELECT isvoi_upsert_directus_field('site_settings', 'tagline', 'input', NULL, NULL, NULL, 'full', 4, 'Короткий глобальный слоган.', false, false, false, NULL, 'group_brand', 'Слоган');
SELECT isvoi_upsert_directus_field('site_settings', 'city', 'input', NULL, NULL, NULL, 'half', 5, 'Город или основная география.', false, false, false, NULL, 'group_brand', 'Город');
SELECT isvoi_upsert_directus_field('site_settings', 'phone', 'input', NULL, NULL, NULL, 'half', 21, 'Публичный телефон.', false, false, false, NULL, 'group_contacts', 'Телефон');
SELECT isvoi_upsert_directus_field('site_settings', 'telegram', 'input', NULL, NULL, NULL, 'half', 22, 'Telegram username или URL.', false, false, false, NULL, 'group_contacts', 'Telegram');
SELECT isvoi_upsert_directus_field('site_settings', 'email', 'input', NULL, NULL, NULL, 'half', 23, 'Публичный email.', false, false, false, NULL, 'group_contacts', 'Email');
SELECT isvoi_upsert_directus_field('site_settings', 'address', 'input-multiline', NULL, NULL, NULL, 'full', 24, 'Адрес или пояснение по визиту.', false, false, false, NULL, 'group_contacts', 'Адрес');
SELECT isvoi_upsert_directus_field('site_settings', 'footer_brand_text', 'input-multiline', NULL, NULL, NULL, 'full', 41, 'Короткий текст о бренде в footer.', false, false, false, NULL, 'group_footer', 'Текст бренда');
SELECT isvoi_upsert_directus_field('site_settings', 'footer_note', 'input-multiline', NULL, NULL, NULL, 'full', 42, 'Дополнительная заметка в footer.', false, false, false, NULL, 'group_footer', 'Заметка');
SELECT isvoi_upsert_directus_field('site_settings', 'footer_legal', 'input-multiline', NULL, NULL, NULL, 'full', 43, 'Юридический текст или дисклеймер.', false, false, false, NULL, 'group_footer', 'Юридический текст');
SELECT isvoi_upsert_directus_field('site_settings', 'footer_copyright', 'input', NULL, NULL, NULL, 'full', 44, 'Строка copyright.', false, false, false, NULL, 'group_footer', 'Copyright');
SELECT isvoi_upsert_directus_field('site_settings', 'default_og_image', 'file-image', 'file', '{"folder":"ISVOI Site Assets"}'::json, NULL, 'half', 71, 'Картинка по умолчанию для соцсетей. Используйте ISVOI Site Assets.', false, false, false, 'm2o', 'group_technical', 'OG-картинка по умолчанию');
SELECT isvoi_upsert_directus_field('site_settings', 'maintenance_mode', 'boolean', 'boolean', NULL, NULL, 'half', 72, 'Технический флаг. Включайте только осознанно; сайт может использовать его как аварийный режим.', false, false, false, NULL, 'group_technical', 'Maintenance mode');

-- Navigation.
SELECT isvoi_upsert_directus_field('navigation_items', 'group_link', 'group-detail', NULL, '{"headerIcon":"link","start":"open"}'::json, NULL, 'full', 1, 'Текст и URL ссылки.', false, false, false, 'alias,no-data,group', NULL, 'Ссылка');
SELECT isvoi_upsert_directus_field('navigation_items', 'group_placement', 'group-detail', NULL, '{"headerIcon":"low_priority","start":"open"}'::json, NULL, 'full', 20, 'Где показывать ссылку и как сортировать.', false, false, false, 'alias,no-data,group', NULL, 'Расположение');
SELECT isvoi_upsert_directus_field('navigation_items', 'group_behavior', 'group-detail', NULL, '{"headerIcon":"open_in_new","start":"closed"}'::json, NULL, 'full', 40, 'Видимость и поведение ссылки.', false, false, false, 'alias,no-data,group', NULL, 'Поведение');
SELECT isvoi_upsert_directus_field('navigation_items', 'id', 'input', NULL, NULL, NULL, 'half', 2, 'Системный ID.', true, true, false, 'uuid', 'group_link', 'ID');
SELECT isvoi_upsert_directus_field('navigation_items', 'label', 'input', NULL, NULL, NULL, 'half', 3, 'Текст ссылки в меню.', false, false, true, NULL, 'group_link', 'Название ссылки');
SELECT isvoi_upsert_directus_field('navigation_items', 'url', 'input', NULL, NULL, NULL, 'half', 4, 'Внутренний путь (/catalog) или внешний URL.', false, false, true, NULL, 'group_link', 'URL');
SELECT isvoi_upsert_directus_field('navigation_items', 'location', 'select-dropdown', 'labels', '{"choices":[{"text":"Шапка","value":"header","color":"#2563eb"},{"text":"Footer","value":"footer","color":"#0f766e"}]}'::json, NULL, 'half', 21, 'Область навигации.', false, false, true, NULL, 'group_placement', 'Где показывать');
SELECT isvoi_upsert_directus_field('navigation_items', 'parent', 'select-dropdown-m2o', 'related-values', '{"template":"{{label}} · {{location}}"}'::json, NULL, 'half', 22, 'Родительская ссылка, если нужно вложенное меню.', false, false, false, 'm2o', 'group_placement', 'Родитель');
SELECT isvoi_upsert_directus_field('navigation_items', 'children', 'list-o2m', NULL, '{"layout":"table","enableCreate":true,"enableSelect":true,"fields":["sort","is_active","label","url","location"]}'::json, NULL, 'full', 23, 'Вложенные ссылки, если используются.', false, false, false, 'o2m', 'group_placement', 'Дочерние ссылки');
SELECT isvoi_upsert_directus_field('navigation_items', 'sort', 'input', NULL, '{"min":1,"step":1}'::json, NULL, 'half', 24, 'Порядок внутри шапки или footer.', false, false, false, NULL, 'group_placement', 'Порядок');
SELECT isvoi_upsert_directus_field('navigation_items', 'is_active', 'boolean', 'boolean', NULL, NULL, 'half', 41, 'Выключите, чтобы временно скрыть ссылку.', false, false, false, NULL, 'group_behavior', 'Показывать');
SELECT isvoi_upsert_directus_field('navigation_items', 'open_in_new', 'boolean', 'boolean', NULL, NULL, 'half', 42, 'Открывать в новой вкладке. Обычно включать только для внешних ссылок.', false, false, false, NULL, 'group_behavior', 'Новая вкладка');

-- FAQ.
SELECT isvoi_upsert_directus_field('faq_items', 'group_answer', 'group-detail', NULL, '{"headerIcon":"quiz","start":"open"}'::json, NULL, 'full', 1, 'Вопрос и ответ.', false, false, false, 'alias,no-data,group', NULL, 'Вопрос');
SELECT isvoi_upsert_directus_field('faq_items', 'group_placement', 'group-detail', NULL, '{"headerIcon":"rule","start":"open"}'::json, NULL, 'full', 20, 'Где и в каком порядке показывать FAQ.', false, false, false, 'alias,no-data,group', NULL, 'Публикация');
SELECT isvoi_upsert_directus_field('faq_items', 'id', 'input', NULL, NULL, NULL, 'half', 2, 'Системный ID.', true, true, false, 'uuid', 'group_answer', 'ID');
SELECT isvoi_upsert_directus_field('faq_items', 'key', 'input', NULL, NULL, NULL, 'half', 3, 'Стабильный ключ для ссылок из page_sections.content. Лучше латиницей, например passport-warranty.', false, false, true, NULL, 'group_answer', 'Ключ');
SELECT isvoi_upsert_directus_field('faq_items', 'question', 'input', NULL, NULL, NULL, 'full', 4, 'Текст вопроса.', false, false, true, NULL, 'group_answer', 'Вопрос');
SELECT isvoi_upsert_directus_field('faq_items', 'answer', 'input-rich-text-html', NULL, NULL, NULL, 'full', 5, 'Ответ. Пишите обычный текст; сложную вёрстку не вставлять.', false, false, true, NULL, 'group_answer', 'Ответ');
SELECT isvoi_upsert_directus_field('faq_items', 'page', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{slug}}"}'::json, NULL, 'half', 21, 'Страница, к которой относится вопрос. Можно оставить пустым для общего FAQ.', false, false, false, 'm2o', 'group_placement', 'Страница');
SELECT isvoi_upsert_directus_field('faq_items', 'category', 'select-dropdown', 'labels', '{"choices":[{"text":"Общее","value":"general","color":"#6b7280"},{"text":"Store","value":"store","color":"#2563eb"},{"text":"Trade","value":"trade","color":"#7c3aed"},{"text":"Passport","value":"passport","color":"#dc2626"},{"text":"Club","value":"club","color":"#ca8a04"},{"text":"Каталог","value":"catalog","color":"#111827"}]}'::json, NULL, 'half', 22, 'Категория для фильтрации FAQ.', false, false, true, NULL, 'group_placement', 'Категория');
SELECT isvoi_upsert_directus_field('faq_items', 'sort', 'input', NULL, '{"min":1,"step":1}'::json, NULL, 'half', 23, 'Порядок показа.', false, false, false, NULL, 'group_placement', 'Порядок');
SELECT isvoi_upsert_directus_field('faq_items', 'is_active', 'boolean', 'boolean', NULL, NULL, 'half', 24, 'На сайте выводятся только активные вопросы.', false, false, false, NULL, 'group_placement', 'Показывать');

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

SELECT isvoi_upsert_relation('navigation_items', 'parent', 'navigation_items', 'children', 'nullify');
SELECT isvoi_upsert_relation('faq_items', 'page', 'site_pages', 'faqs', 'nullify');
SELECT isvoi_upsert_relation('site_settings', 'default_og_image', 'directus_files', NULL, 'nullify');

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

SELECT isvoi_upsert_permission('ISVOI Editor', 'faq_items', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'faq_items',
  'create',
  'key,question,answer,page,category,sort,is_active',
  NULL,
  '{"key":{"_nnull":true},"question":{"_nnull":true},"answer":{"_nnull":true},"category":{"_in":["general","store","trade","passport","club","catalog"]}}'::json,
  '{"category":"general","is_active":true}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'faq_items',
  'update',
  'key,question,answer,page,category,sort,is_active',
  NULL,
  '{"category":{"_in":["general","store","trade","passport","club","catalog"]}}'::json
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

SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Шапка', 'web_asset', '#2563eb', '{"location":{"_eq":"header"}}'::json, '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","url","open_in_new"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'navigation_items', 'Footer', 'vertical_align_bottom', '#0f766e', '{"location":{"_eq":"footer"}}'::json, '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","url","open_in_new"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Активные FAQ', 'quiz', '#10b981', '{"is_active":{"_eq":true}}'::json, '{"tabular":{"sort":["category","sort"],"fields":["is_active","category","sort","question","page"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'faq_items', 'Скрытые FAQ', 'visibility_off', '#6b7280', '{"is_active":{"_eq":false}}'::json, '{"tabular":{"sort":["category","sort"],"fields":["is_active","category","sort","question","page"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, varchar, json, json);

SELECT 'global_content.groups' AS check_name, count(*)::text AS value
FROM directus_fields
WHERE collection IN ('site_settings', 'navigation_items', 'faq_items')
  AND field LIKE 'group_%'
UNION ALL
SELECT 'global_content.relations', count(*)::text
FROM directus_relations
WHERE (many_collection = 'navigation_items' AND many_field = 'parent' AND one_field = 'children')
   OR (many_collection = 'site_settings' AND many_field = 'default_og_image')
   OR (many_collection = 'faq_items' AND many_field = 'page')
UNION ALL
SELECT 'global_content.editor_permissions', count(*)::text
FROM directus_permissions
WHERE collection IN ('site_settings', 'navigation_items', 'faq_items')
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'global_content.editor_presets', count(*)::text
FROM directus_presets
WHERE collection IN ('navigation_items', 'faq_items')
  AND bookmark IS NOT NULL
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor');

COMMIT;
`);
