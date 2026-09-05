#!/usr/bin/env node

const profileDescription = 'Поможем подобрать устройство, продать или обменять технику, задать вопрос менеджеру и продолжить заявку. По желанию можно подписаться на поступления, снижение цен, новости и акции';
const consentText = 'Я согласен получать выбранные информационные сообщения от I СВОИ в Telegram. Подписку можно отключить в любой момент командой /news.';

const q = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${q(JSON.stringify(value))}::json`;
const flowOptions = {collections:['telegram_campaigns'],location:'item',requireSelection:false};
const operation = payload => ({collection:'telegram_campaigns',permissions:'$trigger',emitEvents:true,key:'{{$trigger.key}}',payload});

export const notificationsSql = String.raw`
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';

CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  bot_id bigint PRIMARY KEY CHECK(bot_id>0), public_username varchar(32) NOT NULL DEFAULT 'isvoi_help_bot',
  profile_description text NOT NULL DEFAULT ${q(profileDescription)}, short_description varchar(120) NOT NULL DEFAULT 'Заявки, поддержка и новости I СВОИ',
  welcome_text text NOT NULL DEFAULT 'Здравствуйте! Это бот I СВОИ. Здесь можно подобрать устройство, продать или обменять технику, задать вопрос менеджеру и продолжить действующую заявку.',
  help_text text NOT NULL DEFAULT 'Бот передаёт обращения менеджерам I СВОИ и сохраняет переписку в заявке. Подписками можно управлять командой /news.',
  privacy_url text NOT NULL DEFAULT 'https://isvoi.ru/privacy', consent_version varchar(40) NOT NULL DEFAULT 'pilot-2026-09',
  consent_text text NOT NULL DEFAULT ${q(consentText)}, notifications_enabled boolean NOT NULL DEFAULT false,
  pilot_mode boolean NOT NULL DEFAULT true, pilot_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(pilot_user_ids)='array'), timezone varchar(64) NOT NULL DEFAULT 'Europe/Moscow',
  quiet_start time NOT NULL DEFAULT '10:00', quiet_end time NOT NULL DEFAULT '20:00', weekly_limit integer NOT NULL DEFAULT 2 CHECK(weekly_limit BETWEEN 0 AND 20),
  channel_enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), CHECK(quiet_start<quiet_end)
);

CREATE TABLE IF NOT EXISTS telegram_notification_topics (
  key varchar(50) PRIMARY KEY CHECK(key ~ '^[a-z][a-z0-9_]{1,48}$'), label varchar(120) NOT NULL,
  description text, active boolean NOT NULL DEFAULT true, sort integer NOT NULL DEFAULT 1
);
INSERT INTO telegram_notification_topics(key,label,description,sort) VALUES
 ('new_arrivals','Новые поступления','Новая техника в каталоге.',1),
 ('price_drops','Снижение цен','Снижение цены на устройства.',2),
 ('news_promotions','Новости и акции','Новости магазина и специальные предложения.',3)
ON CONFLICT(key) DO UPDATE SET label=excluded.label,description=excluded.description,sort=excluded.sort;

CREATE TABLE IF NOT EXISTS telegram_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bot_id bigint NOT NULL, session_id uuid NOT NULL REFERENCES telegram_client_sessions(id) ON DELETE CASCADE,
  topic_key varchar(50) NOT NULL REFERENCES telegram_notification_topics(key), status varchar(20) NOT NULL DEFAULT 'unsubscribed' CHECK(status IN ('active','unsubscribed','blocked')),
  consent_version varchar(40), consented_at timestamptz, revoked_at timestamptz, source varchar(64) NOT NULL DEFAULT 'bot_menu', updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bot_id,session_id,topic_key)
);
CREATE TABLE IF NOT EXISTS telegram_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES telegram_subscriptions(id) ON DELETE RESTRICT,
  event varchar(20) NOT NULL CHECK(event IN ('subscribed','unsubscribed','blocked')), consent_version varchar(40), source varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bot_id bigint NOT NULL DEFAULT 8694946838, internal_title varchar(160) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','sending','completed','cancelled','failed')),
  destination_type varchar(24) NOT NULL DEFAULT 'bot_subscribers' CHECK(destination_type IN ('bot_subscribers','channel')),
  topic_key varchar(50) NOT NULL REFERENCES telegram_notification_topics(key), message_text text NOT NULL,
  photo_file uuid REFERENCES directus_files(id) ON DELETE RESTRICT, cta_label varchar(64), cta_url text, product_id varchar(255),
  utm_source varchar(100) NOT NULL DEFAULT 'telegram', utm_medium varchar(100) NOT NULL DEFAULT 'bot', utm_campaign varchar(100),
  test_requested_by uuid REFERENCES directus_users(id) ON DELETE SET NULL, test_requested_at timestamptz, test_sent_at timestamptz,
  approved_by uuid REFERENCES directus_users(id) ON DELETE SET NULL, approved_at timestamptz,
  content_snapshot jsonb, recipient_snapshot_at timestamptz, recipient_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0, blocked_count integer NOT NULL DEFAULT 0, failed_count integer NOT NULL DEFAULT 0, suppressed_count integer NOT NULL DEFAULT 0,
  started_at timestamptz, completed_at timestamptz, last_error varchar(160), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(length(message_text) BETWEEN 1 AND 3500), CHECK(destination_type<>'channel' OR status IN ('draft','review','failed','cancelled'))
);
DO $$ BEGIN IF to_regclass('public.products') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='telegram_campaigns_product_fk') THEN
 ALTER TABLE telegram_campaigns ADD CONSTRAINT telegram_campaigns_product_fk FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL;
END IF; END $$;

ALTER TABLE telegram_client_sessions ADD COLUMN IF NOT EXISTS entry_source varchar(64);
ALTER TABLE telegram_client_sessions ADD COLUMN IF NOT EXISTS subscription_draft jsonb;
ALTER TABLE telegram_message_outbox ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES telegram_campaigns(id) ON DELETE RESTRICT;
ALTER TABLE telegram_message_outbox ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES telegram_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE telegram_message_outbox ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE telegram_message_outbox ALTER COLUMN state TYPE varchar(32);
ALTER TABLE telegram_message_outbox DROP CONSTRAINT IF EXISTS telegram_message_outbox_state_check;
ALTER TABLE telegram_message_outbox ADD CONSTRAINT telegram_message_outbox_state_check CHECK(state IN ('pending','in_flight','done','blocked','failed','uncertain','suppressed_frequency','cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS telegram_campaign_session_once ON telegram_message_outbox(campaign_id,session_id) WHERE campaign_id IS NOT NULL AND is_test=false;
CREATE INDEX IF NOT EXISTS telegram_campaign_queue ON telegram_message_outbox(campaign_id,state,created_at) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telegram_subscription_active ON telegram_subscriptions(bot_id,topic_key,session_id) WHERE status='active';

CREATE OR REPLACE FUNCTION isvoi_telegram_campaign_recipient_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.campaign_id IS NOT NULL AND (NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.is_test IS DISTINCT FROM OLD.is_test) THEN
  RAISE EXCEPTION 'Campaign recipient snapshot is immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS isvoi_telegram_campaign_recipient_guard ON telegram_message_outbox;
CREATE TRIGGER isvoi_telegram_campaign_recipient_guard BEFORE UPDATE ON telegram_message_outbox FOR EACH ROW EXECUTE FUNCTION isvoi_telegram_campaign_recipient_guard();

CREATE OR REPLACE FUNCTION isvoi_telegram_campaign_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at=now();
  IF OLD.content_snapshot IS NOT NULL AND (
    NEW.internal_title IS DISTINCT FROM OLD.internal_title OR NEW.destination_type IS DISTINCT FROM OLD.destination_type OR
    NEW.topic_key IS DISTINCT FROM OLD.topic_key OR NEW.message_text IS DISTINCT FROM OLD.message_text OR NEW.photo_file IS DISTINCT FROM OLD.photo_file OR
    NEW.cta_label IS DISTINCT FROM OLD.cta_label OR NEW.cta_url IS DISTINCT FROM OLD.cta_url OR NEW.product_id IS DISTINCT FROM OLD.product_id OR
    NEW.utm_source IS DISTINCT FROM OLD.utm_source OR NEW.utm_medium IS DISTINCT FROM OLD.utm_medium OR NEW.utm_campaign IS DISTINCT FROM OLD.utm_campaign
  ) THEN RAISE EXCEPTION 'Started campaign content is immutable'; END IF;
  IF NEW.status='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN RAISE EXCEPTION 'Campaign approval identity is required'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS isvoi_telegram_campaign_guard ON telegram_campaigns;
CREATE TRIGGER isvoi_telegram_campaign_guard BEFORE UPDATE ON telegram_campaigns FOR EACH ROW EXECUTE FUNCTION isvoi_telegram_campaign_guard();

CREATE OR REPLACE FUNCTION isvoi_telegram_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Subscription events are immutable'; END $$;
DROP TRIGGER IF EXISTS isvoi_telegram_event_immutable ON telegram_subscription_events;
CREATE TRIGGER isvoi_telegram_event_immutable BEFORE UPDATE OR DELETE ON telegram_subscription_events FOR EACH ROW EXECUTE FUNCTION isvoi_telegram_event_immutable();

DO $$ BEGIN
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS support_telegram_url text;
    ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS support_telegram_label varchar(120);
    UPDATE site_settings SET support_telegram_url=coalesce(support_telegram_url,'https://t.me/isvoi_help_bot?start=site'), support_telegram_label=coalesce(support_telegram_label,'Заявки и поддержка в Telegram');
  END IF;
END $$;

INSERT INTO directus_collections(collection,icon,note,hidden,singleton,accountability) VALUES
 ('telegram_bot_settings','smart_toy','Настройки приветствия, согласия, пилота и ограничений Telegram.',false,true,'all'),
 ('telegram_notification_topics','notifications','Темы подписок Telegram.',false,false,'all'),
 ('telegram_subscriptions','subscriptions','Текущее состояние подписок. Public доступа не имеет.',false,false,'all'),
 ('telegram_subscription_events','history','Неизменяемый журнал согласий и отказов.',false,false,'all'),
 ('telegram_campaigns','campaign','Кампании Telegram: редактор готовит, администратор подтверждает.',false,false,'all')
ON CONFLICT(collection) DO UPDATE SET note=excluded.note,hidden=excluded.hidden,singleton=excluded.singleton;

CREATE OR REPLACE FUNCTION isvoi_notify_field(c varchar,f varchar,i varchar,d varchar,o json,w varchar,s integer,n text,sp varchar,ro boolean,h boolean,t text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE tr json:=json_build_array(json_build_object('language','ru-RU','translation',t))::json;
BEGIN
 IF EXISTS(SELECT 1 FROM directus_fields WHERE collection=c AND field=f) THEN UPDATE directus_fields SET interface=i,display=d,options=o,width=w,sort=s,note=n,special=sp,readonly=ro,hidden=h,translations=tr WHERE collection=c AND field=f;
 ELSE INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,readonly,hidden,translations) VALUES(c,f,i,d,o,w,s,n,sp,ro,h,tr); END IF;
END $$;
SELECT isvoi_notify_field('telegram_campaigns','internal_title','input',NULL,NULL,'full',1,'Внутреннее название.',NULL,false,false,'Название');
SELECT isvoi_notify_field('telegram_campaigns','bot_id','input',NULL,NULL,'half',0,'Production bot ID. Заполняется автоматически.',NULL,true,true,'Bot ID');
SELECT isvoi_notify_field('telegram_campaigns','status','select-dropdown','labels',${json({choices:[{text:'Черновик',value:'draft'},{text:'На проверке',value:'review'},{text:'Подтверждена',value:'approved'},{text:'Отправляется',value:'sending'},{text:'Завершена',value:'completed'},{text:'Ошибка',value:'failed'}]})},'half',2,'Запуск выполняется только после подтверждения администратором.',NULL,true,false,'Статус');
SELECT isvoi_notify_field('telegram_campaigns','topic_key','select-dropdown-m2o','related-values',NULL,'half',3,'Тема определяет получателей.','m2o',false,false,'Тема');
SELECT isvoi_notify_field('telegram_campaigns','destination_type','select-dropdown','labels',${json({choices:[{text:'Подписчики бота',value:'bot_subscribers'},{text:'Канал (зарезервировано)',value:'channel'}]})},'half',3,'Канал зарезервирован и не запускается.',NULL,false,false,'Назначение');
SELECT isvoi_notify_field('telegram_campaigns','message_text','input-multiline',NULL,NULL,'full',4,'До 3500 знаков; если добавлено фото — до 1024.',NULL,false,false,'Текст');
SELECT isvoi_notify_field('telegram_campaigns','photo_file','file-image','file',NULL,'half',5,'Только файл изображения Directus.','file',false,false,'Фото');
SELECT isvoi_notify_field('telegram_campaigns','cta_label','input',NULL,NULL,'half',6,'Подпись одной кнопки.',NULL,false,false,'Текст кнопки');
SELECT isvoi_notify_field('telegram_campaigns','cta_url','input',NULL,NULL,'full',7,'Только HTTPS-ссылка isvoi.ru.',NULL,false,false,'Ссылка кнопки');
SELECT isvoi_notify_field('telegram_campaigns','product_id','select-dropdown-m2o','related-values',NULL,'half',8,'Необязательная связь с товаром.','m2o',false,false,'Товар');
SELECT isvoi_notify_field('telegram_campaigns','utm_campaign','input',NULL,NULL,'half',9,'Неперсональная метка кампании.',NULL,false,false,'UTM campaign');
SELECT isvoi_notify_field('telegram_campaigns','content_snapshot','input-code','formatted-json-value',NULL,'full',20,'Неизменяемый снимок после запуска.','cast-json',true,false,'Снимок содержания');
SELECT isvoi_notify_field('telegram_campaigns','recipient_count','input',NULL,NULL,'half',21,'Получатели снимка без подавленных.',NULL,true,false,'Получателей');
SELECT isvoi_notify_field('telegram_campaigns','delivered_count','input',NULL,NULL,'half',22,'Принято Telegram.',NULL,true,false,'Принято Telegram');
SELECT isvoi_notify_field('telegram_campaigns','blocked_count','input',NULL,NULL,'half',23,'Пользователи заблокировали бот.',NULL,true,false,'Блокировок');
SELECT isvoi_notify_field('telegram_campaigns','failed_count','input',NULL,NULL,'half',24,'Ошибки и неопределённые результаты.',NULL,true,false,'Ошибок');
SELECT isvoi_notify_field('telegram_campaigns','suppressed_count','input',NULL,NULL,'half',25,'Исключено недельным лимитом.',NULL,true,false,'По лимиту');
SELECT isvoi_notify_field('telegram_subscriptions','status','select-dropdown','labels',NULL,'half',1,'Текущее состояние.',NULL,true,false,'Статус');
SELECT isvoi_notify_field('telegram_subscription_events','event','select-dropdown','labels',NULL,'half',1,'Согласие, отказ или блокировка.',NULL,true,false,'Событие');
SELECT isvoi_notify_field('telegram_bot_settings','welcome_text','input-multiline',NULL,NULL,'full',1,'Приветствие /start.',NULL,false,false,'Приветствие');
SELECT isvoi_notify_field('telegram_bot_settings','profile_description','input-multiline',NULL,NULL,'full',1,'Полное описание Telegram.',NULL,false,false,'Описание профиля');
SELECT isvoi_notify_field('telegram_bot_settings','short_description','input',NULL,NULL,'full',1,'Короткое описание Telegram.',NULL,false,false,'Короткое описание');
SELECT isvoi_notify_field('telegram_bot_settings','consent_text','input-multiline',NULL,NULL,'full',2,'До публичного запуска требуется юридическое утверждение.',NULL,false,false,'Текст согласия');
SELECT isvoi_notify_field('telegram_bot_settings','consent_version','input',NULL,NULL,'half',2,'Записывается в журнал вместе с согласием.',NULL,false,false,'Версия согласия');
SELECT isvoi_notify_field('telegram_bot_settings','privacy_url','input',NULL,NULL,'half',2,'Ссылка на политику обработки данных.',NULL,false,false,'Политика данных');
SELECT isvoi_notify_field('telegram_bot_settings','notifications_enabled','boolean','boolean',NULL,'half',3,'Общий выключатель рассылок.',NULL,false,false,'Рассылки включены');
SELECT isvoi_notify_field('telegram_bot_settings','pilot_mode','boolean','boolean',NULL,'half',4,'В пилоте доступны только разрешённые Telegram ID.',NULL,false,false,'Закрытый пилот');
SELECT isvoi_notify_field('telegram_bot_settings','pilot_user_ids','tags',NULL,NULL,'full',5,'Разрешённые Telegram ID закрытого пилота.','cast-json',false,false,'Telegram ID пилота');
SELECT isvoi_notify_field('telegram_bot_settings','timezone','input',NULL,NULL,'half',5,'Часовой пояс окна отправки.',NULL,false,false,'Часовой пояс');
SELECT isvoi_notify_field('telegram_bot_settings','quiet_start','datetime',NULL,'{"includeSeconds":false}'::json,'half',6,'Начало отправки по часовому поясу.','cast-time',false,false,'Начало окна');
SELECT isvoi_notify_field('telegram_bot_settings','quiet_end','datetime',NULL,'{"includeSeconds":false}'::json,'half',7,'Окончание отправки по часовому поясу.','cast-time',false,false,'Конец окна');
SELECT isvoi_notify_field('telegram_bot_settings','weekly_limit','input',NULL,NULL,'half',8,'Маркетинговых сообщений за скользящие 7 дней.',NULL,false,false,'Недельный лимит');
SELECT isvoi_notify_field('telegram_bot_settings','channel_enabled','boolean','boolean',NULL,'half',9,'Зарезервировано; оставлять выключенным. Канал не подключён.',NULL,true,false,'Канал включён');
SELECT isvoi_notify_field('telegram_message_outbox','state','select-dropdown','labels',${json({choices:[{text:'Ожидает',value:'pending'},{text:'Отправляется',value:'in_flight'},{text:'Принято Telegram',value:'done'},{text:'Бот заблокирован',value:'blocked'},{text:'Ошибка',value:'failed'},{text:'Результат неизвестен',value:'uncertain'},{text:'Лимит частоты',value:'suppressed_frequency'},{text:'Отменено',value:'cancelled'}]})},'half',4,'done означает принятие Telegram, но не прочтение.',NULL,true,false,'Состояние');
DO $$ BEGIN IF to_regclass('public.site_settings') IS NOT NULL THEN
 PERFORM isvoi_notify_field('site_settings','support_telegram_url','input',NULL,NULL,'full',90,'Общая ссылка на бот; одноразовые ссылки форм не меняет.',NULL,false,false,'Telegram для заявок');
 PERFORM isvoi_notify_field('site_settings','support_telegram_label','input',NULL,NULL,'full',91,'Подпись ссылки в контактах и футере.',NULL,false,false,'Подпись Telegram');
END IF; END $$;
DROP FUNCTION isvoi_notify_field(varchar,varchar,varchar,varchar,json,varchar,integer,text,varchar,boolean,boolean,text);

CREATE OR REPLACE FUNCTION isvoi_notify_relation(mc varchar,mf varchar,oc varchar,of varchar,act varchar) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM directus_relations WHERE many_collection=mc AND many_field=mf) THEN UPDATE directus_relations SET one_collection=oc,one_field=of,one_deselect_action=act WHERE many_collection=mc AND many_field=mf;
 ELSE INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action) VALUES(mc,mf,oc,of,act); END IF;
END $$;
SELECT isvoi_notify_relation('telegram_campaigns','topic_key','telegram_notification_topics',NULL,'nullify');
SELECT isvoi_notify_relation('telegram_campaigns','photo_file','directus_files',NULL,'nullify');
DO $$ BEGIN IF to_regclass('public.products') IS NOT NULL THEN PERFORM isvoi_notify_relation('telegram_campaigns','product_id','products',NULL,'nullify'); END IF; END $$;
SELECT isvoi_notify_relation('telegram_subscriptions','session_id','telegram_client_sessions',NULL,'delete');
SELECT isvoi_notify_relation('telegram_subscriptions','topic_key','telegram_notification_topics',NULL,'nullify');
SELECT isvoi_notify_relation('telegram_subscription_events','subscription_id','telegram_subscriptions',NULL,'nullify');
SELECT isvoi_notify_relation('telegram_message_outbox','campaign_id','telegram_campaigns',NULL,'nullify');
DROP FUNCTION isvoi_notify_relation(varchar,varchar,varchar,varchar,varchar);

CREATE OR REPLACE FUNCTION isvoi_notify_permission(p_role text,p_collection varchar,p_action varchar,p_fields text,p_permissions json DEFAULT NULL,p_validation json DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid; BEGIN SELECT id INTO v_policy FROM directus_policies WHERE name=p_role ORDER BY id LIMIT 1; IF v_policy IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN UPDATE directus_permissions SET fields=p_fields,permissions=p_permissions,validation=p_validation WHERE policy=v_policy AND collection=p_collection AND action=p_action;
 ELSE INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation) VALUES(v_policy,p_collection,p_action,p_fields,p_permissions,p_validation); END IF; END $$;
SELECT isvoi_notify_permission('ISVOI Editor','telegram_campaigns','read','*');
SELECT isvoi_notify_permission('ISVOI Editor','telegram_campaigns','create','id,bot_id,internal_title,status,destination_type,topic_key,message_text,photo_file,cta_label,cta_url,product_id,utm_source,utm_medium,utm_campaign',NULL,'{"status":{"_eq":"draft"},"destination_type":{"_eq":"bot_subscribers"}}'::json);
SELECT isvoi_notify_permission('ISVOI Editor','telegram_campaigns','update','internal_title,status,destination_type,topic_key,message_text,photo_file,cta_label,cta_url,product_id,utm_source,utm_medium,utm_campaign','{"status":{"_in":["draft","review"]}}'::json,'{"status":{"_in":["draft","review"]},"destination_type":{"_eq":"bot_subscribers"}}'::json);
SELECT isvoi_notify_permission('ISVOI Editor','telegram_notification_topics','read','*');
SELECT isvoi_notify_permission('ISVOI Editor','telegram_subscriptions','read','*');
SELECT isvoi_notify_permission('ISVOI Editor','telegram_subscription_events','read','*');
SELECT isvoi_notify_permission('ISVOI Editor','telegram_message_outbox','read','id,campaign_id,session_id,purpose,state,error_code,created_at,telegram_message_id');
DROP FUNCTION isvoi_notify_permission(text,varchar,varchar,text,json,json);

CREATE OR REPLACE FUNCTION isvoi_notify_preset(p_collection varchar,p_bookmark text,p_filter json,p_icon varchar,p_color varchar,p_query json) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM directus_presets WHERE collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL AND role IS NULL) THEN
  UPDATE directus_presets SET filter=p_filter,icon=p_icon,color=p_color,layout='tabular',layout_query=p_query WHERE collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL AND role IS NULL;
 ELSE INSERT INTO directus_presets(bookmark,role,"user",collection,layout,layout_query,filter,icon,color) VALUES(p_bookmark,NULL,NULL,p_collection,'tabular',p_query,p_filter,p_icon,p_color); END IF; END $$;
SELECT isvoi_notify_preset('telegram_campaigns','Черновики','{"status":{"_eq":"draft"}}'::json,'edit_note','#64748b','{"tabular":{"fields":["internal_title","topic_key","status","updated_at"]}}'::json);
SELECT isvoi_notify_preset('telegram_campaigns','На проверке','{"status":{"_eq":"review"}}'::json,'fact_check','#f59e0b','{"tabular":{"fields":["internal_title","topic_key","status","test_sent_at","updated_at"]}}'::json);
SELECT isvoi_notify_preset('telegram_campaigns','Отправляются','{"status":{"_in":["approved","sending"]}}'::json,'send','#2563eb','{"tabular":{"fields":["internal_title","status","recipient_count","delivered_count","blocked_count","failed_count"]}}'::json);
SELECT isvoi_notify_preset('telegram_campaigns','Завершены','{"status":{"_eq":"completed"}}'::json,'task_alt','#16a34a','{"tabular":{"fields":["internal_title","completed_at","recipient_count","delivered_count","suppressed_count"]}}'::json);
SELECT isvoi_notify_preset('telegram_campaigns','Ошибки доставки','{"_or":[{"status":{"_eq":"failed"}},{"failed_count":{"_gt":0}},{"blocked_count":{"_gt":0}}]}'::json,'error','#ef4444','{"tabular":{"fields":["internal_title","status","last_error","blocked_count","failed_count","completed_at"]}}'::json);
SELECT isvoi_notify_preset('telegram_subscriptions','Активные подписки','{"status":{"_eq":"active"}}'::json,'notifications_active','#16a34a','{"tabular":{"fields":["topic_key","status","consented_at","source"]}}'::json);
SELECT isvoi_notify_preset('telegram_subscriptions','Отказы и блокировки','{"status":{"_in":["unsubscribed","blocked"]}}'::json,'notifications_off','#ef4444','{"tabular":{"fields":["topic_key","status","revoked_at","source"]}}'::json);
DROP FUNCTION isvoi_notify_preset(varchar,text,json,varchar,varchar,json);

CREATE OR REPLACE FUNCTION isvoi_notify_flow(p_name text,p_icon text,p_color text,p_description text,p_key text,p_payload json) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_flow uuid; v_operation uuid; BEGIN SELECT id INTO v_flow FROM directus_flows WHERE name=p_name LIMIT 1;
 IF v_flow IS NULL THEN v_flow:=gen_random_uuid(); INSERT INTO directus_flows(id,name,icon,color,description,status,trigger,accountability,options,date_created) VALUES(v_flow,p_name,p_icon,p_color,p_description,'active','manual','all',${json(flowOptions)},now());
 ELSE UPDATE directus_flows SET icon=p_icon,color=p_color,description=p_description,status='active',trigger='manual',accountability='all',options=${json(flowOptions)} WHERE id=v_flow; END IF;
 SELECT id INTO v_operation FROM directus_operations WHERE flow=v_flow AND key=p_key LIMIT 1;
 IF v_operation IS NULL THEN v_operation:=gen_random_uuid(); INSERT INTO directus_operations(id,name,key,type,position_x,position_y,options,flow,date_created) VALUES(v_operation,p_name,p_key,'item-update',19,1,json_build_object('collection','telegram_campaigns','permissions',CASE WHEN p_key='isvoi_telegram_test' THEN '$full' ELSE '$trigger' END,'emitEvents',true,'key','{{$trigger.key}}','payload',p_payload),v_flow,now());
 ELSE UPDATE directus_operations SET name=p_name,type='item-update',options=json_build_object('collection','telegram_campaigns','permissions',CASE WHEN p_key='isvoi_telegram_test' THEN '$full' ELSE '$trigger' END,'emitEvents',true,'key','{{$trigger.key}}','payload',p_payload) WHERE id=v_operation; END IF;
 UPDATE directus_flows SET operation=v_operation WHERE id=v_flow; END $$;
SELECT isvoi_notify_flow('Telegram: отправить тест себе','send','#2563eb','Тест разрешён только пилотному Telegram ID, связанному с текущим пользователем.','isvoi_telegram_test',json_build_object('test_requested_by','{{$accountability.user}}','test_requested_at','$NOW'));
SELECT isvoi_notify_flow('Telegram: передать на проверку','fact_check','#f59e0b','Переводит черновик на проверку.','isvoi_telegram_review',json_build_object('status','review'));
SELECT isvoi_notify_flow('Telegram: подтвердить и запустить','campaign','#16a34a','Только администратор может записать поля подтверждения и запустить кампанию.','isvoi_telegram_approve',json_build_object('status','approved','approved_by','{{$accountability.user}}','approved_at','$NOW'));
DROP FUNCTION isvoi_notify_flow(text,text,text,text,text,json);

COMMIT;
`;

if(process.argv[1]?.endsWith('setup_directus_telegram_notifications_sql.mjs')) process.stdout.write(notificationsSql);
