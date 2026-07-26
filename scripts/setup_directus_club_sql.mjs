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
  support_level varchar(255),
  service_response_text varchar(255),
  diagnostics_text varchar(255),
  replacement_text varchar(255),
  early_exit_text varchar(255),
  damage_text varchar(255),
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
  pricing_mode varchar(32) NOT NULL DEFAULT 'manual',
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

CREATE TABLE IF NOT EXISTS club_process_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  group_key varchar(32) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  label varchar(120),
  title varchar(200) NOT NULL,
  body text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_process_items_status_check CHECK (status IN ('draft','published','archived')),
  CONSTRAINT club_process_items_group_check CHECK (group_key IN ('scenario','passport','participation'))
);

CREATE TABLE IF NOT EXISTS club_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  document_type varchar(64) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  title varchar(255) NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  version varchar(80) NOT NULL DEFAULT '',
  effective_date date,
  file uuid,
  legal_reviewed boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_legal_documents_status_check CHECK (status IN ('draft','published','archived'))
);

CREATE TABLE IF NOT EXISTS club_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key varchar(32) NOT NULL DEFAULT 'club' UNIQUE,
  publication_mode varchar(32) NOT NULL DEFAULT 'pilot_noindex',
  hero_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · пилот в Северодвинске',
  hero_title varchar(255) NOT NULL DEFAULT 'Своя, пока нужна.',
  hero_body text NOT NULL DEFAULT 'Пользуйтесь проверенным устройством Apple за фиксированную плату в месяц. В конце срока продолжите, смените модель, выкупите или вернёте.',
  hero_primary_label varchar(160) NOT NULL DEFAULT 'Получить расчёт Club',
  hero_primary_url varchar(255) NOT NULL DEFAULT '#club-request',
  hero_secondary_label varchar(160) NOT NULL DEFAULT 'Посмотреть устройства',
  hero_secondary_url varchar(255) NOT NULL DEFAULT '#devices',
  hero_disclaimer text NOT NULL DEFAULT 'Club — аренда/подписка. Устройство остаётся собственностью I СВОИ до выкупа.',
  hero_panel_eyebrow varchar(160) NOT NULL DEFAULT 'Passport цикла',
  hero_panel_title varchar(255) NOT NULL DEFAULT 'Состояние фиксируется дважды',
  hero_panel_body text NOT NULL DEFAULT 'Club стартует как пилот с ручным расчётом: без публичной оплаты, скоринга и личного кабинета.',
  offers_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · устройства',
  offers_title varchar(255) NOT NULL DEFAULT 'Доступные устройства Club.',
  offers_empty_title varchar(255) NOT NULL DEFAULT 'Публичная витрина Club готовится.',
  offers_empty_body text NOT NULL DEFAULT 'Оставьте заявку: менеджер подберёт устройство, срок и тариф вручную.',
  monthly_fallback varchar(160) NOT NULL DEFAULT 'Расчёт по заявке',
  offer_cta_label varchar(160) NOT NULL DEFAULT 'Получить расчёт Club',
  cycle_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · как работает',
  cycle_title varchar(255) NOT NULL DEFAULT 'В конце срока есть четыре понятных сценария.',
  cycle_body text NOT NULL DEFAULT 'Сначала вы пользуетесь устройством в рамках согласованной модели, затем выбираете следующий шаг.',
  passport_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Passport · цикл владения',
  passport_title varchar(255) NOT NULL DEFAULT 'Передача и возврат фиксируются двумя проверками.',
  passport_body text NOT NULL DEFAULT 'Passport отделяет нормальный износ от спорных повреждений: состояние фиксируется в начале Club-цикла и при его завершении.',
  plans_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · тарифы',
  plans_title varchar(255) NOT NULL DEFAULT 'Тарифы отличаются уровнем сопровождения.',
  rules_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · правила',
  rules_title varchar(255) NOT NULL DEFAULT 'Правила фиксируют нормальный износ, возврат и выкуп.',
  participation_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · участие',
  participation_title varchar(255) NOT NULL DEFAULT 'От заявки до передачи устройства',
  participation_body text NOT NULL DEFAULT 'До оформления вы увидите устройство, расчёт, правила и проект документов.',
  legal_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · документы',
  legal_title varchar(255) NOT NULL DEFAULT 'Юридический пакет пилота',
  legal_body text NOT NULL DEFAULT 'Документы публикуются после проверки. До этого Club доступен как закрытый от поиска пилот.',
  final_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · заявка',
  final_title varchar(255) NOT NULL DEFAULT 'Получите ручной расчёт под устройство и срок.',
  final_body text NOT NULL DEFAULT 'Мы проверим модель, срок, тариф, комфортный ежемесячный платёж и сценарий в конце срока.',
  form_title varchar(255) NOT NULL DEFAULT 'Заявка на расчёт Club',
  form_scenario varchar(160) NOT NULL DEFAULT 'Получить расчёт Club',
  form_device_label varchar(160) NOT NULL DEFAULT 'Категория или модель',
  form_device_placeholder varchar(255) NOT NULL DEFAULT 'Например, iPhone 15 Pro 256 GB',
  form_device_error varchar(255) NOT NULL DEFAULT 'Укажите модель или выберите готовое предложение.',
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
  form_consent_label text NOT NULL DEFAULT 'Я согласен на обработку персональных данных для ответа по заявке.',
  consent_version varchar(120) NOT NULL DEFAULT 'club-pilot-v1',
  privacy_url varchar(500) NOT NULL DEFAULT 'https://isvoi.ru/privacy',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_plans ADD COLUMN IF NOT EXISTS support_level varchar(255);
ALTER TABLE club_plans ADD COLUMN IF NOT EXISTS service_response_text varchar(255);
ALTER TABLE club_plans ADD COLUMN IF NOT EXISTS diagnostics_text varchar(255);
ALTER TABLE club_plans ADD COLUMN IF NOT EXISTS replacement_text varchar(255);
ALTER TABLE club_plans ADD COLUMN IF NOT EXISTS early_exit_text varchar(255);
ALTER TABLE club_plans ADD COLUMN IF NOT EXISTS damage_text varchar(255);
ALTER TABLE club_offers ADD COLUMN IF NOT EXISTS pricing_mode varchar(32) NOT NULL DEFAULT 'manual';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS publication_mode varchar(32) NOT NULL DEFAULT 'pilot_noindex';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · пилот в Северодвинске';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_title varchar(255) NOT NULL DEFAULT 'Своя, пока нужна.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_body text NOT NULL DEFAULT 'Пользуйтесь проверенным устройством Apple за фиксированную плату в месяц. В конце срока продолжите, смените модель, выкупите или вернёте.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_primary_label varchar(160) NOT NULL DEFAULT 'Получить расчёт Club';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_primary_url varchar(255) NOT NULL DEFAULT '#club-request';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_secondary_label varchar(160) NOT NULL DEFAULT 'Посмотреть устройства';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_secondary_url varchar(255) NOT NULL DEFAULT '#devices';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_panel_eyebrow varchar(160) NOT NULL DEFAULT 'Passport цикла';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_panel_title varchar(255) NOT NULL DEFAULT 'Состояние фиксируется дважды';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS hero_panel_body text NOT NULL DEFAULT 'Club стартует как пилот с ручным расчётом: без публичной оплаты, скоринга и личного кабинета.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS cycle_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · как работает';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS cycle_title varchar(255) NOT NULL DEFAULT 'В конце срока есть четыре понятных сценария.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS cycle_body text NOT NULL DEFAULT 'Сначала вы пользуетесь устройством в рамках согласованной модели, затем выбираете следующий шаг.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS passport_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Passport · цикл владения';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS passport_title varchar(255) NOT NULL DEFAULT 'Передача и возврат фиксируются двумя проверками.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS passport_body text NOT NULL DEFAULT 'Passport отделяет нормальный износ от спорных повреждений: состояние фиксируется в начале Club-цикла и при его завершении.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS participation_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · участие';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS participation_title varchar(255) NOT NULL DEFAULT 'От заявки до передачи устройства';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS participation_body text NOT NULL DEFAULT 'До оформления вы увидите устройство, расчёт, правила и проект документов.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS legal_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · документы';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS legal_title varchar(255) NOT NULL DEFAULT 'Юридический пакет пилота';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS legal_body text NOT NULL DEFAULT 'Документы публикуются после проверки. До этого Club доступен как закрытый от поиска пилот.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS final_eyebrow varchar(160) NOT NULL DEFAULT 'I СВОИ Club · заявка';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS final_title varchar(255) NOT NULL DEFAULT 'Получите ручной расчёт под устройство и срок.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS final_body text NOT NULL DEFAULT 'Мы проверим модель, срок, тариф, комфортный ежемесячный платёж и сценарий в конце срока.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS form_device_label varchar(160) NOT NULL DEFAULT 'Категория или модель';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS form_device_placeholder varchar(255) NOT NULL DEFAULT 'Например, iPhone 15 Pro 256 GB';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS form_device_error varchar(255) NOT NULL DEFAULT 'Укажите модель или выберите готовое предложение.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS form_consent_label text NOT NULL DEFAULT 'Я согласен на обработку персональных данных для ответа по заявке.';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS consent_version varchar(120) NOT NULL DEFAULT 'club-pilot-v1';
ALTER TABLE club_page_settings ADD COLUMN IF NOT EXISTS privacy_url varchar(500) NOT NULL DEFAULT 'https://isvoi.ru/privacy';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_offer uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_plan uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_term_months integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_budget_text varchar(160);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_device_request varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_consent_version varchar(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS club_consent_at timestamptz;

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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='club_legal_documents_file_fkey') THEN
    ALTER TABLE club_legal_documents ADD CONSTRAINT club_legal_documents_file_fkey
      FOREIGN KEY (file) REFERENCES directus_files(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS club_plans_status_sort_idx ON club_plans(status, sort);
CREATE INDEX IF NOT EXISTS club_offers_status_sort_idx ON club_offers(status, offer_status, sort);
CREATE INDEX IF NOT EXISTS club_offers_product_idx ON club_offers(product);
CREATE INDEX IF NOT EXISTS club_offers_plan_idx ON club_offers(plan);
CREATE INDEX IF NOT EXISTS club_rule_items_status_sort_idx ON club_rule_items(status, sort);
CREATE INDEX IF NOT EXISTS club_process_items_status_group_sort_idx ON club_process_items(status, group_key, sort);
CREATE INDEX IF NOT EXISTS club_legal_documents_status_sort_idx ON club_legal_documents(status, sort);
CREATE INDEX IF NOT EXISTS leads_club_offer_idx ON leads(club_offer);
CREATE INDEX IF NOT EXISTS leads_club_plan_idx ON leads(club_plan);

INSERT INTO club_plans (
  slug,status,name,badge,summary,min_term_months,monthly_note,features,
  support_level,service_response_text,diagnostics_text,replacement_text,early_exit_text,damage_text,
  is_featured,is_future,sort
)
VALUES
  ('base','published','Base','Пилот','Базовая модель Club: устройство, Passport и четыре сценария в конце срока.',6,'Расчёт зависит от устройства и срока.','["Устройство из проверенного круга","Passport передачи и возврата","Продлить, сменить, выкупить или вернуть"]'::json,'Стандартное сопровождение','Ответ в рабочее время','Диагностика при передаче и возврате','Не включено','По индивидуальному расчёту','После диагностики по правилам пилота',true,false,10),
  ('care','published','Care','С сопровождением','Больше сопровождения и приоритетный сервисный маршрут в рамках пилота.',6,'Финальные условия подтверждаются вручную.','["Всё из Base","Приоритетный разбор сервисных вопросов","Расширенная фиксация состояния"]'::json,'Приоритетное сопровождение','Приоритетный ответ в рабочее время','Расширенная фиксация состояния','По наличию и условиям расчёта','По индивидуальному расчёту','Приоритетный разбор после диагностики',true,false,20),
  ('flex','published','Flex','Будущий формат','Гибкий формат смены устройства находится в подготовке и доступен как лист ожидания.',6,'Публичные условия появятся позже.','["Лист ожидания","Индивидуальный расчёт","Без публичного CTA до утверждения правил"]'::json,'Будущий формат',NULL,NULL,NULL,NULL,NULL,false,true,30)
ON CONFLICT (slug) DO UPDATE SET
  status=EXCLUDED.status,
  name=EXCLUDED.name,
  badge=EXCLUDED.badge,
  summary=EXCLUDED.summary,
  min_term_months=EXCLUDED.min_term_months,
  monthly_note=EXCLUDED.monthly_note,
  features=EXCLUDED.features,
  support_level=EXCLUDED.support_level,
  service_response_text=EXCLUDED.service_response_text,
  diagnostics_text=EXCLUDED.diagnostics_text,
  replacement_text=EXCLUDED.replacement_text,
  early_exit_text=EXCLUDED.early_exit_text,
  damage_text=EXCLUDED.damage_text,
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
  ('published','buyout','Выкуп','Выкуп возможен после согласования стоимости и финальной проверки состояния. Сумма не считается заранее зафиксированной, пока это не закреплено документами.',40),
  ('published','early_exit','Досрочный выход','Условия досрочного завершения рассчитываются и согласуются до подписания документов.',50),
  ('published','payment','Просрочка платежа','Сроки, уведомления и последствия просрочки фиксируются в индивидуальных условиях пилота.',60),
  ('published','loss','Потеря или кража','При потере или краже участник сразу сообщает I СВОИ; дальнейший порядок определяется документами пилота.',70),
  ('published','data','Данные и Apple ID','Личные данные удаляются владельцем до передачи; устройство не должно оставаться привязанным к Apple ID.',80),
  ('published','service','Сервис','Обращения по неисправностям сначала проходят диагностику; дальнейший маршрут зависит от тарифа и причины.',90)
) seed(status,category,title,body,sort)
WHERE NOT EXISTS (SELECT 1 FROM club_rule_items existing WHERE existing.title=seed.title);

INSERT INTO club_process_items (status,group_key,slug,label,title,body,sort)
VALUES
  ('published','scenario','extend','01','Продлить','Оставить устройство ещё на срок после согласования условий.',10),
  ('published','scenario','switch','02','Сменить','Перейти на другую модель после проверки и нового расчёта.',20),
  ('published','scenario','buyout','03','Выкупить','Оставить устройство себе по согласованной после проверки стоимости.',30),
  ('published','scenario','return','04','Вернуть','Закрыть цикл после удаления данных и повторной диагностики.',40),
  ('published','passport','passport-start','Старт','Паспорт передачи','Модель, комплект, корпус, экран, батарея и важные серийные признаки.',10),
  ('published','passport','passport-finish','Финиш','Паспорт возврата','Повторная проверка перед продлением, сменой, выкупом или возвратом.',20),
  ('published','participation','participation-request','01','Заявка','Укажите модель, срок и комфортный платёж.',10),
  ('published','participation','participation-calculation','02','Расчёт','Покажем устройство, тариф, платёж и сценарии завершения.',20),
  ('published','participation','participation-handover','03','Проверка и передача','Фиксируем состояние в Passport и подписываем проверенные документы.',30)
ON CONFLICT (slug) DO UPDATE SET
  status=EXCLUDED.status,
  group_key=EXCLUDED.group_key,
  label=EXCLUDED.label,
  title=EXCLUDED.title,
  body=EXCLUDED.body,
  sort=EXCLUDED.sort,
  updated_at=now();

INSERT INTO club_legal_documents (
  status,document_type,slug,title,summary,body,version,legal_reviewed,sort
)
VALUES
  ('draft','privacy','privacy','Политика обработки данных Club','Документ для обработки заявок Club.','','',false,10),
  ('draft','pilot_terms','pilot-terms','Условия пилота I СВОИ Club','Правила участия, платежей, возврата и завершения Club-цикла.','','',false,20),
  ('draft','contract_draft','contract-draft','Проект договора Club','Проект договора для проверки до запуска публичного трафика.','','',false,30)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO club_page_settings (singleton_key)
VALUES ('club')
ON CONFLICT (singleton_key) DO NOTHING;

UPDATE club_page_settings
SET offers_eyebrow=CASE WHEN offers_eyebrow IN ('Устройства','I СВОИ Club · устройства') THEN 'I СВОИ Club · подбор' ELSE offers_eyebrow END,
    offers_title=CASE WHEN offers_title IN ('Доступно по Club','Доступные устройства Club.') THEN 'Подберём устройство под задачу и срок' ELSE offers_title END,
    offers_empty_title=CASE WHEN offers_empty_title IN ('Club-витрина готовится','Публичная витрина Club готовится.') THEN 'Начните с модели или категории' ELSE offers_empty_title END,
    offers_empty_body=CASE WHEN offers_empty_body LIKE '%витрин%' OR offers_empty_body LIKE '%Оставьте заявку%' THEN 'Укажите, что вам нужно, желаемый срок и комфортный платёж. Менеджер предложит конкретное проверенное устройство.' ELSE offers_empty_body END,
    offer_cta_label=CASE WHEN offer_cta_label IN ('Получить расчёт','Получить расчёт Club') THEN 'Рассчитать это устройство' ELSE offer_cta_label END,
    plans_title=CASE WHEN plans_title IN ('Base и Care запускаются первыми','Тарифы отличаются уровнем сопровождения.') THEN 'Base и Care отличаются уровнем сопровождения' ELSE plans_title END,
    form_consent_note=CASE WHEN form_consent_note LIKE 'Нажимая кнопку%' THEN 'Согласие относится только к обработке заявки Club и не означает заключение договора.' ELSE form_consent_note END,
    updated_at=now()
WHERE singleton_key='club';

UPDATE site_pages
SET title='I СВОИ Club — устройство по понятной ежемесячной модели',
    meta_description='Пилот I СВОИ Club в Северодвинске: подберём проверенное устройство, срок и понятный ежемесячный платёж.'
WHERE slug='club';

UPDATE page_sections section
SET eyebrow='I СВОИ Club · пилот в Северодвинске',
    headline='Своя, пока нужна.',
    body='Пользуйтесь проверенным устройством Apple за фиксированную плату в месяц. В конце срока продолжите, смените модель, выкупите или вернёте.',
    primary_cta_label='Получить расчёт Club',
    primary_cta_url='#club-request',
    secondary_cta_label='Посмотреть устройства',
    secondary_cta_url='#devices'
FROM site_pages page
WHERE section.page=page.id AND page.slug='club' AND section.section_key='club_hero';

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
SELECT isvoi_club_upsert_collection('club_process_items','route','Editable Club scenarios, Passport stages and participation steps.','{{group_key}} · {{title}}',false,47);
SELECT isvoi_club_upsert_collection('club_legal_documents','gavel','Draft and published legal documents for the Club pilot.','{{title}} · {{status}} · {{version}}',false,48);
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
SELECT isvoi_club_upsert_field('club_plans','min_term_months','input','raw',NULL,'half',7,'Minimum term shown in comparison.');
SELECT isvoi_club_upsert_field('club_plans','monthly_note','input','raw',NULL,'half',8,'Short pricing note.');
SELECT isvoi_club_upsert_field('club_plans','support_level','input','raw',NULL,'half',9,'Measurable support level used in Base/Care comparison.');
SELECT isvoi_club_upsert_field('club_plans','service_response_text','input','raw',NULL,'half',10,'Expected service response wording. Publish only verified promises.');
SELECT isvoi_club_upsert_field('club_plans','diagnostics_text','input','raw',NULL,'half',11,'Diagnostics included in this plan.');
SELECT isvoi_club_upsert_field('club_plans','replacement_text','input','raw',NULL,'half',12,'Replacement device policy. Do not promise availability unless approved.');
SELECT isvoi_club_upsert_field('club_plans','early_exit_text','input','raw',NULL,'half',13,'Early exit terms shown in comparison.');
SELECT isvoi_club_upsert_field('club_plans','damage_text','input','raw',NULL,'half',14,'Damage handling shown in comparison.');
SELECT isvoi_club_upsert_field('club_plans','is_featured','boolean','boolean',NULL,'half',15,'Highlights the active pilot plan.');
SELECT isvoi_club_upsert_field('club_plans','is_future','boolean','boolean',NULL,'half',16,'Use for future formats such as Flex. Future plans should not look like a ready purchase CTA.');
SELECT isvoi_club_upsert_field('club_plans','sort','input','raw',NULL,'half',17,'Sort order.');

SELECT isvoi_club_upsert_field('club_offers','status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Archived","value":"archived"}]}'::json,'half',1,'Publication status. Public page reads only published rows.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','offer_status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Approved","value":"approved"},{"text":"Waitlist","value":"waitlist"},{"text":"Paused","value":"paused"},{"text":"Archived","value":"archived"}]}'::json,'half',2,'Approved offers may show public monthly price. Waitlist offers use request wording.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','product','select-dropdown-m2o','related-values',NULL,'half',3,'Product from the commercial catalog used as the Club device.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','plan','select-dropdown-m2o','related-values',NULL,'half',4,'Club plan linked to this offer.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','term_months','input','raw',NULL,'half',5,'Minimum term in months.');
SELECT isvoi_club_upsert_field('club_offers','pricing_mode','select-dropdown','labels','{"choices":[{"text":"Ручной расчёт","value":"manual"},{"text":"Цена от","value":"monthly_from"}]}'::json,'half',6,'Manual shows request wording. Monthly from requires an approved monthly value.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','monthly_from','input','raw',NULL,'half',7,'Public monthly price in rubles. Required for monthly_from mode.');
SELECT isvoi_club_upsert_field('club_offers','terms_text','input-multiline','raw',NULL,'full',8,'Short terms shown on the offer card.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_offers','badge','input','raw',NULL,'half',9,'Optional offer badge.');
SELECT isvoi_club_upsert_field('club_offers','cta_label','input','raw',NULL,'half',10,'Optional CTA override. Default is from Club settings.');
SELECT isvoi_club_upsert_field('club_offers','sort','input','raw',NULL,'half',11,'Sort order.');

SELECT isvoi_club_upsert_field('club_rule_items','status','select-dropdown','labels', '{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Archived","value":"archived"}]}'::json,'half',1,'Publication status.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','category','select-dropdown','labels', '{"choices":[{"text":"Нормальный износ","value":"wear"},{"text":"Повреждения","value":"damage"},{"text":"Возврат","value":"return"},{"text":"Выкуп","value":"buyout"},{"text":"Досрочный выход","value":"early_exit"},{"text":"Платежи","value":"payment"},{"text":"Потеря или кража","value":"loss"},{"text":"Данные / Apple ID","value":"data"},{"text":"Сервис","value":"service"}]}'::json,'half',2,'Категория правила. На сайте показывается локализованная подпись.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','title','input','raw',NULL,'half',3,'Rule title.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','body','input-multiline','raw',NULL,'full',4,'Public rule explanation.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_rule_items','sort','input','raw',NULL,'half',5,'Sort order.');

SELECT isvoi_club_upsert_field('club_process_items','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}'::json,'half',1,'Only published steps appear on Club.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_process_items','group_key','select-dropdown','labels','{"choices":[{"text":"Сценарии завершения","value":"scenario"},{"text":"Passport","value":"passport"},{"text":"Участие","value":"participation"}]}'::json,'half',2,'Select where this step is displayed.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_process_items','slug','input','raw',NULL,'half',3,'Stable unique key.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_process_items','label','input','raw',NULL,'half',4,'Short step number or stage label.');
SELECT isvoi_club_upsert_field('club_process_items','title','input','raw',NULL,'half',5,'Public title.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_process_items','body','input-multiline','raw',NULL,'full',6,'Public explanation.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_process_items','sort','input','raw',NULL,'half',7,'Sort inside the selected group.');

SELECT isvoi_club_upsert_field('club_legal_documents','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}'::json,'half',1,'Publish only after legal review.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_legal_documents','document_type','select-dropdown','labels','{"choices":[{"text":"Политика данных","value":"privacy"},{"text":"Условия пилота","value":"pilot_terms"},{"text":"Проект договора","value":"contract_draft"}]}'::json,'half',2,'Required launch-gate document type.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_legal_documents','slug','input','raw',NULL,'half',3,'Stable URL slug.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_legal_documents','title','input','raw',NULL,'full',4,'Public document title.',NULL,NULL,true);
SELECT isvoi_club_upsert_field('club_legal_documents','summary','input-multiline','raw',NULL,'full',5,'Short description shown on the Club page.');
SELECT isvoi_club_upsert_field('club_legal_documents','body','input-multiline','raw',NULL,'full',6,'Document body. Keep draft until reviewed.');
SELECT isvoi_club_upsert_field('club_legal_documents','version','input','raw',NULL,'half',7,'Published document version.');
SELECT isvoi_club_upsert_field('club_legal_documents','effective_date','datetime','datetime',NULL,'half',8,'Effective date.');
SELECT isvoi_club_upsert_field('club_legal_documents','file','file','file',NULL,'full',9,'Optional reviewed PDF in Directus Files.','file');
SELECT isvoi_club_upsert_field('club_legal_documents','legal_reviewed','boolean','boolean',NULL,'half',10,'Admin confirmation that the exact published version was legally reviewed.');
SELECT isvoi_club_upsert_field('club_legal_documents','sort','input','raw',NULL,'half',11,'Display order.');

SELECT isvoi_club_upsert_field('club_page_settings','group_publication','group-detail',NULL,'{"start":"open","headerIcon":"shield"}'::json,'full',1,'Launch mode and search visibility.','group');
SELECT isvoi_club_upsert_field('club_page_settings','group_hero','group-detail',NULL,'{"start":"open","headerIcon":"web_asset"}'::json,'full',2,'First screen copy and CTA.','group');
SELECT isvoi_club_upsert_field('club_page_settings','group_offers','group-detail',NULL,'{"start":"closed","headerIcon":"devices"}'::json,'full',3,'Device selection and offer labels.','group');
SELECT isvoi_club_upsert_field('club_page_settings','group_story','group-detail',NULL,'{"start":"closed","headerIcon":"route"}'::json,'full',4,'Process, Passport, plan and rule section copy.','group');
SELECT isvoi_club_upsert_field('club_page_settings','group_legal','group-detail',NULL,'{"start":"closed","headerIcon":"gavel"}'::json,'full',5,'Legal section and consent controls.','group');
SELECT isvoi_club_upsert_field('club_page_settings','group_form','group-detail',NULL,'{"start":"closed","headerIcon":"contact_page"}'::json,'full',6,'Lead form labels and states.','group');
SELECT isvoi_club_upsert_field('club_page_settings','group_advanced','group-detail',NULL,'{"start":"closed","headerIcon":"settings"}'::json,'full',7,'Technical singleton fields.','group');

SELECT isvoi_club_upsert_field('club_page_settings','publication_mode','select-dropdown','labels','{"choices":[{"text":"Пилот · noindex","value":"pilot_noindex"},{"text":"Публичная индексация","value":"public_index"},{"text":"Пауза","value":"paused"}]}'::json,'half',1,'Only admin can switch indexing. public_index also requires CLUB_INDEXING_ENABLED=1 and a green launch gate.',NULL,'group_publication',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_eyebrow','input','raw',NULL,'half',1,'Club eyebrow.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_title','input','raw',NULL,'full',2,'Main Club promise.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_body','input-multiline','raw',NULL,'full',3,'Plain-language Club explanation.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_primary_label','input','raw',NULL,'half',4,'Primary CTA label.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_primary_url','input','raw',NULL,'half',5,'Use #club-request.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_secondary_label','input','raw',NULL,'half',6,'Secondary CTA label.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_secondary_url','input','raw',NULL,'half',7,'Use #devices.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_disclaimer','input-multiline','raw',NULL,'full',8,'Required ownership and rental disclaimer.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_panel_eyebrow','input','raw',NULL,'half',9,'Passport panel eyebrow.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_panel_title','input','raw',NULL,'half',10,'Passport panel title.',NULL,'group_hero',true);
SELECT isvoi_club_upsert_field('club_page_settings','hero_panel_body','input-multiline','raw',NULL,'full',11,'Pilot limitations shown in the hero panel.',NULL,'group_hero',true);

SELECT isvoi_club_upsert_field('club_page_settings','offers_eyebrow','input','raw',NULL,'half',1,'Offers section eyebrow.',NULL,'group_offers',true);
SELECT isvoi_club_upsert_field('club_page_settings','offers_title','input','raw',NULL,'full',2,'Offers section title.',NULL,'group_offers',true);
SELECT isvoi_club_upsert_field('club_page_settings','offers_empty_title','input','raw',NULL,'full',3,'Selection-first title when no offers are published.',NULL,'group_offers',true);
SELECT isvoi_club_upsert_field('club_page_settings','offers_empty_body','input-multiline','raw',NULL,'full',4,'Selection explanation when no offers are published.',NULL,'group_offers',true);
SELECT isvoi_club_upsert_field('club_page_settings','monthly_fallback','input','raw',NULL,'half',5,'Text shown when price is calculated manually.',NULL,'group_offers',true);
SELECT isvoi_club_upsert_field('club_page_settings','offer_cta_label','input','raw',NULL,'half',6,'Default offer CTA.',NULL,'group_offers',true);

SELECT isvoi_club_upsert_field('club_page_settings','cycle_eyebrow','input','raw',NULL,'half',1,'Cycle section eyebrow.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','cycle_title','input','raw',NULL,'full',2,'Cycle section title.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','cycle_body','input-multiline','raw',NULL,'full',3,'Cycle section explanation.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','passport_eyebrow','input','raw',NULL,'half',4,'Passport section eyebrow.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','passport_title','input','raw',NULL,'full',5,'Passport section title.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','passport_body','input-multiline','raw',NULL,'full',6,'Passport section explanation.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','plans_eyebrow','input','raw',NULL,'half',7,'Plans section eyebrow.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','plans_title','input','raw',NULL,'full',8,'Plans section title.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','rules_eyebrow','input','raw',NULL,'half',9,'Rules section eyebrow.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','rules_title','input','raw',NULL,'full',10,'Rules section title.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','participation_eyebrow','input','raw',NULL,'half',11,'Participation section eyebrow.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','participation_title','input','raw',NULL,'full',12,'Participation section title.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','participation_body','input-multiline','raw',NULL,'full',13,'Participation section explanation.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','final_eyebrow','input','raw',NULL,'half',14,'Final form eyebrow.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','final_title','input','raw',NULL,'full',15,'Final form title.',NULL,'group_story',true);
SELECT isvoi_club_upsert_field('club_page_settings','final_body','input-multiline','raw',NULL,'full',16,'Final form explanation.',NULL,'group_story',true);

SELECT isvoi_club_upsert_field('club_page_settings','legal_eyebrow','input','raw',NULL,'half',1,'Legal section eyebrow.',NULL,'group_legal',true);
SELECT isvoi_club_upsert_field('club_page_settings','legal_title','input','raw',NULL,'full',2,'Legal section title.',NULL,'group_legal',true);
SELECT isvoi_club_upsert_field('club_page_settings','legal_body','input-multiline','raw',NULL,'full',3,'Legal readiness explanation.',NULL,'group_legal',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_consent_label','input-multiline','raw',NULL,'full',4,'Required checkbox label.',NULL,'group_legal',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_consent_note','input-multiline','raw',NULL,'full',5,'Consent clarification below the checkbox.',NULL,'group_legal',true);
SELECT isvoi_club_upsert_field('club_page_settings','consent_version','input','raw',NULL,'half',6,'Version stored with each Club lead.',NULL,'group_legal',true);
SELECT isvoi_club_upsert_field('club_page_settings','privacy_url','input','raw',NULL,'full',7,'Published privacy policy URL.',NULL,'group_legal',true);

SELECT isvoi_club_upsert_field('club_page_settings','form_title','input','raw',NULL,'full',1,'Lead form title.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_scenario','input','raw',NULL,'half',2,'Lead scenario stored in Directus.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_device_label','input','raw',NULL,'half',3,'Device request field label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_device_placeholder','input','raw',NULL,'half',4,'Device request example.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_device_error','input','raw',NULL,'full',5,'Validation error for missing offer/model.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_contact_label','input','raw',NULL,'half',6,'Contact field label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_contact_placeholder','input','raw',NULL,'half',7,'Contact example.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_budget_label','input','raw',NULL,'half',8,'Budget field label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_budget_placeholder','input','raw',NULL,'half',9,'Budget example.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_term_label','input','raw',NULL,'half',10,'Term field label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_message_label','input','raw',NULL,'half',11,'Comment field label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_message_placeholder','input-multiline','raw',NULL,'full',12,'Comment field example.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_submit_label','input','raw',NULL,'half',13,'Submit label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_submitting_label','input','raw',NULL,'half',14,'Submitting label.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_idle_note','input-multiline','raw',NULL,'full',15,'Idle form note.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_success_note','input-multiline','raw',NULL,'full',16,'Success state.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','form_error_note','input-multiline','raw',NULL,'full',17,'Error state.',NULL,'group_form',true);
SELECT isvoi_club_upsert_field('club_page_settings','singleton_key','input','raw',NULL,'half',1,'Technical singleton key.',NULL,'group_advanced',true,true);
SELECT isvoi_club_upsert_field('club_page_settings','updated_at','datetime','datetime',NULL,'half',2,'Last settings update.',NULL,'group_advanced',false,true);

SELECT isvoi_club_upsert_field('leads','club_offer','select-dropdown-m2o','related-values',NULL,'half',80,'Club offer selected on club.isvoi.ru.',NULL,'group_context',false,true);
SELECT isvoi_club_upsert_field('leads','club_plan','select-dropdown-m2o','related-values',NULL,'half',81,'Club plan selected on club.isvoi.ru.',NULL,'group_context',false,true);
SELECT isvoi_club_upsert_field('leads','club_term_months','input','raw',NULL,'half',82,'Requested Club term in months.',NULL,'group_context',false,true);
SELECT isvoi_club_upsert_field('leads','club_budget_text','input','raw',NULL,'half',83,'Comfortable monthly payment text entered by the visitor.',NULL,'group_context',false,true);
SELECT isvoi_club_upsert_field('leads','club_device_request','input','raw',NULL,'full',84,'Requested Club category or model when no offer was selected.',NULL,'group_context',false,true);
SELECT isvoi_club_upsert_field('leads','club_consent_version','input','raw',NULL,'half',85,'Consent copy version submitted with the Club lead.',NULL,'group_source',false,true);
SELECT isvoi_club_upsert_field('leads','club_consent_at','datetime','datetime',NULL,'half',86,'Server timestamp of explicit Club consent.',NULL,'group_source',false,true);

SELECT isvoi_club_upsert_relation('club_offers','product','products',NULL,'delete');
SELECT isvoi_club_upsert_relation('club_offers','plan','club_plans',NULL,'restrict');
SELECT isvoi_club_upsert_relation('leads','club_offer','club_offers',NULL,'nullify');
SELECT isvoi_club_upsert_relation('leads','club_plan','club_plans',NULL,'nullify');
SELECT isvoi_club_upsert_relation('club_legal_documents','file','directus_files',NULL,'nullify');

SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_plans','read','id,slug,status,name,badge,summary,min_term_months,monthly_note,features,support_level,service_response_text,diagnostics_text,replacement_text,early_exit_text,damage_text,is_featured,is_future,sort','{"status":{"_eq":"published"}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_rule_items','read','id,status,category,title,body,sort','{"status":{"_eq":"published"}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_process_items','read','id,status,group_key,slug,label,title,body,sort','{"status":{"_eq":"published"}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_legal_documents','read','id,status,document_type,slug,title,summary,body,version,effective_date,file,legal_reviewed,sort','{"_and":[{"status":{"_eq":"published"}},{"legal_reviewed":{"_eq":true}}]}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_page_settings','read','id,singleton_key,publication_mode,hero_eyebrow,hero_title,hero_body,hero_primary_label,hero_primary_url,hero_secondary_label,hero_secondary_url,hero_disclaimer,hero_panel_eyebrow,hero_panel_title,hero_panel_body,offers_eyebrow,offers_title,offers_empty_title,offers_empty_body,monthly_fallback,offer_cta_label,cycle_eyebrow,cycle_title,cycle_body,passport_eyebrow,passport_title,passport_body,plans_eyebrow,plans_title,rules_eyebrow,rules_title,participation_eyebrow,participation_title,participation_body,legal_eyebrow,legal_title,legal_body,final_eyebrow,final_title,final_body,form_title,form_scenario,form_device_label,form_device_placeholder,form_device_error,form_contact_label,form_contact_placeholder,form_budget_label,form_budget_placeholder,form_term_label,form_message_label,form_message_placeholder,form_submit_label,form_submitting_label,form_idle_note,form_success_note,form_error_note,form_consent_note,form_consent_label,consent_version,privacy_url,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Public Read','club_offers','read','id,status,offer_status,product,plan,term_months,monthly_from,pricing_mode,terms_text,badge,cta_label,sort','{"status":{"_eq":"published"},"offer_status":{"_in":["approved","waitlist"]}}'::json);

SELECT isvoi_club_upsert_permission('ISVOI Editor','club_plans','read','id,status,slug,name,badge,summary,min_term_months,monthly_note,features,support_level,service_response_text,diagnostics_text,replacement_text,early_exit_text,damage_text,is_featured,is_future,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_plans','create','status,slug,name,badge,summary,min_term_months,monthly_note,features,support_level,service_response_text,diagnostics_text,replacement_text,early_exit_text,damage_text,is_featured,is_future,sort','{}'::json,'{"slug":{"_nnull":true},"name":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_plans','update','status,slug,name,badge,summary,min_term_months,monthly_note,features,support_level,service_response_text,diagnostics_text,replacement_text,early_exit_text,damage_text,is_featured,is_future,sort','{}'::json,'{"slug":{"_nnull":true},"name":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_offers','read','id,status,offer_status,product,plan,term_months,monthly_from,pricing_mode,terms_text,badge,cta_label,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_offers','create','status,offer_status,product,plan,term_months,monthly_from,pricing_mode,terms_text,badge,cta_label,sort','{}'::json,'{"product":{"_nnull":true},"plan":{"_nnull":true},"term_months":{"_nnull":true},"terms_text":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_offers','update','status,offer_status,product,plan,term_months,monthly_from,pricing_mode,terms_text,badge,cta_label,sort','{}'::json,'{"product":{"_nnull":true},"plan":{"_nnull":true},"term_months":{"_nnull":true},"terms_text":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_rule_items','read','id,status,category,title,body,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_rule_items','create','status,category,title,body,sort','{}'::json,'{"title":{"_nnull":true},"body":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_rule_items','update','status,category,title,body,sort','{}'::json,'{"title":{"_nnull":true},"body":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_process_items','read','id,status,group_key,slug,label,title,body,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_process_items','create','status,group_key,slug,label,title,body,sort','{}'::json,'{"group_key":{"_nnull":true},"slug":{"_nnull":true},"title":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_process_items','update','status,group_key,slug,label,title,body,sort','{}'::json,'{"group_key":{"_nnull":true},"slug":{"_nnull":true},"title":{"_nnull":true}}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_legal_documents','read','id,status,document_type,slug,title,summary,body,version,effective_date,file,legal_reviewed,sort,created_at,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_legal_documents','create','document_type,slug,title,summary,body,version,effective_date,file,sort','{}'::json,'{"document_type":{"_nnull":true},"slug":{"_nnull":true},"title":{"_nnull":true}}'::json,'{"status":"draft","legal_reviewed":false}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_legal_documents','update','document_type,slug,title,summary,body,version,effective_date,file,sort','{}'::json);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_page_settings','read','id,singleton_key,publication_mode,hero_eyebrow,hero_title,hero_body,hero_primary_label,hero_primary_url,hero_secondary_label,hero_secondary_url,hero_disclaimer,hero_panel_eyebrow,hero_panel_title,hero_panel_body,offers_eyebrow,offers_title,offers_empty_title,offers_empty_body,monthly_fallback,offer_cta_label,cycle_eyebrow,cycle_title,cycle_body,passport_eyebrow,passport_title,passport_body,plans_eyebrow,plans_title,rules_eyebrow,rules_title,participation_eyebrow,participation_title,participation_body,legal_eyebrow,legal_title,legal_body,final_eyebrow,final_title,final_body,form_title,form_scenario,form_device_label,form_device_placeholder,form_device_error,form_contact_label,form_contact_placeholder,form_budget_label,form_budget_placeholder,form_term_label,form_message_label,form_message_placeholder,form_submit_label,form_submitting_label,form_idle_note,form_success_note,form_error_note,form_consent_note,form_consent_label,consent_version,privacy_url,updated_at',NULL);
SELECT isvoi_club_upsert_permission('ISVOI Editor','club_page_settings','update','hero_eyebrow,hero_title,hero_body,hero_primary_label,hero_primary_url,hero_secondary_label,hero_secondary_url,hero_disclaimer,hero_panel_eyebrow,hero_panel_title,hero_panel_body,offers_eyebrow,offers_title,offers_empty_title,offers_empty_body,monthly_fallback,offer_cta_label,cycle_eyebrow,cycle_title,cycle_body,passport_eyebrow,passport_title,passport_body,plans_eyebrow,plans_title,rules_eyebrow,rules_title,participation_eyebrow,participation_title,participation_body,legal_eyebrow,legal_title,legal_body,final_eyebrow,final_title,final_body,form_title,form_scenario,form_device_label,form_device_placeholder,form_device_error,form_contact_label,form_contact_placeholder,form_budget_label,form_budget_placeholder,form_term_label,form_message_label,form_message_placeholder,form_submit_label,form_submitting_label,form_idle_note,form_success_note,form_error_note,form_consent_note,form_consent_label,consent_version,privacy_url','{}'::json);

UPDATE directus_permissions
SET fields = concat_ws(',',
  fields,
  CASE WHEN fields NOT LIKE '%club_offer%' THEN 'club_offer' END,
  CASE WHEN fields NOT LIKE '%club_plan%' THEN 'club_plan' END,
  CASE WHEN fields NOT LIKE '%club_term_months%' THEN 'club_term_months' END,
  CASE WHEN fields NOT LIKE '%club_budget_text%' THEN 'club_budget_text' END,
  CASE WHEN fields NOT LIKE '%club_device_request%' THEN 'club_device_request' END,
  CASE WHEN fields NOT LIKE '%club_consent_version%' THEN 'club_consent_version' END,
  CASE WHEN fields NOT LIKE '%club_consent_at%' THEN 'club_consent_at' END
)
WHERE collection='leads'
  AND action='create'
  AND policy IN (SELECT id FROM directus_policies WHERE name='ISVOI Lead Intake')
  AND (
    fields NOT LIKE '%club_device_request%'
    OR fields NOT LIKE '%club_consent_version%'
    OR fields NOT LIKE '%club_consent_at%'
  );

INSERT INTO directus_presets (bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT 'Club: новые', role.id, NULL, 'leads', 'tabular',
  '{"tabular":{"fields":["created_at","contact","club_device_request","club_offer","club_plan","club_term_months","status","assigned_to"],"sort":["-created_at"]}}'::json,
  '{"kind":{"_eq":"club"},"status":{"_eq":"new"}}'::json,
  'loyalty',
  '#0071e3'
FROM directus_roles role
WHERE role.name='ISVOI Editor'
  AND NOT EXISTS (
    SELECT 1 FROM directus_presets p
    WHERE p.role=role.id AND p.collection='leads' AND p.bookmark='Club: новые' AND p."user" IS NULL
  );

UPDATE directus_presets
SET layout_query='{"tabular":{"fields":["created_at","contact","club_device_request","club_offer","club_plan","club_term_months","status","assigned_to"],"sort":["-created_at"]}}'::json
WHERE collection='leads' AND bookmark='Club: новые' AND "user" IS NULL
  AND role IN (SELECT id FROM directus_roles WHERE name='ISVOI Editor');

INSERT INTO directus_presets (bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT preset.bookmark, role.id, NULL, 'leads', 'tabular', preset.layout_query, preset.filter, preset.icon, preset.color
FROM directus_roles role
CROSS JOIN (
  VALUES
    (
      'Club: без ответственного',
      '{"tabular":{"fields":["created_at","status","contact","club_device_request","club_offer","club_plan","next_action_at"],"sort":["-created_at"]}}'::json,
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_in":["new","in_progress","waiting"]}},{"assigned_to":{"_null":true}}]}'::json,
      'person_off',
      '#ef4444'
    ),
    (
      'Club: расчёт отправлен',
      '{"tabular":{"fields":["created_at","status","contact","club_device_request","club_offer","club_plan","assigned_to","next_action_at"],"sort":["-created_at"]}}'::json,
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_eq":"waiting"}}]}'::json,
      'send',
      '#f59e0b'
    ),
    (
      'Club: просрочен SLA',
      '{"tabular":{"fields":["next_action_at","created_at","status","contact","club_device_request","club_offer","club_plan","assigned_to"],"sort":["next_action_at"]}}'::json,
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_in":["in_progress","waiting"]}},{"next_action_at":{"_lt":"$NOW"}}]}'::json,
      'event_busy',
      '#dc2626'
    )
) preset(bookmark,layout_query,filter,icon,color)
WHERE role.name='ISVOI Editor'
  AND NOT EXISTS (
    SELECT 1 FROM directus_presets existing
    WHERE existing.role=role.id
      AND existing.collection='leads'
      AND existing.bookmark=preset.bookmark
      AND existing."user" IS NULL
  );

INSERT INTO directus_presets (bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT
  preset.bookmark,
  role.id,
  NULL,
  'navigation_items',
  'tabular',
  preset.layout_query,
  preset.filter,
  preset.icon,
  preset.color
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
