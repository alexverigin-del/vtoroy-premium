#!/usr/bin/env node

process.stdout.write(String.raw`
SELECT 'trade_mvp.tables_missing' AS check_name,(6-count(*))::text AS value
FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('trade_pricing_versions','trade_device_configs','trade_condition_rules','trade_quotes','trade_settings','trade_events')
UNION ALL
SELECT 'trade_mvp.lead_fields_missing',(11-count(*))::text
FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name IN ('quote_id','target_product_id','target_offer_id','store_location_id','preferred_visit_date','preferred_visit_period','diagnostics_status','final_offer','final_offer_reason','reference_code','idempotency_key')
UNION ALL
SELECT 'trade_mvp.collections_missing',(6-count(*))::text FROM directus_collections WHERE collection IN ('trade_pricing_versions','trade_device_configs','trade_condition_rules','trade_quotes','trade_settings','trade_events')
UNION ALL
SELECT 'trade_mvp.relations_missing',(14-count(*))::text FROM directus_relations WHERE (many_collection,many_field) IN (
 ('trade_pricing_versions','published_by'),('trade_device_configs','pricing_version'),('trade_device_configs','device_model'),('trade_condition_rules','pricing_version'),('trade_quotes','device_config'),('trade_quotes','pricing_version'),('trade_quotes','superseded_by'),('trade_settings','active_pricing_version'),('trade_settings','default_store'),('trade_events','quote'),('leads','quote_id'),('leads','target_product_id'),('leads','target_offer_id'),('leads','store_location_id'))
UNION ALL
SELECT 'trade_mvp.public_permissions',count(*)::text FROM directus_permissions
WHERE collection IN ('trade_pricing_versions','trade_device_configs','trade_condition_rules','trade_quotes','trade_settings','trade_events')
  AND policy IN(SELECT id FROM directus_policies WHERE name='ISVOI Public Read')
UNION ALL
SELECT 'trade_mvp.service_policy_missing',(1-count(*))::text FROM directus_policies WHERE name='ISVOI Trade Service'
UNION ALL
SELECT 'trade_mvp.service_permissions_missing',(11-count(*))::text FROM directus_permissions WHERE policy IN(SELECT id FROM directus_policies WHERE name='ISVOI Trade Service')
UNION ALL
SELECT 'trade_mvp.settings_count_invalid',abs(1-count(*))::text FROM trade_settings
UNION ALL
SELECT 'trade_mvp.multiple_published_versions',greatest(0,count(*)-1)::text FROM trade_pricing_versions WHERE status='published'
UNION ALL
SELECT 'trade_mvp.invalid_published_configs',count(*)::text FROM trade_device_configs c JOIN device_models m ON m.id=c.device_model WHERE c.status='published' AND (c.base_min<=0 OR c.base_max<c.base_min OR m.slug NOT IN ('iphone-13-pro','iphone-14-pro','iphone-14-pro-max','iphone-16-pro','iphone-16-pro-max'))
UNION ALL
SELECT 'trade_mvp.invalid_active_settings',count(*)::text FROM trade_settings WHERE status='published' AND active_pricing_version IS NULL
UNION ALL
SELECT 'trade_mvp.calculator_section_missing',(1-count(*))::text FROM page_sections ps JOIN site_pages sp ON sp.id=ps.page WHERE sp.slug='trade' AND ps.section_key='trade_calculator_intro' AND ps.is_active=true
UNION ALL
SELECT 'trade_mvp.service_identity_missing',(1-count(*))::text
FROM directus_users
WHERE email='trade-service@service.isvoi' AND status='active' AND role IS NULL
  AND password IS NULL AND length(token)>=64
UNION ALL
SELECT 'trade_mvp.service_identity_policy_missing',(1-count(*))::text
FROM directus_access access
JOIN directus_users users ON users.id=access."user"
JOIN directus_policies policy ON policy.id=access.policy
WHERE users.email='trade-service@service.isvoi' AND policy.name='ISVOI Trade Service'
UNION ALL
SELECT 'trade_mvp.service_identity_unexpected_access',count(*)::text
FROM directus_access access
JOIN directus_users users ON users.id=access."user"
LEFT JOIN directus_policies policy ON policy.id=access.policy
WHERE users.email='trade-service@service.isvoi'
  AND policy.name IS DISTINCT FROM 'ISVOI Trade Service'
UNION ALL
SELECT 'trade_mvp.draft_pilot_models_missing',(5-count(*))::text
FROM device_models WHERE is_active=true
  AND slug IN ('iphone-13-pro','iphone-14-pro','iphone-14-pro-max','iphone-16-pro','iphone-16-pro-max')
UNION ALL
SELECT 'trade_mvp.draft_configs_invalid',
  CASE WHEN count(*)=19 AND count(*) FILTER(WHERE c.status='draft' AND c.base_min>0 AND c.base_max>=c.base_min)=19 THEN '0' ELSE '1' END
FROM trade_device_configs c
JOIN trade_pricing_versions v ON v.id=c.pricing_version
WHERE v.version='trade-pricing-v2-draft' AND v.status='draft'
UNION ALL
SELECT 'trade_mvp.draft_rules_invalid',
  CASE WHEN count(*)=21 AND count(*) FILTER(WHERE r.status='draft')=21 THEN '0' ELSE '1' END
FROM trade_condition_rules r
JOIN trade_pricing_versions v ON v.id=r.pricing_version
WHERE v.version='trade-pricing-v2-draft' AND v.status='draft'
UNION ALL
SELECT 'trade_mvp.draft_settings_invalid',(1-count(*))::text
FROM trade_settings settings
JOIN trade_pricing_versions version ON version.id=settings.active_pricing_version
JOIN store_locations store ON store.id=settings.default_store
WHERE settings.id=1 AND settings.status='draft' AND settings.quote_validity_days=7
  AND version.version='trade-pricing-v2-draft' AND version.status='draft'
  AND store.slug='belgorod' AND store.status='published'
UNION ALL
SELECT 'trade_mvp.qa_fields_missing',(3-count(*))::text
FROM information_schema.columns
WHERE table_schema='public' AND (table_name,column_name) IN (
  ('trade_quotes','is_test'),('trade_events','is_test'),('leads','is_test')
)
UNION ALL
SELECT 'trade_mvp.qa_permission_fields_missing',count(*)::text
FROM (VALUES
  ('ISVOI Trade Service','trade_quotes','read'),
  ('ISVOI Trade Service','trade_quotes','create'),
  ('ISVOI Trade Service','trade_events','create'),
  ('ISVOI Trade Service','leads','read'),
  ('ISVOI Lead Intake','leads','create'),
  ('ISVOI Lead Intake','leads','read'),
  ('ISVOI Editor','trade_quotes','read'),
  ('ISVOI Editor','trade_events','read'),
  ('ISVOI Editor','leads','read'),
  ('ISVOI Advanced Editor','trade_quotes','read'),
  ('ISVOI Advanced Editor','trade_events','read'),
  ('ISVOI Advanced Editor','leads','read')
) expected(policy_name,collection_name,action_name)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name=expected.policy_name AND permission.collection=expected.collection_name
    AND permission.action=expected.action_name
    AND (permission.fields='*' OR 'is_test'=ANY(string_to_array(permission.fields,',')))
)
UNION ALL
SELECT 'trade_mvp.qa_public_exposure',count(*)::text
FROM directus_permissions permission
WHERE permission.policy IN(SELECT id FROM directus_policies WHERE name='ISVOI Public Read')
  AND permission.collection IN ('trade_quotes','trade_events','leads');
`);
