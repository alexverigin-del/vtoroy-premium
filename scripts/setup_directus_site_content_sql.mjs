#!/usr/bin/env node
/**
 * Print idempotent SQL that makes Site Pages / Page Sections usable for
 * non-technical editors in Directus Studio.
 *
 * Usage:
 *   node scripts/setup_directus_site_content_sql.mjs > /tmp/isvoi_setup_directus_site_content_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_site_content_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'page_sections'
      AND constraint_name = 'page_sections_image_fkey'
  ) THEN
    ALTER TABLE page_sections
      ADD CONSTRAINT page_sections_image_fkey
      FOREIGN KEY (image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'site_pages'
      AND constraint_name = 'site_pages_og_image_fkey'
  ) THEN
    ALTER TABLE site_pages
      ADD CONSTRAINT site_pages_og_image_fkey
      FOREIGN KEY (og_image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_upsert_collection_metadata(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_archive_field varchar,
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
    singleton = false,
    archive_field = p_archive_field,
    archive_value = CASE WHEN p_archive_field IS NULL THEN NULL ELSE 'archived' END,
    unarchive_value = CASE WHEN p_archive_field IS NULL THEN NULL ELSE 'draft' END,
    sort_field = p_sort_field,
    accountability = 'all',
    sort = p_sort,
    color = p_color,
    translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json
  WHERE collection = p_collection;
END;
$$;

SELECT isvoi_upsert_collection_metadata(
  'site_pages',
  'web_asset',
  'Редактируемые страницы сайта. Обычный сценарий: открыть страницу, поменять SEO/статус и секции внутри поля "Секции страницы". Slug и template лучше не менять без разработчика.',
  '{{title}} · {{status}}',
  'status',
  NULL,
  20,
  '#0f766e',
  'Страницы сайта'
);

SELECT isvoi_upsert_collection_metadata(
  'page_sections',
  'view_agenda',
  'Блоки внутри страниц сайта. Обычно удобнее редактировать их через "Страницы сайта" → "Секции страницы". Поле "JSON-настройки блока" нужно только для карточек, шагов, таблиц и других сложных блоков.',
  '{{page.slug}} · {{sort_order}} · {{section_key}}',
  NULL,
  'sort_order',
  21,
  '#2563eb',
  'Секции страниц'
);

DROP FUNCTION isvoi_upsert_collection_metadata(varchar, varchar, text, varchar, varchar, varchar, integer, varchar, text);

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

-- Site Pages: edit from page-level screen first.
SELECT isvoi_upsert_directus_field('site_pages', 'group_page', 'group-detail', NULL, '{"headerIcon":"web_asset","start":"open"}'::json, NULL, 'full', 1, 'Маршрут и публикация страницы. Slug/template связаны с кодом сайта.', false, false, false, 'alias,no-data,group', NULL, 'Страница');
SELECT isvoi_upsert_directus_field('site_pages', 'group_seo', 'group-detail', NULL, '{"headerIcon":"manage_search","start":"open"}'::json, NULL, 'full', 20, 'SEO и картинка для соцсетей.', false, false, false, 'alias,no-data,group', NULL, 'SEO');
SELECT isvoi_upsert_directus_field('site_pages', 'group_sections', 'group-detail', NULL, '{"headerIcon":"view_agenda","start":"open"}'::json, NULL, 'full', 40, 'Секции, которые реально выводятся на странице.', false, false, false, 'alias,no-data,group', NULL, 'Секции');
SELECT isvoi_upsert_directus_field('site_pages', 'id', 'input', NULL, NULL, NULL, 'half', 2, 'Системный ID.', true, true, false, 'uuid', 'group_page', 'ID');
SELECT isvoi_upsert_directus_field('site_pages', 'slug', 'input', NULL, NULL, NULL, 'half', 3, 'Адрес страницы. Менять только вместе с маршрутом сайта.', true, false, true, NULL, 'group_page', 'Адрес страницы');
SELECT isvoi_upsert_directus_field('site_pages', 'template', 'select-dropdown', 'labels', '{"choices":[{"text":"Главная","value":"home","color":"#0f766e"},{"text":"Store","value":"store","color":"#2563eb"},{"text":"Trade","value":"trade","color":"#7c3aed"},{"text":"Passport","value":"passport","color":"#dc2626"},{"text":"Club","value":"club","color":"#ca8a04"}]}'::json, NULL, 'half', 4, 'Шаблон рендера в Next. Обычно не менять.', true, false, true, NULL, 'group_page', 'Шаблон');
SELECT isvoi_upsert_directus_field('site_pages', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, NULL, 'half', 5, 'На сайте отображаются только published страницы.', false, false, true, NULL, 'group_page', 'Статус');
SELECT isvoi_upsert_directus_field('site_pages', 'title', 'input', NULL, NULL, NULL, 'full', 21, 'Заголовок страницы для SEO и запасного H1.', false, false, true, NULL, 'group_seo', 'Название страницы');
SELECT isvoi_upsert_directus_field('site_pages', 'meta_description', 'input-multiline', NULL, NULL, NULL, 'full', 22, 'Описание для поисковиков и превью.', false, false, false, NULL, 'group_seo', 'SEO-описание');
SELECT isvoi_upsert_directus_field('site_pages', 'og_image', 'file-image', 'file', '{"folder":"ISVOI Site Assets"}'::json, NULL, 'half', 23, 'Картинка для соцсетей. Используйте папку ISVOI Site Assets, не товарные фото.', false, false, false, 'm2o', 'group_seo', 'Картинка для соцсетей');
SELECT isvoi_upsert_directus_field('site_pages', 'sections', 'list-o2m', NULL, '{"layout":"table","enableCreate":true,"enableSelect":true,"fields":["sort_order","is_active","section_key","variant","headline","image"]}'::json, NULL, 'full', 41, 'Блоки страницы в порядке вывода. Основное редактирование текстов и нетоварных картинок делайте здесь.', false, false, false, 'o2m', 'group_sections', 'Секции страницы');

-- Page Sections: make the edit form less technical.
SELECT isvoi_upsert_directus_field('page_sections', 'group_placement', 'group-detail', NULL, '{"headerIcon":"low_priority","start":"open"}'::json, NULL, 'full', 1, 'Где находится блок и как он рендерится.', false, false, false, 'alias,no-data,group', NULL, 'Публикация');
SELECT isvoi_upsert_directus_field('page_sections', 'group_copy', 'group-detail', NULL, '{"headerIcon":"article","start":"open"}'::json, NULL, 'full', 20, 'Тексты, которые чаще всего правит редактор.', false, false, false, 'alias,no-data,group', NULL, 'Тексты');
SELECT isvoi_upsert_directus_field('page_sections', 'group_actions', 'group-detail', NULL, '{"headerIcon":"touch_app","start":"closed"}'::json, NULL, 'full', 50, 'Кнопки блока.', false, false, false, 'alias,no-data,group', NULL, 'Кнопки');
SELECT isvoi_upsert_directus_field('page_sections', 'group_media', 'group-detail', NULL, '{"headerIcon":"image","start":"open"}'::json, NULL, 'full', 70, 'Нетоварные изображения для страницы. Товарные фото живут отдельно в device_images.', false, false, false, 'alias,no-data,group', NULL, 'Изображение');
SELECT isvoi_upsert_directus_field('page_sections', 'group_advanced', 'group-detail', NULL, '{"headerIcon":"data_object","start":"closed"}'::json, NULL, 'full', 90, 'Структурные данные для сложных блоков: карточки, шаги, таблицы, FAQ. Если не уверены — не менять.', false, false, false, 'alias,no-data,group', NULL, 'Расширенные настройки');
SELECT isvoi_upsert_directus_field('page_sections', 'id', 'input', NULL, NULL, NULL, 'half', 2, 'Системный ID.', true, true, false, 'uuid', 'group_placement', 'ID');
SELECT isvoi_upsert_directus_field('page_sections', 'page', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{slug}}"}'::json, NULL, 'half', 3, 'Страница-владелец. Обычно задаётся автоматически, если редактировать из страницы.', false, false, true, 'm2o', 'group_placement', 'Страница');
SELECT isvoi_upsert_directus_field('page_sections', 'sort_order', 'input', NULL, '{"min":1,"step":1}'::json, NULL, 'half', 4, 'Порядок блока на странице: меньше число — выше блок.', false, false, true, NULL, 'group_placement', 'Порядок');
SELECT isvoi_upsert_directus_field('page_sections', 'is_active', 'boolean', 'boolean', NULL, NULL, 'half', 5, 'Выключите, чтобы временно скрыть блок без удаления.', false, false, false, NULL, 'group_placement', 'Показывать на сайте');
SELECT isvoi_upsert_directus_field('page_sections', 'section_key', 'input', NULL, NULL, NULL, 'half', 6, 'Стабильный ключ блока для кода и импорта. Не менять без разработчика.', true, false, true, NULL, 'group_placement', 'Ключ блока');
SELECT isvoi_upsert_directus_field('page_sections', 'variant', 'select-dropdown', 'labels', '{"choices":[{"text":"Hero страницы","value":"page.hero","color":"#0f766e"},{"text":"Hero главной","value":"hero.static","color":"#0f766e"},{"text":"Полоса доверия","value":"trust.strip","color":"#10b981"},{"text":"Карточки 3","value":"cards.three","color":"#2563eb"},{"text":"Сетка карточек","value":"cards.grid","color":"#2563eb"},{"text":"Каталог","value":"catalog.grid","color":"#111827"},{"text":"Шаги","value":"steps","color":"#7c3aed"},{"text":"Store steps","value":"store.steps","color":"#7c3aed"},{"text":"Сравнение","value":"compare","color":"#dc2626"},{"text":"Диагностика","value":"diagnostics.compare","color":"#dc2626"},{"text":"Визуальная полоса","value":"visual.band","color":"#0891b2"},{"text":"FAQ","value":"faq","color":"#ca8a04"},{"text":"CTA","value":"page.cta","color":"#f97316"},{"text":"Форма","value":"final.form","color":"#f97316"},{"text":"Passport split","value":"passport.split","color":"#be123c"},{"text":"Trade choices","value":"trade.choices","color":"#7c3aed"},{"text":"Club levels","value":"club.levels","color":"#ca8a04"},{"text":"Levels","value":"levels","color":"#ca8a04"}]}'::json, NULL, 'half', 7, 'Тип блока, который выбирает renderer. Менять осторожно: разные типы ждут разные JSON-настройки.', true, false, false, NULL, 'group_placement', 'Тип блока');
SELECT isvoi_upsert_directus_field('page_sections', 'eyebrow', 'input', NULL, NULL, NULL, 'half', 21, 'Короткая надпись над заголовком.', false, false, false, NULL, 'group_copy', 'Надзаголовок');
SELECT isvoi_upsert_directus_field('page_sections', 'headline', 'input', NULL, NULL, NULL, 'full', 22, 'Главный заголовок блока.', false, false, false, NULL, 'group_copy', 'Заголовок');
SELECT isvoi_upsert_directus_field('page_sections', 'subheadline', 'input-multiline', NULL, NULL, NULL, 'full', 23, 'Дополнительная строка под заголовком.', false, false, false, NULL, 'group_copy', 'Подзаголовок');
SELECT isvoi_upsert_directus_field('page_sections', 'body', 'input-rich-text-html', NULL, NULL, NULL, 'full', 24, 'Основной текст блока. Не вставляйте сюда скрипты и сложную вёрстку.', false, false, false, NULL, 'group_copy', 'Основной текст');
SELECT isvoi_upsert_directus_field('page_sections', 'primary_cta_label', 'input', NULL, NULL, NULL, 'half', 51, 'Текст главной кнопки.', false, false, false, NULL, 'group_actions', 'Главная кнопка');
SELECT isvoi_upsert_directus_field('page_sections', 'primary_cta_url', 'input', NULL, NULL, NULL, 'half', 52, 'Ссылка главной кнопки, например /catalog или /store.', false, false, false, NULL, 'group_actions', 'Ссылка главной кнопки');
SELECT isvoi_upsert_directus_field('page_sections', 'secondary_cta_label', 'input', NULL, NULL, NULL, 'half', 53, 'Текст второй кнопки.', false, false, false, NULL, 'group_actions', 'Вторая кнопка');
SELECT isvoi_upsert_directus_field('page_sections', 'secondary_cta_url', 'input', NULL, NULL, NULL, 'half', 54, 'Ссылка второй кнопки.', false, false, false, NULL, 'group_actions', 'Ссылка второй кнопки');
SELECT isvoi_upsert_directus_field('page_sections', 'image', 'file-image', 'file', '{"folder":"ISVOI Site Assets"}'::json, NULL, 'full', 71, 'Главное нетоварное изображение блока. Загружайте и выбирайте файлы из папки ISVOI Site Assets. Сайт отдаёт его через Directus assets с resize/WebP/AVIF.', false, false, false, 'm2o', 'group_media', 'Главное изображение блока');
SELECT isvoi_upsert_directus_field('page_sections', 'content', 'input-code', NULL, '{"language":"json","lineWrapping":true}'::json, NULL, 'full', 91, 'JSON-настройки для сложных блоков. Для обычного текста и главной картинки используйте поля выше. Править JSON может только расширенный редактор. Не добавляйте image_src/imageSrc, файловые пути или прямые asset URL в JSON.', false, false, false, 'json', 'group_advanced', 'JSON-настройки блока');

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

SELECT isvoi_upsert_relation('page_sections', 'page', 'site_pages', 'sections', 'delete');
SELECT isvoi_upsert_relation('page_sections', 'image', 'directus_files', NULL, 'nullify');
SELECT isvoi_upsert_relation('site_pages', 'og_image', 'directus_files', NULL, 'nullify');

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

SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'site_pages',
  'read',
  'id,slug,template,status,title,meta_description,og_image,sections',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'site_pages',
  'update',
  'status,title,meta_description,og_image',
  NULL,
  '{"status":{"_in":["draft","published","archived"]}}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'page_sections',
  'read',
  'id,page,section_key,variant,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,image,sort_order,is_active,content',
  NULL
);
SELECT isvoi_delete_permission('ISVOI Editor', 'page_sections', 'create');
SELECT isvoi_delete_permission('ISVOI Editor', 'page_sections', 'delete');
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'page_sections',
  'update',
  'sort_order,is_active,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,image',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Advanced Editor',
  'page_sections',
  'update',
  'sort_order,is_active,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,image,content',
  NULL
);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_delete_permission(text, varchar, varchar);

SELECT 'site_content.collections' AS check_name, count(*)::text AS value
FROM directus_collections
WHERE collection IN ('site_pages', 'page_sections')
UNION ALL
SELECT 'site_content.file_relations', count(*)::text
FROM directus_relations
WHERE (many_collection = 'page_sections' AND many_field = 'image')
   OR (many_collection = 'site_pages' AND many_field = 'og_image')
UNION ALL
SELECT 'site_content.page_sections_field', count(*)::text
FROM directus_fields
WHERE collection = 'site_pages' AND field = 'sections'
UNION ALL
SELECT 'site_content.editor_permissions', count(*)::text
FROM directus_permissions
WHERE collection IN ('site_pages', 'page_sections')
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor');

COMMIT;
`);
