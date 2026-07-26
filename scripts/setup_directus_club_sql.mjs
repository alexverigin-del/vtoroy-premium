#!/usr/bin/env node
/**
 * Print idempotent SQL that prepares the ISVOI Club pilot model.
 *
 * Usage:
 *   node scripts/setup_directus_club_sql.mjs > /tmp/isvoi_setup_directus_club.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_club.sql
 */

process.stdout.write(String.raw`
BEGIN;

SET client_encoding = 'UTF8';
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS club_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  slug varchar(120) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  badge varchar(120),
  summary text NOT NULL DEFAULT '',
  min_term_months integer,
  monthly_note varchar(255),
  features json NOT NULL DEFAULT '[]'::json,
  is_featured boolean NOT NULL DEFAULT false,
  is_future boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_plans_status_check CHECK (status IN ('draft','published','archived'))
);

CREATE TABLE IF NOT EXISTS club_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  offer_status varchar(32) NOT NULL DEFAULT 'waitlist',
  product varchar(255) NOT NULL,
  plan uuid NOT NULL,
  term_months integer,
  monthly_from integer,
  terms_text text,
  badge varchar(120),
  cta_label varchar(160),
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_offers_status_check CHECK (status IN ('draft','published','archived')),
  CONSTRAINT club_offers_offer_status_check CHECK (offer_status IN ('draft','approved','waitlist','paused','archived'))
);

CREATE TABLE IF NOT EXISTS club_rule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  category varchar(80) NOT NULL DEFAULT 'service',
  title varchar(200) NOT NULL,
  body text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_rule_items_status_check CHECK (status IN ('draft','published','archived'))
);

CREATE TABLE IF NOT EXISTS club_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key varchar(32) NOT NULL DEFAULT 'club' UNIQUE,
  hero_disclaimer text NOT NULL DEFAULT 'Club — аренда/подписка. Устройство остаётся собственностью I СВОИ до выкупа.',
  offers_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · устройства',
  offers_title varchar(255) NOT NULL DEFAULT 'Доступные устройства Club.',
  offers_empty_title varchar(255) NOT NULL DEFAULT 'Публичная витрина Club готовится.',
  offers_empty_body text NOT NULL DEFAULT 'Оставьте заявку: менеджер подберёт устройство, срок и тариф вручную.',
  monthly_fallback varchar(160) NOT NULL DEFAULT 'Расчёт по заявке',
  offer_cta_label varchar(160) NOT NULL DEFAULT 'Получить расчёт Club',
  plans_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · тарифы',
  plans_title varchar(255) NOT NULL DEFAULT 'Тарифы отличаются уровнем сопровождения.',
  rules_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · правила',
  rules_title varchar(255) NOT NULL DEFAULT 'Правила фиксируют нормальный износ, возврат и выкуп.',
  form_title varchar(255) NOT NULL DEFAULT 'Заявка на расчёт Club',
  form_scenario varchar(160) NOT NULL DEFAULT 'Получить расчёт Club',
  form_contact_label varchar(120) NOT NULL DEFAULT 'Контакт',
  form_contact_placeholder varchar(160) NOT NULL DEFAULT 'Телефон или Telegram',
  form_budget_label varchar(160) NOT NULL DEFAULT 'Комфортный ежемесячный платёж',
  form_budget_placeholder varchar(160) NOT NULL DEFAULT 'Например, до 5 000 ₽ в месяц',
  form_term_label varchar(120) NOT NULL DEFAULT 'Срок',
  form_message_label varchar(120) NOT NULL DEFAULT 'Комментарий',
  form_message_placeholder text NOT NULL DEFAULT 'Какая модель нужна, какой срок удобен, что важно учесть?',
  form_submit_label varchar(160) NOT NULL DEFAULT 'Отправить заявку',
  form_submitting_label varchar(160) NOT NULL DEFAULT 'Отправляем...',
  form_idle_note text NOT NULL DEFAULT 'Ответим и вручную посчитаем условия пилота.',
  form_success_note text NOT NULL DEFAULT 'Заявка принята. Мы свяжемся и подготовим расчёт Club.',
  form_error_note text NOT NULL DEFAULT 'Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.',
  form_consent_note text NOT NULL DEFAULT 'Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_offer uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_plan uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_term_months integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_budget_text varchar(160);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='club_offers_product_fkey') THEN
    ALTER TABLE club_offers ADD CONSTRAINT club_offers_product_fkey
      FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='club_offers_plan_fkey') THEN
    ALTER TABLE club_offers ADD CONSTRAINT club_offers_plan_fkey
      FOREIGN KEY (plan) REFERENCES club_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_club_offer_fkey') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_club_offer_fkey
      FOREIGN KEY (club_offer) REFERENCES club_offers(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_club_plan_fkey') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_club_plan_fkey
      FOREIGN KEY (club_plan) REFERENCES club_plans(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS club_plans_status_sort_idx ON club_plans(status, sort);
CREATE INDEX IF NOT EXISTS club_offers_status_sort_idx ON club_offers(status, offer_status, sort);
CREATE INDEX IF NOT EXISTS club_offers_product_idx ON club_offers(product);
CREATE INDEX IF NOT EXISTS club_offers_plan_idx ON club_offers(plan);
CREATE INDEX IF NOT EXISTS club_rule_items_status_sort_idx ON club_rule_items(status, sort);
CREATE INDEX IF NOT EXISTS leads_club_offer_idx ON leads(club_offer);
CREATE INDEX IF NOT EXISTS leads_club_plan_idx ON leads(club_plan);

INSERT INTO club_plans (slug,status,name,badge,summary,min_term_months,monthly_note,features,is_featured,is_future,sort)
VALUES
  ('base','published','Base','Пилот','Базовая модель Club: устройство, стартовый Passport и понятный сценарий в конце срока.',6,'Расчёт зависит от устройства и срока.','["Устройство из проверенного круга","Passport передачи и возврата","Продлить, сменить, выкупить или вернуть"]'::json,true,false,10),
  ('care','published','Care','С сопровождением','Больше сопровождения и спокойнее правила по сервисным вопросам в рамках пилота.',6,'Финальные условия подтверждаются вручную.','["Всё из Base","Приоритетный разбор сервисных вопросов","Более подробная фиксация состояния"]'::json,true,false,20),
  ('flex','published','Flex','Будущий формат','Гибкий формат смены устройства находится в подготовке и доступен как лист ожидания.',6,'Публичные условия появятся позже.','["Лист ожидания","Индивидуальный расчёт","Без публичного CTA до утверждения правил"]'::json,false,true,30)
ON CONFLICT (slug) DO UPDATE SET
  status=EXCLUDED.status,
  name=EXCLUDED.name,
  badge=EXCLUDED.badge,
  summary=EXCLUDED.summary,
  min_term_months=EXCLUDED.min_term_months,
  monthly_note=EXCLUDED.monthly_note,
  features=EXCLUDED.features,
  is_featured=EXCLUDED.is_featured,
  is_future=EXCLUDED.is_future,
  sort=EXCLUDED.sort,
  updated_at=now();

INSERT INTO club_rule_items (status,category,title,body,sort)
SELECT status,category,title,body,sort
FROM (VALUES
  ('published','wear','Нормальный износ','Небольшие следы аккуратного использования допустимы и фиксируются через Passport возврата.',10),
  ('published','damage','Повреждения','Сильные повреждения, влага, неработающие функции и скрытые блокировки разбираются отдельно после диагностики.',20),
  ('published','return','Возврат','Перед возвратом устройство очищается от данных, Apple ID и блокировок, затем проходит повторную проверку.',30),
  ('published','buyout','Выкуп','Выкуп возможен после согласования остаточной стоимости и финальной проверки состояния.',40),
  ('published','data','Данные и Apple ID','Личные данные удаляются владельцем до передачи; устройство не должно оставаться привязанным к Apple ID.',50)
) seed(status,category,title,body,sort)
WHERE NOT EXISTS (SELECT 1 FROM club_rule_items existing WHERE existing.title=seed.title);

INSERT INTO club_page_settings (singleton_key)
VALUES ('club')
ON CONFLICT (singleton_key) DO NOTHING;

CREATE OR REPLACE FUNCTION isvoi_club_upsert_collection(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_singleton boolean DEFAULT false,
  p_sort integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_collections WHERE collection=p_collection) THEN
    UPDATE directus_collections
    SET icon=p_icon, note=p_note, display_template=p_display_template,
      hidden=false, singleton=p_singleton, sort=COALESCE(p_sort, sort), accountability=COALESCE(accountability,'all')
    WHERE collection=p_collection;
  ELSE
    INSERT INTO directus_collections(collection,icon,note,display_template,hidden,singleton,sort,accountability)
    VALUES (p_collection,p_icon,p_note,p_display_template,false,p_singleton,p_sort,'all');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_club_upsert_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_special varchar DEFAULT NULL,
  p_group varchar DEFAULT NULL,
  p_required boolean DEFAULT false,
  p_readonly boolean DEFAULT false,
  p_hidden boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields
    SET interface=p_interface, display=p_display, options=p_options, width=p_width,
      sort=p_sort, note=p_note, special=p_special, "group"=p_group,
      required=p_required, readonly=p_readonly, hidden=p_hidden
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,"group",required,readonly,hidden)
    VALUES (p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,p_group,p_required,p_readonly,p_hidden);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_club_upsert_relation(
  p_many_collection varchar,
  p_many_field varchar,
  p_one_collection varchar,
  p_one_field varchar DEFAULT NULL,
  p_action varchar DEFAULT 'nullify'
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many_collection AND many_field=p_many_field) THEN
    UPDATE directus_relations
    SET one_collection=p_one_collection, one_field=p_one_field, one_deselect_action=p_action
    WHERE many_collection=p_many_collection AND many_field=p_many_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES (p_many_collection,p_many_field,p_one_collection,p_one_field,p_action);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_club_upsert_permission(
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
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions
    SET fields=p_fields, permissions=p_permissions, validation=p_validation, presets=p_presets
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation,presets)
    VALUES (v_policy,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
  END IF;
END;
$$;

SELECT isvoi_club_upsert_collection('club_plans','view_timeline','Club tariffs: Base/Care/Flex pilot settings.','{{name}} · {{status}}',false,44);
SELECT isvoi_club_upsert_collection('club_offers','devices','Club offer rows linked to products and plans. Published approved offers are shown on club.isvoi.ru.','{{product}} · {{plan}} · {{offer_status}}',false,45);
SELECT isvoi_club_upsert_collection('club_rule_items','rule','Club rules for wear, damage, return, buyout and data cleanup.','{{category}} · {{title}}',false,46);
SELECT isvoi_club_upsert_collection('club_page_settings','tune','Singleton copy and labels for club.isvoi.ru.','Club page settings',true,43);

UPDATE directus_fields
SET options='{"choices":[{"text":"Шапка","value":"header","color":"#2563eb"},{"text":"Footer","value":"footer","color":"#0f766e"},{"text":"Mobile","value":"mobile","color":"#0891b2"},{"text":"Utility","value":"utility","color":"#6b7280"},{"text":"Club header","value":"club_header","color":"#0f766e"},{"text":"Club footer","value":"club_footer","color":"#047857"}]}'::json,
  note='Navigation area. Use club_header and club_footer only for club.isvoi.ru.'
WHERE collection='navigation_items' AND field='location';

SELECT isvoi_club_upsert_field('club_plans','status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Archived","value":"archived"}]}'::json,'half',1,'Publication status. Only published rows can appear on the public Club page.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_plans','slug','input','raw',NULL,'half',2,'Stable operator-friendly key, for example base, care, flex.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_plans','name','input','raw',NULL,'half',3,'Public plan name.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_plans','badge','input','raw',NULL,'half',4,'Short badge shown near the plan name.');
SELECT isvoi_club_upsert_field('club_plans','summary','input-multiline','raw',NULL,'full',5,'Short public explanation of the plan.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_plans','features','tags','formatted-json-value',NULL,'full',6,'Short feature list. Keep each line brief.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_plans','is_future','boolean','boolean',NULL,'half',7,'Use for future formats such as Flex. Future plans should not look like a ready purchase CTA.');
SELECT isvoi_club_upsert_field('club_plans','sort','input','raw',NULL,'half',8,'Sort order.');

SELECT isvoi_club_upsert_field('club_offers','status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Archived","value":"archived"}]}'::json,'half',1,'Publication status. Public page reads only published rows.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','offer_status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Approved","value":"approved"},{"text":"Waitlist","value":"waitlist"},{"text":"Paused","value":"paused"},{"text":"Archived","value":"archived"}]}'::json,'half',2,'Approved offers may show public monthly price. Waitlist offers use request wording.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','product','select-dropdown-m2o','related-values',NULL,'half',3,'Product from the commercial catalog used as the Club device.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','plan','select-dropdown-m2o','related-values',NULL,'half',4,'Club plan linked to this offer.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','term_months','input','raw',NULL,'half',5,'Minimum term in months.');
SELECT isvoi_club_upsert_field('club_offers','monthly_from','input','raw',NULL,'half',6,'Public monthly price in rubles. Leave empty to show request-only calculation.');
SELECT isvoi_club_upsert_field('club_offers','terms_text','input-multiline','raw',NULL,'full',7,'Short terms shown on the offer card.');
SELECT isvoi_club_upsert_field('club_offers','badge','input','raw',NULL,'half',8,'Optional offer badge.');
SELECT isvoi_club_upsert_field('club_offers','cta_label','input','raw',NULL,'half',9,'Optional CTA override. Default is from Club settings.');
SELECT isvoi_club_upsert_field('club_offers','sort','input','raw',NULL,'half',10,'Sort order.');

SELECT isvoi_club_upsert_field('club_rule_items','status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Archived","value":"archived"}]}'::json,'half',1,'Publication status.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','category','select-dropdown','labels', '{"choices":[{"text":"Normal wear","value":"wear"},{"text":"Damage","value":"damage"},{"text":"Return","value":"return"},{"text":"Buyout","value":"buyout"},{"text":"Data / Apple ID","value":"data"},{"text":"Service","value":"service"}]}'::json,'half',2,'Rule category.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','title','input','raw',NULL,'half',3,'Rule title.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','body','input-multiline','raw',NULL,'full',4,'Public rule explanation.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','sort','input','raw',NULL,'half',5,'Sort order.');

SELECT isvoi_club_upsert_field('leads','club_offer','select-dropdown-m2o','related-values',NULL,'half',80,'Club offer selected on club.isvoi.ru.',NULL,NULL,false,true);
SELECT isvoi_club_upsert_field('leads','club_plan','select-dropdown-m2o','related-values',NULL,'half',81,'Club plan selected on club.isvoi.ru.',NULL,NULL,false,true);
SELECT isvoi_club_upsert_field('leads','club_term_months','input','raw',NULL,'half',82,'Requested Club term in months.',NULL,NULL,false,true);
SELECT isvoi_club_upsert_field('leads','club_budget_text','input','raw',NULL,'half',83,'Comfortable monthly payment text entered by the visitor.',NULL,NULL,false,true);

SELECT isvoi_club_upsert_relation('club_offers','product','products',NULL,'delete');
SELECT isvoi_club_upsert_relation('club_offers','plan','club_plans',NULL,'restrict');
SELECT isvoi_club_upsert_relation('leads','club_offer','club_offers',NULL,'nullify');
SELECT isvoi_club_upsert_relation('leads','club_plan','club_plans',NULL,'nullify');

SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_plans','read','id,slug,status,name,badge,summary,min_term_months,monthly_note,features,is_featured,is_future,sort','{"status":{"_eq":"published"}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_rule_items','read','id,status,category,title,body,sort','{"status":{"_eq":"published"}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_page_settings','read','id,singleton_key,hero_disclaimer,offers_eyebrow,offers_title,offers_empty_title,offers_empty_body,monthly_fallback,offer_cta_label,plans_eyebrow,plans_title,rules_eyebrow,rules_title,form_title,form_scenario,form_contact_label,form_contact_placeholder,form_budget_label,form_budget_placeholder,form_term_label,form_message_label,form_message_placeholder,form_submit_label,form_submitting_label,form_idle_note,form_success_note,form_error_note,form_consent_note,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_offers','read','id,status,offer_status,product,plan,term_months,monthly_from,terms_text,badge,cta_label,sort','{"status":{"_eq":"published"},"offer_status":{"_in":["approved","waitlist"]}}'::json);

SELECT isvoi_club_upsert_permission('ISVOI Editor','club_plans','read','id,status,slug,name,badge,summary,min_term_months,monthly_note,features,is_featured,is_future,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_plans','create','status,slug,name,badge,summary,min_term_months,monthly_note,features,is_featured,is_future,sort','{}'::json,'{"slug":{"_nnull":true},"name":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_plans','update','status,slug,name,badge,summary,min_term_months,monthly_note,features,is_featured,is_future,sort','{}'::json,'{"slug":{"_nnull":true},"name":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_offers','read','id,status,offer_status,product,plan,term_months,monthly_from,terms_text,badge,cta_label,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_offers','create','status,offer_status,product,plan,term_months,monthly_from,terms_text,badge,cta_label,sort','{}'::json,'{"product":{"_nnull":true},"plan":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_offers','update','status,offer_status,product,plan,term_months,monthly_from,terms_text,badge,cta_label,sort','{}'::json,'{"product":{"_nnull":true},"plan":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_rule_items','read','id,status,category,title,body,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_rule_items','create','status,category,title,body,sort','{}'::json,'{"title":{"_nnull":true},"body":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_rule_items','update','status,category,title,body,sort','{}'::json,'{"title":{"_nnull":true},"body":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_page_settings','read','id,singleton_key,hero_disclaimer,offers_eyebrow,offers_title,offers_empty_title,offers_empty_body,monthly_fallback,offer_cta_label,plans_eyebrow,plans_title,rules_eyebrow,rules_title,form_title,form_scenario,form_contact_label,form_contact_placeholder,form_budget_label,form_budget_placeholder,form_term_label,form_message_label,form_message_placeholder,form_submit_label,form_submitting_label,form_idle_note,form_success_note,form_error_note,form_consent_note,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_page_settings','update','hero_disclaimer,offers_eyebrow,offers_title,offers_empty_title,offers_empty_body,monthly_fallback,offer_cta_label,plans_eyebrow,plans_title,rules_eyebrow,rules_title,form_title,form_scenario,form_contact_label,form_contact_placeholder,form_budget_label,form_budget_placeholder,form_term_label,form_message_label,form_message_placeholder,form_submit_label,form_submitting_label,form_idle_note,form_success_note,form_error_note,form_consent_note','{}'::json);

UPDATE directus_permissions
SET fields = concat_ws(',', fields, 'club_offer','club_plan','club_term_months','club_budget_text')
WHERE collection='leads'
  AND action='create'
  AND policy IN (SELECT id FROM directus_policies WHERE name='ISVOI Lead Intake')
  AND fields NOT LIKE '%club_offer%';

INSERT INTO directus_presets (bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT 'Club: новые', role.id, NULL, 'leads', 'tabular',
  '{"tabular":{"fields":["created_at","contact","club_offer","club_plan","club_term_months","status","assigned_to"],"sort":["-created_at"]}}'::json,
  '{"kind":{"_eq":"club"},"status":{"_eq":"new"}}'::json,
  'loyalty',
  '#0071e3'
FROM directus_roles role
WHERE role.name='ISVOI Editor'
  AND NOT EXISTS (
    SELECT 1 FROM directus_presets p
    WHERE p.role=role.id AND p.collection='leads' AND p.bookmark='Club: новые' AND p."user" IS NULL
  );

INSERT INTO directus_presets (bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT bookmark, role.id, NULL, 'navigation_items', 'tabular', layout_query, filter, icon, color
FROM directus_roles role
CROSS JOIN (
  VALUES
    (
      'Club header',
      '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","link_type","custom_url","item_role"],"page":1}}'::json,
      '{"location":{"_eq":"club_header"}}'::json,
      'loyalty',
      '#0f766e'
    ),
    (
      'Club footer',
      '{"tabular":{"sort":["sort","label"],"fields":["sort","is_active","label","link_type","custom_url","item_role"],"page":1}}'::json,
      '{"location":{"_eq":"club_footer"}}'::json,
      'vertical_align_bottom',
      '#047857'
    )
) preset(bookmark,layout_query,filter,icon,color)
WHERE role.name='ISVOI Editor'
  AND NOT EXISTS (
    SELECT 1 FROM directus_presets p
    WHERE p.role=role.id AND p.collection='navigation_items' AND p.bookmark=preset.bookmark AND p."user" IS NULL
  );

DROP FUNCTION isvoi_club_upsert_collection(varchar,varchar,text,varchar,boolean,integer);
DROP FUNCTION isvoi_club_upsert_field(varchar,varchar,varchar,varchar,json,varchar,integer,text,varchar,varchar,boolean,boolean,boolean);
DROP FUNCTION isvoi_club_upsert_relation(varchar,varchar,varchar,varchar,varchar);
DROP FUNCTION isvoi_club_upsert_permission(text,varchar,varchar,text,json,json,json);

COMMIT;
`);
