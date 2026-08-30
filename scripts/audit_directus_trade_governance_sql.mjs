#!/usr/bin/env node

process.stdout.write(String.raw`
WITH settings_fields(field) AS (VALUES
  ('economics_status'),('preparation_cost_rub'),('warranty_reserve_pct'),('warranty_reserve_min_rub'),
  ('markdown_reserve_pct'),('sales_cost_pct'),('operations_cost_rub'),('tax_reserve_pct'),
  ('tax_treatment_confirmed'),('tax_regime'),('vat_mode'),('primary_document_mode'),('kkt_mode'),
  ('payout_cash_enabled'),('payout_transfer_enabled'),
  ('exchange_offset_enabled'),('primary_document_status'),('kkt_workflow_status'),
  ('minimum_contribution_margin_pct'),('target_contribution_margin_pct'),
  ('economics_approved_by'),('economics_approved_at'),('economics_approval_note'),('legal_status'),
  ('quote_disclaimer_short'),('quote_disclaimer_full'),('consent_label'),('consent_text'),('consent_version'),
  ('consent_url'),('privacy_url'),('safety_notice'),('counteroffer_notice'),('legal_approved_by'),('legal_approved_at'),('legal_approval_note')
), lead_fields(field) AS (VALUES
  ('trade_consent_version'),('trade_consent_at'),('trade_consent_text_snapshot'),
  ('trade_consent_text_hash'),('trade_consent_source_path')
)
SELECT 'trade_governance.settings_fields_missing',count(*)::text FROM settings_fields expected
WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns actual WHERE actual.table_schema='public' AND actual.table_name='trade_settings' AND actual.column_name=expected.field)
UNION ALL
SELECT 'trade_governance.settings_metadata_missing',count(*)::text FROM settings_fields expected
WHERE NOT EXISTS(SELECT 1 FROM directus_fields actual WHERE actual.collection='trade_settings' AND actual.field=expected.field)
UNION ALL
SELECT 'trade_governance.lead_fields_missing',count(*)::text FROM lead_fields expected
WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns actual WHERE actual.table_schema='public' AND actual.table_name='leads' AND actual.column_name=expected.field)
UNION ALL
SELECT 'trade_governance.lead_metadata_missing',count(*)::text FROM lead_fields expected
WHERE NOT EXISTS(SELECT 1 FROM directus_fields actual WHERE actual.collection='leads' AND actual.field=expected.field)
UNION ALL
SELECT 'trade_governance.lead_consent_group_missing',count(*)::text
FROM (VALUES(1)) marker(value)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_fields
  WHERE collection='leads' AND field='group_trade_consent' AND special='group'
    AND conditions::text LIKE '%"kind"%"trade"%'
)
UNION ALL
SELECT 'trade_governance.lead_consent_grouping_invalid',count(*)::text
FROM lead_fields expected JOIN directus_fields actual
  ON actual.collection='leads' AND actual.field=expected.field
WHERE actual."group" IS DISTINCT FROM 'group_trade_consent' OR actual.readonly IS DISTINCT FROM true
UNION ALL
SELECT 'trade_governance.service_read_missing',count(*)::text FROM directus_permissions permission
RIGHT JOIN directus_policies policy ON policy.id=permission.policy AND permission.collection='trade_settings' AND permission.action='read'
WHERE policy.name='ISVOI Trade Service' AND (permission.id IS NULL OR permission.fields NOT LIKE '%legal_status%' OR permission.fields NOT LIKE '%economics_status%' OR permission.fields NOT LIKE '%primary_document_status%' OR permission.fields NOT LIKE '%kkt_workflow_status%')
UNION ALL
SELECT 'trade_governance.advanced_update_missing',count(*)::text FROM directus_permissions permission
RIGHT JOIN directus_policies policy ON policy.id=permission.policy AND permission.collection='trade_settings' AND permission.action='update'
WHERE policy.name='ISVOI Advanced Editor' AND (permission.id IS NULL OR permission.fields NOT LIKE '%tax_regime%' OR permission.fields NOT LIKE '%vat_mode%' OR permission.fields NOT LIKE '%primary_document_mode%' OR permission.fields NOT LIKE '%kkt_mode%' OR permission.fields NOT LIKE '%payout_cash_enabled%' OR permission.fields NOT LIKE '%primary_document_status%' OR permission.fields NOT LIKE '%kkt_workflow_status%')
UNION ALL
SELECT 'trade_governance.lead_intake_consent_write_missing',count(*)::text FROM directus_permissions permission
RIGHT JOIN directus_policies policy ON policy.id=permission.policy AND permission.collection='leads' AND permission.action='create'
WHERE policy.name='ISVOI Lead Intake' AND (
  permission.id IS NULL OR permission.fields NOT LIKE '%trade_consent_version%' OR
  permission.fields NOT LIKE '%trade_consent_at%' OR
  permission.fields NOT LIKE '%trade_consent_text_snapshot%' OR
  permission.fields NOT LIKE '%trade_consent_text_hash%' OR
  permission.fields NOT LIKE '%trade_consent_source_path%'
)
UNION ALL
SELECT 'trade_governance.public_exposure',count(*)::text FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Public Read' AND permission.collection='trade_settings'
UNION ALL
SELECT 'trade_governance.info.approval_state',concat(economics_status,' · tax=',tax_treatment_confirmed,' · primary=',primary_document_status,' · kkt=',kkt_workflow_status,' · legal=',legal_status,' · consent=',consent_version)
FROM trade_settings WHERE id=1;
`);
