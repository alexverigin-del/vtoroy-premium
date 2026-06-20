#!/usr/bin/env node
/**
 * Print idempotent SQL that adds a Directus Studio catalog import batch screen
 * and two Manual Flow buttons: dry-run and apply.
 *
 * Required env:
 *   CATALOG_IMPORT_WEBHOOK_SECRET
 *
 * Optional env:
 *   CATALOG_IMPORT_WEBHOOK_URL=https://isvoi.ru/api/admin/catalog-import/run
 *
 * Usage:
 *   CATALOG_IMPORT_WEBHOOK_SECRET=... node scripts/setup_directus_catalog_import_button_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

const secret = process.env.CATALOG_IMPORT_WEBHOOK_SECRET || "";
const webhookUrl = process.env.CATALOG_IMPORT_WEBHOOK_URL || "https://isvoi.ru/api/admin/catalog-import/run";

if (!secret) {
  console.error("CATALOG_IMPORT_WEBHOOK_SECRET must be set.");
  process.exit(1);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function flowOptions(collection) {
  return JSON.stringify({
    collections: [collection],
    location: "item",
    requireSelection: false,
  });
}

function requestOptions(apply) {
  const url = `${webhookUrl}?batch_id={{$trigger.key}}&apply=${apply ? "true" : "false"}`;
  return JSON.stringify({
    url,
    method: "POST",
    headers: [
      { header: "Content-Type", value: "application/json" },
      { header: "x-isvoi-import-secret", value: secret },
    ],
    body: JSON.stringify({
      batch_id: "{{$trigger.key}}",
      apply,
    }),
  });
}

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  batch_name varchar(160) NOT NULL,
  workbook uuid NOT NULL REFERENCES directus_files(id) ON DELETE RESTRICT,
  photos_archive uuid REFERENCES directus_files(id) ON DELETE RESTRICT,
  default_status varchar(32) NOT NULL DEFAULT 'draft',
  note text,
  last_run_mode varchar(32),
  last_run_status varchar(32),
  last_run_log text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_import_batches_status_idx ON catalog_import_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_import_batches_batch_name_idx ON catalog_import_batches (batch_name);

CREATE OR REPLACE FUNCTION isvoi_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_import_batches_touch_updated_at ON catalog_import_batches;
CREATE TRIGGER catalog_import_batches_touch_updated_at
BEFORE UPDATE ON catalog_import_batches
FOR EACH ROW
EXECUTE FUNCTION isvoi_touch_updated_at();

INSERT INTO directus_collections (
  collection, icon, note, display_template, archive_field, archive_value,
  unarchive_value, accountability, sort, color
) VALUES (
  'catalog_import_batches',
  'upload_file',
  'Операторский импорт каталога. Создайте партию, загрузите stock.xlsx и ZIP с фото, затем используйте Flow-кнопки проверки или импорта.',
  '{{batch_name}} · {{status}} · {{last_run_status}}',
  'status',
  'archived',
  'draft',
  'all',
  12,
  '#7c3aed'
) ON CONFLICT (collection) DO UPDATE SET
  icon = EXCLUDED.icon,
  note = EXCLUDED.note,
  display_template = EXCLUDED.display_template,
  archive_field = EXCLUDED.archive_field,
  archive_value = EXCLUDED.archive_value,
  unarchive_value = EXCLUDED.unarchive_value,
  accountability = EXCLUDED.accountability,
  sort = EXCLUDED.sort,
  color = EXCLUDED.color;

CREATE OR REPLACE FUNCTION isvoi_upsert_directus_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_readonly boolean DEFAULT false,
  p_special varchar DEFAULT NULL,
  p_group varchar DEFAULT NULL,
  p_required boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields WHERE collection = p_collection AND field = p_field
  ) THEN
    UPDATE directus_fields
    SET interface = p_interface,
      display = p_display,
      options = p_options,
      width = p_width,
      sort = p_sort,
      note = p_note,
      readonly = p_readonly,
      special = p_special,
      "group" = p_group,
      required = p_required
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, interface, display, options, width, sort, note,
      readonly, special, "group", required
    ) VALUES (
      p_collection, p_field, p_interface, p_display, p_options, p_width, p_sort, p_note,
      p_readonly, p_special, p_group, p_required
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_directus_field('catalog_import_batches', 'group_batch', 'group-detail', NULL, '{"headerIcon":"upload_file","start":"open"}'::json, 'full', 1, 'Файлы партии и безопасный статус новых товаров.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'group_result', 'group-detail', NULL, '{"headerIcon":"fact_check","start":"open"}'::json, 'full', 50, 'Результат последней проверки или импорта.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'id', 'input', NULL, NULL, 'half', 2, 'ID партии.', true, 'uuid', 'group_batch');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Проверяется","value":"running","color":"#3b82f6"},{"text":"Проверено","value":"checked","color":"#10b981"},{"text":"Импортировано","value":"imported","color":"#7c3aed"},{"text":"Ошибка","value":"failed","color":"#ef4444"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 3, 'Статус партии. Меняется автоматически после кнопок.', false, NULL, 'group_batch', true);
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'batch_name', 'input', NULL, NULL, 'half', 4, 'Короткое имя партии латиницей, например 2026-06-stock.', false, NULL, 'group_batch', true);
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'default_status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"}]}'::json, 'half', 5, 'Безопасный вариант — draft. Published используйте только для проверенной партии.', false, NULL, 'group_batch', true);
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'workbook', 'file', 'file', NULL, 'full', 6, 'Excel stock.xlsx с товарами.', false, 'm2o', 'group_batch', true);
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'photos_archive', 'file', 'file', NULL, 'full', 7, 'ZIP-архив с папкой/файлами фотографий.', false, 'm2o', 'group_batch', true);
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'note', 'input-multiline', NULL, NULL, 'full', 8, 'Комментарий оператора.', false, NULL, 'group_batch');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_mode', 'input', NULL, NULL, 'half', 51, 'Последний режим: dry_run или apply.', true, NULL, 'group_result');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_status', 'input', NULL, NULL, 'half', 52, 'Последний результат: running, success или failed.', true, NULL, 'group_result');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_at', 'datetime', 'datetime', NULL, 'half', 53, 'Время последнего запуска.', true, NULL, 'group_result');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'last_run_log', 'input-multiline', NULL, NULL, 'full', 54, 'Лог проверки/импорта. Если есть ошибка, она будет здесь.', true, NULL, 'group_result');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'created_at', 'datetime', 'datetime', NULL, 'half', 90, 'Создано.', true, 'date-created');
SELECT isvoi_upsert_directus_field('catalog_import_batches', 'updated_at', 'datetime', 'datetime', NULL, 'half', 91, 'Обновлено.', true, 'date-updated');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar, varchar, boolean);

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'catalog_import_batches', 'workbook', 'directus_files', NULL, 'nullify'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'catalog_import_batches' AND many_field = 'workbook'
);

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'catalog_import_batches', 'photos_archive', 'directus_files', NULL, 'nullify'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'catalog_import_batches' AND many_field = 'photos_archive'
);

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

SELECT isvoi_upsert_permission('ISVOI Editor', 'catalog_import_batches', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'catalog_import_batches',
  'create',
  'status,batch_name,workbook,photos_archive,default_status,note',
  NULL,
  '{"batch_name":{"_nnull":true},"workbook":{"_nnull":true},"photos_archive":{"_nnull":true},"default_status":{"_in":["draft","published"]}}'::json,
  '{"status":"draft","default_status":"draft"}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'catalog_import_batches',
  'update',
  'status,batch_name,workbook,photos_archive,default_status,note,last_run_mode,last_run_status,last_run_log,last_run_at',
  NULL,
  '{"default_status":{"_in":["draft","published"]}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Importer', 'catalog_import_batches', 'read', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'catalog_import_batches', 'create', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'catalog_import_batches', 'update', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'catalog_import_batches', 'read', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'catalog_import_batches', 'update', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'directus_files', 'read', '*', NULL);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);

CREATE OR REPLACE FUNCTION isvoi_upsert_manual_request_flow(
  p_name text,
  p_icon text,
  p_color text,
  p_description text,
  p_operation_key text,
  p_operation_name text,
  p_operation_options json
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_flow uuid;
  v_operation uuid;
BEGIN
  SELECT id INTO v_flow FROM directus_flows WHERE name = p_name LIMIT 1;
  IF v_flow IS NULL THEN
    v_flow := gen_random_uuid();
    INSERT INTO directus_flows (
      id, name, icon, color, description, status, trigger, accountability,
      options, date_created
    ) VALUES (
      v_flow, p_name, p_icon, p_color, p_description, 'active', 'manual', 'all',
      ${sql(flowOptions("catalog_import_batches"))}::json, now()
    );
  ELSE
    UPDATE directus_flows
    SET icon = p_icon,
      color = p_color,
      description = p_description,
      status = 'active',
      trigger = 'manual',
      accountability = 'all',
      options = ${sql(flowOptions("catalog_import_batches"))}::json
    WHERE id = v_flow;
  END IF;

  SELECT id INTO v_operation
  FROM directus_operations
  WHERE flow = v_flow AND key = p_operation_key
  LIMIT 1;

  IF v_operation IS NULL THEN
    v_operation := gen_random_uuid();
    INSERT INTO directus_operations (
      id, name, key, type, position_x, position_y, options, flow, date_created
    ) VALUES (
      v_operation, p_operation_name, p_operation_key, 'request', 19, 1,
      p_operation_options, v_flow, now()
    );
  ELSE
    UPDATE directus_operations
    SET name = p_operation_name,
      type = 'request',
      options = p_operation_options
    WHERE id = v_operation;
  END IF;

  UPDATE directus_flows SET operation = v_operation WHERE id = v_flow;
END;
$$;

SELECT isvoi_upsert_manual_request_flow(
  'ISVOI: проверить партию каталога',
  'fact_check',
  '#2563eb',
  'Dry-run проверка stock.xlsx и ZIP с фото без записи товаров в каталог.',
  'isvoi_catalog_import_dry_run',
  'Проверить партию',
  ${sql(requestOptions(false))}::json
);

SELECT isvoi_upsert_manual_request_flow(
  'ISVOI: импортировать партию каталога',
  'publish',
  '#7c3aed',
  'Импорт партии в Directus. Перед записью endpoint ещё раз выполняет dry-run.',
  'isvoi_catalog_import_apply',
  'Импортировать партию',
  ${sql(requestOptions(true))}::json
);

DROP FUNCTION isvoi_upsert_manual_request_flow(text, text, text, text, text, text, json);

COMMIT;

SELECT 'catalog_import_batches_table' AS check_name, count(*)::text AS value
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'catalog_import_batches'
UNION ALL
SELECT 'catalog_import_batch_fields', count(*)::text
FROM directus_fields
WHERE collection = 'catalog_import_batches'
UNION ALL
SELECT 'catalog_import_flows', count(*)::text
FROM directus_flows
WHERE name IN ('ISVOI: проверить партию каталога', 'ISVOI: импортировать партию каталога')
UNION ALL
SELECT 'catalog_import_operations', count(*)::text
FROM directus_operations
WHERE key IN ('isvoi_catalog_import_dry_run', 'isvoi_catalog_import_apply');
`);
