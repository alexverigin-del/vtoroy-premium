#!/usr/bin/env node
/** Forward-only, idempotent Trade-in MVP schema and Studio contract. */

const rehearse = process.argv.includes("--rehearse");
const sql = String.raw`
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trade_pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(80) NOT NULL UNIQUE,
  status varchar(32) NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  published_by uuid,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_device_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  pricing_version uuid NOT NULL,
  device_model uuid NOT NULL,
  storage varchar(80) NOT NULL,
  base_min integer NOT NULL,
  base_max integer NOT NULL,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pricing_version,device_model,storage)
);

CREATE TABLE IF NOT EXISTS trade_condition_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  pricing_version uuid NOT NULL,
  question_key varchar(80) NOT NULL,
  question_label varchar(255) NOT NULL,
  question_help text,
  question_sort integer NOT NULL DEFAULT 100,
  option_value varchar(32) NOT NULL,
  option_label varchar(120) NOT NULL,
  option_sort integer NOT NULL DEFAULT 100,
  delta_min integer NOT NULL DEFAULT 0,
  delta_max integer NOT NULL DEFAULT 0,
  factor_label varchar(255),
  factor_type varchar(32) NOT NULL DEFAULT 'neutral',
  manual_evaluation boolean NOT NULL DEFAULT false,
  safety_stop boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pricing_version,question_key,option_value)
);

CREATE TABLE IF NOT EXISTS trade_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'active',
  device_config uuid NOT NULL,
  pricing_version uuid NOT NULL,
  answers_snapshot jsonb NOT NULL,
  range_min integer NOT NULL,
  range_max integer NOT NULL,
  currency varchar(8) NOT NULL DEFAULT 'RUB',
  positive_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_until timestamptz NOT NULL,
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_settings (
  id integer PRIMARY KEY DEFAULT 1,
  status varchar(32) NOT NULL DEFAULT 'draft',
  active_pricing_version uuid,
  quote_validity_days integer NOT NULL DEFAULT 7,
  default_store uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id=1)
);

CREATE TABLE IF NOT EXISTS trade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name varchar(80) NOT NULL,
  session_id varchar(80) NOT NULL,
  quote uuid,
  scenario varchar(80),
  step varchar(80),
  duration_ms integer,
  error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS target_product_id varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS target_offer_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS store_location_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_visit_date date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_visit_period varchar(24);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS diagnostics_status varchar(32);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS final_offer integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS final_offer_reason text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reference_code varchar(32);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS idempotency_key varchar(120);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_pricing_versions_status_check') THEN
    ALTER TABLE trade_pricing_versions ADD CONSTRAINT trade_pricing_versions_status_check CHECK(status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_pricing_versions_published_by_fk') THEN
    ALTER TABLE trade_pricing_versions ADD CONSTRAINT trade_pricing_versions_published_by_fk FOREIGN KEY(published_by) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_device_configs_pricing_fk') THEN
    ALTER TABLE trade_device_configs ADD CONSTRAINT trade_device_configs_pricing_fk FOREIGN KEY(pricing_version) REFERENCES trade_pricing_versions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_device_configs_model_fk') THEN
    ALTER TABLE trade_device_configs ADD CONSTRAINT trade_device_configs_model_fk FOREIGN KEY(device_model) REFERENCES device_models(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_device_configs_range_check') THEN
    ALTER TABLE trade_device_configs ADD CONSTRAINT trade_device_configs_range_check CHECK(base_min>=0 AND base_max>=base_min);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_device_configs_status_check') THEN
    ALTER TABLE trade_device_configs ADD CONSTRAINT trade_device_configs_status_check CHECK(status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_condition_rules_pricing_fk') THEN
    ALTER TABLE trade_condition_rules ADD CONSTRAINT trade_condition_rules_pricing_fk FOREIGN KEY(pricing_version) REFERENCES trade_pricing_versions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_condition_rules_value_check') THEN
    ALTER TABLE trade_condition_rules ADD CONSTRAINT trade_condition_rules_value_check CHECK(option_value IN ('yes','no','unknown') AND factor_type IN ('positive','risk','neutral'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_condition_rules_status_check') THEN
    ALTER TABLE trade_condition_rules ADD CONSTRAINT trade_condition_rules_status_check CHECK(status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_quotes_device_fk') THEN
    ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_device_fk FOREIGN KEY(device_config) REFERENCES trade_device_configs(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_quotes_pricing_fk') THEN
    ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_pricing_fk FOREIGN KEY(pricing_version) REFERENCES trade_pricing_versions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_quotes_superseded_fk') THEN
    ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_superseded_fk FOREIGN KEY(superseded_by) REFERENCES trade_quotes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_quotes_range_check') THEN
    ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_range_check CHECK(range_min>=0 AND range_max>=range_min AND currency='RUB');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_quotes_status_check') THEN
    ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_status_check CHECK(status IN ('active','expired','superseded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_settings_pricing_fk') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_pricing_fk FOREIGN KEY(active_pricing_version) REFERENCES trade_pricing_versions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_settings_store_fk') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_store_fk FOREIGN KEY(default_store) REFERENCES store_locations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_settings_values_check') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_values_check CHECK(status IN ('draft','published','paused') AND quote_validity_days BETWEEN 1 AND 30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='trade_events_quote_fk') THEN
    ALTER TABLE trade_events ADD CONSTRAINT trade_events_quote_fk FOREIGN KEY(quote) REFERENCES trade_quotes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_trade_quote_fk') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_trade_quote_fk FOREIGN KEY(quote_id) REFERENCES trade_quotes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_trade_product_fk') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_trade_product_fk FOREIGN KEY(target_product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_trade_offer_fk') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_trade_offer_fk FOREIGN KEY(target_offer_id) REFERENCES product_offers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_trade_store_fk') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_trade_store_fk FOREIGN KEY(store_location_id) REFERENCES store_locations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_trade_period_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_trade_period_check CHECK(preferred_visit_period IS NULL OR preferred_visit_period IN ('morning','day','evening'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_final_offer_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_final_offer_check CHECK(final_offer IS NULL OR final_offer>=0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS trade_pricing_one_published_idx ON trade_pricing_versions((status)) WHERE status='published';
CREATE INDEX IF NOT EXISTS trade_device_configs_public_idx ON trade_device_configs(pricing_version,status,sort);
CREATE INDEX IF NOT EXISTS trade_rules_public_idx ON trade_condition_rules(pricing_version,status,question_sort,option_sort);
CREATE INDEX IF NOT EXISTS trade_quotes_active_idx ON trade_quotes(status,valid_until);
CREATE INDEX IF NOT EXISTS trade_events_funnel_idx ON trade_events(event_name,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS leads_reference_code_unique_idx ON leads(reference_code) WHERE reference_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leads_idempotency_key_unique_idx ON leads(idempotency_key) WHERE idempotency_key IS NOT NULL;

INSERT INTO trade_settings(id,status,quote_validity_days,default_store)
SELECT 1,'draft',7,id FROM store_locations WHERE slug='belgorod' LIMIT 1
ON CONFLICT(id) DO UPDATE SET default_store=COALESCE(trade_settings.default_store,EXCLUDED.default_store);

INSERT INTO directus_collections(collection,icon,note,display_template,archive_field,archive_value,unarchive_value,accountability,sort,color,"group",hidden,singleton)
VALUES
 ('trade_pricing_versions','currency_ruble','Версии цен Trade-in. Публикация меняет расчёт на сайте.','{{version}} · {{status}}','status','archived','draft','all',31,'#0071e3','isvoi_catalog',false,false),
 ('trade_device_configs','devices','Базовые диапазоны по модели и памяти.','{{device_model.name}} · {{storage}}','status','archived','draft','all',32,'#0071e3','isvoi_catalog',false,false),
 ('trade_condition_rules','rule','Поправки к диапазону и безопасные остановки.','{{question_label}} · {{option_label}}','status','archived','draft','all',33,'#946000','isvoi_catalog',false,false),
 ('trade_settings','tune','Единственная запись: включение и активная версия Trade-in.',NULL,NULL,NULL,NULL,'all',34,'#237a3b','isvoi_catalog',false,true),
 ('trade_quotes','request_quote','Серверные снимки предварительных оценок.','{{id}} · {{range_min}}–{{range_max}} ₽','status','expired','active','all',35,'#707070','isvoi_catalog',true,false),
 ('trade_events','monitoring','Неперсональные события воронки Trade-in.','{{event_name}} · {{created_at}}',NULL,NULL,NULL,'all',36,'#707070','isvoi_catalog',true,false)
ON CONFLICT(collection) DO UPDATE SET icon=EXCLUDED.icon,note=EXCLUDED.note,display_template=EXCLUDED.display_template,sort=EXCLUDED.sort,color=EXCLUDED.color,"group"=EXCLUDED."group",hidden=EXCLUDED.hidden,singleton=EXCLUDED.singleton;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_field(
 p_collection varchar,p_field varchar,p_interface varchar,p_special varchar,p_width varchar,p_sort integer,p_note text,p_readonly boolean DEFAULT false,p_hidden boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
  UPDATE directus_fields SET interface=p_interface,special=p_special,width=p_width,sort=p_sort,note=p_note,readonly=p_readonly,hidden=p_hidden WHERE collection=p_collection AND field=p_field;
 ELSE
  INSERT INTO directus_fields(collection,field,interface,special,width,sort,note,readonly,hidden) VALUES(p_collection,p_field,p_interface,p_special,p_width,p_sort,p_note,p_readonly,p_hidden);
 END IF;
END $$;

SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','version','input',NULL,'half',1,'Уникальная версия, например 2026-09-01.');
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','status','select-dropdown',NULL,'half',2,'На сайте используется только опубликованная версия.');
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','published_at','datetime',NULL,'half',3,'Фактическое время публикации.');
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','published_by','select-dropdown-m2o','m2o','half',4,'Ответственный Trade Desk.');
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','change_reason','input-multiline',NULL,'full',5,'Почему изменились диапазоны или правила.');
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','id','input','uuid','half',90,'Системный UUID.',true,true);
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','created_at','datetime','date-created','half',91,'Создано автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_pricing_versions','updated_at','datetime','date-updated','half',92,'Обновлено автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_device_configs','status','select-dropdown',NULL,'half',1,'Опубликованная строка участвует в расчёте.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','pricing_version','select-dropdown-m2o','m2o','half',2,'Версия цен.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','device_model','select-dropdown-m2o','m2o','half',3,'Одна из пяти пилотных моделей iPhone.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','storage','input',NULL,'half',4,'Память, например 256 ГБ.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','base_min','input',NULL,'half',5,'Нижняя базовая граница в рублях.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','base_max','input',NULL,'half',6,'Верхняя базовая граница в рублях.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','sort','input',NULL,'half',7,'Порядок в форме.');
SELECT pg_temp.isvoi_trade_field('trade_device_configs','id','input','uuid','half',90,'Системный UUID.',true,true);
SELECT pg_temp.isvoi_trade_field('trade_device_configs','created_at','datetime','date-created','half',91,'Создано автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_device_configs','updated_at','datetime','date-updated','half',92,'Обновлено автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','status','select-dropdown',NULL,'half',1,'Опубликованное правило применяется сервером.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','pricing_version','select-dropdown-m2o','m2o','half',2,'Версия цен.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','question_key','input',NULL,'half',3,'Стабильный системный ключ вопроса.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','question_label','input',NULL,'half',4,'Публичный вопрос.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','question_help','input-multiline',NULL,'full',5,'Необязательная подсказка.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','option_value','select-dropdown',NULL,'half',6,'yes, no или unknown.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','option_label','input',NULL,'half',7,'Публичная подпись ответа.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','delta_min','input',NULL,'half',8,'Поправка к нижней границе в рублях.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','delta_max','input',NULL,'half',9,'Поправка к верхней границе в рублях.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','factor_label','input',NULL,'full',10,'Объяснение, которое увидит пользователь.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','factor_type','select-dropdown',NULL,'half',11,'positive, risk или neutral.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','manual_evaluation','boolean',NULL,'half',12,'Остановить автоматический расчёт и передать менеджеру.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','safety_stop','boolean',NULL,'half',13,'Показать обязательный безопасный сценарий.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','question_sort','input',NULL,'half',14,'Порядок вопроса.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','option_sort','input',NULL,'half',15,'Порядок ответа.');
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','id','input','uuid','half',90,'Системный UUID.',true,true);
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','created_at','datetime','date-created','half',91,'Создано автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_condition_rules','updated_at','datetime','date-updated','half',92,'Обновлено автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_settings','status','select-dropdown',NULL,'half',1,'published включает сервис при включённом env-флаге.');
SELECT pg_temp.isvoi_trade_field('trade_settings','active_pricing_version','select-dropdown-m2o','m2o','half',2,'Опубликованная версия для расчёта.');
SELECT pg_temp.isvoi_trade_field('trade_settings','quote_validity_days','input',NULL,'half',3,'Срок до 23:59 по Москве, по умолчанию 7 дней.');
SELECT pg_temp.isvoi_trade_field('trade_settings','default_store','select-dropdown-m2o','m2o','half',4,'Магазин, приоритетный для обмена и визита.');
SELECT pg_temp.isvoi_trade_field('trade_settings','id','input',NULL,'half',90,'Системный singleton id=1.',true,true);
SELECT pg_temp.isvoi_trade_field('trade_settings','updated_at','datetime','date-updated','half',91,'Обновлено автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','id','input','uuid','half',1,'Неперсональный идентификатор оценки.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','status','select-dropdown',NULL,'half',2,'active, expired или superseded.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','device_config','select-dropdown-m2o','m2o','half',3,'Снимок выбранной конфигурации.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','pricing_version','select-dropdown-m2o','m2o','half',4,'Версия, по которой выполнен расчёт.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','answers_snapshot','input-code','cast-json','full',5,'Неизменяемый снимок неперсональных ответов.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','range_min','input',NULL,'half',6,'Нижняя граница в рублях.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','range_max','input',NULL,'half',7,'Верхняя граница в рублях.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','currency','input',NULL,'half',8,'Всегда RUB.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','positive_factors','input-code','cast-json','full',9,'Публичные положительные факторы.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','risk_factors','input-code','cast-json','full',10,'Публичные рисковые факторы.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','valid_until','datetime',NULL,'half',11,'Срок действия до 23:59 МСК.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','superseded_by','select-dropdown-m2o','m2o','half',12,'Новый quote после пересчёта.',true);
SELECT pg_temp.isvoi_trade_field('trade_quotes','created_at','datetime','date-created','half',13,'Создано автоматически.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','id','input','uuid','half',1,'Системный UUID.',true,true);
SELECT pg_temp.isvoi_trade_field('trade_events','event_name','input',NULL,'half',2,'Событие воронки без PII.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','session_id','input',NULL,'half',3,'Неперсональный session id.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','quote','select-dropdown-m2o','m2o','half',4,'Связанный quote без контакта.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','scenario','input',NULL,'half',5,'Выбранный сценарий.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','step','input',NULL,'half',6,'Шаг формы.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','duration_ms','input',NULL,'half',7,'Время до события в миллисекундах.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','error_code','input',NULL,'half',8,'Безопасный код ошибки без содержимого формы.',true);
SELECT pg_temp.isvoi_trade_field('trade_events','created_at','datetime','date-created','half',9,'Создано автоматически.',true);
SELECT pg_temp.isvoi_trade_field('leads','quote_id','select-dropdown-m2o','m2o','half',80,'Связанная предварительная оценка.',true);
SELECT pg_temp.isvoi_trade_field('leads','target_product_id','select-dropdown-m2o','m2o','half',81,'Выбранный товар для обмена.',true);
SELECT pg_temp.isvoi_trade_field('leads','target_offer_id','select-dropdown-m2o','m2o','half',82,'Проверенное предложение магазина.',true);
SELECT pg_temp.isvoi_trade_field('leads','store_location_id','select-dropdown-m2o','m2o','half',83,'Выбранный магазин.',false);
SELECT pg_temp.isvoi_trade_field('leads','preferred_visit_date','datetime',NULL,'half',84,'Желаемый день, не подтверждённый слот.');
SELECT pg_temp.isvoi_trade_field('leads','preferred_visit_period','select-dropdown',NULL,'half',85,'morning, day или evening.');
SELECT pg_temp.isvoi_trade_field('leads','diagnostics_status','select-dropdown',NULL,'half',86,'Статус фактической диагностики.');
SELECT pg_temp.isvoi_trade_field('leads','final_offer','input',NULL,'half',87,'Финальная сумма в рублях после диагностики.');
SELECT pg_temp.isvoi_trade_field('leads','final_offer_reason','input-multiline',NULL,'full',88,'Причина отличия от предварительного диапазона.');
SELECT pg_temp.isvoi_trade_field('leads','reference_code','input',NULL,'half',89,'Публичный номер заявки.',true);
SELECT pg_temp.isvoi_trade_field('leads','idempotency_key','input',NULL,'half',90,'Техническая защита от дублей.',true,true);

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_relation(p_many varchar,p_field varchar,p_one varchar,p_one_field varchar,p_action varchar) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM directus_relations WHERE many_collection=p_many AND many_field=p_field) THEN
  UPDATE directus_relations SET one_collection=p_one,one_field=p_one_field,one_deselect_action=p_action WHERE many_collection=p_many AND many_field=p_field;
 ELSE
  INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action) VALUES(p_many,p_field,p_one,p_one_field,p_action);
 END IF;
END $$;

SELECT pg_temp.isvoi_trade_relation('trade_pricing_versions','published_by','directus_users',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('trade_device_configs','pricing_version','trade_pricing_versions',NULL,'restrict');
SELECT pg_temp.isvoi_trade_relation('trade_device_configs','device_model','device_models',NULL,'restrict');
SELECT pg_temp.isvoi_trade_relation('trade_condition_rules','pricing_version','trade_pricing_versions',NULL,'delete');
SELECT pg_temp.isvoi_trade_relation('trade_quotes','device_config','trade_device_configs',NULL,'restrict');
SELECT pg_temp.isvoi_trade_relation('trade_quotes','pricing_version','trade_pricing_versions',NULL,'restrict');
SELECT pg_temp.isvoi_trade_relation('trade_quotes','superseded_by','trade_quotes',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('trade_settings','active_pricing_version','trade_pricing_versions',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('trade_settings','default_store','store_locations',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('trade_events','quote','trade_quotes',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('leads','quote_id','trade_quotes',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('leads','target_product_id','products',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('leads','target_offer_id','product_offers',NULL,'nullify');
SELECT pg_temp.isvoi_trade_relation('leads','store_location_id','store_locations',NULL,'nullify');

DO $$ DECLARE v_policy uuid; BEGIN
 SELECT id INTO v_policy FROM directus_policies WHERE name='ISVOI Trade Service' LIMIT 1;
 IF v_policy IS NULL THEN
  INSERT INTO directus_policies(id,name,icon,description,app_access,admin_access,enforce_tfa) VALUES(gen_random_uuid(),'ISVOI Trade Service','price_check','Server-only Trade-in calculation, quote, analytics and lead validation.',false,false,false);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_permission(p_policy text,p_collection varchar,p_action varchar,p_fields text,p_permissions json DEFAULT NULL,p_validation json DEFAULT NULL,p_presets json DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
 SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy LIMIT 1;
 IF v_policy IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
  UPDATE directus_permissions SET fields=p_fields,permissions=p_permissions,validation=p_validation,presets=p_presets WHERE policy=v_policy AND collection=p_collection AND action=p_action;
 ELSE
  INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation,presets) VALUES(v_policy,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
 END IF;
END $$;

SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_settings','read','id,status,active_pricing_version,quote_validity_days,default_store');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_pricing_versions','read','id,version,status,published_at');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_device_configs','read','id,status,pricing_version,device_model,storage,base_min,base_max,sort');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_condition_rules','read','id,status,pricing_version,question_key,question_label,question_help,question_sort,option_value,option_label,option_sort,delta_min,delta_max,factor_label,factor_type,manual_evaluation,safety_stop');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_quotes','read','id,status,device_config,pricing_version,answers_snapshot,range_min,range_max,currency,positive_factors,risk_factors,valid_until,superseded_by,created_at');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_quotes','create','status,device_config,pricing_version,answers_snapshot,range_min,range_max,currency,positive_factors,risk_factors,valid_until','{}'::json,'{"status":{"_eq":"active"},"currency":{"_eq":"RUB"}}'::json,'{"status":"active","currency":"RUB"}'::json);
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_quotes','update','status,superseded_by');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','trade_events','create','event_name,session_id,quote,scenario,step,duration_ms,error_code');
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','store_locations','read','id,slug,status,name,city,intercity_delivery_enabled','{"status":{"_eq":"published"}}'::json);
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','device_models','read','id,slug,name,is_active','{"is_active":{"_eq":true}}'::json);
SELECT pg_temp.isvoi_trade_permission('ISVOI Trade Service','leads','read','id,reference_code,idempotency_key');

DO $$ DECLARE role_name text; collection_name text; fields text; write_fields text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
  FOREACH collection_name IN ARRAY ARRAY['trade_pricing_versions','trade_device_configs','trade_condition_rules','trade_settings','trade_quotes','trade_events'] LOOP
   fields := CASE collection_name
    WHEN 'trade_pricing_versions' THEN 'id,version,status,published_at,published_by,change_reason,created_at,updated_at'
    WHEN 'trade_device_configs' THEN 'id,status,pricing_version,device_model,storage,base_min,base_max,sort,created_at,updated_at'
    WHEN 'trade_condition_rules' THEN 'id,status,pricing_version,question_key,question_label,question_help,question_sort,option_value,option_label,option_sort,delta_min,delta_max,factor_label,factor_type,manual_evaluation,safety_stop,created_at,updated_at'
    WHEN 'trade_settings' THEN 'id,status,active_pricing_version,quote_validity_days,default_store,updated_at'
    WHEN 'trade_quotes' THEN 'id,status,device_config,pricing_version,answers_snapshot,range_min,range_max,currency,positive_factors,risk_factors,valid_until,superseded_by,created_at'
    ELSE 'id,event_name,session_id,quote,scenario,step,duration_ms,error_code,created_at' END;
   PERFORM pg_temp.isvoi_trade_permission(role_name,collection_name,'read',fields);
   IF role_name='ISVOI Advanced Editor' AND collection_name IN ('trade_pricing_versions','trade_device_configs','trade_condition_rules','trade_settings') THEN
    write_fields := CASE collection_name
     WHEN 'trade_pricing_versions' THEN 'version,status,published_at,published_by,change_reason'
     WHEN 'trade_device_configs' THEN 'status,pricing_version,device_model,storage,base_min,base_max,sort'
     WHEN 'trade_condition_rules' THEN 'status,pricing_version,question_key,question_label,question_help,question_sort,option_value,option_label,option_sort,delta_min,delta_max,factor_label,factor_type,manual_evaluation,safety_stop'
     ELSE 'status,active_pricing_version,quote_validity_days,default_store' END;
    PERFORM pg_temp.isvoi_trade_permission(role_name,collection_name,'create',write_fields);
    PERFORM pg_temp.isvoi_trade_permission(role_name,collection_name,'update',write_fields);
   END IF;
  END LOOP;
 END LOOP;
END $$;

SELECT pg_temp.isvoi_trade_permission('ISVOI Lead Intake','leads','create',
 'kind,status,priority,contact_channel,name,contact,product,product_type,device,device_id,scenario,message,source,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,club_offer,club_plan,club_term_months,club_budget_text,club_device_request,club_consent_version,club_consent_at,user_agent,quote_id,target_product_id,target_offer_id,store_location_id,preferred_visit_date,preferred_visit_period,reference_code,idempotency_key',
 NULL,'{"contact":{"_nnull":true},"status":{"_eq":"new"},"priority":{"_in":["normal","high"]},"kind":{"_in":["selection","purchase","trade","upgrade","club","support"]},"contact_channel":{"_in":["unknown","phone","telegram","whatsapp","email"]}}'::json,'{"status":"new","priority":"normal"}'::json);
SELECT pg_temp.isvoi_trade_permission('ISVOI Lead Intake','leads','read','reference_code,idempotency_key');

UPDATE directus_permissions SET fields=concat_ws(',',fields,'quote_id,target_product_id,target_offer_id,store_location_id,preferred_visit_date,preferred_visit_period,diagnostics_status,final_offer,final_offer_reason,reference_code')
WHERE collection='leads' AND action='read' AND policy IN(SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor','ISVOI Advanced Editor')) AND fields NOT LIKE '%quote_id%';
UPDATE directus_permissions SET fields=concat_ws(',',fields,'store_location_id,preferred_visit_date,preferred_visit_period,diagnostics_status,final_offer,final_offer_reason')
WHERE collection='leads' AND action='update' AND policy IN(SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor','ISVOI Advanced Editor')) AND fields NOT LIKE '%diagnostics_status%';

INSERT INTO page_sections(id,page,section_key,variant,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,sort_order,is_active,content)
SELECT gen_random_uuid(),sp.id,'trade_calculator_intro','calculator.intro','Предварительная оценка','Оцените устройство до визита','','<p>Выберите модель и состояние — покажем рабочий диапазон по действующей версии цен.</p>','','','','',15,true,
 '{"note":"Расчёт не требует контактных данных.","disclaimer":"Предварительная оценка не является офертой. Итоговую сумму подтвердим после диагностики устройства."}'::json
FROM site_pages sp WHERE sp.slug='trade'
 AND NOT EXISTS(SELECT 1 FROM page_sections ps WHERE ps.page=sp.id AND ps.section_key='trade_calculator_intro');

UPDATE page_sections ps SET variant='calculator.intro',eyebrow='Предварительная оценка',headline='Оцените устройство до визита',subheadline='',body='<p>Выберите модель и состояние — покажем рабочий диапазон по действующей версии цен.</p>',primary_cta_label='',primary_cta_url='',secondary_cta_label='',secondary_cta_url='',sort_order=15,is_active=true,content='{"note":"Расчёт не требует контактных данных.","disclaimer":"Предварительная оценка не является офертой. Итоговую сумму подтвердим после диагностики устройства."}'::json
FROM site_pages sp WHERE sp.id=ps.page AND sp.slug='trade' AND ps.section_key='trade_calculator_intro';

UPDATE page_sections ps SET primary_cta_url='#trade-calculator'
FROM site_pages sp WHERE sp.id=ps.page AND sp.slug='trade' AND ps.section_key='trade_hero' AND ps.primary_cta_url='#final';

COMMIT;

SELECT 'trade_mvp.tables',count(*)::text FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('trade_pricing_versions','trade_device_configs','trade_condition_rules','trade_quotes','trade_settings','trade_events')
UNION ALL SELECT 'trade_mvp.lead_fields',count(*)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name IN ('quote_id','target_product_id','target_offer_id','store_location_id','preferred_visit_date','preferred_visit_period','diagnostics_status','final_offer','final_offer_reason','reference_code','idempotency_key')
UNION ALL SELECT 'trade_mvp.collections',count(*)::text FROM directus_collections WHERE collection LIKE 'trade_%';
`;

process.stdout.write(rehearse ? `${sql.slice(0, sql.indexOf("\nCOMMIT;"))}\nROLLBACK;\n` : sql);
