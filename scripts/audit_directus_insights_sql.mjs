#!/usr/bin/env node

process.stdout.write(String.raw`
WITH expected_dashboard(id, name) AS (
  VALUES (
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid,
    'Руководитель · Операционный обзор'::varchar
  )
), expected_panels(id, name, type, position_x, position_y, width, height, options) AS (
  VALUES
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0101'::uuid,'Новые заявки'::varchar,'metric'::varchar,0,0,6,2,'{"collection":"leads","field":"id","function":"count","filter":{"status":{"_eq":"new"}},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#d97706"}]}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0102'::uuid,'Заявки требуют внимания'::varchar,'metric'::varchar,6,0,6,2,'{"collection":"leads","field":"id","function":"count","filter":{"_and":[{"status":{"_in":["new","in_progress","waiting"]}},{"_or":[{"assigned_to":{"_null":true}},{"next_action_at":{"_lt":"$NOW"}}]}]},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#dc2626"}]}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0103'::uuid,'Товары доступны'::varchar,'metric'::varchar,12,0,6,2,'{"collection":"products","field":"id","function":"count","filter":{"_and":[{"status":{"_eq":"published"}},{"stock_status":{"_eq":"available"}}]},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#059669"}]}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0104'::uuid,'Открытые блокеры'::varchar,'metric'::varchar,18,0,6,2,'{"collection":"inventory_import_issues","field":"id","function":"count","filter":{"_and":[{"severity":{"_eq":"blocker"}},{"resolved":{"_eq":false}}]},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#dc2626"}]}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0105'::uuid,'Заявки за 30 дней'::varchar,'time-series'::varchar,0,2,12,6,'{"collection":"leads","color":"#2563eb","function":"count","precision":"day","dateField":"created_at","range":"1 month","valueField":"id","decimals":0,"curveType":"straight","fillType":"solid","missingData":"0","filter":{},"showXAxis":true,"showYAxis":true}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0106'::uuid,'Готовность каталога'::varchar,'metric-list'::varchar,12,2,12,6,'{"collection":"products","limit":8,"groupByField":"content_status","aggregateField":"id","aggregateFunction":"count","sortDirection":"desc","filter":{},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"conditionalFormatting":[{"operator":">","value":"0","color":"#2563eb"}]}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0107'::uuid,'Активные заявки'::varchar,'list'::varchar,0,8,12,6,'{"collection":"leads","limit":5,"sortField":"created_at","sortDirection":"desc","displayTemplate":"{{status}} · {{contact}} · {{kind}}","linkToItem":true,"filter":{"status":{"_in":["new","in_progress","waiting"]}}}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0108'::uuid,'Последние блокеры'::varchar,'list'::varchar,12,8,12,6,'{"collection":"inventory_import_issues","limit":5,"sortField":"created_at","sortDirection":"desc","displayTemplate":"{{code}} · {{message}}","linkToItem":true,"filter":{"_and":[{"severity":{"_eq":"blocker"}},{"resolved":{"_eq":false}}]}}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0109'::uuid,'Заявки по типам'::varchar,'metric-list'::varchar,0,14,12,6,'{"collection":"leads","limit":8,"groupByField":"kind","aggregateField":"id","aggregateFunction":"count","sortDirection":"desc","filter":{"created_at":{"_gte":"$NOW(-90 days)"}},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"conditionalFormatting":[{"operator":">","value":"0","color":"#6366f1"}]}'::json),
    ('f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0110'::uuid,'Последние импорты'::varchar,'list'::varchar,12,14,12,6,'{"collection":"inventory_import_batches","limit":5,"sortField":"snapshot_at","sortDirection":"desc","displayTemplate":"{{snapshot_at}} · {{batch_name}} · {{status}} · {{blocker_count}} блокеров","linkToItem":true,"filter":{}}'::json)
), expected_fields(collection, field) AS (
  VALUES
    ('leads','id'),('leads','status'),('leads','assigned_to'),
    ('leads','next_action_at'),('leads','created_at'),('leads','contact'),('leads','kind'),
    ('products','id'),('products','status'),('products','stock_status'),('products','content_status'),
    ('inventory_import_issues','id'),('inventory_import_issues','severity'),
    ('inventory_import_issues','resolved'),('inventory_import_issues','created_at'),
    ('inventory_import_issues','code'),('inventory_import_issues','message'),
    ('inventory_import_batches','id'),('inventory_import_batches','snapshot_at'),
    ('inventory_import_batches','batch_name'),('inventory_import_batches','status'),
    ('inventory_import_batches','blocker_count')
), managed_panels AS (
  SELECT panel.*
  FROM directus_panels panel
  WHERE panel.dashboard='f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid
)
SELECT 'insights.dashboard.missing' AS check_name, count(*)::text AS value
FROM expected_dashboard expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_dashboards dashboard
  WHERE dashboard.id=expected.id AND dashboard.name=expected.name
)
UNION ALL
SELECT 'insights.dashboard.duplicate_name', greatest(count(*) - 1, 0)::text
FROM directus_dashboards
WHERE name='Руководитель · Операционный обзор'
UNION ALL
SELECT 'insights.panels.missing', count(*)::text
FROM expected_panels expected
WHERE NOT EXISTS (SELECT 1 FROM managed_panels panel WHERE panel.id=expected.id)
UNION ALL
SELECT 'insights.panels.unexpected', count(*)::text
FROM managed_panels panel
WHERE NOT EXISTS (SELECT 1 FROM expected_panels expected WHERE expected.id=panel.id)
UNION ALL
SELECT 'insights.panels.config_mismatch', count(*)::text
FROM expected_panels expected
JOIN managed_panels panel ON panel.id=expected.id
WHERE panel.name IS DISTINCT FROM expected.name
  OR panel.type IS DISTINCT FROM expected.type
  OR panel.position_x IS DISTINCT FROM expected.position_x
  OR panel.position_y IS DISTINCT FROM expected.position_y
  OR panel.width IS DISTINCT FROM expected.width
  OR panel.height IS DISTINCT FROM expected.height
  OR panel.show_header IS DISTINCT FROM true
  OR panel.options::jsonb IS DISTINCT FROM expected.options::jsonb
UNION ALL
SELECT 'insights.panels.invalid_type', count(*)::text
FROM managed_panels
WHERE type NOT IN ('metric','metric-list','time-series','list')
UNION ALL
SELECT 'insights.panels.invalid_bounds', count(*)::text
FROM managed_panels
WHERE position_x < 0 OR position_y < 0 OR width <= 0 OR height <= 0
  OR position_x + width > 24
UNION ALL
SELECT 'insights.panels.overlaps', count(*)::text
FROM managed_panels left_panel
JOIN managed_panels right_panel ON left_panel.id < right_panel.id
WHERE left_panel.position_x < right_panel.position_x + right_panel.width
  AND left_panel.position_x + left_panel.width > right_panel.position_x
  AND left_panel.position_y < right_panel.position_y + right_panel.height
  AND left_panel.position_y + left_panel.height > right_panel.position_y
UNION ALL
SELECT 'insights.source_fields.missing', count(*)::text
FROM expected_fields expected
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns column_info
  WHERE column_info.table_schema='public'
    AND column_info.table_name=expected.collection
    AND column_info.column_name=expected.field
)
UNION ALL
SELECT 'insights.permissions.non_admin', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE permission.collection IN ('directus_dashboards','directus_panels')
  AND policy.admin_access IS DISTINCT FROM true
UNION ALL
SELECT 'insights.panels.sensitive_templates', count(*)::text
FROM managed_panels
WHERE coalesce(options->>'displayTemplate','') ~* '(serial|imei|purchase_price|unit_cost|total_cost)'
UNION ALL
SELECT 'insights.info.dashboard_count', count(*)::text
FROM directus_dashboards
WHERE id='f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid
UNION ALL
SELECT 'insights.info.panel_count', count(*)::text FROM managed_panels;
`);
