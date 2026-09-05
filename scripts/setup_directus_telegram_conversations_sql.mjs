// Additive and disabled by default. No public permissions or file-library changes.
export const conversationsSql = String.raw`
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS lead_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 route_id uuid NOT NULL REFERENCES telegram_routes(id),
 bot_id bigint NOT NULL, client_user_id bigint NOT NULL CHECK(client_user_id>0),
 client_chat_id bigint NOT NULL CHECK(client_chat_id>0),
 created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 UNIQUE(lead_id,bot_id)
);
ALTER TABLE lead_conversations ADD COLUMN IF NOT EXISTS closed_at timestamptz;
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
 token_hash char(64) PRIMARY KEY, lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 bot_id bigint NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE IF NOT EXISTS telegram_client_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bot_id bigint NOT NULL,
 user_id bigint NOT NULL CHECK(user_id>0), chat_id bigint NOT NULL CHECK(chat_id>0),
 conversation_id uuid REFERENCES lead_conversations(id) ON DELETE SET NULL,
 pending_kind varchar(16), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bot_id,user_id), CHECK(chat_id=user_id)
);
CREATE TABLE IF NOT EXISTS lead_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES lead_conversations(id) ON DELETE CASCADE,
 direction varchar(8) NOT NULL CHECK(direction IN ('in','out')),
 text text NOT NULL DEFAULT '', photo_file_id varchar(512), album_id varchar(128),
 created_by uuid REFERENCES directus_users(id), telegram_message_id bigint,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_reply_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES lead_conversations(id) ON DELETE CASCADE,
 staff_user uuid NOT NULL REFERENCES directus_users(id), telegram_user_id bigint NOT NULL,
 state varchar(16) NOT NULL DEFAULT 'awaiting' CHECK(state IN ('awaiting','preview','confirmed','cancelled')),
 text text NOT NULL DEFAULT '', photo_file_id varchar(512),
 prompt_message_id bigint, preview_message_id bigint,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_message_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bot_id bigint NOT NULL,
 route_id uuid REFERENCES telegram_routes(id), conversation_id uuid REFERENCES lead_conversations(id) ON DELETE CASCADE,
 session_id uuid REFERENCES telegram_client_sessions(id) ON DELETE CASCADE,
 message_id uuid REFERENCES lead_messages(id) ON DELETE CASCADE,
 draft_id uuid REFERENCES telegram_reply_drafts(id) ON DELETE CASCADE,
 destination varchar(8) NOT NULL CHECK(destination IN ('client','group')),
 purpose varchar(16) NOT NULL DEFAULT 'notice', payload jsonb NOT NULL,
 state varchar(16) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','in_flight','done','uncertain','failed')),
 operation_id uuid, operation_deadline timestamptz, telegram_message_id bigint,
 due_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 error_code varchar(80), CHECK(conversation_id IS NOT NULL OR session_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_message_once ON telegram_message_outbox(message_id,destination) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telegram_message_queue ON telegram_message_outbox(due_at,created_at) WHERE state='pending';
CREATE INDEX IF NOT EXISTS telegram_client_conversations ON lead_conversations(bot_id,client_user_id);
CREATE INDEX IF NOT EXISTS telegram_conversation_retention ON lead_conversations(closed_at) WHERE closed_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS telegram_retention_settings (
 bot_id bigint PRIMARY KEY CHECK(bot_id>0),
 retention_months integer NOT NULL DEFAULT 6 CHECK(retention_months=6),
 last_run_at timestamptz, next_run_at timestamptz NOT NULL DEFAULT now(),
 last_conversations_deleted integer NOT NULL DEFAULT 0,
 last_sessions_deleted integer NOT NULL DEFAULT 0,
 last_tokens_deleted integer NOT NULL DEFAULT 0,
 last_receipts_deleted integer NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION isvoi_telegram_close_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('won','closed') AND coalesce(OLD.status,'') NOT IN ('won','closed') THEN
   UPDATE lead_conversations SET closed_at=now() WHERE lead_id=NEW.id AND closed_at IS NULL;
 ELSIF coalesce(NEW.status,'') NOT IN ('won','closed') AND OLD.status IN ('won','closed') THEN
   UPDATE lead_conversations SET closed_at=NULL WHERE lead_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS isvoi_telegram_conversation_status ON leads;
CREATE TRIGGER isvoi_telegram_conversation_status AFTER UPDATE OF status ON leads
 FOR EACH ROW EXECUTE FUNCTION isvoi_telegram_close_conversation();
INSERT INTO directus_collections(collection,icon,note,hidden,singleton,accountability) VALUES
 ('lead_conversations','forum','Диалоги с клиентами Telegram.',false,false,'all'),
 ('lead_messages','chat','История. Фотографии хранятся как закрытые Telegram file_id, не в публичном каталоге.',false,false,'all'),
 ('telegram_link_tokens','key','Одноразовые хеши привязки. Не выдавать права Public.',true,false,'all'),
 ('telegram_client_sessions','person','Выбранный клиентом диалог.',true,false,'all'),
 ('telegram_reply_drafts','draft','Личные черновики менеджеров, срок 10 минут.',true,false,'all'),
 ('telegram_message_outbox','outbox','Доставка переписки. uncertain требует сверки, повтор запрещён.',false,false,'all')
 ,('telegram_retention_settings','timer','Срок хранения переписки: 6 месяцев после закрытия. Служебное состояние ежедневной очистки.',true,false,'all')
ON CONFLICT(collection) DO NOTHING;

-- Make the conversation history usable from the lead card in Directus Studio.
UPDATE directus_collections
SET "group"=CASE WHEN EXISTS (SELECT 1 FROM directus_collections WHERE collection='isvoi_sales') THEN 'isvoi_sales' ELSE NULL END,
    sort=20, icon='forum', color='#24a1de',
    display_template='{{lead_id.reference_code}} · Telegram · {{created_at}}',
    translations='[{"language":"ru-RU","translation":"Диалоги Telegram"}]'::json
WHERE collection='lead_conversations';
UPDATE directus_collections
SET "group"=CASE WHEN EXISTS (SELECT 1 FROM directus_collections WHERE collection='isvoi_sales') THEN 'isvoi_sales' ELSE NULL END,
    sort=21, icon='chat', color='#2563eb', hidden=true,
    display_template='{{direction}} · {{created_at}} · {{text}}',
    translations='[{"language":"ru-RU","translation":"Сообщения Telegram"}]'::json
WHERE collection='lead_messages';
UPDATE directus_collections
SET "group"=CASE WHEN EXISTS (SELECT 1 FROM directus_collections WHERE collection='isvoi_sales') THEN 'isvoi_sales' ELSE NULL END,
    sort=22, icon='outbox', color='#64748b', hidden=true,
    display_template='{{state}} · {{destination}} · {{purpose}}',
    translations='[{"language":"ru-RU","translation":"Доставка Telegram"}]'::json
WHERE collection='telegram_message_outbox';

CREATE OR REPLACE FUNCTION isvoi_telegram_field(
  p_collection varchar, p_field varchar, p_interface varchar, p_display varchar,
  p_options json, p_width varchar, p_sort integer, p_note text,
  p_special varchar, p_group varchar, p_readonly boolean,
  p_hidden boolean, p_translation text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_translations json;
BEGIN
  v_translations := json_build_array(json_build_object('language','ru-RU','translation',p_translation))::json;
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface, display=p_display, options=p_options,
      width=p_width, sort=p_sort, note=p_note, special=p_special, "group"=p_group,
      readonly=p_readonly, hidden=p_hidden, translations=v_translations
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,"group",readonly,hidden,translations)
    VALUES(p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,p_group,p_readonly,p_hidden,v_translations);
  END IF;
END $$;

-- The lead remains the manager's main workspace; open the Telegram history here.
SELECT isvoi_telegram_field('leads','telegram_dialogs','list-o2m',NULL,
  '{"layout":"table","enableCreate":false,"enableSelect":false,"fields":["created_at","closed_at"]}'::json,
  'full',9,'Диалоги и сообщения клиента в Telegram. Откройте строку, чтобы увидеть всю переписку.',
  'o2m','group_processing',true,false,'Переписка Telegram');

SELECT isvoi_telegram_field('lead_conversations','id','input',NULL,NULL,'half',1,'ID диалога.','uuid',NULL,true,true,'ID');
SELECT isvoi_telegram_field('lead_conversations','lead_id','select-dropdown-m2o','related-values','{"template":"{{reference_code}} · {{contact}} · {{status}}"}'::json,'full',2,'Заявка, к которой относится переписка.','m2o',NULL,true,false,'Заявка');
SELECT isvoi_telegram_field('lead_conversations','created_at','datetime','datetime',NULL,'half',3,'Когда клиент привязал Telegram к заявке.',NULL,NULL,true,false,'Начало диалога');
SELECT isvoi_telegram_field('lead_conversations','closed_at','datetime','datetime',NULL,'half',4,'Заполняется после закрытия заявки; с этой даты отсчитываются шесть месяцев хранения.',NULL,NULL,true,false,'Диалог закрыт');
SELECT isvoi_telegram_field('lead_conversations','messages','list-o2m',NULL,
  '{"layout":"table","enableCreate":false,"enableSelect":false,"fields":["created_at","direction","text","created_by","photo_file_id"]}'::json,
  'full',5,'Хронологическая переписка. Входящие сообщения — от клиента, исходящие — подтвержденные ответы менеджера.',
  'o2m',NULL,true,false,'История сообщений');
SELECT isvoi_telegram_field('lead_conversations','delivery_log','list-o2m',NULL,
  '{"layout":"table","enableCreate":false,"enableSelect":false,"fields":["created_at","destination","purpose","state","error_code"]}'::json,
  'full',6,'Технический журнал доставки. Проверяйте его при состояниях «Неизвестно» или «Ошибка».',
  'o2m',NULL,true,false,'Доставка сообщений');
SELECT isvoi_telegram_field('lead_conversations','route_id','select-dropdown-m2o','related-values',NULL,'half',90,'Маршрут Telegram.','m2o',NULL,true,true,'Маршрут');
SELECT isvoi_telegram_field('lead_conversations','bot_id','input',NULL,NULL,'half',91,'Telegram ID бота.',NULL,NULL,true,true,'ID бота');
SELECT isvoi_telegram_field('lead_conversations','client_user_id','input',NULL,NULL,'half',92,'Telegram ID пользователя.',NULL,NULL,true,true,'ID пользователя');
SELECT isvoi_telegram_field('lead_conversations','client_chat_id','input',NULL,NULL,'half',93,'Telegram ID личного чата.',NULL,NULL,true,true,'ID чата');

SELECT isvoi_telegram_field('lead_messages','id','input',NULL,NULL,'half',1,'ID сообщения.','uuid',NULL,true,true,'ID');
SELECT isvoi_telegram_field('lead_messages','conversation_id','select-dropdown-m2o','related-values','{"template":"{{lead_id.reference_code}} · {{created_at}}"}'::json,'full',2,'Диалог Telegram.','m2o',NULL,true,false,'Диалог');
SELECT isvoi_telegram_field('lead_messages','created_at','datetime','datetime',NULL,'half',3,'Время сообщения.',NULL,NULL,true,false,'Время');
SELECT isvoi_telegram_field('lead_messages','direction','select-dropdown','labels','{"choices":[{"text":"Клиент","value":"in","color":"#24a1de"},{"text":"Менеджер","value":"out","color":"#16a34a"}]}'::json,'half',4,'Кто отправил сообщение.',NULL,NULL,true,false,'Отправитель');
SELECT isvoi_telegram_field('lead_messages','text','input-multiline',NULL,NULL,'full',5,'Текст сообщения.',NULL,NULL,true,false,'Сообщение');
SELECT isvoi_telegram_field('lead_messages','created_by','select-dropdown-m2o','related-values','{"template":"{{first_name}} {{last_name}} · {{email}}"}'::json,'half',6,'Менеджер, подтвердивший исходящее сообщение.','m2o',NULL,true,false,'Менеджер');
SELECT isvoi_telegram_field('lead_messages','photo_file_id','input',NULL,NULL,'full',7,'Закрытый Telegram file_id. Само изображение остается в Telegram и в Directus сейчас не показывается.',NULL,NULL,true,false,'Фото Telegram');
SELECT isvoi_telegram_field('lead_messages','album_id','input',NULL,NULL,'half',90,'ID альбома Telegram.',NULL,NULL,true,true,'ID альбома');
SELECT isvoi_telegram_field('lead_messages','telegram_message_id','input',NULL,NULL,'half',91,'ID сообщения Telegram.',NULL,NULL,true,true,'ID в Telegram');

SELECT isvoi_telegram_field('telegram_message_outbox','created_at','datetime','datetime',NULL,'half',1,'Когда создана попытка доставки.',NULL,NULL,true,false,'Создана');
SELECT isvoi_telegram_field('telegram_message_outbox','destination','select-dropdown','labels','{"choices":[{"text":"Клиент","value":"client"},{"text":"Группа","value":"group"}]}'::json,'half',2,'Куда отправлялось сообщение.',NULL,NULL,true,false,'Получатель');
SELECT isvoi_telegram_field('telegram_message_outbox','purpose','input',NULL,NULL,'half',3,'Назначение сообщения.',NULL,NULL,true,false,'Назначение');
SELECT isvoi_telegram_field('telegram_message_outbox','state','select-dropdown','labels','{"choices":[{"text":"Ожидает","value":"pending","color":"#f59e0b"},{"text":"Отправляется","value":"in_flight","color":"#2563eb"},{"text":"Доставлено Telegram","value":"done","color":"#16a34a"},{"text":"Неизвестно","value":"uncertain","color":"#f97316"},{"text":"Ошибка","value":"failed","color":"#ef4444"}]}'::json,'half',4,'Результат передачи сообщения Telegram.',NULL,NULL,true,false,'Состояние');
SELECT isvoi_telegram_field('telegram_message_outbox','error_code','input',NULL,NULL,'full',5,'Код ошибки или неопределенной доставки.',NULL,NULL,true,false,'Ошибка');
SELECT isvoi_telegram_field('telegram_message_outbox','conversation_id','select-dropdown-m2o','related-values',NULL,'full',6,'Связанный диалог.','m2o',NULL,true,false,'Диалог');

DROP FUNCTION isvoi_telegram_field(varchar,varchar,varchar,varchar,json,varchar,integer,text,varchar,varchar,boolean,boolean,text);

CREATE OR REPLACE FUNCTION isvoi_telegram_relation(
  p_many_collection varchar, p_many_field varchar, p_one_collection varchar,
  p_one_field varchar, p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many_collection AND many_field=p_many_field) THEN
    UPDATE directus_relations SET one_collection=p_one_collection, one_field=p_one_field, one_deselect_action=p_action
    WHERE many_collection=p_many_collection AND many_field=p_many_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES(p_many_collection,p_many_field,p_one_collection,p_one_field,p_action);
  END IF;
END $$;

SELECT isvoi_telegram_relation('lead_conversations','lead_id','leads','telegram_dialogs','delete');
SELECT isvoi_telegram_relation('lead_conversations','route_id','telegram_routes',NULL,'nullify');
SELECT isvoi_telegram_relation('lead_messages','conversation_id','lead_conversations','messages','delete');
SELECT isvoi_telegram_relation('lead_messages','created_by','directus_users',NULL,'nullify');
SELECT isvoi_telegram_relation('telegram_message_outbox','conversation_id','lead_conversations','delivery_log','delete');
DROP FUNCTION isvoi_telegram_relation(varchar,varchar,varchar,varchar,varchar);
COMMIT;
`;
if(process.argv[1]?.endsWith('setup_directus_telegram_conversations_sql.mjs')) process.stdout.write(conversationsSql);
