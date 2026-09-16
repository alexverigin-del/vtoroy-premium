\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Telegram has one runtime and one operator workspace after cutover. The old
-- Directus collections stay intact as read-only migration evidence.
DO $$
DECLARE
  core_connections integer;
  active_legacy_operations integer;
  active_core_operations integer;
  editor_write_permissions integer;
BEGIN
  SELECT count(*) INTO core_connections
  FROM comm_connections
  WHERE platform = 'telegram' AND enabled = true;

  IF core_connections <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled core Telegram connection, found %', core_connections;
  END IF;

  SELECT
    (SELECT count(*) FROM telegram_message_outbox
      WHERE state IN ('pending', 'in_flight', 'uncertain'))
    +
    (SELECT count(*) FROM telegram_deliveries
      WHERE state IN ('pending', 'in_flight', 'uncertain'))
    INTO active_legacy_operations;

  IF active_legacy_operations <> 0 THEN
    RAISE EXCEPTION 'Legacy Telegram still has % active operations', active_legacy_operations;
  END IF;

  SELECT
    (SELECT count(*)
       FROM comm_outbox outbox
       JOIN comm_connections connection ON connection.id = outbox.connection_id
      WHERE connection.platform = 'telegram'
        AND outbox.state IN ('pending', 'sending', 'uncertain', 'partial'))
    +
    (SELECT count(*)
       FROM comm_operations operation
       JOIN comm_outbox outbox ON outbox.id = operation.outbox_id
       JOIN comm_connections connection ON connection.id = outbox.connection_id
      WHERE connection.platform = 'telegram' AND operation.state = 'uncertain')
    INTO active_core_operations;

  IF active_core_operations <> 0 THEN
    RAISE EXCEPTION 'Core Telegram has % active or uncertain operations', active_core_operations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM directus_collections WHERE collection = 'isvoi_telegram_current'
  ) THEN
    RAISE EXCEPTION 'Legacy Telegram Studio group is missing';
  END IF;

  SELECT count(*) INTO editor_write_permissions
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id = permission.policy
  WHERE policy.name = 'ISVOI Editor'
    AND policy.admin_access = false
    AND permission.collection = 'telegram_campaigns'
    AND permission.action IN ('create', 'update');

  IF editor_write_permissions NOT IN (0, 2) THEN
    RAISE EXCEPTION 'Unexpected legacy Telegram editor write permission count: %', editor_write_permissions;
  END IF;
END $$;

UPDATE directus_collections
SET hidden = true,
    icon = 'archive',
    note = 'Архив миграции Telegram. Рабочий контур находится в модуле «Коммуникации».',
    translations = '[{"language":"ru-RU","translation":"Telegram · архив миграции"}]'::json
WHERE collection = 'isvoi_telegram_current';

UPDATE directus_collections
SET hidden = true
WHERE "group" = 'isvoi_telegram_current'
   OR collection IN ('lead_conversations', 'lead_messages', 'telegram_message_outbox');

DELETE FROM directus_permissions permission
USING directus_policies policy
WHERE policy.id = permission.policy
  AND policy.name = 'ISVOI Editor'
  AND policy.admin_access = false
  AND permission.collection = 'telegram_campaigns'
  AND permission.action IN ('create', 'update');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_collections
    WHERE (collection = 'isvoi_telegram_current'
       OR "group" = 'isvoi_telegram_current'
       OR collection IN ('lead_conversations', 'lead_messages', 'telegram_message_outbox'))
      AND hidden = false
  ) THEN
    RAISE EXCEPTION 'A legacy Telegram collection remains visible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM directus_permissions permission
    JOIN directus_policies policy ON policy.id = permission.policy
    WHERE policy.name = 'ISVOI Editor'
      AND policy.admin_access = false
      AND permission.collection = 'telegram_campaigns'
      AND permission.action IN ('create', 'update')
  ) THEN
    RAISE EXCEPTION 'Legacy Telegram editor write permissions remain';
  END IF;
END $$;

COMMIT;
