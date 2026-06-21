#!/usr/bin/env node
/**
 * Print idempotent SQL that turns catalog_import_batches into an operator
 * screen in Directus Studio.
 *
 * This script does not create webhook flows and does not need secrets. It only
 * configures folders, Studio metadata, bookmarks and safer editor permissions.
 *
 * Usage:
 *   node scripts/setup_directus_catalog_import_operator_screen_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION isvoi_file_folder_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM directus_folders
  WHERE name = p_name AND parent IS NULL
  ORDER BY name
  LIMIT 1;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_folders (id, name, parent)
    VALUES (v_id, p_name, NULL);
  END IF;

  RETURN v_id;
END;
$$;

SELECT isvoi_file_folder_id('ISVOI Catalog Imports');

UPDATE directus_collections
SET icon = 'upload_file',
  note = 'Операторский экран импорта каталога. Создайте партию, приложите stock.xlsx и ZIP с фото, сохраните запись, затем запустите Flow-кнопку проверки. Импорт запускайте только после успешной проверки.',
  display_template = '{{batch_name}} · {{status}} · {{last_run_status}}',
  archive_field = 'status',
  archive_value = 'archived',
  unarchive_value = 'draft',
  accountability = 'all',
  sort = 12,
  color = '#7c3aed',
  translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', 'Импорт каталога'))::json
WHERE collection = 'catalog_import_batches';

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

SELECT isvoi_upsert_directus_field('catalog_import_batches', 'group_batch', 'group-detail', NULL, '{"headerIcon":"upload_file","start":"open"}'::json, NULL, 'full', 1, 'Что оператор заполняет перед запуском проверки.', false, false, false, 'alias,no-data,group', NULL, 'Партия');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'group_result', 'group-detail', NULL, '{"headerIcon":"fact_check","start":"open"}'::json, NULL, 'full', 50, 'Автоматический результат последнего запуска. Поля ниже не заполняются руками.', false, false, false, 'alias,no-data,group', NULL, 'Результат запуска');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'group_system', 'group-detail', NULL, '{"headerIcon":"settings","start":"closed"}'::json, NULL, 'full', 90, 'Служебные поля.', false, false, false, 'alias,no-data,group', NULL, 'Системное');

SELECT isvoi_upsert_directus_field('catalog_import_batches', 'id', 'input', NULL, NULL, NULL, 'half', 91, 'Системный ID партии.', true, true, false, 'uuid', 'group_system', 'ID');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Проверяется","value":"running","color":"#3b82f6"},{"text":"Проверено","value":"checked","color":"#10b981"},{"text":"Импортировано","value":"imported","color":"#7c3aed"},{"text":"Ошибка","value":"failed","color":"#ef4444"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, NULL, 'half', 2, 'Статус меняется автоматически после Flow-кнопок. Оператор его не редактирует руками.', true, false, true, NULL, 'group_batch', 'Статус');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'batch_name', 'input', NULL, NULL, NULL, 'half', 3, 'Короткое имя партии латиницей, например 2026-06-stock. Это имя станет меткой import_batch у товаров и фото.', false, false, true, NULL, 'group_batch', 'Имя партии');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'default_status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"}]}'::json, NULL, 'half', 4, 'Безопасный вариант — draft. Published используйте только для полностью проверенной партии.', false, false, true, NULL, 'group_batch', 'Статус новых товаров');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'workbook', 'file', 'file', '{"folder":"ISVOI Catalog Imports"}'::json, NULL, 'full', 5, 'Excel-файл stock.xlsx с устройствами и путями к фото.', false, false, true, 'm2o', 'group_batch', 'Excel stock.xlsx');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'photos_archive', 'file', 'file', '{"folder":"ISVOI Catalog Imports"}'::json, NULL, 'full', 6, 'ZIP-архив с исходными фотографиями. Внутри должны быть файлы/папки, на которые ссылается Excel.', false, false, true, 'm2o', 'group_batch', 'ZIP с фото');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'note', 'input-multiline', NULL, NULL, NULL, 'full', 7, 'Комментарий оператора: что внутри партии, откуда данные, что проверить после импорта.', false, false, false, NULL, 'group_batch', 'Комментарий');

SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_mode', 'select-dropdown', 'labels', '{"choices":[{"text":"Проверка","value":"dry_run","color":"#2563eb"},{"text":"Импорт","value":"apply","color":"#7c3aed"}]}'::json, NULL, 'half', 51, 'Последний режим запуска.', true, false, false, NULL, 'group_result', 'Режим');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_status', 'select-dropdown', 'labels', '{"choices":[{"text":"Выполняется","value":"running","color":"#3b82f6"},{"text":"Успешно","value":"success","color":"#10b981"},{"text":"Ошибка","value":"failed","color":"#ef4444"}]}'::json, NULL, 'half', 52, 'Последний технический результат запуска.', true, false, false, NULL, 'group_result', 'Результат');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_at', 'datetime', 'datetime', NULL, NULL, 'half', 53, 'Время последней проверки или импорта.', true, false, false, NULL, 'group_result', 'Время запуска');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_log', 'input-code', NULL, '{"language":"shell","lineWrapping":true}'::json, NULL, 'full', 54, 'Лог проверки/импорта. Если есть ошибка, последние строки помогут понять, что исправить в Excel или ZIP.', true, false, false, NULL, 'group_result', 'Лог');

SELECT isvoi_upsert_directus_field('catalog_import_batches', 'created_at', 'datetime', 'datetime', NULL, NULL, 'half', 92, 'Создано.', true, false, false, 'date-created', 'group_system', 'Создано');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'updated_at', 'datetime', 'datetime', NULL, NULL, 'half', 93, 'Обновлено.', true, false, false, 'date-updated', 'group_system', 'Обновлено');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, json, varchar, integer, text, boolean, boolean, boolean, varchar, varchar, text);

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

SELECT isvoi_upsert_permission('ISVOI Editor', 'catalog_import_batches', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'catalog_import_batches',
  'create',
  'batch_name,workbook,photos_archive,default_status,note',
  NULL,
  '{"batch_name":{"_nnull":true},"workbook":{"_nnull":true},"photos_archive":{"_nnull":true},"default_status":{"_in":["draft","published"]}}'::json,
  '{"status":"draft","default_status":"draft"}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'catalog_import_batches',
  'update',
  'batch_name,workbook,photos_archive,default_status,note',
  NULL,
  '{"default_status":{"_in":["draft","published"]}}'::json
);
SELECT isvoi_delete_permission('ISVOI Editor', 'catalog_import_batches', 'delete');

SELECT isvoi_upsert_permission('ISVOI Importer', 'catalog_import_batches', 'read', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'catalog_import_batches', 'create', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'catalog_import_batches', 'update', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'catalog_import_batches', 'read', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'catalog_import_batches', 'update', '*', NULL);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_delete_permission(text, varchar, varchar);

CREATE OR REPLACE FUNCTION isvoi_upsert_preset(
  p_role_name text,
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
    WHERE role = v_role
      AND collection = 'catalog_import_batches'
      AND bookmark = p_bookmark
      AND "user" IS NULL
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
    WHERE role = v_role
      AND collection = 'catalog_import_batches'
      AND bookmark = p_bookmark
      AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets (
      bookmark, role, "user", collection, search, layout, layout_query,
      layout_options, refresh_interval, filter, icon, color
    ) VALUES (
      p_bookmark, v_role, NULL, 'catalog_import_batches', NULL, 'tabular', p_layout_query,
      NULL, NULL, p_filter, p_icon, p_color
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_preset('ISVOI Editor', 'Новые партии', 'upload_file', '#6b7280', '{"status":{"_eq":"draft"}}'::json, '{"tabular":{"sort":["-created_at"],"fields":["created_at","status","batch_name","default_status","last_run_status","last_run_at","note"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'В работе', 'sync', '#3b82f6', '{"status":{"_eq":"running"}}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","last_run_mode","last_run_status"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'Проверены к импорту', 'fact_check', '#10b981', '{"_and":[{"status":{"_eq":"checked"}},{"last_run_status":{"_eq":"success"}}]}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","default_status","last_run_status"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'Ошибки', 'error', '#ef4444', '{"_or":[{"status":{"_eq":"failed"}},{"last_run_status":{"_eq":"failed"}}]}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","last_run_mode","last_run_status","note"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'Импортировано', 'publish', '#7c3aed', '{"status":{"_eq":"imported"}}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","default_status","last_run_status"],"page":1}}'::json);

SELECT isvoi_upsert_preset('ISVOI Importer', 'Новые партии', 'upload_file', '#6b7280', '{"status":{"_eq":"draft"}}'::json, '{"tabular":{"sort":["-created_at"],"fields":["created_at","status","batch_name","default_status","last_run_status","last_run_at","note"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Importer', 'В работе', 'sync', '#3b82f6', '{"status":{"_eq":"running"}}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","last_run_mode","last_run_status"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Importer', 'Проверены к импорту', 'fact_check', '#10b981', '{"_and":[{"status":{"_eq":"checked"}},{"last_run_status":{"_eq":"success"}}]}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","default_status","last_run_status"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Importer', 'Ошибки', 'error', '#ef4444', '{"_or":[{"status":{"_eq":"failed"}},{"last_run_status":{"_eq":"failed"}}]}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","last_run_mode","last_run_status","note"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Importer', 'Импортировано', 'publish', '#7c3aed', '{"status":{"_eq":"imported"}}'::json, '{"tabular":{"sort":["-last_run_at"],"fields":["last_run_at","status","batch_name","default_status","last_run_status"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, json, json);
DROP FUNCTION isvoi_file_folder_id(text);

SELECT 'catalog_import_operator.folder' AS check_name, count(*)::text AS value
FROM directus_folders
WHERE name = 'ISVOI Catalog Imports'
UNION ALL
SELECT 'catalog_import_operator.bookmarks', count(*)::text
FROM directus_presets
WHERE collection = 'catalog_import_batches'
  AND bookmark IS NOT NULL
  AND role IN (SELECT id FROM directus_roles WHERE name IN ('ISVOI Editor', 'ISVOI Importer'))
UNION ALL
SELECT 'catalog_import_operator.editor_fields', count(*)::text
FROM directus_permissions
WHERE collection = 'catalog_import_batches'
  AND action = 'update'
  AND fields = 'batch_name,workbook,photos_archive,default_status,note'
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'catalog_import_operator.readonly_result', count(*)::text
FROM directus_fields
WHERE collection = 'catalog_import_batches'
  AND field IN ('status', 'last_run_mode', 'last_run_status', 'last_run_at', 'last_run_log')
  AND readonly = true;

COMMIT;
`);
