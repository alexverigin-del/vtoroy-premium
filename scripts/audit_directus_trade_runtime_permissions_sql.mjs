#!/usr/bin/env node

process.stdout.write(String.raw`
WITH settings_required(field) AS (VALUES
  ('id'),('status'),('quote_validity_days'),('economics_status'),
  ('tax_treatment_confirmed'),('primary_document_status'),('kkt_workflow_status'),
  ('economics_approved_by'),('economics_approved_at'),('legal_status'),
  ('quote_disclaimer_short'),('quote_disclaimer_full'),('consent_label'),('consent_text'),
  ('consent_version'),('consent_url'),('privacy_url'),('safety_notice'),
  ('counteroffer_notice'),('legal_approved_by'),('legal_approved_at'),
  ('active_pricing_version'),('default_store')
), settings_permission AS (
  SELECT permission.fields
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Trade Service'
    AND permission.collection='trade_settings'
    AND permission.action='read'
  LIMIT 1
), store_required(field) AS (VALUES
  ('id'),('slug'),('status'),('name'),('city'),('sort'),('intercity_delivery_enabled')
), store_permission AS (
  SELECT permission.fields
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Trade Service'
    AND permission.collection='store_locations'
    AND permission.action='read'
  LIMIT 1
)
SELECT 'trade_runtime.settings_read_fields_missing',count(*)::text
FROM settings_required
WHERE NOT EXISTS(
  SELECT 1 FROM settings_permission
  WHERE fields='*' OR settings_required.field=ANY(string_to_array(coalesce(fields,''),','))
)
UNION ALL
SELECT 'trade_runtime.store_read_fields_missing',count(*)::text
FROM store_required
WHERE NOT EXISTS(
  SELECT 1 FROM store_permission
  WHERE fields='*' OR store_required.field=ANY(string_to_array(coalesce(fields,''),','))
)
UNION ALL
SELECT 'trade_runtime.service_policy_assignment_missing',count(*)::text
FROM directus_policies policy
WHERE policy.name='ISVOI Trade Service'
  AND NOT EXISTS(SELECT 1 FROM directus_access access WHERE access.policy=policy.id)
UNION ALL
SELECT 'trade_runtime.info.settings_fields',coalesce(permission.fields,'<missing>')
FROM directus_policies policy
LEFT JOIN directus_permissions permission ON permission.policy=policy.id
  AND permission.collection='trade_settings' AND permission.action='read'
WHERE policy.name='ISVOI Trade Service'
UNION ALL
SELECT 'trade_runtime.info.service_user_id',id::text
FROM directus_users
WHERE email='trade-service@service.isvoi';
`);
