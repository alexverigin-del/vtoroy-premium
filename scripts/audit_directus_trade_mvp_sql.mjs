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
SELECT 'trade_mvp.calculator_section_missing',(1-count(*))::text FROM page_sections ps JOIN site_pages sp ON sp.id=ps.page WHERE sp.slug='trade' AND ps.section_key='trade_calculator_intro' AND ps.is_active=true;
`);
