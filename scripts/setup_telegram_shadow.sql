\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM comm_connections
    WHERE platform = 'telegram' AND external_id = '8694946838'
      AND id <> '7c4123ea-3330-4c56-9b14-bdf72f49ae7f'
  ) THEN
    RAISE EXCEPTION 'Telegram resource is already bound to another connection';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM telegram_routes
    WHERE bot_id = 8694946838
      AND store_id = '4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f'
      AND is_test = false AND enabled = true
  ) THEN
    RAISE EXCEPTION 'Production Telegram route is not ready';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM directus_users
    WHERE id = '7449da36-9451-48c7-8577-c159b9554110' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Telegram worker identity is not active';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM directus_users
    WHERE id = 'bfa46d8a-7cc1-482a-97d7-41b64bbf90f8' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Telegram intake identity is not active';
  END IF;
END $$;

INSERT INTO comm_connections(
  id, platform, external_id, name, enabled, mode, store_id,
  worker_user_id, service_user_id, secret_ref, bot_username, settings,
  marketing_enabled
) VALUES (
  '7c4123ea-3330-4c56-9b14-bdf72f49ae7f',
  'telegram',
  '8694946838',
  'Telegram · подготовка переноса',
  false,
  'production',
  '4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f',
  '7449da36-9451-48c7-8577-c159b9554110',
  'bfa46d8a-7cc1-482a-97d7-41b64bbf90f8',
  'ISVOI_TELEGRAM_PRODUCTION',
  'isvoi_help_bot',
  '{"migration_state":"shadow","cutover_approved":false}',
  false
)
ON CONFLICT(id) DO UPDATE SET
  name = EXCLUDED.name,
  enabled = false,
  mode = 'production',
  store_id = EXCLUDED.store_id,
  worker_user_id = EXCLUDED.worker_user_id,
  service_user_id = EXCLUDED.service_user_id,
  secret_ref = EXCLUDED.secret_ref,
  bot_username = EXCLUDED.bot_username,
  settings = comm_connections.settings || EXCLUDED.settings,
  marketing_enabled = false;

COMMIT;
