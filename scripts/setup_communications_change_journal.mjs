// Temporary capture is installed BEFORE shadow backfill. Old data remains authoritative.
export const changeJournalSql = String.raw`
BEGIN;
CREATE OR REPLACE FUNCTION comm_capture_legacy_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
   RETURN NEW;
  END IF;
  -- The legacy worker renews its lease every polling cycle. Only the cursor is
  -- relevant to Telegram migration; journaling lease heartbeats would grow the
  -- temporary table by tens of thousands of rows per day.
  IF TG_TABLE_NAME='telegram_runtime'
     AND (to_jsonb(NEW)->>'update_offset') IS NOT DISTINCT FROM (to_jsonb(OLD)->>'update_offset') THEN
   RETURN NEW;
  END IF;
 END IF;
 INSERT INTO comm_migration_changes(collection,operation,row_id) VALUES(TG_TABLE_NAME,TG_OP,coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id',to_jsonb(NEW)->>'token_hash',to_jsonb(OLD)->>'token_hash',to_jsonb(NEW)->>'bot_id',to_jsonb(OLD)->>'bot_id'));
 RETURN coalesce(NEW,OLD); END $$;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['lead_conversations','lead_messages','telegram_client_sessions','telegram_subscriptions','telegram_link_tokens','telegram_message_outbox','telegram_receipts','telegram_runtime'] LOOP
  IF to_regclass(name) IS NOT NULL THEN
   EXECUTE format('DROP TRIGGER IF EXISTS comm_legacy_change ON %I',name);
   EXECUTE format('CREATE TRIGGER comm_legacy_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION comm_capture_legacy_change()',name);
  END IF;
 END LOOP; END $$;
COMMIT;`;
if (process.argv[1]?.endsWith("setup_communications_change_journal.mjs"))
  process.stdout.write(changeJournalSql);
