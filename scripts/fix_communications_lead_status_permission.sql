BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  target_count integer;
  current_validation jsonb;
BEGIN
  SELECT count(*), min(permission.validation::text)::jsonb
    INTO target_count, current_validation
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id = permission.policy
  WHERE policy.name = 'ISVOI Telegram Staff'
    AND permission.collection = 'leads'
    AND permission.action = 'update';

  IF target_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one communications lead update permission, found %', target_count;
  END IF;

  IF current_validation #>> '{assigned_to,_eq}' <> '$CURRENT_USER'
     OR current_validation #>> '{status,_eq}' <> 'in_progress' THEN
    RAISE EXCEPTION 'Unexpected communications lead update validation: %', current_validation;
  END IF;
END $$;

UPDATE directus_permissions permission
SET validation = '{"assigned_to":{"_eq":"$CURRENT_USER"},"status":{"_in":["in_progress","waiting","closed"]}}'::json
FROM directus_policies policy
WHERE policy.id = permission.policy
  AND policy.name = 'ISVOI Telegram Staff'
  AND permission.collection = 'leads'
  AND permission.action = 'update';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM directus_permissions permission
    JOIN directus_policies policy ON policy.id = permission.policy
    WHERE policy.name = 'ISVOI Telegram Staff'
      AND permission.collection = 'leads'
      AND permission.action = 'update'
      AND permission.validation::jsonb =
        '{"assigned_to":{"_eq":"$CURRENT_USER"},"status":{"_in":["in_progress","waiting","closed"]}}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Communications lead lifecycle validation was not installed';
  END IF;
END $$;

COMMIT;
