\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION comm_lead_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE effective_store uuid;
BEGIN
 IF (SELECT active FROM comm_runtime WHERE id=1)
  AND EXISTS(SELECT 1 FROM comm_conversations WHERE lead_id=OLD.id) THEN
  IF NEW.store_location_id IS DISTINCT FROM OLD.store_location_id THEN
   RAISE EXCEPTION 'Communication lead store cannot be moved';
  END IF;
  effective_store := NEW.store_location_id;
  IF effective_store IS NULL THEN
   SELECT n.store_id INTO effective_store
   FROM comm_conversations c
   JOIN comm_threads t ON t.id=c.thread_id
   JOIN comm_connections n ON n.id=t.connection_id
   WHERE c.lead_id=OLD.id
   ORDER BY c.created_at LIMIT 1;
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
   AND NEW.assigned_to IS NOT NULL
   AND NOT EXISTS(
    SELECT 1 FROM comm_staff s
    JOIN directus_users u ON u.id=s.user_id
    WHERE s.user_id=NEW.assigned_to AND s.store_id=effective_store
      AND s.enabled AND u.status='active'
   ) THEN
   RAISE EXCEPTION 'Assignee is not an active communication operator for this store';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION comm_comment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT active FROM comm_runtime WHERE id=1)
  AND EXISTS(SELECT 1 FROM comm_conversations WHERE lead_id=NEW.lead)
  AND NOT EXISTS(
   SELECT 1 FROM leads l
   JOIN comm_conversations c ON c.lead_id=l.id
   JOIN comm_threads t ON t.id=c.thread_id
   JOIN comm_connections n ON n.id=t.connection_id
   JOIN comm_staff s ON s.store_id=COALESCE(l.store_location_id,n.store_id)
    AND s.user_id=NEW.created_by AND s.enabled
   JOIN directus_users u ON u.id=s.user_id AND u.status='active'
   WHERE l.id=NEW.lead
    AND (l.store_location_id IS NULL OR l.store_location_id=n.store_id)
  ) THEN
  RAISE EXCEPTION 'Comment author is not an active communication operator for this store';
 END IF;
 RETURN NEW;
END $$;

COMMIT;
