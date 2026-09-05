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
COMMIT;
`;
if(process.argv[1]?.endsWith('setup_directus_telegram_conversations_sql.mjs')) process.stdout.write(conversationsSql);
