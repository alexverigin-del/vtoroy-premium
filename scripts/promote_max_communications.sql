\set ON_ERROR_STOP on
-- Run with psql -v apply=0 for a rollback rehearsal, then -v apply=1 to publish.
BEGIN;
SELECT pg_advisory_xact_lock(412305808);

DO $$
DECLARE
  current_mode text;
  current_validation jsonb;
  expected_test jsonb := '{"_and":[{"status":{"_eq":"new"}},{"contact_channel":{"_eq":"max"}},{"source":{"_eq":"max"}},{"source_path":{"_eq":"bot:412305808"}},{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}},{"is_test":{"_eq":true}}]}'::jsonb;
  expected_live jsonb := '{"_and":[{"status":{"_eq":"new"}},{"contact_channel":{"_eq":"max"}},{"source":{"_eq":"max"}},{"source_path":{"_eq":"bot:412305808"}},{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}}]}'::jsonb;
BEGIN
  SELECT mode INTO STRICT current_mode
  FROM comm_connections
  WHERE id = '5e1320ad-9392-4dda-9719-ea388eae49c3'
    AND platform = 'max' AND external_id = '412305808'
    AND enabled AND NOT marketing_enabled
    AND service_user_id = 'f8d9e7c9-7842-4ab1-97de-1e62d85bfb49'
  FOR UPDATE;
  IF current_mode NOT IN ('test', 'production') THEN
    RAISE EXCEPTION 'Unexpected MAX mode: %', current_mode;
  END IF;

  SELECT validation::jsonb INTO STRICT current_validation
  FROM directus_permissions
  WHERE id = 1975 AND policy = '7c48b522-6b43-40be-9423-d04f0dc67de8'
    AND collection = 'leads' AND action = 'create'
    AND fields = 'kind,status,contact,contact_channel,message,source,source_path,store_location_id,is_test'
  FOR UPDATE;
  IF current_validation NOT IN (expected_test, expected_live) THEN
    RAISE EXCEPTION 'MAX lead creation permission has changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM comm_runtime
    WHERE id = 1 AND active AND sending_enabled AND NOT recovery_hold
  ) THEN
    RAISE EXCEPTION 'Communications runtime is not live';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM comm_backups
    WHERE state = 'completed' AND external_verified
      AND completed_at >= now() - interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'No recent verified external backup';
  END IF;
  IF EXISTS (
    SELECT 1 FROM comm_outbox
    WHERE connection_id = '5e1320ad-9392-4dda-9719-ea388eae49c3'
      AND state IN ('sending', 'uncertain', 'partial')
  ) THEN
    RAISE EXCEPTION 'MAX has unresolved delivery operations';
  END IF;
  IF (current_mode = 'test') <> (current_validation = expected_test) THEN
    RAISE EXCEPTION 'MAX mode and lead permission are inconsistent';
  END IF;
END $$;

UPDATE directus_permissions
SET validation = '{"_and":[{"status":{"_eq":"new"}},{"contact_channel":{"_eq":"max"}},{"source":{"_eq":"max"}},{"source_path":{"_eq":"bot:412305808"}},{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}}]}'
WHERE id = 1975
  AND validation::jsonb = '{"_and":[{"status":{"_eq":"new"}},{"contact_channel":{"_eq":"max"}},{"source":{"_eq":"max"}},{"source_path":{"_eq":"bot:412305808"}},{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}},{"is_test":{"_eq":true}}]}'::jsonb;

UPDATE comm_connections
SET mode = 'production'
WHERE id = '5e1320ad-9392-4dda-9719-ea388eae49c3'
  AND mode = 'test' AND enabled AND NOT marketing_enabled;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM comm_connections
    WHERE id = '5e1320ad-9392-4dda-9719-ea388eae49c3'
      AND mode = 'production' AND enabled AND NOT marketing_enabled
  ) OR NOT EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE id = 1975
      AND validation::jsonb = '{"_and":[{"status":{"_eq":"new"}},{"contact_channel":{"_eq":"max"}},{"source":{"_eq":"max"}},{"source_path":{"_eq":"bot:412305808"}},{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}}]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'MAX promotion postcondition failed';
  END IF;
END $$;

\if :apply
COMMIT;
\echo MAX_PRODUCTION_APPLIED
\else
ROLLBACK;
\echo MAX_PRODUCTION_REHEARSAL_PASSED
\endif
