#!/usr/bin/env node
/**
 * Print idempotent SQL that improves the Directus Studio catalog workflow.
 *
 * The schema already stores product photos in device_images. This setup makes
 * device editing device-first: open a device, edit product copy, then manage
 * all photos through the embedded "images" O2M section.
 *
 * Usage:
 *   node scripts/setup_directus_catalog_studio_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
SET icon = 'inventory_2',
  note = 'Рабочий каталог устройств. Открывайте устройство, проверьте публикацию, цену, тексты и фото. Новые фото ведите в блоке "Фото устройства"; legacy JSON-поля не используйте для нового наполнения.',
  display_template = '{{title}} · {{price_text}} · {{stock_status}} · {{content_status}}',
  sort_field = 'sort',
  accountability = 'all',
  sort = 10,
  color = '#111827',
  translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', 'Устройства'))::json
WHERE collection = 'devices';

UPDATE directus_collections
SET icon = 'photo_library',
  note = 'Фото устройств. Обычно редактируются из карточки устройства через блок "Фото устройства". Для публикации нужны status=published и shot_status=approved.',
  display_template = '{{device.title}} · {{role}} · {{label}}',
  sort_field = 'sort',
  accountability = 'all',
  sort = 11,
  color = '#2563eb',
  translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', 'Фото устройств'))::json
WHERE collection = 'device_images';

-- Device-first media workflow.
SELECT isvoi_upsert_directus_field(
  'devices',
  'group_media',
  'group-detail',
  NULL,
  '{"headerIcon":"photo_library","start":"open"}'::json,
  NULL,
  'full',
  50,
  'Фото товара. Основной сценарий: добавляйте строки в "Фото устройства"; role=card отвечает за плитку каталога, остальные роли формируют галерею.',
  false,
  false,
  false,
  'alias,no-data,group',
  NULL,
  'Фото'
);

SELECT isvoi_upsert_directus_field(
  'devices',
  'images',
  'list-o2m',
  NULL,
  '{"layout":"table","enableCreate":true,"enableSelect":true,"fields":["sort","status","shot_status","role","image","label"]}'::json,
  NULL,
  'full',
  51,
  'Все фото устройства. Для карточки каталога нужна одна строка role=card. Для товарной страницы используйте main, screen, body, defect или other.',
  false,
  false,
  false,
  'o2m',
  'group_media',
  'Фото устройства'
);

SELECT isvoi_upsert_directus_field(
  'devices',
  'listing_file',
  'file-image',
  'image',
  '{"folder":"ISVOI Device Photos"}'::json,
  NULL,
  'full',
  52,
  'Совместимость со старой карточкой: сайт сначала ищет device_images role=card, затем использует это поле. Для новых устройств лучше заполнять "Фото устройства".',
  false,
  false,
  false,
  'm2o',
  'group_media',
  'Фото карточки (fallback)'
);

SELECT isvoi_upsert_directus_field('devices', 'listing_image', 'input', NULL, NULL, NULL, 'half', 53, 'Legacy path. Не используйте для новых устройств.', false, true, false, NULL, 'group_media', 'Legacy image path');
SELECT isvoi_upsert_directus_field('devices', 'visual_class', 'input', NULL, NULL, NULL, 'half', 54, 'Legacy CSS-класс. Обычно не нужен после Directus Files.', false, true, false, NULL, 'group_media', 'Legacy visual class');
SELECT isvoi_upsert_directus_field('devices', 'listing_alt', 'input', NULL, NULL, NULL, 'half', 55, 'Alt-текст основного фото, если нужен отдельно от alt в device_images.', false, false, false, NULL, 'group_media', 'Alt основного фото');

SELECT isvoi_upsert_directus_field(
  'devices',
  'group_structured',
  'group-detail',
  NULL,
  '{"headerIcon":"data_object","start":"closed"}'::json,
  NULL,
  'full',
  90,
  'Расширенные JSON-данные. Галерею для новых устройств не редактируйте здесь: используйте "Фото устройства".',
  false,
  false,
  false,
  'alias,no-data,group',
  NULL,
  'Расширенные данные'
);

SELECT isvoi_upsert_directus_field('devices', 'gallery', 'list', NULL, NULL, NULL, 'full', 91, 'Legacy JSON-галерея. Скрыто из обычного workflow: новые фото ведутся через device_images.', false, true, false, 'cast-json', 'group_structured', 'Legacy gallery JSON');
SELECT isvoi_upsert_directus_field('devices', 'passport', 'input-code', NULL, '{"language":"json","lineWrapping":true}'::json, NULL, 'full', 92, 'JSON ISVOI Passport. До отдельной модели редактируйте осторожно и проверяйте страницу товара после изменений.', false, false, false, 'cast-json', 'group_structured', 'Passport JSON');
SELECT isvoi_upsert_directus_field('devices', 'trade', 'input-code', NULL, '{"language":"json","lineWrapping":true}'::json, NULL, 'full', 93, 'JSON trade options. До отдельной модели редактируйте осторожно.', false, false, false, 'cast-json', 'group_structured', 'Trade JSON');

-- Image rows: clearer editor defaults.
SELECT isvoi_upsert_directus_field(
  'device_images',
  'group_image_main',
  'group-detail',
  NULL,
  '{"headerIcon":"photo_library","start":"open"}'::json,
  NULL,
  'full',
  1,
  'Связь изображения с устройством, роль кадра и публикация.',
  false,
  false,
  false,
  'alias,no-data,group',
  NULL,
  'Фото'
);

SELECT isvoi_upsert_directus_field(
  'device_images',
  'image',
  'file-image',
  'image',
  '{"folder":"ISVOI Device Photos"}'::json,
  NULL,
  'full',
  8,
  'Файл из Directus Files. Используйте папку ISVOI Device Photos; сайт отдаёт изображение через Directus asset transforms.',
  false,
  false,
  true,
  'm2o',
  'group_image_main',
  'Файл фото'
);

SELECT isvoi_upsert_directus_field('device_images', 'device', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}} · {{stock_status}}"}'::json, NULL, 'half', 5, 'Связанное устройство. Если фото создаётся из карточки устройства, поле заполняется автоматически.', false, false, true, 'm2o', 'group_image_main', 'Устройство');
SELECT isvoi_upsert_directus_field('device_images', 'role', 'select-dropdown', 'labels', '{"choices":[{"text":"Карточка каталога","value":"card","color":"#111827"},{"text":"Главный вид","value":"main","color":"#2563eb"},{"text":"Экран","value":"screen","color":"#0f766e"},{"text":"Корпус","value":"body","color":"#7c3aed"},{"text":"Дефект","value":"defect","color":"#dc2626"},{"text":"Другое","value":"other","color":"#6b7280"}]}'::json, NULL, 'half', 6, 'Роль фото. role=card используется для плитки каталога; остальные роли показываются в галерее товарной страницы.', false, false, true, NULL, 'group_image_main', 'Роль фото');
SELECT isvoi_upsert_directus_field('device_images', 'sort', 'input', NULL, '{"min":1,"step":1}'::json, NULL, 'half', 7, 'Порядок в галерее. Меньше число — выше/раньше.', false, false, false, NULL, 'group_image_main', 'Порядок');
SELECT isvoi_upsert_directus_field('device_images', 'label', 'input', NULL, NULL, NULL, 'half', 9, 'Короткая подпись кадра для редактора и интерфейса.', false, false, false, NULL, 'group_image_main', 'Подпись');
SELECT isvoi_upsert_directus_field('device_images', 'alt', 'input-multiline', NULL, NULL, NULL, 'full', 10, 'Alt-текст изображения. Пишите, что реально видно на фото.', false, false, false, NULL, 'group_image_main', 'Alt-текст');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, json, varchar, integer, text, boolean, boolean, boolean, varchar, varchar, text);

-- Directus needs one_field for the O2M alias devices.images.
UPDATE directus_relations
SET one_field = 'images',
  one_deselect_action = 'delete'
WHERE many_collection = 'device_images'
  AND many_field = 'device'
  AND one_collection = 'devices';

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'device_images', 'device', 'devices', 'images', 'delete'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'device_images' AND many_field = 'device'
);

-- Public API should expose only commercially ready catalog rows.
UPDATE directus_permissions
SET permissions = '{"_and":[{"status":{"_eq":"published"}},{"stock_status":{"_neq":"hidden"}},{"content_status":{"_eq":"ready"}}]}'::json
WHERE collection = 'devices'
  AND action = 'read'
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Public Read');

UPDATE directus_permissions
SET permissions = '{"_and":[{"status":{"_eq":"published"}},{"shot_status":{"_eq":"approved"}}]}'::json
WHERE collection = 'device_images'
  AND action = 'read'
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Public Read');

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

SELECT isvoi_upsert_preset('ISVOI Editor', 'devices', 'Нужны фото', 'add_photo_alternate', '#f59e0b', '{"content_status":{"_eq":"needs_photo"}}'::json, '{"tabular":{"sort":["sort","title"],"fields":["title","stock_status","content_status","price_text","updated_at"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'devices', 'Нужен текст', 'edit_note', '#ef4444', '{"content_status":{"_eq":"needs_content"}}'::json, '{"tabular":{"sort":["sort","title"],"fields":["title","stock_status","content_status","price_text","updated_at"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'devices', 'На проверке', 'rate_review', '#3b82f6', '{"content_status":{"_eq":"review"}}'::json, '{"tabular":{"sort":["sort","title"],"fields":["title","stock_status","content_status","price_text","updated_at"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'devices', 'Готово к публикации', 'verified', '#10b981', '{"_and":[{"content_status":{"_eq":"ready"}},{"stock_status":{"_neq":"hidden"}}]}'::json, '{"tabular":{"sort":["sort","title"],"fields":["title","stock_status","content_status","price_text","updated_at"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'device_images', 'Фото на проверке', 'photo_camera', '#f59e0b', '{"shot_status":{"_eq":"needs_review"}}'::json, '{"tabular":{"sort":["device","sort"],"fields":["device","role","status","shot_status","image","label"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'device_images', 'Опубликованные фото', 'photo_library', '#10b981', '{"_and":[{"status":{"_eq":"published"}},{"shot_status":{"_eq":"approved"}}]}'::json, '{"tabular":{"sort":["device","sort"],"fields":["device","role","status","shot_status","image","label"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, varchar, json, json);

SELECT 'catalog_studio.devices_images_field' AS check_name, count(*)::text AS value
FROM directus_fields
WHERE collection = 'devices' AND field = 'images'
UNION ALL
SELECT 'catalog_studio.device_relation_one_field', count(*)::text
FROM directus_relations
WHERE many_collection = 'device_images' AND many_field = 'device' AND one_collection = 'devices' AND one_field = 'images'
UNION ALL
SELECT 'catalog_studio.editor_presets', count(*)::text
FROM directus_presets
WHERE collection IN ('devices', 'device_images')
  AND bookmark IS NOT NULL
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'catalog_studio.public_filters', count(*)::text
FROM directus_permissions
WHERE collection IN ('devices', 'device_images')
  AND action = 'read'
  AND permissions IS NOT NULL
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Public Read');

COMMIT;
`);
