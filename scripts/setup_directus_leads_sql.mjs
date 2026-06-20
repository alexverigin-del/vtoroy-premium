#!/usr/bin/env node

/**
 * Print idempotent SQL that prepares the Directus leads workflow.
 *
 * Usage:
 *   node scripts/setup_directus_leads_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  kind varchar(64),
  status varchar(32) NOT NULL DEFAULT 'new',
  priority varchar(16) NOT NULL DEFAULT 'normal',
  name varchar(160),
  contact varchar(255) NOT NULL,
  device varchar(255),
  device_id varchar(255),
  scenario varchar(160),
  message text,
  source varchar(255),
  source_path varchar(255),
  source_url text,
  page_title varchar(255),
  referrer text,
  utm_source varchar(128),
  utm_medium varchar(128),
  utm_campaign varchar(128),
  utm_content varchar(128),
  utm_term varchar(128),
  user_agent text
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS device_id varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS scenario varchar(160);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_path varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS page_title varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source varchar(128);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium varchar(128);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign varchar(128);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content varchar(128);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term varchar(128);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_agent text;

UPDATE leads SET source_path = source WHERE source_path IS NULL AND source IS NOT NULL;
UPDATE leads
SET scenario = trim(replace(split_part(message, E'\n', 1), 'Сценарий:', ''))
WHERE scenario IS NULL
  AND message LIKE 'Сценарий:%';

CREATE OR REPLACE FUNCTION isvoi_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_touch_updated_at ON leads;
CREATE TRIGGER leads_touch_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION isvoi_touch_updated_at();

DO $$
BEGIN
  IF to_regclass('public.devices') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'leads_device_id_fkey'
    ) THEN
      ALTER TABLE leads
      ADD CONSTRAINT leads_device_id_fkey
      FOREIGN KEY (device_id) REFERENCES devices(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_kind_idx ON leads (kind);
CREATE INDEX IF NOT EXISTS leads_device_id_idx ON leads (device_id);
CREATE INDEX IF NOT EXISTS leads_source_path_idx ON leads (source_path);

INSERT INTO directus_collections (
  collection, icon, note, display_template, archive_field, archive_value,
  unarchive_value, accountability, sort, color
) VALUES (
  'leads',
  'mark_email_unread',
  'Заявки с сайта: подбор, покупка, Trade, Club. Публичный сайт пишет только через Next API.',
  '{{kind}} · {{contact}} · {{device}}',
  'status',
  'archived',
  'new',
  'all',
  30,
  '#0071e3'
) ON CONFLICT (collection) DO UPDATE SET
  icon = EXCLUDED.icon,
  note = EXCLUDED.note,
  display_template = EXCLUDED.display_template,
  archive_field = EXCLUDED.archive_field,
  archive_value = EXCLUDED.archive_value,
  unarchive_value = EXCLUDED.unarchive_value,
  accountability = EXCLUDED.accountability,
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
  p_special varchar DEFAULT NULL
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
        special = p_special
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, interface, display, options, width, sort, note, readonly, special
    ) VALUES (
      p_collection, p_field, p_interface, p_display, p_options, p_width, p_sort, p_note, p_readonly, p_special
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_directus_field('leads', 'id', 'input', NULL, NULL, 'half', 1, 'ID заявки.', true, 'uuid');
SELECT isvoi_upsert_directus_field('leads', 'created_at', 'datetime', 'datetime', NULL, 'half', 2, 'Когда заявка создана.', true, 'date-created');
SELECT isvoi_upsert_directus_field('leads', 'updated_at', 'datetime', 'datetime', NULL, 'half', 3, 'Когда заявка обновлена.', true, 'date-updated');
SELECT isvoi_upsert_directus_field('leads', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Новая","value":"new","color":"#0071e3"},{"text":"В работе","value":"in_progress","color":"#f59e0b"},{"text":"Связались","value":"contacted","color":"#10b981"},{"text":"Сделка","value":"won","color":"#16a34a"},{"text":"Потеряна","value":"lost","color":"#ef4444"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 4, 'Этап обработки заявки.');
SELECT isvoi_upsert_directus_field('leads', 'priority', 'select-dropdown', 'labels', '{"choices":[{"text":"Обычная","value":"normal","color":"#6b7280"},{"text":"Срочная","value":"high","color":"#ef4444"}]}'::json, 'half', 5, 'Приоритет обработки.');
SELECT isvoi_upsert_directus_field('leads', 'kind', 'select-dropdown', 'labels', '{"choices":[{"text":"Подбор","value":"selection"},{"text":"Покупка/бронь","value":"purchase"},{"text":"Trade","value":"trade"},{"text":"Upgrade","value":"upgrade"},{"text":"Club","value":"club"},{"text":"Поддержка","value":"support"}]}'::json, 'half', 6, 'Тип обращения.');
SELECT isvoi_upsert_directus_field('leads', 'scenario', 'input', NULL, NULL, 'half', 7, 'Сценарий, выбранный пользователем.');
SELECT isvoi_upsert_directus_field('leads', 'contact', 'input', NULL, NULL, 'full', 8, 'Телефон, Telegram или email.');
SELECT isvoi_upsert_directus_field('leads', 'name', 'input', NULL, NULL, 'half', 9, 'Имя, если указано.');
SELECT isvoi_upsert_directus_field('leads', 'device', 'input', NULL, NULL, 'half', 10, 'Текстовое название интересующей вещи.');
SELECT isvoi_upsert_directus_field('leads', 'device_id', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}}"}'::json, 'half', 11, 'Связанная карточка устройства.', false, 'm2o');
SELECT isvoi_upsert_directus_field('leads', 'message', 'input-multiline', NULL, NULL, 'full', 12, 'Комментарий пользователя.');
SELECT isvoi_upsert_directus_field('leads', 'source_path', 'input', NULL, NULL, 'half', 13, 'Путь страницы, где создана заявка.');
SELECT isvoi_upsert_directus_field('leads', 'source_url', 'input', NULL, NULL, 'full', 14, 'Полный URL страницы.');
SELECT isvoi_upsert_directus_field('leads', 'page_title', 'input', NULL, NULL, 'half', 15, 'Title страницы.');
SELECT isvoi_upsert_directus_field('leads', 'referrer', 'input', NULL, NULL, 'half', 16, 'Referrer браузера.');
SELECT isvoi_upsert_directus_field('leads', 'utm_source', 'input', NULL, NULL, 'half', 17, 'UTM source.');
SELECT isvoi_upsert_directus_field('leads', 'utm_medium', 'input', NULL, NULL, 'half', 18, 'UTM medium.');
SELECT isvoi_upsert_directus_field('leads', 'utm_campaign', 'input', NULL, NULL, 'half', 19, 'UTM campaign.');
SELECT isvoi_upsert_directus_field('leads', 'utm_content', 'input', NULL, NULL, 'half', 20, 'UTM content.');
SELECT isvoi_upsert_directus_field('leads', 'utm_term', 'input', NULL, NULL, 'half', 21, 'UTM term.');
SELECT isvoi_upsert_directus_field('leads', 'source', 'input', NULL, NULL, 'half', 22, 'Legacy source alias.');
SELECT isvoi_upsert_directus_field('leads', 'user_agent', 'input-multiline', NULL, NULL, 'full', 23, 'User-Agent запроса.', true);

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar);

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'leads', 'device_id', 'devices', NULL, 'nullify'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'leads' AND many_field = 'device_id'
);

UPDATE directus_permissions
SET fields = 'kind,status,priority,name,contact,device,device_id,scenario,message,source,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,user_agent'
WHERE collection = 'leads'
  AND action = 'create';

COMMIT;

SELECT 'leads_columns' AS check_name, count(*)::text AS value
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads';
`);
