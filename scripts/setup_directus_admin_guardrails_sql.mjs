#!/usr/bin/env node
/**
 * Print idempotent SQL that applies final Directus admin guardrails.
 *
 * Run this after broader Studio/setup scripts. It keeps Administrator as the
 * only admin policy, disables Studio app access for service-only policies,
 * enforces TFA for Studio policies, removes accidental non-admin permissions on
 * high-risk system collections, and keeps the public/lead intake policies
 * narrow.
 *
 * Usage:
 *   node scripts/setup_directus_admin_guardrails_sql.mjs > /tmp/isvoi_setup_directus_admin_guardrails_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_admin_guardrails_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE OR REPLACE FUNCTION isvoi_policy_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_name LIMIT 1;
  RETURN v_policy;
END;
$$;

-- Policy-level guardrails.
UPDATE directus_policies
SET admin_access = false
WHERE name <> 'Administrator'
  AND admin_access IS DISTINCT FROM false;

UPDATE directus_policies
SET admin_access = true,
  app_access = true,
  enforce_tfa = true,
  description = COALESCE(NULLIF(description, ''), 'Full Directus administration. Use only for schema, users, roles, policies and emergency maintenance.')
WHERE name = 'Administrator';

UPDATE directus_policies
SET app_access = true,
  admin_access = false,
  enforce_tfa = true
WHERE name IN ('ISVOI Editor', 'ISVOI Importer');

UPDATE directus_policies
SET app_access = false,
  admin_access = false,
  enforce_tfa = false
WHERE name IN (
  '$t:public_label',
  'ISVOI Public Read',
  'ISVOI Blog Preview',
  'ISVOI Lead Intake',
  'ISVOI Catalog Import'
);

-- High-risk Directus system collections stay admin-only. Files/folders are
-- intentionally excluded because editors/importers need media workflows.
DELETE FROM directus_permissions pe
USING directus_policies p
WHERE p.id = pe.policy
  AND COALESCE(p.admin_access, false) = false
  AND pe.collection IN (
    'directus_access',
    'directus_activity',
    'directus_dashboards',
    'directus_extensions',
    'directus_flows',
    'directus_migrations',
    'directus_notifications',
    'directus_operations',
    'directus_panels',
    'directus_permissions',
    'directus_policies',
    'directus_presets',
    'directus_relations',
    'directus_revisions',
    'directus_roles',
    'directus_sessions',
    'directus_settings',
    'directus_shares',
    'directus_users',
    'directus_versions',
    'directus_webhooks'
  );

-- Anonymous Public, Next.js reads, and blog preview are read-only surfaces.
DELETE FROM directus_permissions
WHERE policy IN (
    SELECT id FROM directus_policies
    WHERE name IN ('$t:public_label', 'ISVOI Public Read', 'ISVOI Blog Preview')
  )
  AND action <> 'read';

-- Lead intake is create-only on leads. It should not read, update, delete or
-- touch any other collection.
DELETE FROM directus_permissions
WHERE policy = isvoi_policy_id('ISVOI Lead Intake')
  AND NOT (collection = 'leads' AND action = 'create');

-- Catalog import automation must stay headless. It may use tokens/flows, not
-- the Studio app.
UPDATE directus_policies
SET app_access = false,
  admin_access = false,
  enforce_tfa = false
WHERE name = 'ISVOI Catalog Import';

DROP FUNCTION isvoi_policy_id(text);

SELECT 'admin_guardrails.non_admin_admin_access' AS check_name, count(*)::text AS value
FROM directus_policies
WHERE name <> 'Administrator'
  AND COALESCE(admin_access, false) = true
UNION ALL
SELECT 'admin_guardrails.service_app_access', count(*)::text
FROM directus_policies
WHERE name IN ('$t:public_label', 'ISVOI Public Read', 'ISVOI Blog Preview', 'ISVOI Lead Intake', 'ISVOI Catalog Import')
  AND COALESCE(app_access, false) = true
UNION ALL
SELECT 'admin_guardrails.studio_tfa_policies', count(*)::text
FROM directus_policies
WHERE name IN ('Administrator', 'ISVOI Editor', 'ISVOI Importer')
  AND COALESCE(enforce_tfa, false) = true
UNION ALL
SELECT 'admin_guardrails.system_permissions', count(*)::text
FROM directus_permissions pe
JOIN directus_policies p ON p.id = pe.policy
WHERE COALESCE(p.admin_access, false) = false
  AND pe.collection IN (
    'directus_access',
    'directus_activity',
    'directus_dashboards',
    'directus_extensions',
    'directus_flows',
    'directus_migrations',
    'directus_notifications',
    'directus_operations',
    'directus_panels',
    'directus_permissions',
    'directus_policies',
    'directus_presets',
    'directus_relations',
    'directus_revisions',
    'directus_roles',
    'directus_sessions',
    'directus_settings',
    'directus_shares',
    'directus_users',
    'directus_versions',
    'directus_webhooks'
  )
UNION ALL
SELECT 'admin_guardrails.public_writes', count(*)::text
FROM directus_permissions
WHERE policy IN (
    SELECT id FROM directus_policies
    WHERE name IN ('$t:public_label', 'ISVOI Public Read', 'ISVOI Blog Preview')
  )
  AND action <> 'read'
UNION ALL
SELECT 'admin_guardrails.lead_intake_extra_permissions', count(*)::text
FROM directus_permissions
WHERE policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Lead Intake')
  AND NOT (collection = 'leads' AND action = 'create')
UNION ALL
SELECT 'admin_guardrails.admin_users_without_tfa', count(*)::text
FROM directus_users u
WHERE u.status = 'active'
  AND (
    u.role IN (
      SELECT role
      FROM directus_access a
      JOIN directus_policies p ON p.id = a.policy
      WHERE p.name = 'Administrator'
    )
    OR EXISTS (
      SELECT 1
      FROM directus_access a
      JOIN directus_policies p ON p.id = a.policy
      WHERE a."user" = u.id
        AND p.name = 'Administrator'
    )
  )
  AND (u.tfa_secret IS NULL OR u.tfa_secret = '');

COMMIT;
`);
