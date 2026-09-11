\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM comm_connections
    WHERE platform = 'max' AND external_id = '412305808'
      AND id <> '5e1320ad-9392-4dda-9719-ea388eae49c3'
  ) THEN
    RAISE EXCEPTION 'MAX resource is already bound to another connection';
  END IF;
END $$;

INSERT INTO directus_users(id, first_name, last_name, status, token)
VALUES (
  '8b033c87-5289-4d68-944e-aeb84f4374a9',
  'MAX',
  'Communications Worker',
  'active',
  :'worker_token'
)
ON CONFLICT(id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  status = 'active',
  token = EXCLUDED.token;

INSERT INTO directus_users(id, first_name, last_name, status)
VALUES (
  'f8d9e7c9-7842-4ab1-97de-1e62d85bfb49',
  'MAX',
  'Lead Intake',
  'active'
)
ON CONFLICT(id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  status = 'active',
  token = NULL;

INSERT INTO directus_policies(id, name, admin_access, app_access) VALUES
  ('065d01b8-bb8d-45b1-abfa-fbf1aa47ac87', 'ISVOI MAX Worker', false, false),
  ('7c48b522-6b43-40be-9423-d04f0dc67de8', 'ISVOI MAX Lead Intake', false, false),
  ('1e54eb31-43f1-4935-ad42-a5ac0a5b9d82', 'ISVOI Communications Manager', false, true)
ON CONFLICT(id) DO UPDATE SET
  name = EXCLUDED.name,
  admin_access = EXCLUDED.admin_access,
  app_access = EXCLUDED.app_access;

DELETE FROM directus_access
WHERE policy IN (
  '065d01b8-bb8d-45b1-abfa-fbf1aa47ac87',
  '7c48b522-6b43-40be-9423-d04f0dc67de8',
  '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82'
);
INSERT INTO directus_access(id, "user", policy) VALUES
  (gen_random_uuid(), '8b033c87-5289-4d68-944e-aeb84f4374a9', '065d01b8-bb8d-45b1-abfa-fbf1aa47ac87'),
  (gen_random_uuid(), 'f8d9e7c9-7842-4ab1-97de-1e62d85bfb49', '7c48b522-6b43-40be-9423-d04f0dc67de8'),
  (gen_random_uuid(), '1a612dfb-8f1c-455b-a8cd-b57ea60afc24', '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82');

DELETE FROM directus_permissions
WHERE policy IN (
  '065d01b8-bb8d-45b1-abfa-fbf1aa47ac87',
  '7c48b522-6b43-40be-9423-d04f0dc67de8',
  '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82'
);
INSERT INTO directus_permissions(policy, collection, action, permissions, validation, fields) VALUES
  (
    '7c48b522-6b43-40be-9423-d04f0dc67de8',
    'leads',
    'create',
    '{}',
    '{"_and":[{"status":{"_eq":"new"}},{"contact_channel":{"_eq":"max"}},{"source":{"_eq":"max"}},{"source_path":{"_eq":"bot:412305808"}},{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}},{"is_test":{"_eq":true}}]}',
    'kind,status,contact,contact_channel,message,source,source_path,store_location_id,is_test'
  ),
  (
    '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82',
    'leads',
    'read',
    '{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}}',
    '{}',
    '*'
  ),
  (
    '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82',
    'leads',
    'update',
    '{"store_location_id":{"_eq":"4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f"}}',
    '{"status":{"_in":["new","in_progress","waiting","won","closed"]}}',
    'status,assigned_to'
  ),
  (
    '1e54eb31-43f1-4935-ad42-a5ac0a5b9d82',
    'lead_comments',
    'create',
    '{}',
    '{"_and":[{"created_by":{"_eq":"$CURRENT_USER"}},{"outcome":{"_eq":"note"}},{"lead":{"_nnull":true}},{"comment":{"_nnull":true}}]}',
    'lead,created_by,comment,outcome'
  );

INSERT INTO comm_staff(user_id, store_id, enabled, can_manage, can_publish)
VALUES (
  '1a612dfb-8f1c-455b-a8cd-b57ea60afc24',
  '4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f',
  true,
  true,
  false
)
ON CONFLICT(user_id, store_id) DO UPDATE SET
  enabled = true,
  can_manage = true,
  can_publish = false;

INSERT INTO comm_connections(
  id, platform, external_id, name, enabled, mode, store_id,
  worker_user_id, service_user_id, secret_ref, bot_username, settings,
  marketing_enabled
) VALUES (
  '5e1320ad-9392-4dda-9719-ea388eae49c3',
  'max',
  '412305808',
  'MAX · I СВОИ · Поддержка',
  true,
  'test',
  '4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f',
  '8b033c87-5289-4d68-944e-aeb84f4374a9',
  'f8d9e7c9-7842-4ab1-97de-1e62d85bfb49',
  'ISVOI_MAX_SUPPORT',
  'id290210599993_bot',
  '{"pilot_user_ids":[],"subscriptions_pilot_only":true,"subscriptions_enabled":false,"welcome_text":"Здравствуйте! Это I СВОИ. Поможем подобрать, продать или обменять технику и ответим на вопросы."}',
  false
)
ON CONFLICT(id) DO UPDATE SET
  external_id = EXCLUDED.external_id,
  name = EXCLUDED.name,
  enabled = true,
  mode = 'test',
  store_id = EXCLUDED.store_id,
  worker_user_id = EXCLUDED.worker_user_id,
  service_user_id = EXCLUDED.service_user_id,
  secret_ref = EXCLUDED.secret_ref,
  bot_username = EXCLUDED.bot_username,
  settings = EXCLUDED.settings,
  marketing_enabled = false;

UPDATE comm_runtime
SET active = true, sending_enabled = false, recovery_hold = true
WHERE id = 1;

COMMIT;
