#!/usr/bin/env node
/** Forward-only, idempotent Trade-in economics and legal approval controls. */

const rehearse = process.argv.includes("--rehearse");

const sql = String.raw`
BEGIN;

ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS economics_status varchar(32) NOT NULL DEFAULT 'draft';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS preparation_cost_rub integer NOT NULL DEFAULT 1500;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS warranty_reserve_pct numeric(6,2) NOT NULL DEFAULT 3;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS warranty_reserve_min_rub integer NOT NULL DEFAULT 1500;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS markdown_reserve_pct numeric(6,2) NOT NULL DEFAULT 5;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS sales_cost_pct numeric(6,2) NOT NULL DEFAULT 2;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS operations_cost_rub integer NOT NULL DEFAULT 1000;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS tax_reserve_pct numeric(6,2) NOT NULL DEFAULT 6;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS tax_treatment_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS tax_regime varchar(80) NOT NULL DEFAULT 'usn_income';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS vat_mode varchar(80) NOT NULL DEFAULT 'without_vat';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS primary_document_mode varchar(80) NOT NULL DEFAULT 'external_print';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS kkt_mode varchar(80) NOT NULL DEFAULT 'external_terminal';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS payout_cash_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS payout_transfer_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS exchange_offset_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS primary_document_status varchar(32) NOT NULL DEFAULT 'draft';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS kkt_workflow_status varchar(32) NOT NULL DEFAULT 'draft';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS minimum_contribution_margin_pct numeric(6,2) NOT NULL DEFAULT 15;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS target_contribution_margin_pct numeric(6,2) NOT NULL DEFAULT 18;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS economics_approved_by uuid;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS economics_approved_at timestamptz;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS economics_approval_note text;

ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS legal_status varchar(32) NOT NULL DEFAULT 'draft';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS quote_disclaimer_short text NOT NULL DEFAULT 'Предварительная оценка не является офертой. Итоговая сумма зависит от диагностики и подтверждается до сделки.';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS quote_disclaimer_full text NOT NULL DEFAULT 'Предварительная оценка, не оферта. Диапазон действует до {date}. Итоговую сумму подтвердим после очной диагностики, проверки комплектации, серийного номера, блокировок и права распоряжаться устройством. Если состояние отличается от ответов, предложим новую сумму — вы сможете принять её или отказаться.';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS consent_label text NOT NULL DEFAULT 'Я даю согласие на обработку телефона или Telegram для ответа по заявке Trade-in и ознакомлен с Политикой обработки персональных данных.';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS consent_text text NOT NULL DEFAULT '';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS consent_version varchar(120) NOT NULL DEFAULT 'trade-consent-v1-draft';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS consent_url varchar(500) NOT NULL DEFAULT '';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS privacy_url varchar(500) NOT NULL DEFAULT '/privacy';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS safety_notice text NOT NULL DEFAULT 'Не заряжайте и не пересылайте устройство. Выключите его, если это можно сделать без давления на корпус, не вскрывайте и свяжитесь с магазином.';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS counteroffer_notice text NOT NULL DEFAULT 'После диагностики сумма изменилась: {reason}. Новое предложение — {amount}. Вы можете принять его или забрать устройство без сделки.';
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS legal_approved_by uuid;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS legal_approved_at timestamptz;
ALTER TABLE trade_settings ADD COLUMN IF NOT EXISTS legal_approval_note text;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_consent_version varchar(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_consent_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_consent_text_snapshot text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_consent_text_hash varchar(64);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_consent_source_path varchar(255);

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_economics_status_check') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_economics_status_check CHECK(economics_status IN ('draft','approved'));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_legal_status_check') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_legal_status_check CHECK(legal_status IN ('draft','approved'));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_cost_policy_check') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_cost_policy_check CHECK(
      preparation_cost_rub>=0 AND warranty_reserve_pct BETWEEN 0 AND 100 AND
      warranty_reserve_min_rub>=0 AND markdown_reserve_pct BETWEEN 0 AND 100 AND
      sales_cost_pct BETWEEN 0 AND 100 AND operations_cost_rub>=0 AND
      tax_reserve_pct BETWEEN 0 AND 100 AND minimum_contribution_margin_pct>0 AND
      target_contribution_margin_pct>=minimum_contribution_margin_pct
    );
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_primary_document_status_check') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_primary_document_status_check CHECK(primary_document_status IN ('draft','approved'));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_kkt_workflow_status_check') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_kkt_workflow_status_check CHECK(kkt_workflow_status IN ('draft','approved'));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_economics_approved_by_fk') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_economics_approved_by_fk FOREIGN KEY(economics_approved_by) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trade_settings_legal_approved_by_fk') THEN
    ALTER TABLE trade_settings ADD CONSTRAINT trade_settings_legal_approved_by_fk FOREIGN KEY(legal_approved_by) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_governance_field(
  p_collection varchar,p_field varchar,p_interface varchar,p_special varchar,p_width varchar,
  p_sort integer,p_note text,p_group varchar DEFAULT NULL,p_readonly boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface,special=p_special,width=p_width,sort=p_sort,
      note=p_note,"group"=p_group,readonly=p_readonly,hidden=false
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,special,width,sort,note,"group",readonly,hidden)
    VALUES(p_collection,p_field,p_interface,p_special,p_width,p_sort,p_note,p_group,p_readonly,false);
  END IF;
END $$;

SELECT pg_temp.isvoi_trade_governance_field('trade_settings','group_economics','group-detail','group','full',10,'Расходы, пороги маржи и их утверждение. Публикация закрыта до статуса «Утверждено».');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','economics_status','select-dropdown',NULL,'half',11,'Черновик не разрешает публичный запуск.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','preparation_cost_rub','input',NULL,'half',12,'Подготовка одного устройства, ₽.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','warranty_reserve_pct','input',NULL,'half',13,'Гарантийный резерв от витринной цены, %.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','warranty_reserve_min_rub','input',NULL,'half',14,'Минимальный гарантийный резерв, ₽.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','markdown_reserve_pct','input',NULL,'half',15,'Резерв снижения цены, %.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','sales_cost_pct','input',NULL,'half',16,'Переменные расходы продажи, %.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','operations_cost_rub','input',NULL,'half',17,'Фиксированные операции на устройство, ₽.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','tax_reserve_pct','input',NULL,'half',18,'Налоговый резерв, %. Значение утверждает бухгалтер.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','tax_treatment_confirmed','boolean',NULL,'half',19,'Подтверждены ставка УСН и режим НДС.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','tax_regime','select-dropdown',NULL,'half',20,'Налоговый режим. Для текущего оператора: УСН «Доходы».','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','vat_mode','select-dropdown',NULL,'half',21,'Для текущего оператора: без НДС.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','primary_document_mode','select-dropdown',NULL,'half',22,'Договор печатается вне ISVOI по факту сделки.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','kkt_mode','select-dropdown',NULL,'half',23,'Чеки формируются внешним кассовым терминалом.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','minimum_contribution_margin_pct','input',NULL,'half',24,'Жёсткий блокирующий минимум, %.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','target_contribution_margin_pct','input',NULL,'half',25,'Целевой уровень, %.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','payout_cash_enabled','boolean',NULL,'half',26,'Разрешена выплата наличными из кассы.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','payout_transfer_enabled','boolean',NULL,'half',27,'Разрешён перевод физическому лицу.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','exchange_offset_enabled','boolean',NULL,'half',28,'Разрешён зачёт стоимости устройства при обмене.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','primary_document_status','select-dropdown',NULL,'half',29,'Внешний процесс печати договора подтверждён.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','kkt_workflow_status','select-dropdown',NULL,'half',30,'Внешний процесс кассового терминала подтверждён.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','economics_approved_by','select-dropdown-m2o','m2o','half',31,'Кто утвердил экономику.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','economics_approved_at','datetime',NULL,'half',32,'Когда утверждена экономика.','group_economics');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','economics_approval_note','input-multiline',NULL,'full',33,'Основание, версия расчёта и ограничения.','group_economics');

SELECT pg_temp.isvoi_trade_governance_field('trade_settings','group_legal','group-detail','group','full',30,'Публичные тексты, согласие и юридическое утверждение.');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','legal_status','select-dropdown',NULL,'half',31,'Черновик не разрешает публичный запуск.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','quote_disclaimer_short','input-multiline',NULL,'full',32,'Короткий текст под калькулятором.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','quote_disclaimer_full','input-multiline',NULL,'full',33,'Текст на экране результата. Доступен плейсхолдер {date}.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','consent_label','input-multiline',NULL,'full',34,'Подпись обязательного пустого чекбокса.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','consent_text','input-multiline',NULL,'full',35,'Полный отдельный текст согласия: оператор, цели, данные, действия, срок и отзыв.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','consent_version','input',NULL,'half',36,'Версия, сохраняемая с заявкой.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','consent_url','input',NULL,'half',37,'Ссылка на отдельный опубликованный текст согласия.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','privacy_url','input',NULL,'half',38,'Ссылка на опубликованную политику.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','safety_notice','input-multiline',NULL,'full',39,'Инструкция при риске аккумулятора.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','counteroffer_notice','input-multiline',NULL,'full',40,'Текст изменения суммы. Плейсхолдеры {reason} и {amount}.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','legal_approved_by','select-dropdown-m2o','m2o','half',41,'Кто утвердил тексты.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','legal_approved_at','datetime',NULL,'half',42,'Когда утверждены тексты.','group_legal');
SELECT pg_temp.isvoi_trade_governance_field('trade_settings','legal_approval_note','input-multiline',NULL,'full',43,'Основание и ограничения юридического согласования.','group_legal');

SELECT pg_temp.isvoi_trade_governance_field('leads','group_trade_consent','group-detail','group','full',90,'Доказательство отдельного согласия для заявки Trade-in. Поля заполняются только сервером.');
SELECT pg_temp.isvoi_trade_governance_field('leads','trade_consent_version','input',NULL,'half',91,'Версия явно принятого согласия Trade-in.','group_trade_consent',true);
SELECT pg_temp.isvoi_trade_governance_field('leads','trade_consent_at','datetime',NULL,'half',92,'Серверное время принятия согласия Trade-in.','group_trade_consent',true);
SELECT pg_temp.isvoi_trade_governance_field('leads','trade_consent_text_hash','input',NULL,'full',93,'SHA-256 неизменяемого текста согласия, принятого вместе с заявкой.','group_trade_consent',true);
SELECT pg_temp.isvoi_trade_governance_field('leads','trade_consent_source_path','input',NULL,'half',94,'Страница, на которой пользователь принял согласие.','group_trade_consent',true);
SELECT pg_temp.isvoi_trade_governance_field('leads','trade_consent_text_snapshot','input-multiline',NULL,'full',95,'Неизменяемый снимок полного текста согласия на момент заявки.','group_trade_consent',true);

UPDATE directus_fields SET
  conditions='[{"name":"Заявка Trade-in","rule":{"kind":{"_eq":"trade"}},"hidden":false,"readonly":true,"required":false,"options":{}}]'::json,
  options='{"headerIcon":"verified_user","start":"closed"}'::json
WHERE collection='leads' AND field='group_trade_consent';

UPDATE directus_fields SET options='{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Утверждено","value":"approved","color":"#16a34a"}]}'::json
WHERE collection='trade_settings' AND field IN('economics_status','legal_status','primary_document_status','kkt_workflow_status');

UPDATE directus_fields SET options='{"choices":[{"text":"УСН · Доходы","value":"usn_income"},{"text":"УСН · Доходы минус расходы","value":"usn_income_minus_expenses"},{"text":"Другой","value":"other"}]}'::json
WHERE collection='trade_settings' AND field='tax_regime';

UPDATE directus_fields SET options='{"choices":[{"text":"Без НДС","value":"without_vat"},{"text":"С НДС","value":"with_vat"}]}'::json
WHERE collection='trade_settings' AND field='vat_mode';

UPDATE directus_fields SET options='{"choices":[{"text":"Печать вне ISVOI","value":"external_print"}]}'::json
WHERE collection='trade_settings' AND field='primary_document_mode';

UPDATE directus_fields SET options='{"choices":[{"text":"Внешний кассовый терминал","value":"external_terminal"}]}'::json
WHERE collection='trade_settings' AND field='kkt_mode';

UPDATE directus_fields field SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('group_economics','Экономика и маржа'),('economics_status','Статус экономики'),
  ('preparation_cost_rub','Подготовка, ₽'),('warranty_reserve_pct','Гарантийный резерв, %'),
  ('warranty_reserve_min_rub','Минимальный гарантийный резерв, ₽'),('markdown_reserve_pct','Резерв снижения цены, %'),
  ('sales_cost_pct','Расходы продажи, %'),('operations_cost_rub','Операционные расходы, ₽'),
  ('tax_reserve_pct','Налоговый резерв, %'),('tax_treatment_confirmed','Налоговая модель подтверждена'),
  ('tax_regime','Налоговый режим'),('vat_mode','НДС'),
  ('primary_document_mode','Оформление договора'),('kkt_mode','Оформление чеков'),
  ('payout_cash_enabled','Выплата наличными'),
  ('payout_transfer_enabled','Выплата переводом'),('exchange_offset_enabled','Зачёт при обмене'),
  ('primary_document_status','Первичный документ'),('kkt_workflow_status','Сценарий ККТ'),
  ('minimum_contribution_margin_pct','Минимальная маржа, %'),('target_contribution_margin_pct','Целевая маржа, %'),
  ('economics_approved_by','Экономику утвердил'),('economics_approved_at','Экономика утверждена'),
  ('economics_approval_note','Комментарий к экономике'),('group_legal','Юридические тексты'),
  ('legal_status','Статус юридических текстов'),('quote_disclaimer_short','Короткий дисклеймер'),
  ('quote_disclaimer_full','Полный дисклеймер'),('consent_label','Подпись согласия'),
  ('consent_text','Полный текст согласия'),('consent_version','Версия согласия'),
  ('consent_url','Ссылка на согласие'),('privacy_url','Ссылка на политику'),('safety_notice','Safety-stop'),
  ('counteroffer_notice','Изменение суммы'),('legal_approved_by','Тексты утвердил'),
  ('legal_approved_at','Тексты утверждены'),('legal_approval_note','Комментарий к текстам')
) labels(field,label)
WHERE field.collection='trade_settings' AND field.field=labels.field;

UPDATE directus_fields field SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('group_trade_consent','Согласие Trade-in'),
  ('trade_consent_version','Версия согласия Trade-in'),
  ('trade_consent_at','Время согласия Trade-in'),
  ('trade_consent_text_hash','SHA-256 согласия Trade-in'),
  ('trade_consent_source_path','Страница согласия Trade-in'),
  ('trade_consent_text_snapshot','Снимок согласия Trade-in')
) labels(field,label)
WHERE field.collection='leads' AND field.field=labels.field;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_governance_relation(p_field varchar) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM directus_relations WHERE many_collection='trade_settings' AND many_field=p_field) THEN
    UPDATE directus_relations SET one_collection='directus_users',one_field=NULL,one_deselect_action='nullify'
    WHERE many_collection='trade_settings' AND many_field=p_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES('trade_settings',p_field,'directus_users',NULL,'nullify');
  END IF;
END $$;
SELECT pg_temp.isvoi_trade_governance_relation('economics_approved_by');
SELECT pg_temp.isvoi_trade_governance_relation('legal_approved_by');

DO $$ DECLARE permission_row record; extra_fields text := 'economics_status,preparation_cost_rub,warranty_reserve_pct,warranty_reserve_min_rub,markdown_reserve_pct,sales_cost_pct,operations_cost_rub,tax_reserve_pct,tax_treatment_confirmed,tax_regime,vat_mode,primary_document_mode,kkt_mode,payout_cash_enabled,payout_transfer_enabled,exchange_offset_enabled,primary_document_status,kkt_workflow_status,minimum_contribution_margin_pct,target_contribution_margin_pct,economics_approved_by,economics_approved_at,economics_approval_note,legal_status,quote_disclaimer_short,quote_disclaimer_full,consent_label,consent_text,consent_version,consent_url,privacy_url,safety_notice,counteroffer_notice,legal_approved_by,legal_approved_at,legal_approval_note'; BEGIN
  FOR permission_row IN
    SELECT permission.id FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
    WHERE permission.collection='trade_settings' AND permission.action='read' AND policy.name IN('ISVOI Trade Service','ISVOI Editor','ISVOI Advanced Editor')
  LOOP
    UPDATE directus_permissions SET fields=concat_ws(',',fields,extra_fields) WHERE id=permission_row.id AND fields NOT LIKE '%kkt_workflow_status%';
  END LOOP;

  FOR permission_row IN
    SELECT permission.id FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
    WHERE permission.collection='trade_settings' AND permission.action IN('create','update') AND policy.name='ISVOI Advanced Editor'
  LOOP
    UPDATE directus_permissions SET fields=concat_ws(',',fields,extra_fields) WHERE id=permission_row.id AND fields NOT LIKE '%kkt_workflow_status%';
  END LOOP;

  FOR permission_row IN
    SELECT permission.id FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
    WHERE permission.collection='leads' AND permission.action='create' AND policy.name='ISVOI Lead Intake'
  LOOP
    UPDATE directus_permissions SET fields=concat_ws(',',fields,'trade_consent_version,trade_consent_at,trade_consent_text_snapshot,trade_consent_text_hash,trade_consent_source_path') WHERE id=permission_row.id AND fields NOT LIKE '%trade_consent_text_hash%';
  END LOOP;

  FOR permission_row IN
    SELECT permission.id FROM directus_permissions permission JOIN directus_policies policy ON policy.id=permission.policy
    WHERE permission.collection='leads' AND permission.action='read' AND policy.name IN('ISVOI Editor','ISVOI Advanced Editor')
  LOOP
    UPDATE directus_permissions SET fields=concat_ws(',',fields,'group_trade_consent,trade_consent_version,trade_consent_at,trade_consent_text_snapshot,trade_consent_text_hash,trade_consent_source_path') WHERE id=permission_row.id AND fields NOT LIKE '%trade_consent_text_hash%';
  END LOOP;
END $$;

COMMIT;

SELECT 'trade_governance.settings_fields',count(*)::text FROM information_schema.columns
WHERE table_schema='public' AND table_name='trade_settings' AND column_name IN(
  'economics_status','preparation_cost_rub','warranty_reserve_pct','warranty_reserve_min_rub',
  'markdown_reserve_pct','sales_cost_pct','operations_cost_rub','tax_reserve_pct',
  'tax_treatment_confirmed','tax_regime','vat_mode','primary_document_mode','kkt_mode',
  'payout_cash_enabled','payout_transfer_enabled',
  'exchange_offset_enabled','primary_document_status','kkt_workflow_status',
  'minimum_contribution_margin_pct','target_contribution_margin_pct',
  'economics_approved_by','economics_approved_at','economics_approval_note','legal_status',
  'quote_disclaimer_short','quote_disclaimer_full','consent_label','consent_text','consent_version',
  'consent_url','privacy_url','safety_notice','counteroffer_notice','legal_approved_by','legal_approved_at','legal_approval_note'
)
UNION ALL
SELECT 'trade_governance.lead_fields',count(*)::text FROM information_schema.columns
WHERE table_schema='public' AND table_name='leads' AND column_name IN(
  'trade_consent_version','trade_consent_at','trade_consent_text_snapshot',
  'trade_consent_text_hash','trade_consent_source_path'
);
`;

process.stdout.write(rehearse ? `${sql.slice(0, sql.indexOf("\nCOMMIT;"))}\nROLLBACK;\n` : sql);
