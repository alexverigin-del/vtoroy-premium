#!/usr/bin/env node
/**
 * Print idempotent SQL for managed third-party integrations and consent copy.
 *
 * Usage:
 *   node scripts/setup_directus_site_integrations_sql.mjs > /tmp/isvoi_site_integrations.sql
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_site_integrations.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS site_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(24) NOT NULL DEFAULT 'draft',
  name varchar(160) NOT NULL,
  provider varchar(48) NOT NULL DEFAULT 'yandex_metrika',
  consent_category varchar(32) NOT NULL DEFAULT 'analytics',
  load_strategy varchar(32) NOT NULL DEFAULT 'after_interactive',
  provider_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  script_url text,
  bootstrap_code text,
  cleanup_code text,
  hostnames jsonb NOT NULL DEFAULT '[]'::jsonb,
  include_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclude_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort integer NOT NULL DEFAULT 10,
  notes text,
  user_created uuid,
  date_created timestamptz NOT NULL DEFAULT now(),
  user_updated uuid,
  date_updated timestamptz
);

CREATE TABLE IF NOT EXISTS integration_consent_settings (
  id integer PRIMARY KEY DEFAULT 1,
  version varchar(120) NOT NULL DEFAULT 'integrations-consent-v1',
  retention_days integer NOT NULL DEFAULT 180,
  banner_title varchar(240) NOT NULL,
  banner_body text NOT NULL,
  accept_all_label varchar(120) NOT NULL,
  reject_optional_label varchar(120) NOT NULL,
  customize_label varchar(120) NOT NULL,
  settings_title varchar(240) NOT NULL,
  settings_body text NOT NULL,
  save_label varchar(120) NOT NULL,
  close_label varchar(120) NOT NULL,
  footer_link_label varchar(120) NOT NULL,
  privacy_link_label varchar(120) NOT NULL,
  necessary_label varchar(120) NOT NULL,
  necessary_description text NOT NULL,
  analytics_label varchar(120) NOT NULL,
  analytics_description text NOT NULL,
  marketing_label varchar(120) NOT NULL,
  marketing_description text NOT NULL,
  support_label varchar(120) NOT NULL,
  support_description text NOT NULL,
  user_updated uuid,
  date_updated timestamptz
);

ALTER TABLE integration_consent_settings
  ADD COLUMN IF NOT EXISTS privacy_link_label varchar(120) NOT NULL DEFAULT 'Подробнее о данных';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_status_check') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_status_check
      CHECK (status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_provider_check') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_provider_check
      CHECK (provider IN ('yandex_metrika','custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_category_check') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_category_check
      CHECK (consent_category IN ('necessary','analytics','marketing','support'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_strategy_check') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_strategy_check
      CHECK (load_strategy IN ('after_interactive','lazy_onload'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_json_shape_check') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_json_shape_check
      CHECK (
        jsonb_typeof(provider_settings)='object' AND
        jsonb_typeof(hostnames)='array' AND
        jsonb_typeof(include_paths)='array' AND
        jsonb_typeof(exclude_paths)='array'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_consent_singleton_check') THEN
    ALTER TABLE integration_consent_settings ADD CONSTRAINT integration_consent_singleton_check
      CHECK (id=1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_consent_retention_check') THEN
    ALTER TABLE integration_consent_settings ADD CONSTRAINT integration_consent_retention_check
      CHECK (retention_days BETWEEN 1 AND 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_user_created_fkey') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_user_created_fkey
      FOREIGN KEY (user_created) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_integrations_user_updated_fkey') THEN
    ALTER TABLE site_integrations ADD CONSTRAINT site_integrations_user_updated_fkey
      FOREIGN KEY (user_updated) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_consent_user_updated_fkey') THEN
    ALTER TABLE integration_consent_settings ADD CONSTRAINT integration_consent_user_updated_fkey
      FOREIGN KEY (user_updated) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

INSERT INTO integration_consent_settings (
  id,version,retention_days,banner_title,banner_body,accept_all_label,
  reject_optional_label,customize_label,settings_title,settings_body,save_label,
  close_label,footer_link_label,privacy_link_label,necessary_label,necessary_description,
  analytics_label,analytics_description,marketing_label,marketing_description,
  support_label,support_description
) VALUES (
  1,'integrations-consent-v1',180,'Настройки приватности',
  'Мы используем необходимые cookie для работы сайта. С вашего согласия Яндекс Метрика будет собирать данные о посещениях, чтобы мы могли анализировать трафик и улучшать сайт. Вы можете разрешить аналитику или оставить только необходимые cookie. Подробнее — в Политике конфиденциальности.',
  'Принять все','Только необходимые','Настроить','Какие сервисы можно включить',
  'Необходимые функции работают всегда. Остальные категории можно включать независимо друг от друга.',
  'Сохранить выбор','Закрыть','Настройки cookies','Подробнее о данных','Необходимые',
  'Нужны для базовой работы и безопасности сайта.','Аналитика',
  'Помогает понять, какие страницы полезны и где сайт можно улучшить.','Маркетинг',
  'Используется для оценки рекламных кампаний и релевантности предложений.','Поддержка и чаты',
  'Позволяет подключать онлайн-чат и другие сервисы помощи.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO site_integrations (
  id,status,name,provider,consent_category,load_strategy,provider_settings,
  hostnames,include_paths,exclude_paths,sort,notes
) VALUES (
  '00000000-0000-4000-8000-000000000101','draft','Яндекс Метрика',
  'yandex_metrika','analytics','after_interactive',
  '{"counterId":"","webvisor":false,"clickmap":true,"trackLinks":true,"accurateTrackBounce":true}'::jsonb,
  '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,10,
  'Шаблон выключен. Перед публикацией укажите реальный ID счётчика и проверьте политику обработки данных.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO directus_collections (
  collection,icon,note,display_template,hidden,singleton,accountability,sort,color,translations
) VALUES
  ('site_integrations','extension','Сторонние скрипты сайта. Публикация custom-кода разрешена только доверенным ролям.','{{status}} · {{name}}',false,false,'all',28,'#7c3aed','[{"language":"ru-RU","translation":"Интеграции сайта"}]'::json),
  ('integration_consent_settings','privacy_tip','Тексты и срок хранения выбора для баннера приватности. Singleton: должна существовать ровно одна запись.','{{version}}',false,true,'all',29,'#0f766e','[{"language":"ru-RU","translation":"Согласие на интеграции"}]'::json)
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon,note=EXCLUDED.note,display_template=EXCLUDED.display_template,
  hidden=false,singleton=EXCLUDED.singleton,accountability='all',sort=EXCLUDED.sort,
  color=EXCLUDED.color,translations=EXCLUDED.translations;

CREATE OR REPLACE FUNCTION isvoi_integration_field(
  p_collection varchar,p_field varchar,p_interface varchar,p_options json,p_width varchar,
  p_sort integer,p_note text,p_readonly boolean,p_hidden boolean,p_required boolean,
  p_special varchar,p_group varchar,p_translation text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_translations json;
BEGIN
  v_translations := json_build_array(json_build_object('language','ru-RU','translation',p_translation))::json;
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface,options=p_options,width=p_width,sort=p_sort,
      note=p_note,readonly=p_readonly,hidden=p_hidden,required=p_required,special=p_special,
      "group"=p_group,translations=v_translations
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields (
      collection,field,interface,options,width,sort,note,readonly,hidden,required,special,"group",translations
    ) VALUES (
      p_collection,p_field,p_interface,p_options,p_width,p_sort,p_note,p_readonly,p_hidden,p_required,p_special,p_group,v_translations
    );
  END IF;
END;
$$;

SELECT isvoi_integration_field('site_integrations','group_main','group-detail','{"headerIcon":"extension","start":"open"}'::json,'full',1,'Провайдер, публикация и категория согласия.',false,false,false,'alias,no-data,group',NULL,'Интеграция');
SELECT isvoi_integration_field('site_integrations','group_targeting','group-detail','{"headerIcon":"filter_alt","start":"open"}'::json,'full',20,'Ограничения по точным hostname и префиксам URL.',false,false,false,'alias,no-data,group',NULL,'Охват');
SELECT isvoi_integration_field('site_integrations','group_custom','group-detail','{"headerIcon":"code","start":"closed"}'::json,'full',40,'Исполняемый custom-код. Доступен только расширенному редактору и администратору.',false,false,false,'alias,no-data,group',NULL,'Custom JavaScript');
SELECT isvoi_integration_field('site_integrations','group_system','group-detail','{"headerIcon":"history","start":"closed"}'::json,'full',80,'Системные поля аудита.',false,false,false,'alias,no-data,group',NULL,'Системное');
SELECT isvoi_integration_field('site_integrations','id','input',NULL,'half',2,'Системный UUID.',true,true,false,'uuid','group_main','ID');
SELECT isvoi_integration_field('site_integrations','status','select-dropdown','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}'::json,'half',3,'Только published-записи попадают на сайт.',false,false,true,NULL,'group_main','Статус');
SELECT isvoi_integration_field('site_integrations','name','input',NULL,'half',4,'Понятное внутреннее название сервиса.',false,false,true,NULL,'group_main','Название');
SELECT isvoi_integration_field('site_integrations','provider','select-dropdown','{"choices":[{"text":"Яндекс Метрика","value":"yandex_metrika"},{"text":"Custom JavaScript","value":"custom"}]}'::json,'half',5,'Шаблон провайдера или доверенный custom-код.',false,false,true,NULL,'group_main','Провайдер');
SELECT isvoi_integration_field('site_integrations','consent_category','select-dropdown','{"choices":[{"text":"Необходимые","value":"necessary"},{"text":"Аналитика","value":"analytics"},{"text":"Маркетинг","value":"marketing"},{"text":"Поддержка и чаты","value":"support"}]}'::json,'half',6,'Необязательные категории запускаются только после согласия.',false,false,true,NULL,'group_main','Категория согласия');
SELECT isvoi_integration_field('site_integrations','load_strategy','select-dropdown','{"choices":[{"text":"После интерактивности","value":"after_interactive"},{"text":"В простое браузера","value":"lazy_onload"}]}'::json,'half',7,'Стратегия неблокирующей загрузки.',false,false,true,NULL,'group_main','Загрузка');
SELECT isvoi_integration_field('site_integrations','provider_settings','input-code','{"language":"json"}'::json,'full',8,'Для Метрики: counterId, webvisor, clickmap, trackLinks, accurateTrackBounce.',false,false,true,'cast-json','group_main','Настройки провайдера');
SELECT isvoi_integration_field('site_integrations','sort','input','{"min":0,"step":1}'::json,'half',9,'Порядок инициализации.',false,false,false,NULL,'group_main','Порядок');
SELECT isvoi_integration_field('site_integrations','notes','input-multiline',NULL,'full',10,'Внутренняя памятка; на сайт не передаётся.',false,false,false,NULL,'group_main','Заметки');
SELECT isvoi_integration_field('site_integrations','hostnames','tags','{"placeholder":"isvoi.ru"}'::json,'full',21,'Точные hostname без протокола. Пусто — все домены.',false,false,false,'cast-json','group_targeting','Домены');
SELECT isvoi_integration_field('site_integrations','include_paths','tags','{"placeholder":"/catalog"}'::json,'full',22,'Префиксы страниц, где интеграция разрешена. Пусто — все страницы.',false,false,false,'cast-json','group_targeting','Разрешённые пути');
SELECT isvoi_integration_field('site_integrations','exclude_paths','tags','{"placeholder":"/trade/qa"}'::json,'full',23,'Префиксы-исключения; имеют приоритет.',false,false,false,'cast-json','group_targeting','Исключённые пути');
SELECT isvoi_integration_field('site_integrations','script_url','input',NULL,'full',41,'Только абсолютный HTTPS URL. Поле исполняет код и доступно доверенным ролям.',false,false,false,NULL,'group_custom','URL скрипта');
SELECT isvoi_integration_field('site_integrations','bootstrap_code','input-code','{"language":"javascript","lineNumber":true}'::json,'full',42,'JavaScript инициализации без тегов script/html.',false,false,false,NULL,'group_custom','Bootstrap JavaScript');
SELECT isvoi_integration_field('site_integrations','cleanup_code','input-code','{"language":"javascript","lineNumber":true}'::json,'full',43,'Останавливает сервис и удаляет созданные им элементы. Обязательно при ограничении по страницам.',false,false,false,NULL,'group_custom','Cleanup JavaScript');
SELECT isvoi_integration_field('site_integrations','user_created','select-dropdown-m2o',NULL,'half',81,'Кто создал запись.',true,true,false,'m2o,user-created','group_system','Создал');
SELECT isvoi_integration_field('site_integrations','date_created','datetime',NULL,'half',82,'Когда создана запись.',true,true,false,'date-created','group_system','Создано');
SELECT isvoi_integration_field('site_integrations','user_updated','select-dropdown-m2o',NULL,'half',83,'Кто изменил запись.',true,true,false,'m2o,user-updated','group_system','Изменил');
SELECT isvoi_integration_field('site_integrations','date_updated','datetime',NULL,'half',84,'Когда изменена запись.',true,true,false,'date-updated','group_system','Изменено');

SELECT isvoi_integration_field('integration_consent_settings','id','input',NULL,'half',1,'Singleton ID, всегда 1.',true,true,false,NULL,NULL,'ID');
SELECT isvoi_integration_field('integration_consent_settings','version','input',NULL,'half',2,'Измените версию, чтобы запросить согласие повторно.',false,false,true,NULL,NULL,'Версия согласия');
SELECT isvoi_integration_field('integration_consent_settings','retention_days','input','{"min":1,"max":365}'::json,'half',3,'Срок действия выбора посетителя: 1–365 дней.',false,false,true,NULL,NULL,'Срок, дней');
SELECT isvoi_integration_field('integration_consent_settings','banner_title','input',NULL,'full',4,'Заголовок компактного баннера.',false,false,true,NULL,NULL,'Заголовок баннера');
SELECT isvoi_integration_field('integration_consent_settings','banner_body','input-multiline',NULL,'full',5,'Кратко объясняет назначение выбора.',false,false,true,NULL,NULL,'Текст баннера');
SELECT isvoi_integration_field('integration_consent_settings','accept_all_label','input',NULL,'half',6,'Кнопка согласия со всеми категориями.',false,false,true,NULL,NULL,'Принять все');
SELECT isvoi_integration_field('integration_consent_settings','reject_optional_label','input',NULL,'half',7,'Кнопка отказа от необязательных категорий.',false,false,true,NULL,NULL,'Отклонить необязательные');
SELECT isvoi_integration_field('integration_consent_settings','customize_label','input',NULL,'half',8,'Открывает детальные настройки.',false,false,true,NULL,NULL,'Настроить');
SELECT isvoi_integration_field('integration_consent_settings','settings_title','input',NULL,'full',9,'Заголовок диалога категорий.',false,false,true,NULL,NULL,'Заголовок настроек');
SELECT isvoi_integration_field('integration_consent_settings','settings_body','input-multiline',NULL,'full',10,'Пояснение в диалоге категорий.',false,false,true,NULL,NULL,'Текст настроек');
SELECT isvoi_integration_field('integration_consent_settings','save_label','input',NULL,'half',11,'Кнопка сохранения выбора.',false,false,true,NULL,NULL,'Сохранить');
SELECT isvoi_integration_field('integration_consent_settings','close_label','input',NULL,'half',12,'Доступная подпись кнопки закрытия.',false,false,true,NULL,NULL,'Закрыть');
SELECT isvoi_integration_field('integration_consent_settings','footer_link_label','input',NULL,'half',13,'Ссылка повторного открытия настроек в footer.',false,false,true,NULL,NULL,'Ссылка в footer');
SELECT isvoi_integration_field('integration_consent_settings','privacy_link_label','input',NULL,'half',14,'Подпись ссылки на каноническую политику обработки данных.',false,false,true,NULL,NULL,'Ссылка на политику');
SELECT isvoi_integration_field('integration_consent_settings','necessary_label','input',NULL,'half',20,'Название обязательной категории.',false,false,true,NULL,NULL,'Необходимые · название');
SELECT isvoi_integration_field('integration_consent_settings','necessary_description','input-multiline',NULL,'full',21,'Описание обязательной категории.',false,false,true,NULL,NULL,'Необходимые · описание');
SELECT isvoi_integration_field('integration_consent_settings','analytics_label','input',NULL,'half',22,'Название категории аналитики.',false,false,true,NULL,NULL,'Аналитика · название');
SELECT isvoi_integration_field('integration_consent_settings','analytics_description','input-multiline',NULL,'full',23,'Описание категории аналитики.',false,false,true,NULL,NULL,'Аналитика · описание');
SELECT isvoi_integration_field('integration_consent_settings','marketing_label','input',NULL,'half',24,'Название маркетинговой категории.',false,false,true,NULL,NULL,'Маркетинг · название');
SELECT isvoi_integration_field('integration_consent_settings','marketing_description','input-multiline',NULL,'full',25,'Описание маркетинговой категории.',false,false,true,NULL,NULL,'Маркетинг · описание');
SELECT isvoi_integration_field('integration_consent_settings','support_label','input',NULL,'half',26,'Название категории чатов.',false,false,true,NULL,NULL,'Поддержка · название');
SELECT isvoi_integration_field('integration_consent_settings','support_description','input-multiline',NULL,'full',27,'Описание категории чатов и поддержки.',false,false,true,NULL,NULL,'Поддержка · описание');
SELECT isvoi_integration_field('integration_consent_settings','user_updated','select-dropdown-m2o',NULL,'half',80,'Кто изменил настройки.',true,true,false,'m2o,user-updated',NULL,'Изменил');
SELECT isvoi_integration_field('integration_consent_settings','date_updated','datetime',NULL,'half',81,'Когда изменены настройки.',true,true,false,'date-updated',NULL,'Изменено');

CREATE OR REPLACE FUNCTION isvoi_integration_relation(p_collection varchar,p_field varchar)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_relations
    WHERE many_collection=p_collection AND many_field=p_field
  ) THEN
    UPDATE directus_relations SET one_collection='directus_users',one_field=NULL,
      one_deselect_action='nullify'
    WHERE many_collection=p_collection AND many_field=p_field;
  ELSE
    INSERT INTO directus_relations (
      many_collection,many_field,one_collection,one_field,one_deselect_action
    ) VALUES (p_collection,p_field,'directus_users',NULL,'nullify');
  END IF;
END;
$$;

SELECT isvoi_integration_relation('site_integrations','user_created');
SELECT isvoi_integration_relation('site_integrations','user_updated');
SELECT isvoi_integration_relation('integration_consent_settings','user_updated');
DROP FUNCTION isvoi_integration_relation(varchar,varchar);

DROP FUNCTION isvoi_integration_field(varchar,varchar,varchar,json,varchar,integer,text,boolean,boolean,boolean,varchar,varchar,text);

CREATE OR REPLACE FUNCTION isvoi_integration_permission(
  p_policy text,p_collection varchar,p_action varchar,p_fields text,
  p_permissions json DEFAULT NULL,p_validation json DEFAULT NULL,p_presets json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy=v_policy AND collection=p_collection AND action=p_action
  ) THEN
    UPDATE directus_permissions SET fields=p_fields,permissions=p_permissions,
      validation=p_validation,presets=p_presets
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions (policy,collection,action,fields,permissions,validation,presets)
    VALUES (v_policy,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_remove_integration_permission(
  p_policy text,p_collection varchar,p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy LIMIT 1;
  DELETE FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action;
END;
$$;

SELECT isvoi_remove_integration_permission('$t:public_label','site_integrations','read');
SELECT isvoi_remove_integration_permission('$t:public_label','integration_consent_settings','read');

SELECT isvoi_integration_permission(
  'ISVOI Public Read','site_integrations','read',
  'id,status,name,provider,consent_category,load_strategy,provider_settings,script_url,bootstrap_code,cleanup_code,hostnames,include_paths,exclude_paths,sort',
  '{"status":{"_eq":"published"}}'::json
);
SELECT isvoi_integration_permission(
  'ISVOI Public Read','integration_consent_settings','read',
  'id,version,retention_days,banner_title,banner_body,accept_all_label,reject_optional_label,customize_label,settings_title,settings_body,save_label,close_label,footer_link_label,privacy_link_label,necessary_label,necessary_description,analytics_label,analytics_description,marketing_label,marketing_description,support_label,support_description'
);

SELECT isvoi_integration_permission(
  'ISVOI Editor','site_integrations','read',
  'id,status,name,provider,consent_category,load_strategy,provider_settings,hostnames,include_paths,exclude_paths,sort,notes,date_created,date_updated'
);
SELECT isvoi_integration_permission(
  'ISVOI Editor','site_integrations','create',
  'status,name,provider,consent_category,load_strategy,provider_settings,hostnames,include_paths,exclude_paths,sort,notes',
  NULL,
  '{"provider":{"_eq":"yandex_metrika"},"status":{"_in":["draft","published","archived"]}}'::json,
  '{"status":"draft","provider":"yandex_metrika","consent_category":"analytics","load_strategy":"after_interactive"}'::json
);
SELECT isvoi_integration_permission(
  'ISVOI Editor','site_integrations','update',
  'status,name,consent_category,load_strategy,provider_settings,hostnames,include_paths,exclude_paths,sort,notes',
  '{"provider":{"_eq":"yandex_metrika"}}'::json,
  '{"provider":{"_eq":"yandex_metrika"},"status":{"_in":["draft","published","archived"]}}'::json
);
SELECT isvoi_remove_integration_permission('ISVOI Editor','site_integrations','delete');

SELECT isvoi_integration_permission('ISVOI Editor','integration_consent_settings','read','id,version,retention_days,banner_title,banner_body,accept_all_label,reject_optional_label,customize_label,settings_title,settings_body,save_label,close_label,footer_link_label,privacy_link_label,necessary_label,necessary_description,analytics_label,analytics_description,marketing_label,marketing_description,support_label,support_description,date_updated');
SELECT isvoi_integration_permission(
  'ISVOI Editor','integration_consent_settings','update',
  'version,retention_days,banner_title,banner_body,accept_all_label,reject_optional_label,customize_label,settings_title,settings_body,save_label,close_label,footer_link_label,privacy_link_label,necessary_label,necessary_description,analytics_label,analytics_description,marketing_label,marketing_description,support_label,support_description'
);

SELECT isvoi_integration_permission('ISVOI Advanced Editor','site_integrations','read','id,status,name,provider,consent_category,load_strategy,provider_settings,script_url,bootstrap_code,cleanup_code,hostnames,include_paths,exclude_paths,sort,notes,user_created,date_created,user_updated,date_updated');
SELECT isvoi_integration_permission(
  'ISVOI Advanced Editor','site_integrations','create',
  'status,name,provider,consent_category,load_strategy,provider_settings,script_url,bootstrap_code,cleanup_code,hostnames,include_paths,exclude_paths,sort,notes',
  NULL,
  '{"status":{"_in":["draft","published","archived"]},"provider":{"_in":["yandex_metrika","custom"]}}'::json,
  '{"status":"draft","consent_category":"analytics","load_strategy":"after_interactive"}'::json
);
SELECT isvoi_integration_permission(
  'ISVOI Advanced Editor','site_integrations','update',
  'status,name,provider,consent_category,load_strategy,provider_settings,script_url,bootstrap_code,cleanup_code,hostnames,include_paths,exclude_paths,sort,notes',
  NULL,
  '{"status":{"_in":["draft","published","archived"]},"provider":{"_in":["yandex_metrika","custom"]}}'::json
);
SELECT isvoi_remove_integration_permission('ISVOI Advanced Editor','site_integrations','delete');
SELECT isvoi_integration_permission('ISVOI Advanced Editor','integration_consent_settings','read','id,version,retention_days,banner_title,banner_body,accept_all_label,reject_optional_label,customize_label,settings_title,settings_body,save_label,close_label,footer_link_label,privacy_link_label,necessary_label,necessary_description,analytics_label,analytics_description,marketing_label,marketing_description,support_label,support_description,user_updated,date_updated');
SELECT isvoi_integration_permission('ISVOI Advanced Editor','integration_consent_settings','update','version,retention_days,banner_title,banner_body,accept_all_label,reject_optional_label,customize_label,settings_title,settings_body,save_label,close_label,footer_link_label,privacy_link_label,necessary_label,necessary_description,analytics_label,analytics_description,marketing_label,marketing_description,support_label,support_description');

DROP FUNCTION isvoi_remove_integration_permission(text,varchar,varchar);
DROP FUNCTION isvoi_integration_permission(text,varchar,varchar,text,json,json,json);

COMMIT;

SELECT 'site_integrations.tables' AS check_name,count(*)::text AS value
FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('site_integrations','integration_consent_settings')
UNION ALL
SELECT 'site_integrations.draft_metrika_template',count(*)::text
FROM site_integrations WHERE id='00000000-0000-4000-8000-000000000101' AND status='draft'
UNION ALL
SELECT 'site_integrations.consent_singleton',count(*)::text
FROM integration_consent_settings WHERE id=1;
`);
