#!/usr/bin/env node
/**
 * Print idempotent SQL that promotes catalog JSON fields into structured
 * Directus collections.
 *
 * This is additive and reversible: legacy `devices.passport` and
 * `devices.trade` stay in place as fallback data while the site starts reading
 * `device_passports` and `trade_options` first.
 *
 * Usage:
 *   node scripts/setup_directus_catalog_structured_data_sql.mjs > /tmp/isvoi_setup_directus_catalog_structured_data_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_catalog_structured_data_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS device_passports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device varchar NOT NULL UNIQUE,
  repair varchar(255),
  water varchar(255),
  summary_rows json,
  diagnostics_status varchar(255),
  diagnostics_checklist json,
  condition_grade_text varchar(255),
  condition_note text,
  condition_notes json,
  defect_photo uuid,
  defect_photo_alt text,
  story_title varchar(255),
  story_body text,
  story_facts json,
  warranty_duration varchar(255),
  warranty_covered text,
  warranty_not_covered text,
  exit_headline varchar(255),
  exit_buy_today varchar(255),
  exit_trade_in_estimate varchar(255),
  exit_condition varchar(255),
  exit_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device varchar NOT NULL,
  value integer NOT NULL DEFAULT 0,
  label varchar(255) NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS device varchar;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS repair varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS water varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS summary_rows json;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS diagnostics_status varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS diagnostics_checklist json;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS condition_grade_text varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS condition_note text;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS condition_notes json;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS defect_photo uuid;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS defect_photo_alt text;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS story_title varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS story_body text;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS story_facts json;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS warranty_duration varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS warranty_covered text;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS warranty_not_covered text;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS exit_headline varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS exit_buy_today varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS exit_trade_in_estimate varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS exit_condition varchar(255);
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS exit_note text;
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS device varchar;
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS value integer NOT NULL DEFAULT 0;
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS label varchar(255) NOT NULL DEFAULT '';
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 100;
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_passports_device_fkey'
  ) THEN
    ALTER TABLE device_passports
      ADD CONSTRAINT device_passports_device_fkey
      FOREIGN KEY (device) REFERENCES devices(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_passports_defect_photo_fkey'
  ) THEN
    ALTER TABLE device_passports
      ADD CONSTRAINT device_passports_defect_photo_fkey
      FOREIGN KEY (defect_photo) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trade_options_device_fkey'
  ) THEN
    ALTER TABLE trade_options
      ADD CONSTRAINT trade_options_device_fkey
      FOREIGN KEY (device) REFERENCES devices(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trade_options_device_sort_key'
  ) THEN
    ALTER TABLE trade_options
      ADD CONSTRAINT trade_options_device_sort_key UNIQUE (device, sort);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS device_passports_device_idx ON device_passports (device);
CREATE INDEX IF NOT EXISTS trade_options_device_sort_idx ON trade_options (device, sort);
CREATE INDEX IF NOT EXISTS trade_options_active_idx ON trade_options (is_active, device, sort);

CREATE OR REPLACE FUNCTION isvoi_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_passports_touch_updated_at ON device_passports;
CREATE TRIGGER device_passports_touch_updated_at
BEFORE UPDATE ON device_passports
FOR EACH ROW
EXECUTE FUNCTION isvoi_touch_updated_at();

DROP TRIGGER IF EXISTS trade_options_touch_updated_at ON trade_options;
CREATE TRIGGER trade_options_touch_updated_at
BEFORE UPDATE ON trade_options
FOR EACH ROW
EXECUTE FUNCTION isvoi_touch_updated_at();

CREATE OR REPLACE FUNCTION isvoi_upsert_collection_metadata(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_sort_field varchar,
  p_sort integer,
  p_color varchar,
  p_translation text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_collections WHERE collection = p_collection) THEN
    UPDATE directus_collections
    SET icon = p_icon,
      note = p_note,
      display_template = p_display_template,
      hidden = false,
      singleton = false,
      sort_field = p_sort_field,
      accountability = 'all',
      sort = p_sort,
      color = p_color,
      translations = json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json
    WHERE collection = p_collection;
  ELSE
    INSERT INTO directus_collections (
      collection, icon, note, display_template, hidden, singleton,
      sort_field, accountability, sort, color, translations
    ) VALUES (
      p_collection, p_icon, p_note, p_display_template, false, false,
      p_sort_field, 'all', p_sort, p_color,
      json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_collection_metadata(
  'device_passports',
  'verified_user',
  'Структурированный ISVOI Passport устройства. Это рабочая замена legacy JSON в devices.passport.',
  '{{device.title}} · {{condition_grade_text}} · {{warranty_duration}}',
  NULL,
  13,
  '#dc2626',
  'Паспорта устройств'
);

SELECT isvoi_upsert_collection_metadata(
  'trade_options',
  'sync_alt',
  'Варианты Trade/Upgrade для устройства. Это рабочая замена legacy JSON в devices.trade.options.',
  '{{device.title}} · {{label}}',
  'sort',
  14,
  '#7c3aed',
  'Trade варианты'
);

DROP FUNCTION isvoi_upsert_collection_metadata(varchar, varchar, text, varchar, varchar, integer, varchar, text);

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
  p_required boolean DEFAULT false,
  p_hidden boolean DEFAULT false
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
      required = p_required,
      hidden = p_hidden
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, interface, display, options, width, sort, note,
      readonly, special, "group", required, hidden
    ) VALUES (
      p_collection, p_field, p_interface, p_display, p_options, p_width, p_sort, p_note,
      p_readonly, p_special, p_group, p_required, p_hidden
    );
  END IF;
END;
$$;

-- Device embedded relations.
SELECT isvoi_upsert_directus_field('devices', 'passport_record', 'list-o2m', NULL, '{"layout":"table","enableCreate":true,"enableSelect":false,"fields":["condition_grade_text","repair","water","story_title","warranty_duration","exit_headline"]}'::json, 'full', 92, 'Структурированный Passport. Используйте его вместо legacy JSON-поля passport.', false, 'o2m', 'group_structured', false, false);
SELECT isvoi_upsert_directus_field('devices', 'trade_options', 'list-o2m', NULL, '{"layout":"table","enableCreate":true,"enableSelect":false,"fields":["is_active","sort","label","value"]}'::json, 'full', 93, 'Структурированные варианты Trade/Upgrade. Используйте их вместо legacy JSON-поля trade.', false, 'o2m', 'group_structured', false, false);
SELECT isvoi_upsert_directus_field('devices', 'passport', 'input-code', NULL, '{"language":"json","lineWrapping":true}'::json, 'full', 96, 'Legacy JSON Passport. Сайт теперь сначала читает device_passports; это поле оставлено как fallback на время миграции.', true, 'cast-json', 'group_structured', false, false);
SELECT isvoi_upsert_directus_field('devices', 'trade', 'input-code', NULL, '{"language":"json","lineWrapping":true}'::json, 'full', 97, 'Legacy JSON Trade. Сайт теперь сначала читает trade_options; это поле оставлено как fallback на время миграции.', true, 'cast-json', 'group_structured', false, false);

-- Passport fields.
SELECT isvoi_upsert_directus_field('device_passports', 'group_identity', 'group-detail', NULL, '{"headerIcon":"devices","start":"open"}'::json, 'full', 1, 'Связь паспорта с устройством.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_passports', 'group_summary', 'group-detail', NULL, '{"headerIcon":"fact_check","start":"open"}'::json, 'full', 20, 'Краткая сводка, ремонт, влага и диагностика.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_passports', 'group_condition', 'group-detail', NULL, '{"headerIcon":"build","start":"open"}'::json, 'full', 50, 'Состояние, грейд, заметки и фото дефекта.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_passports', 'group_story', 'group-detail', NULL, '{"headerIcon":"history","start":"open"}'::json, 'full', 70, 'Публичная история вещи без персональных данных.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_passports', 'group_warranty', 'group-detail', NULL, '{"headerIcon":"shield","start":"open"}'::json, 'full', 80, 'Гарантия и цена выхода.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_passports', 'group_system', 'group-detail', NULL, '{"headerIcon":"settings","start":"closed"}'::json, 'full', 120, 'Системные поля.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_passports', 'id', 'input', NULL, NULL, 'half', 121, 'Системный ID.', true, 'uuid', 'group_system', false, true);
SELECT isvoi_upsert_directus_field('device_passports', 'device', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}} · {{stock_status}}"}'::json, 'full', 2, 'Устройство, для которого заполнен Passport. Один Passport на одно устройство.', false, 'm2o', 'group_identity', true);
SELECT isvoi_upsert_directus_field('device_passports', 'summary_rows', 'list', NULL, NULL, 'full', 21, 'Краткие строки Passport: label, value, state=ok/warn/bad.', false, 'cast-json', 'group_summary');
SELECT isvoi_upsert_directus_field('device_passports', 'repair', 'input', NULL, NULL, 'half', 22, 'История ремонта простым текстом.', false, NULL, 'group_summary');
SELECT isvoi_upsert_directus_field('device_passports', 'water', 'input', NULL, NULL, 'half', 23, 'Следы влаги.', false, NULL, 'group_summary');
SELECT isvoi_upsert_directus_field('device_passports', 'diagnostics_status', 'input', NULL, NULL, 'half', 24, 'Статус диагностики.', false, NULL, 'group_summary');
SELECT isvoi_upsert_directus_field('device_passports', 'diagnostics_checklist', 'list', NULL, NULL, 'full', 25, 'Чеклист диагностики: text, state=ok/warn/bad.', false, 'cast-json', 'group_summary');
SELECT isvoi_upsert_directus_field('device_passports', 'condition_grade_text', 'input', NULL, NULL, 'half', 51, 'Текст грейда в Passport, например грейд A−.', false, NULL, 'group_condition');
SELECT isvoi_upsert_directus_field('device_passports', 'condition_note', 'input-multiline', NULL, NULL, 'full', 52, 'Основное описание состояния.', false, NULL, 'group_condition');
SELECT isvoi_upsert_directus_field('device_passports', 'condition_notes', 'list', NULL, NULL, 'full', 53, 'Короткие пункты состояния.', false, 'cast-json', 'group_condition');
SELECT isvoi_upsert_directus_field('device_passports', 'defect_photo', 'file-image', 'image', '{"folder":"ISVOI Device Photos"}'::json, 'half', 54, 'Фото дефекта из Directus Files. Обычно подтягивается из device_images role=defect.', false, 'm2o', 'group_condition');
SELECT isvoi_upsert_directus_field('device_passports', 'defect_photo_alt', 'input-multiline', NULL, NULL, 'half', 55, 'Alt-текст фото дефекта.', false, NULL, 'group_condition');
SELECT isvoi_upsert_directus_field('device_passports', 'story_title', 'input', NULL, NULL, 'half', 71, 'Короткий заголовок истории вещи.', false, NULL, 'group_story');
SELECT isvoi_upsert_directus_field('device_passports', 'story_body', 'input-multiline', NULL, NULL, 'full', 72, 'Публичная история происхождения/пути вещи. Не указывайте персональные данные без согласия.', false, NULL, 'group_story');
SELECT isvoi_upsert_directus_field('device_passports', 'story_facts', 'list', NULL, NULL, 'full', 73, 'Короткие факты истории: string[].', false, 'cast-json', 'group_story');
SELECT isvoi_upsert_directus_field('device_passports', 'warranty_duration', 'input', NULL, NULL, 'half', 81, 'Срок гарантии.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'warranty_covered', 'input-multiline', NULL, NULL, 'full', 82, 'Что покрывает гарантия.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'warranty_not_covered', 'input-multiline', NULL, NULL, 'full', 83, 'Что не покрывает гарантия.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'exit_headline', 'input', NULL, NULL, 'half', 84, 'Короткая цена выхода.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'exit_buy_today', 'input', NULL, NULL, 'half', 85, 'Цена покупки сегодня.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'exit_trade_in_estimate', 'input', NULL, NULL, 'half', 86, 'Оценка Trade-in.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'exit_condition', 'input', NULL, NULL, 'half', 87, 'Условие цены выхода.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'exit_note', 'input-multiline', NULL, NULL, 'full', 88, 'Дисклеймер цены выхода.', false, NULL, 'group_warranty');
SELECT isvoi_upsert_directus_field('device_passports', 'created_at', 'datetime', 'datetime', NULL, 'half', 122, 'Создано.', true, 'date-created', 'group_system');
SELECT isvoi_upsert_directus_field('device_passports', 'updated_at', 'datetime', 'datetime', NULL, 'half', 123, 'Обновлено.', true, 'date-updated', 'group_system');

-- Trade option fields.
SELECT isvoi_upsert_directus_field('trade_options', 'group_main', 'group-detail', NULL, '{"headerIcon":"sync_alt","start":"open"}'::json, 'full', 1, 'Вариант Trade/Upgrade для конкретного устройства.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('trade_options', 'group_system', 'group-detail', NULL, '{"headerIcon":"settings","start":"closed"}'::json, 'full', 90, 'Системные поля.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('trade_options', 'id', 'input', NULL, NULL, 'half', 91, 'Системный ID.', true, 'uuid', 'group_system', false, true);
SELECT isvoi_upsert_directus_field('trade_options', 'device', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}} · {{stock_status}}"}'::json, 'full', 2, 'Устройство, к которому относится вариант.', false, 'm2o', 'group_main', true);
SELECT isvoi_upsert_directus_field('trade_options', 'is_active', 'boolean', 'boolean', NULL, 'half', 3, 'Показывать вариант на сайте.', false, NULL, 'group_main');
SELECT isvoi_upsert_directus_field('trade_options', 'sort', 'input', NULL, '{"min":1,"step":1}'::json, 'half', 4, 'Порядок показа.', false, NULL, 'group_main');
SELECT isvoi_upsert_directus_field('trade_options', 'label', 'input', NULL, NULL, 'half', 5, 'Подпись варианта, например iPhone 12 · 26 000 ₽.', false, NULL, 'group_main', true);
SELECT isvoi_upsert_directus_field('trade_options', 'value', 'input', NULL, '{"min":0,"step":100}'::json, 'half', 6, 'Оценка в рублях числом.', false, NULL, 'group_main', true);
SELECT isvoi_upsert_directus_field('trade_options', 'created_at', 'datetime', 'datetime', NULL, 'half', 92, 'Создано.', true, 'date-created', 'group_system');
SELECT isvoi_upsert_directus_field('trade_options', 'updated_at', 'datetime', 'datetime', NULL, 'half', 93, 'Обновлено.', true, 'date-updated', 'group_system');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar, varchar, boolean, boolean);

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

SELECT isvoi_upsert_relation('device_passports', 'device', 'devices', 'passport_record', 'delete');
SELECT isvoi_upsert_relation('device_passports', 'defect_photo', 'directus_files', NULL, 'nullify');
SELECT isvoi_upsert_relation('trade_options', 'device', 'devices', 'trade_options', 'delete');

DROP FUNCTION isvoi_upsert_relation(varchar, varchar, varchar, varchar, varchar);

-- Seed structured rows from legacy JSON. This is idempotent and does not remove
-- editor-created rows.
WITH legacy AS (
  SELECT
    d.id AS device_id,
    d.passport::jsonb AS passport_json,
    (
      SELECT di.image
      FROM device_images di
      WHERE di.device = d.id
        AND di.role = 'defect'
        AND di.image IS NOT NULL
      ORDER BY
        CASE WHEN di.status = 'published' AND di.shot_status = 'approved' THEN 0 ELSE 1 END,
        di.sort
      LIMIT 1
    ) AS defect_file
  FROM devices d
  WHERE d.passport IS NOT NULL
)
INSERT INTO device_passports (
  device,
  repair,
  water,
  summary_rows,
  diagnostics_status,
  diagnostics_checklist,
  condition_grade_text,
  condition_note,
  condition_notes,
  defect_photo,
  defect_photo_alt,
  story_title,
  story_body,
  story_facts,
  warranty_duration,
  warranty_covered,
  warranty_not_covered,
  exit_headline,
  exit_buy_today,
  exit_trade_in_estimate,
  exit_condition,
  exit_note
)
SELECT
  device_id,
  passport_json->>'repair',
  passport_json->>'water',
  (passport_json->'summaryRows')::json,
  passport_json->'diagnostics'->>'status',
  (passport_json->'diagnostics'->'checklist')::json,
  passport_json->'condition'->>'gradeText',
  passport_json->'condition'->>'note',
  (passport_json->'condition'->'notes')::json,
  defect_file,
  passport_json->'condition'->>'defectPhotoAlt',
  passport_json->'story'->>'title',
  passport_json->'story'->>'body',
  (passport_json->'story'->'facts')::json,
  passport_json->'warranty'->>'duration',
  passport_json->'warranty'->>'covered',
  passport_json->'warranty'->>'notCovered',
  passport_json->'exitPrice'->>'headline',
  passport_json->'exitPrice'->>'buyToday',
  passport_json->'exitPrice'->>'tradeInEstimate',
  passport_json->'exitPrice'->>'condition',
  passport_json->'exitPrice'->>'note'
FROM legacy
ON CONFLICT (device) DO UPDATE SET
  repair = COALESCE(NULLIF(device_passports.repair, ''), EXCLUDED.repair),
  water = COALESCE(NULLIF(device_passports.water, ''), EXCLUDED.water),
  summary_rows = COALESCE(device_passports.summary_rows, EXCLUDED.summary_rows),
  diagnostics_status = COALESCE(NULLIF(device_passports.diagnostics_status, ''), EXCLUDED.diagnostics_status),
  diagnostics_checklist = COALESCE(device_passports.diagnostics_checklist, EXCLUDED.diagnostics_checklist),
  condition_grade_text = COALESCE(NULLIF(device_passports.condition_grade_text, ''), EXCLUDED.condition_grade_text),
  condition_note = COALESCE(NULLIF(device_passports.condition_note, ''), EXCLUDED.condition_note),
  condition_notes = COALESCE(device_passports.condition_notes, EXCLUDED.condition_notes),
  defect_photo = COALESCE(device_passports.defect_photo, EXCLUDED.defect_photo),
  defect_photo_alt = COALESCE(NULLIF(device_passports.defect_photo_alt, ''), EXCLUDED.defect_photo_alt),
  story_title = COALESCE(NULLIF(device_passports.story_title, ''), EXCLUDED.story_title),
  story_body = COALESCE(NULLIF(device_passports.story_body, ''), EXCLUDED.story_body),
  story_facts = COALESCE(device_passports.story_facts, EXCLUDED.story_facts),
  warranty_duration = COALESCE(NULLIF(device_passports.warranty_duration, ''), EXCLUDED.warranty_duration),
  warranty_covered = COALESCE(NULLIF(device_passports.warranty_covered, ''), EXCLUDED.warranty_covered),
  warranty_not_covered = COALESCE(NULLIF(device_passports.warranty_not_covered, ''), EXCLUDED.warranty_not_covered),
  exit_headline = COALESCE(NULLIF(device_passports.exit_headline, ''), EXCLUDED.exit_headline),
  exit_buy_today = COALESCE(NULLIF(device_passports.exit_buy_today, ''), EXCLUDED.exit_buy_today),
  exit_trade_in_estimate = COALESCE(NULLIF(device_passports.exit_trade_in_estimate, ''), EXCLUDED.exit_trade_in_estimate),
  exit_condition = COALESCE(NULLIF(device_passports.exit_condition, ''), EXCLUDED.exit_condition),
  exit_note = COALESCE(NULLIF(device_passports.exit_note, ''), EXCLUDED.exit_note);

WITH options AS (
  SELECT
    d.id AS device_id,
    ordinality::integer * 10 AS sort_order,
    COALESCE((option->>'value')::integer, 0) AS value,
    COALESCE(option->>'label', '') AS label
  FROM devices d
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.trade::jsonb->'options', '[]'::jsonb)) WITH ORDINALITY AS item(option, ordinality)
)
INSERT INTO trade_options (device, sort, value, label, is_active)
SELECT device_id, sort_order, value, label, true
FROM options
ON CONFLICT (device, sort) DO NOTHING;

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
  'device_passports',
  'read',
  'id,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,created_at,updated_at',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'device_passports',
  'create',
  'device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',
  NULL,
  '{"device":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'device_passports',
  'update',
  'repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'trade_options',
  'read',
  'id,device,value,label,sort,is_active,created_at,updated_at',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'trade_options',
  'create',
  'device,is_active,sort,label,value',
  NULL,
  '{"device":{"_nnull":true},"label":{"_nnull":true}}'::json,
  '{"is_active":true,"sort":100}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'trade_options',
  'update',
  'is_active,sort,label,value',
  NULL,
  '{"label":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Editor', 'trade_options', 'delete', 'id,device,label', NULL);

SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'device_passports',
  'read',
  'id,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,created_at,updated_at',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'device_passports',
  'create',
  'device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'device_passports',
  'update',
  'device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'trade_options',
  'read',
  'id,device,value,label,sort,is_active,created_at,updated_at',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'trade_options',
  'create',
  'device,value,label,sort,is_active',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'trade_options',
  'update',
  'device,value,label,sort,is_active',
  NULL
);
SELECT isvoi_upsert_permission('ISVOI Importer', 'trade_options', 'delete', 'id,device,label', NULL);

SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'device_passports',
  'read',
  'id,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,created_at,updated_at',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'device_passports',
  'create',
  'device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'device_passports',
  'update',
  'device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'trade_options',
  'read',
  'id,device,value,label,sort,is_active,created_at,updated_at',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'trade_options',
  'create',
  'device,value,label,sort,is_active',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'trade_options',
  'update',
  'device,value,label,sort,is_active',
  NULL
);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'trade_options', 'delete', 'id,device,label', NULL);

SELECT isvoi_upsert_permission(
  'ISVOI Public Read',
  'device_passports',
  'read',
  'id,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,updated_at',
  '{"_and":[{"device":{"status":{"_eq":"published"}}},{"device":{"stock_status":{"_neq":"hidden"}}},{"device":{"content_status":{"_eq":"ready"}}}]}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Public Read',
  'trade_options',
  'read',
  'id,device,value,label,sort,is_active,updated_at',
  '{"_and":[{"is_active":{"_eq":true}},{"device":{"status":{"_eq":"published"}}},{"device":{"stock_status":{"_neq":"hidden"}}},{"device":{"content_status":{"_eq":"ready"}}}]}'::json
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

SELECT isvoi_upsert_preset('ISVOI Editor', 'device_passports', 'Все паспорта', 'verified_user', '#dc2626', NULL, '{"tabular":{"sort":["device"],"fields":["device","condition_grade_text","repair","water","story_title","warranty_duration","exit_headline"],"page":1}}'::json);
SELECT isvoi_upsert_preset('ISVOI Editor', 'trade_options', 'Активные Trade варианты', 'sync_alt', '#7c3aed', '{"is_active":{"_eq":true}}'::json, '{"tabular":{"sort":["device","sort"],"fields":["device","is_active","sort","label","value"],"page":1}}'::json);

DROP FUNCTION isvoi_upsert_preset(text, varchar, varchar, varchar, varchar, json, json);

SELECT 'catalog_structured.passports' AS check_name, count(*)::text AS value
FROM device_passports
UNION ALL
SELECT 'catalog_structured.trade_options', count(*)::text
FROM trade_options
UNION ALL
SELECT 'catalog_structured.device_relations', count(*)::text
FROM directus_relations
WHERE (many_collection = 'device_passports' AND many_field = 'device' AND one_field = 'passport_record')
   OR (many_collection = 'trade_options' AND many_field = 'device' AND one_field = 'trade_options')
UNION ALL
SELECT 'catalog_structured.public_permissions', count(*)::text
FROM directus_permissions
WHERE collection IN ('device_passports', 'trade_options')
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Public Read')
UNION ALL
SELECT 'catalog_structured.editor_permissions', count(*)::text
FROM directus_permissions
WHERE collection IN ('device_passports', 'trade_options')
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor');

COMMIT;
`);
