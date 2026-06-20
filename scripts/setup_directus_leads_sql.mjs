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
  assigned_to uuid,
  contact_channel varchar(32),
  next_action_at timestamptz,
  last_contacted_at timestamptz,
  manager_note text,
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
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_channel varchar(32);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS manager_note text;
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

CREATE TABLE IF NOT EXISTS lead_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  comment text NOT NULL,
  outcome varchar(32),
  next_action_at timestamptz
);

ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS outcome varchar(32);
ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

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

DROP TRIGGER IF EXISTS lead_comments_touch_updated_at ON lead_comments;
CREATE TRIGGER lead_comments_touch_updated_at
BEFORE UPDATE ON lead_comments
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_assigned_to_fkey'
  ) THEN
    ALTER TABLE leads
    ADD CONSTRAINT leads_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES directus_users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_comments_lead_fkey'
  ) THEN
    ALTER TABLE lead_comments
    ADD CONSTRAINT lead_comments_lead_fkey
    FOREIGN KEY (lead) REFERENCES leads(id)
    ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_comments_created_by_fkey'
  ) THEN
    ALTER TABLE lead_comments
    ADD CONSTRAINT lead_comments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES directus_users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_kind_idx ON leads (kind);
CREATE INDEX IF NOT EXISTS leads_priority_idx ON leads (priority);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS leads_next_action_at_idx ON leads (next_action_at);
CREATE INDEX IF NOT EXISTS leads_device_id_idx ON leads (device_id);
CREATE INDEX IF NOT EXISTS leads_source_path_idx ON leads (source_path);
CREATE INDEX IF NOT EXISTS lead_comments_lead_idx ON lead_comments (lead, created_at DESC);

CREATE OR REPLACE FUNCTION isvoi_upsert_collection_metadata(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_archive_field varchar DEFAULT NULL,
  p_archive_value varchar DEFAULT NULL,
  p_unarchive_value varchar DEFAULT NULL,
  p_sort integer DEFAULT NULL,
  p_color varchar DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_collections WHERE collection = p_collection
  ) THEN
    UPDATE directus_collections
    SET icon = p_icon,
      note = p_note,
      display_template = p_display_template,
      hidden = false,
      singleton = false,
      archive_field = p_archive_field,
      archive_value = p_archive_value,
      unarchive_value = p_unarchive_value,
      accountability = COALESCE(accountability, 'all'),
      sort = COALESCE(p_sort, sort),
      color = p_color
    WHERE collection = p_collection;
  ELSE
    INSERT INTO directus_collections (
      collection, icon, note, display_template, hidden, singleton,
      archive_field, archive_value, unarchive_value, accountability, sort, color
    ) VALUES (
      p_collection, p_icon, p_note, p_display_template, false, false,
      p_archive_field, p_archive_value, p_unarchive_value, 'all', p_sort, p_color
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_collection_metadata(
  'leads',
  'mark_email_unread',
  'Заявки с сайта: подбор, покупка, Trade, Upgrade, Club. Публичный сайт только создает заявки; менеджеры обрабатывают их в Studio.',
  '{{status}} · {{contact}} · {{device}}',
  'status',
  'archived',
  'new',
  30,
  '#0071e3'
);

SELECT isvoi_upsert_collection_metadata(
  'lead_comments',
  'mode_comment',
  'История рабочих комментариев по заявкам. Используйте для фиксации звонков, договоренностей и следующего шага.',
  '{{lead.contact}} · {{outcome}} · {{created_at}}',
  NULL,
  NULL,
  NULL,
  31,
  '#6366f1'
);

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
  p_validation json DEFAULT NULL,
  p_validation_message text DEFAULT NULL,
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
      validation = p_validation,
      validation_message = p_validation_message,
      hidden = p_hidden
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, interface, display, options, width, sort, note,
      readonly, special, "group", required, validation, validation_message, hidden
    ) VALUES (
      p_collection, p_field, p_interface, p_display, p_options, p_width, p_sort, p_note,
      p_readonly, p_special, p_group, p_required, p_validation, p_validation_message, p_hidden
    );
  END IF;
END;
$$;

-- Lead Studio groups.
SELECT isvoi_upsert_directus_field('leads', 'group_processing', 'group-detail', NULL, '{"headerIcon":"fact_check","start":"open"}'::json, 'full', 1, 'Статус, ответственный и следующий шаг.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('leads', 'group_contact', 'group-detail', NULL, '{"headerIcon":"contact_phone","start":"open"}'::json, 'full', 20, 'Контакт клиента и смысл обращения.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('leads', 'group_device', 'group-detail', NULL, '{"headerIcon":"devices"}'::json, 'full', 50, 'Привязка к устройству и карточке каталога.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('leads', 'group_source', 'group-detail', NULL, '{"headerIcon":"travel_explore"}'::json, 'full', 70, 'Источник заявки, страница и UTM.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('leads', 'group_system', 'group-detail', NULL, '{"headerIcon":"settings"}'::json, 'full', 100, 'Системные поля и аудит.', false, 'alias,no-data,group');

-- Leads: processing table fields first.
SELECT isvoi_upsert_directus_field('leads', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Новая","value":"new","color":"#0071e3"},{"text":"В работе","value":"in_progress","color":"#f59e0b"},{"text":"Ждем клиента","value":"waiting_client","color":"#8b5cf6"},{"text":"Связались","value":"contacted","color":"#10b981"},{"text":"Сделка","value":"won","color":"#16a34a"},{"text":"Потеряна","value":"lost","color":"#ef4444"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 2, 'Этап обработки заявки. Архивируйте только после финального решения.', false, NULL, 'group_processing', true);
SELECT isvoi_upsert_directus_field('leads', 'priority', 'select-dropdown', 'labels', '{"choices":[{"text":"Обычная","value":"normal","color":"#6b7280"},{"text":"Срочная","value":"high","color":"#ef4444"}]}'::json, 'half', 3, 'Приоритет обработки.', false, NULL, 'group_processing', true);
SELECT isvoi_upsert_directus_field('leads', 'assigned_to', 'select-dropdown-m2o', 'related-values', '{"template":"{{first_name}} {{last_name}} · {{email}}"}'::json, 'half', 4, 'Ответственный менеджер.', false, 'm2o', 'group_processing');
SELECT isvoi_upsert_directus_field('leads', 'next_action_at', 'datetime', 'datetime', NULL, 'half', 5, 'Когда нужно вернуться к заявке.', false, NULL, 'group_processing');
SELECT isvoi_upsert_directus_field('leads', 'last_contacted_at', 'datetime', 'datetime', NULL, 'half', 6, 'Когда последний раз связывались с клиентом.', false, NULL, 'group_processing');
SELECT isvoi_upsert_directus_field('leads', 'manager_note', 'input-multiline', NULL, NULL, 'full', 7, 'Короткая текущая заметка менеджера. Историю звонков ведите в комментариях ниже.', false, NULL, 'group_processing');
SELECT isvoi_upsert_directus_field('leads', 'comments', 'list-o2m', NULL, '{"template":"{{outcome}} · {{comment}}","enableCreate":true,"enableSelect":false}'::json, 'full', 8, 'История рабочих комментариев по заявке.', false, 'o2m', 'group_processing');

-- Leads: customer/contact.
SELECT isvoi_upsert_directus_field('leads', 'kind', 'select-dropdown', 'labels', '{"choices":[{"text":"Подбор","value":"selection"},{"text":"Покупка/бронь","value":"purchase"},{"text":"Trade","value":"trade"},{"text":"Upgrade","value":"upgrade"},{"text":"Club","value":"club"},{"text":"Поддержка","value":"support"}]}'::json, 'half', 21, 'Тип обращения.', false, NULL, 'group_contact', true);
SELECT isvoi_upsert_directus_field('leads', 'contact_channel', 'select-dropdown', 'labels', '{"choices":[{"text":"Не указан","value":"unknown","color":"#6b7280"},{"text":"Телефон","value":"phone","color":"#0071e3"},{"text":"Telegram","value":"telegram","color":"#24a1de"},{"text":"WhatsApp","value":"whatsapp","color":"#22c55e"},{"text":"Email","value":"email","color":"#6366f1"}]}'::json, 'half', 22, 'Предпочтительный канал связи, если понятен из контакта или выбран менеджером.', false, NULL, 'group_contact');
SELECT isvoi_upsert_directus_field('leads', 'contact', 'input', NULL, NULL, 'full', 23, 'Телефон, Telegram или email. Главное обязательное поле заявки.', false, NULL, 'group_contact', true);
SELECT isvoi_upsert_directus_field('leads', 'name', 'input', NULL, NULL, 'half', 24, 'Имя, если указано.', false, NULL, 'group_contact');
SELECT isvoi_upsert_directus_field('leads', 'scenario', 'input', NULL, NULL, 'half', 25, 'Сценарий, выбранный пользователем.', false, NULL, 'group_contact');
SELECT isvoi_upsert_directus_field('leads', 'message', 'input-multiline', NULL, NULL, 'full', 26, 'Комментарий пользователя и технические уточнения формы.', false, NULL, 'group_contact');

-- Leads: device relation.
SELECT isvoi_upsert_directus_field('leads', 'device_id', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}} · {{stock_status}}"}'::json, 'half', 51, 'Связанная карточка устройства. По ней можно быстро открыть товар.', false, 'm2o', 'group_device');
SELECT isvoi_upsert_directus_field('leads', 'device', 'input', NULL, NULL, 'half', 52, 'Текстовое название устройства на момент отправки формы.', false, NULL, 'group_device');

-- Leads: source/analytics.
SELECT isvoi_upsert_directus_field('leads', 'source_path', 'input', NULL, NULL, 'half', 71, 'Путь страницы, где создана заявка.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'source_url', 'input', NULL, NULL, 'full', 72, 'Полный URL страницы.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'page_title', 'input', NULL, NULL, 'half', 73, 'Title страницы.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'referrer', 'input', NULL, NULL, 'half', 74, 'Referrer браузера.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'utm_source', 'input', NULL, NULL, 'half', 75, 'UTM source.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'utm_medium', 'input', NULL, NULL, 'half', 76, 'UTM medium.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'utm_campaign', 'input', NULL, NULL, 'half', 77, 'UTM campaign.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'utm_content', 'input', NULL, NULL, 'half', 78, 'UTM content.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'utm_term', 'input', NULL, NULL, 'half', 79, 'UTM term.', false, NULL, 'group_source');
SELECT isvoi_upsert_directus_field('leads', 'source', 'input', NULL, NULL, 'half', 80, 'Legacy source alias. Новые формы пишут source_path/source_url.', false, NULL, 'group_source');

-- Leads: system.
SELECT isvoi_upsert_directus_field('leads', 'id', 'input', NULL, NULL, 'half', 101, 'ID заявки.', true, 'uuid', 'group_system');
SELECT isvoi_upsert_directus_field('leads', 'created_at', 'datetime', 'datetime', NULL, 'half', 102, 'Когда заявка создана.', true, 'date-created', 'group_system');
SELECT isvoi_upsert_directus_field('leads', 'updated_at', 'datetime', 'datetime', NULL, 'half', 103, 'Когда заявка обновлена.', true, 'date-updated', 'group_system');
SELECT isvoi_upsert_directus_field('leads', 'user_agent', 'input-multiline', NULL, NULL, 'full', 104, 'User-Agent запроса.', true, NULL, 'group_system');

-- Lead comments.
SELECT isvoi_upsert_directus_field('lead_comments', 'id', 'input', NULL, NULL, 'half', 1, 'ID комментария.', true, 'uuid');
SELECT isvoi_upsert_directus_field('lead_comments', 'lead', 'select-dropdown-m2o', 'related-values', '{"template":"{{contact}} · {{status}} · {{device}}"}'::json, 'half', 2, 'Заявка.', false, 'm2o', NULL, true);
SELECT isvoi_upsert_directus_field('lead_comments', 'created_at', 'datetime', 'datetime', NULL, 'half', 3, 'Когда комментарий создан.', true, 'date-created');
SELECT isvoi_upsert_directus_field('lead_comments', 'updated_at', 'datetime', 'datetime', NULL, 'half', 4, 'Когда комментарий обновлен.', true, 'date-updated');
SELECT isvoi_upsert_directus_field('lead_comments', 'created_by', 'select-dropdown-m2o', 'related-values', '{"template":"{{first_name}} {{last_name}} · {{email}}"}'::json, 'half', 5, 'Автор комментария.', false, 'm2o');
SELECT isvoi_upsert_directus_field('lead_comments', 'outcome', 'select-dropdown', 'labels', '{"choices":[{"text":"Звонок","value":"call","color":"#0071e3"},{"text":"Сообщение","value":"message","color":"#24a1de"},{"text":"Договоренность","value":"agreement","color":"#10b981"},{"text":"Напоминание","value":"follow_up","color":"#f59e0b"},{"text":"Проблема","value":"issue","color":"#ef4444"}]}'::json, 'half', 6, 'Тип события.', false, NULL);
SELECT isvoi_upsert_directus_field('lead_comments', 'next_action_at', 'datetime', 'datetime', NULL, 'half', 7, 'Следующий шаг по этому комментарию.', false, NULL);
SELECT isvoi_upsert_directus_field('lead_comments', 'comment', 'input-multiline', NULL, NULL, 'full', 8, 'Рабочий комментарий менеджера.', false, NULL, NULL, true);

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar, varchar, boolean, json, text, boolean);

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

SELECT isvoi_upsert_relation('leads', 'device_id', 'devices', NULL, 'nullify');
SELECT isvoi_upsert_relation('leads', 'assigned_to', 'directus_users', NULL, 'nullify');
SELECT isvoi_upsert_relation('lead_comments', 'lead', 'leads', 'comments', 'delete');
SELECT isvoi_upsert_relation('lead_comments', 'created_by', 'directus_users', NULL, 'nullify');

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
  'ISVOI Lead Intake',
  'leads',
  'create',
  'kind,status,priority,contact_channel,name,contact,device,device_id,scenario,message,source,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,user_agent',
  NULL,
  '{"contact":{"_nnull":true},"status":{"_eq":"new"},"priority":{"_in":["normal","high"]},"kind":{"_in":["selection","purchase","trade","upgrade","club","support"]},"contact_channel":{"_in":["unknown","phone","telegram","whatsapp","email"]}}'::json,
  '{"status":"new","priority":"normal"}'::json
);

SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'leads',
  'read',
  '*',
  NULL
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'leads',
  'update',
  'status,priority,assigned_to,contact_channel,next_action_at,last_contacted_at,manager_note,kind,scenario,name,contact,device,device_id,message,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term',
  NULL,
  '{"status":{"_in":["new","in_progress","waiting_client","contacted","won","lost","archived"]},"priority":{"_in":["normal","high"]}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Editor', 'lead_comments', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'lead_comments',
  'create',
  'lead,created_by,comment,outcome,next_action_at',
  NULL,
  '{"lead":{"_nnull":true},"comment":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'lead_comments',
  'update',
  'created_by,comment,outcome,next_action_at',
  NULL,
  '{"comment":{"_nnull":true}}'::json
);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);

CREATE OR REPLACE FUNCTION isvoi_upsert_leads_preset()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_role uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name = 'ISVOI Editor' LIMIT 1;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_presets
    WHERE role = v_role AND collection = 'leads' AND bookmark = 'Обработка заявок'
  ) THEN
    UPDATE directus_presets
    SET layout = 'tabular',
      layout_query = '{"tabular":{"fields":["created_at","status","priority","assigned_to","next_action_at","kind","contact","device_id","source_path"],"sort":["-created_at"]}}'::json,
      layout_options = '{"tabular":{"spacing":"comfortable","widths":{"created_at":170,"status":140,"priority":120,"assigned_to":180,"next_action_at":170,"kind":130,"contact":220,"device_id":220,"source_path":220}}}'::json,
      filter = '{"status":{"_nin":["archived"]}}'::json,
      icon = 'fact_check',
      color = '#0071e3',
      refresh_interval = 60
    WHERE role = v_role AND collection = 'leads' AND bookmark = 'Обработка заявок';
  ELSE
    INSERT INTO directus_presets (
      bookmark, role, collection, layout, layout_query, layout_options,
      filter, icon, color, refresh_interval
    ) VALUES (
      'Обработка заявок',
      v_role,
      'leads',
      'tabular',
      '{"tabular":{"fields":["created_at","status","priority","assigned_to","next_action_at","kind","contact","device_id","source_path"],"sort":["-created_at"]}}'::json,
      '{"tabular":{"spacing":"comfortable","widths":{"created_at":170,"status":140,"priority":120,"assigned_to":180,"next_action_at":170,"kind":130,"contact":220,"device_id":220,"source_path":220}}}'::json,
      '{"status":{"_nin":["archived"]}}'::json,
      'fact_check',
      '#0071e3',
      60
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_leads_preset();
DROP FUNCTION isvoi_upsert_leads_preset();
DROP FUNCTION isvoi_upsert_collection_metadata(varchar, varchar, text, varchar, varchar, varchar, varchar, integer, varchar);

COMMIT;

SELECT 'leads_columns' AS check_name, count(*)::text AS value
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads'
UNION ALL
SELECT 'lead_comments_columns', count(*)::text
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'lead_comments'
UNION ALL
SELECT 'lead_relations', count(*)::text
FROM directus_relations
WHERE (many_collection = 'leads' AND many_field IN ('device_id', 'assigned_to'))
  OR (many_collection = 'lead_comments' AND many_field IN ('lead', 'created_by'))
UNION ALL
SELECT 'lead_editor_permissions', count(*)::text
FROM directus_permissions
WHERE collection IN ('leads', 'lead_comments')
  AND policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'lead_editor_presets', count(*)::text
FROM directus_presets
WHERE collection = 'leads'
  AND bookmark = 'Обработка заявок';
`);
