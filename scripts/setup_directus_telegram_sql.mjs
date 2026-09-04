#!/usr/bin/env node
// Additive setup. No routes, users, credentials or historical notifications are enabled.
export const telegramSql = String.raw`
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS telegram_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES store_locations(id),
 bot_id bigint NOT NULL CHECK(bot_id > 0),
 chat_id bigint NOT NULL UNIQUE CHECK(chat_id < 0),
 is_test boolean NOT NULL DEFAULT true,
 enabled boolean NOT NULL DEFAULT false,
 accept_unscoped boolean NOT NULL DEFAULT false,
 activated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(store_id,is_test)
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_one_unscoped_route
 ON telegram_routes(is_test) WHERE enabled AND accept_unscoped;

CREATE TABLE IF NOT EXISTS telegram_staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 route_id uuid NOT NULL REFERENCES telegram_routes(id),
 telegram_user_id bigint NOT NULL CHECK(telegram_user_id > 0),
 directus_user uuid NOT NULL REFERENCES directus_users(id),
 enabled boolean NOT NULL DEFAULT false,
 UNIQUE(route_id,telegram_user_id)
);

CREATE OR REPLACE FUNCTION isvoi_telegram_route_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.bot_id,OLD.chat_id,OLD.store_id,OLD.is_test) IS DISTINCT FROM (NEW.bot_id,NEW.chat_id,NEW.store_id,NEW.is_test) THEN
   RAISE EXCEPTION 'Telegram route identity is immutable; use a reviewed migration';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS isvoi_telegram_route_identity ON telegram_routes;
CREATE TRIGGER isvoi_telegram_route_identity BEFORE UPDATE ON telegram_routes
 FOR EACH ROW EXECUTE FUNCTION isvoi_telegram_route_identity();

CREATE TABLE IF NOT EXISTS telegram_runtime (
 bot_id bigint PRIMARY KEY CHECK(bot_id > 0),
 worker_id uuid,
 lease_until timestamptz NOT NULL DEFAULT now(),
 update_offset bigint NOT NULL DEFAULT 0,
 send_after timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 route_id uuid NOT NULL REFERENCES telegram_routes(id),
 topic_id bigint CHECK(topic_id > 0),
 message_id bigint CHECK(message_id > 0),
 revision bigint NOT NULL DEFAULT 1,
 sent_revision bigint NOT NULL DEFAULT 0,
 state varchar(16) NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','in_flight','done','uncertain','failed')),
 operation_id uuid,
 operation_kind varchar(32),
 operation_revision bigint,
 operation_deadline timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 due_at timestamptz NOT NULL DEFAULT now(),
 error_code varchar(80),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(lead_id,route_id)
);
CREATE INDEX IF NOT EXISTS telegram_delivery_queue ON telegram_deliveries(due_at,created_at)
 WHERE state='pending';

CREATE TABLE IF NOT EXISTS telegram_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bot_id bigint NOT NULL,
 update_id bigint NOT NULL,
 callback_id varchar(128),
 result_code varchar(32) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bot_id,update_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_callback_once
 ON telegram_receipts(bot_id,callback_id) WHERE callback_id IS NOT NULL;

CREATE OR REPLACE FUNCTION isvoi_telegram_enqueue_lead() RETURNS trigger
 LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status <> 'new' THEN RETURN NEW; END IF;
   INSERT INTO telegram_deliveries(lead_id,route_id)
   SELECT NEW.id,r.id FROM telegram_routes r
   WHERE r.enabled AND r.is_test=coalesce(NEW.is_test,false)
     AND NEW.created_at >= r.activated_at
     AND (NEW.store_location_id=r.store_id OR (NEW.store_location_id IS NULL AND r.accept_unscoped))
   ON CONFLICT(lead_id,route_id) DO NOTHING;
 ELSE
   IF (OLD.status,OLD.assigned_to,OLD.device,OLD.kind,OLD.store_location_id,OLD.is_test)
      IS DISTINCT FROM
      (NEW.status,NEW.assigned_to,NEW.device,NEW.kind,NEW.store_location_id,NEW.is_test) THEN
     UPDATE telegram_deliveries SET revision=revision+1,
       state=CASE WHEN state='done' THEN 'pending' ELSE state END,
       due_at=CASE WHEN state='done' THEN now() ELSE due_at END
     WHERE lead_id=NEW.id;
   END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS isvoi_telegram_lead_event ON leads;
CREATE TRIGGER isvoi_telegram_lead_event AFTER INSERT OR UPDATE ON leads
 FOR EACH ROW EXECUTE FUNCTION isvoi_telegram_enqueue_lead();

INSERT INTO directus_collections(collection,icon,note,hidden,singleton,accountability)
VALUES
 ('telegram_routes','route','Telegram: маршруты магазинов. Включать только после проверки бота и группы.',false,false,'all'),
 ('telegram_staff','support_agent','Telegram: допуск сотрудников. Активный пользователь Directus с правом обработки лидов обязателен.',false,false,'all'),
 ('telegram_runtime','settings','Telegram: аренда рабочего процесса и входящий курсор.',true,false,'all'),
 ('telegram_deliveries','outbox','Telegram: доставка карточек. uncertain требует ручной сверки, не повторять вслепую.',false,false,'all'),
 ('telegram_receipts','receipt_long','Telegram: результаты обработки без текста сообщений.',true,false,'all')
ON CONFLICT(collection) DO NOTHING;

-- No public/editor/worker collection grants. The worker uses a narrow authenticated endpoint.
-- Do not reset existing route/staff settings when setup is repeated.
COMMIT;
`;
if (process.argv[1]?.endsWith('setup_directus_telegram_sql.mjs')) process.stdout.write(telegramSql);
