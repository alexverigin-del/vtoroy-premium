\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM comm_connections
    WHERE id = '5e1320ad-9392-4dda-9719-ea388eae49c3'
      AND platform = 'max'
      AND external_id = '412305808'
      AND bot_username = 'id290210599993_bot'
      AND enabled
      AND mode = 'test'
      AND NOT marketing_enabled
      AND settings @> '{"pilot_user_ids":[],"subscriptions_pilot_only":true,"subscriptions_enabled":false}'::jsonb
  ) THEN
    RAISE EXCEPTION 'MAX connection guardrail audit failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM comm_runtime
    WHERE id = 1 AND active AND NOT sending_enabled AND recovery_hold
  ) THEN
    RAISE EXCEPTION 'Communications runtime guardrail audit failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM directus_users
    WHERE id = '8b033c87-5289-4d68-944e-aeb84f4374a9'
      AND status = 'active'
      AND token IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM directus_users
    WHERE id = 'f8d9e7c9-7842-4ab1-97de-1e62d85bfb49'
      AND status = 'active'
      AND token IS NULL
  ) THEN
    RAISE EXCEPTION 'MAX service identity audit failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM directus_access access
    JOIN directus_policies policy ON policy.id = access.policy
    WHERE access."user" = '8b033c87-5289-4d68-944e-aeb84f4374a9'
      AND policy.admin_access
  ) THEN
    RAISE EXCEPTION 'MAX worker must not have administrator access';
  END IF;

  IF (
    SELECT count(*)
    FROM directus_access
    WHERE policy IN (
      '065d01b8-bb8d-45b1-abfa-fbf1aa47ac87',
      '7c48b522-6b43-40be-9423-d04f0dc67de8',
      '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82'
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'MAX policy membership audit failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM directus_permissions
    WHERE policy = '7c48b522-6b43-40be-9423-d04f0dc67de8'
      AND collection = 'leads'
      AND action = 'create'
      AND fields = 'kind,status,contact,contact_channel,message,source,source_path,store_location_id,is_test'
  ) THEN
    RAISE EXCEPTION 'MAX lead intake scope audit failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM comm_staff
    WHERE user_id = '1a612dfb-8f1c-455b-a8cd-b57ea60afc24'
      AND store_id = '4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f'
      AND enabled
      AND can_manage
  ) THEN
    RAISE EXCEPTION 'MAX manager assignment audit failed';
  END IF;
END $$;

SELECT json_build_object(
  'pass', true,
  'connection_id', connection.id,
  'platform', connection.platform,
  'mode', connection.mode,
  'sending_enabled', runtime.sending_enabled,
  'recovery_hold', runtime.recovery_hold,
  'pilot_users', jsonb_array_length(connection.settings->'pilot_user_ids')
)
FROM comm_connections connection
CROSS JOIN comm_runtime runtime
WHERE connection.id = '5e1320ad-9392-4dda-9719-ea388eae49c3'
  AND runtime.id = 1;
