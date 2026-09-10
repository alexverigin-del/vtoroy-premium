BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS comm_runtime (
 id integer PRIMARY KEY CHECK(id=1), active boolean NOT NULL DEFAULT false,
 sending_enabled boolean NOT NULL DEFAULT false, cutover_at timestamptz,
 baseline_at timestamptz, last_backup_at timestamptz, recovery_hold boolean NOT NULL DEFAULT true
);
INSERT INTO comm_runtime(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS comm_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform text NOT NULL CHECK(platform IN ('telegram','max','vk')),
 external_id text NOT NULL, name text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 mode text NOT NULL DEFAULT 'test' CHECK(mode IN ('test','production')),
 store_id uuid NOT NULL REFERENCES store_locations(id), worker_user_id uuid NOT NULL REFERENCES directus_users(id),
 service_user_id uuid REFERENCES directus_users(id), secret_ref text NOT NULL,
 bot_username text, settings jsonb NOT NULL DEFAULT '{}', marketing_enabled boolean NOT NULL DEFAULT false,
 last_received_at timestamptz, last_sent_at timestamptz, error_code text,
 poll_offset bigint NOT NULL DEFAULT 0, poll_owner uuid, poll_until timestamptz,
 send_after timestamptz NOT NULL DEFAULT now(), UNIQUE(platform,external_id)
);
CREATE TABLE IF NOT EXISTS comm_staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES directus_users(id),
 store_id uuid NOT NULL REFERENCES store_locations(id), enabled boolean NOT NULL DEFAULT true,
 can_manage boolean NOT NULL DEFAULT false, can_publish boolean NOT NULL DEFAULT false,
 UNIQUE(user_id,store_id)
);
CREATE TABLE IF NOT EXISTS comm_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 merged_into uuid REFERENCES comm_contacts(id), CHECK(merged_into IS NULL OR merged_into<>id)
);
CREATE TABLE IF NOT EXISTS comm_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL REFERENCES comm_contacts(id),
 connection_id uuid NOT NULL REFERENCES comm_connections(id), external_user_id text NOT NULL,
 availability text NOT NULL DEFAULT 'unknown' CHECK(availability IN ('unknown','allowed','blocked')),
 availability_at timestamptz, first_seen_at timestamptz, last_active_at timestamptz,
 source text, is_test boolean NOT NULL DEFAULT false, preferred boolean NOT NULL DEFAULT false,
 UNIQUE(connection_id,external_user_id)
);
CREATE TABLE IF NOT EXISTS comm_threads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES comm_connections(id),
 identity_id uuid NOT NULL REFERENCES comm_identities(id), external_peer_id text NOT NULL,
 selected_conversation_id uuid, pending_kind text, subscription_draft jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(connection_id,external_peer_id)
);
CREATE TABLE IF NOT EXISTS comm_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL REFERENCES comm_threads(id),
 lead_id uuid NOT NULL REFERENCES leads(id), handling text NOT NULL DEFAULT 'queued' CHECK(handling IN ('bot','queued','agent','waiting','closed')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 last_inbound_at timestamptz, last_agent_reply_at timestamptz, awaiting_since timestamptz,
 UNIQUE(thread_id,lead_id)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='comm_thread_selected_fk') THEN
 ALTER TABLE comm_threads ADD CONSTRAINT comm_thread_selected_fk FOREIGN KEY(selected_conversation_id) REFERENCES comm_conversations(id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS comm_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 thread_id uuid NOT NULL REFERENCES comm_threads(id), conversation_id uuid REFERENCES comm_conversations(id) ON DELETE CASCADE,
 direction text NOT NULL CHECK(direction IN ('in','out','internal','system')),
 text text NOT NULL DEFAULT '', created_by uuid REFERENCES directus_users(id), external_id text,
 occurred_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz NOT NULL DEFAULT now(),
 edited_at timestamptz, album_id text, deleted_at timestamptz, UNIQUE(thread_id,external_id,direction)
);
CREATE INDEX IF NOT EXISTS comm_messages_cursor ON comm_messages(thread_id,sequence DESC);
CREATE INDEX IF NOT EXISTS comm_conversation_messages_cursor
 ON comm_messages(conversation_id,sequence DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS comm_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid REFERENCES comm_messages(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES comm_conversations(id) ON DELETE CASCADE,
 connection_id uuid REFERENCES comm_connections(id), uploaded_by uuid REFERENCES directus_users(id),
 kind text NOT NULL CHECK(kind IN ('image','voice','audio','video','document')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','quarantine','scanning','ready','rejected')),
 name text NOT NULL, mime text NOT NULL, size bigint CHECK(size>=0 AND size<=20000000),
 external_ref jsonb, storage_key text UNIQUE, sha256 char(64), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), checked_at timestamptz
);
CREATE INDEX IF NOT EXISTS comm_attachment_work_queue
 ON comm_attachments(connection_id,state,created_at)
 WHERE state IN ('pending','quarantine','scanning');
CREATE TABLE IF NOT EXISTS comm_reads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES directus_users(id), conversation_id uuid NOT NULL REFERENCES comm_conversations(id) ON DELETE CASCADE,
 sequence bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comm_inbound (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES comm_connections(id),
 external_id text NOT NULL, event jsonb, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','failed')),
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, error_code text, result jsonb,
 UNIQUE(connection_id,external_id)
);
ALTER TABLE comm_inbound ADD COLUMN IF NOT EXISTS result jsonb;
CREATE INDEX IF NOT EXISTS comm_inbound_work_queue
 ON comm_inbound(connection_id,received_at) WHERE state='pending';
CREATE TABLE IF NOT EXISTS comm_command_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES directus_users(id),
 command_type text NOT NULL, command_key uuid NOT NULL, fingerprint char(64) NOT NULL,
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,command_type,command_key)
);
CREATE TABLE IF NOT EXISTS comm_topics (
 key text PRIMARY KEY, label text NOT NULL, active boolean NOT NULL DEFAULT true, sort integer NOT NULL DEFAULT 0
);
INSERT INTO comm_topics(key,label,sort) VALUES ('new_arrivals','Новые поступления',1),('price_drops','Снижение цен',2),('news_promotions','Новости и акции',3) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS comm_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identity_id uuid NOT NULL REFERENCES comm_identities(id),
 topic_key text NOT NULL REFERENCES comm_topics(key), consent boolean NOT NULL DEFAULT false,
 consent_version text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(identity_id,topic_key)
);
CREATE TABLE IF NOT EXISTS comm_consent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identity_id uuid NOT NULL REFERENCES comm_identities(id),
 topic_key text NOT NULL REFERENCES comm_topics(key), consent boolean NOT NULL, version text NOT NULL,
 source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comm_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid REFERENCES comm_connections(id),
 identity_id uuid REFERENCES comm_identities(id), lead_id uuid REFERENCES leads(id),
 kind text NOT NULL, version integer NOT NULL DEFAULT 1, dedupe_key text NOT NULL UNIQUE,
 occurred_at timestamptz NOT NULL DEFAULT now(), recorded_at timestamptz NOT NULL DEFAULT now(),
 is_test boolean NOT NULL DEFAULT false, facts jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS comm_events_reporting ON comm_events(connection_id,kind,occurred_at);
CREATE TABLE IF NOT EXISTS comm_content (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, product_id text,
 expires_at timestamptz, created_by uuid NOT NULL REFERENCES directus_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comm_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES comm_content(id),
 platform text NOT NULL CHECK(platform IN ('telegram','max','vk')), text text NOT NULL,
 cta_label text, cta_url text, attachment_id uuid REFERENCES comm_attachments(id), version integer NOT NULL DEFAULT 1,
 UNIQUE(content_id,platform)
);
CREATE TABLE IF NOT EXISTS comm_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, content_id uuid REFERENCES comm_content(id),
 topic_key text REFERENCES comm_topics(key), state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','approved','sending','completed','cancelled')),
 created_by uuid NOT NULL REFERENCES directus_users(id), approved_by uuid REFERENCES directus_users(id),
 approved_at timestamptz, scheduled_at timestamptz NOT NULL DEFAULT now(), snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), is_test boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS comm_destinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES comm_connections(id),
 name text NOT NULL, external_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('channel','vk_wall','staff')),
 enabled boolean NOT NULL DEFAULT false, verified_at timestamptz, UNIQUE(connection_id,external_id,kind)
);
CREATE TABLE IF NOT EXISTS comm_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES comm_campaigns(id),
 connection_id uuid NOT NULL REFERENCES comm_connections(id), destination_id uuid REFERENCES comm_destinations(id),
 kind text NOT NULL CHECK(kind IN ('subscribers','publication')), state text NOT NULL DEFAULT 'pending',
 snapshot jsonb, external_id text, error_code text, published_at timestamptz,
 CHECK((kind='publication')=(destination_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS comm_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES comm_connections(id),
 thread_id uuid REFERENCES comm_threads(id), conversation_id uuid REFERENCES comm_conversations(id),
 message_id uuid REFERENCES comm_messages(id) ON DELETE CASCADE, contact_id uuid REFERENCES comm_contacts(id),
 identity_id uuid REFERENCES comm_identities(id), campaign_id uuid REFERENCES comm_campaigns(id), target_id uuid REFERENCES comm_targets(id),
 purpose text NOT NULL DEFAULT 'service' CHECK(purpose IN ('service','marketing','publication','staff')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','partial','failed','uncertain','blocked','cancelled','suppressed')),
 dedupe_key text NOT NULL UNIQUE, due_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), error_code text, accepted_at timestamptz,
 created_by uuid REFERENCES directus_users(id), expected_version integer,
 UNIQUE(campaign_id,contact_id)
);
CREATE TABLE IF NOT EXISTS comm_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL REFERENCES comm_outbox(id) ON DELETE CASCADE,
 position integer NOT NULL DEFAULT 0, method text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','in_flight','accepted','failed','uncertain','cancelled')),
 attempt_id uuid, lease_version integer NOT NULL DEFAULT 0, lease_until timestamptz, worker_id uuid,
 external_id text, error_code text, attempts integer NOT NULL DEFAULT 0, UNIQUE(outbox_id,position)
);
CREATE TABLE IF NOT EXISTS comm_attempts (
 id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES comm_operations(id) ON DELETE CASCADE,
 lease_version integer NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 outcome jsonb, late boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS comm_frequency (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL REFERENCES comm_contacts(id),
 outbox_id uuid NOT NULL UNIQUE REFERENCES comm_outbox(id) ON DELETE CASCADE,
 reserved_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);
CREATE INDEX IF NOT EXISTS comm_frequency_window ON comm_frequency(contact_id,reserved_at) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS comm_outbox_queue ON comm_outbox(connection_id,due_at,created_at) WHERE state IN ('pending','sending');
CREATE TABLE IF NOT EXISTS comm_link_tokens (
 hash char(64) PRIMARY KEY, source_identity_id uuid REFERENCES comm_identities(id),
 target_identity_id uuid REFERENCES comm_identities(id), lead_id uuid NOT NULL REFERENCES leads(id),
 expires_at timestamptz NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirm','done','revoked')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comm_access_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_id uuid NOT NULL REFERENCES comm_identities(id), lead_id uuid NOT NULL REFERENCES leads(id),
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS comm_legacy_map (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 collection text NOT NULL, legacy_id text NOT NULL, new_id uuid NOT NULL,
 UNIQUE(collection,legacy_id)
);
CREATE TABLE IF NOT EXISTS comm_migration_changes (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, collection text NOT NULL,
 operation text NOT NULL, row_id text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comm_staff_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES comm_connections(id),
 external_user_id text NOT NULL,user_id uuid NOT NULL REFERENCES directus_users(id),enabled boolean NOT NULL DEFAULT false,
 UNIQUE(connection_id,external_user_id)
);
CREATE TABLE IF NOT EXISTS comm_staff_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES comm_connections(id),
 lead_id uuid NOT NULL REFERENCES leads(id),destination_id uuid NOT NULL REFERENCES comm_destinations(id),
 topic_id text,message_id text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(connection_id,lead_id)
);
CREATE TABLE IF NOT EXISTS comm_staff_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES comm_conversations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES directus_users(id),external_user_id text NOT NULL,
 state text NOT NULL DEFAULT 'awaiting' CHECK(state IN ('awaiting','preview','confirmed','cancelled')),
 text text NOT NULL DEFAULT '',attachment_id uuid REFERENCES comm_attachments(id),prompt_message_id text,preview_message_id text,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE IF NOT EXISTS comm_backups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 state text NOT NULL DEFAULT 'running' CHECK(state IN ('running','completed','failed')),manifest_sha256 char(64),external_verified boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS comm_file_gc (
 storage_key uuid PRIMARY KEY,queued_at timestamptz NOT NULL DEFAULT now()
);
-- Release any database created before the short-lived scanner claim state existed.
DO $$ DECLARE state_check text; BEGIN
 SELECT conname INTO state_check FROM pg_constraint
 WHERE conrelid='comm_attachments'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%state%' LIMIT 1;
 IF state_check IS NOT NULL AND pg_get_constraintdef(
   (SELECT oid FROM pg_constraint WHERE conname=state_check AND conrelid='comm_attachments'::regclass)
  ) NOT LIKE '%scanning%' THEN
  EXECUTE format('ALTER TABLE comm_attachments DROP CONSTRAINT %I',state_check);
  ALTER TABLE comm_attachments ADD CONSTRAINT comm_attachments_state_check
   CHECK(state IN ('pending','quarantine','scanning','ready','rejected'));
 END IF;
END $$;
-- Directus requires one scalar primary-key field. Earlier development schemas used composite
-- primary keys for these service tables; migrate them without changing their logical uniqueness.
ALTER TABLE comm_reads ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE comm_access_grants ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE comm_legacy_map ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE comm_reads SET id=gen_random_uuid() WHERE id IS NULL;
UPDATE comm_access_grants SET id=gen_random_uuid() WHERE id IS NULL;
UPDATE comm_legacy_map SET id=gen_random_uuid() WHERE id IS NULL;
ALTER TABLE comm_reads ALTER COLUMN id SET DEFAULT gen_random_uuid(), ALTER COLUMN id SET NOT NULL;
ALTER TABLE comm_access_grants ALTER COLUMN id SET DEFAULT gen_random_uuid(), ALTER COLUMN id SET NOT NULL;
ALTER TABLE comm_legacy_map ALTER COLUMN id SET DEFAULT gen_random_uuid(), ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS comm_reads_logical_unique
 ON comm_reads(user_id,conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS comm_access_grants_logical_unique
 ON comm_access_grants(identity_id,lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS comm_legacy_map_logical_unique
 ON comm_legacy_map(collection,legacy_id);
DO $$ DECLARE target_table text; pk_name text; pk_definition text; BEGIN
 FOREACH target_table IN ARRAY ARRAY['comm_reads','comm_access_grants','comm_legacy_map'] LOOP
  pk_name := NULL;
  pk_definition := NULL;
  SELECT pc.conname, pg_get_constraintdef(pc.oid)
  INTO pk_name, pk_definition
  FROM pg_constraint pc
  WHERE pc.conrelid=target_table::regclass AND pc.contype='p';
  IF pk_name IS NOT NULL AND pk_definition <> 'PRIMARY KEY (id)' THEN
   EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',target_table,pk_name);
   pk_name := NULL;
  END IF;
  IF pk_name IS NULL THEN
   EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY(id)',target_table,target_table||'_pkey');
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION comm_protect_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Consent events are append-only'; END $$;
DROP TRIGGER IF EXISTS comm_consent_immutable ON comm_consent_events;
CREATE TRIGGER comm_consent_immutable BEFORE UPDATE OR DELETE ON comm_consent_events FOR EACH ROW EXECUTE FUNCTION comm_protect_consent();
CREATE OR REPLACE FUNCTION comm_campaign_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.snapshot IS NOT NULL AND (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.content_id IS DISTINCT FROM OLD.content_id OR NEW.topic_key IS DISTINCT FROM OLD.topic_key) THEN
 RAISE EXCEPTION 'Approved campaign snapshot is immutable'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS comm_campaign_snapshot ON comm_campaigns;
CREATE TRIGGER comm_campaign_snapshot BEFORE UPDATE ON comm_campaigns FOR EACH ROW EXECUTE FUNCTION comm_campaign_snapshot_guard();
-- Applies to Studio, Items API and integrations alike. leads remains authoritative.
CREATE OR REPLACE FUNCTION comm_lead_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT active FROM comm_runtime WHERE id=1) AND EXISTS(SELECT 1 FROM comm_conversations WHERE lead_id=OLD.id) THEN
  IF NEW.store_location_id IS DISTINCT FROM OLD.store_location_id THEN RAISE EXCEPTION 'Communication lead store cannot be moved'; END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM comm_staff s JOIN directus_users u ON u.id=s.user_id WHERE s.user_id=NEW.assigned_to AND s.store_id=NEW.store_location_id AND s.enabled AND u.status='active'
  ) THEN RAISE EXCEPTION 'Assignee is not an active communication operator for this store'; END IF;
 END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS comm_lead_guard_trigger ON leads;
CREATE TRIGGER comm_lead_guard_trigger BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION comm_lead_guard();
CREATE OR REPLACE FUNCTION comm_lead_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
  UPDATE comm_conversations SET version=version+1,
   handling=CASE WHEN NEW.status IN ('closed','won') THEN 'closed' WHEN NEW.status='waiting' THEN 'waiting' WHEN NEW.assigned_to IS NULL THEN 'queued' ELSE 'agent' END,
   closed_at=CASE WHEN NEW.status IN ('closed','won') THEN coalesce(closed_at,now()) ELSE NULL END WHERE lead_id=NEW.id;
 END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS comm_lead_sync_trigger ON leads;
CREATE TRIGGER comm_lead_sync_trigger AFTER UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION comm_lead_sync();
-- Directus policies validate the actor-owned fields. This trigger also enforces store ownership
-- for Studio, Items API and extensions whenever the lead belongs to the communications core.
CREATE OR REPLACE FUNCTION comm_comment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT active FROM comm_runtime WHERE id=1)
  AND EXISTS(SELECT 1 FROM comm_conversations WHERE lead_id=NEW.lead)
  AND NOT EXISTS(
   SELECT 1 FROM leads l
   JOIN comm_staff s ON s.store_id=l.store_location_id AND s.user_id=NEW.created_by AND s.enabled
   JOIN directus_users u ON u.id=s.user_id AND u.status='active'
   WHERE l.id=NEW.lead
  )
 THEN RAISE EXCEPTION 'Comment author is not an active communication operator for this store';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS comm_comment_guard_trigger ON lead_comments;
CREATE TRIGGER comm_comment_guard_trigger BEFORE INSERT OR UPDATE ON lead_comments
FOR EACH ROW EXECUTE FUNCTION comm_comment_guard();
COMMIT;
