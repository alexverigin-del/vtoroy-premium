#!/usr/bin/env node
import {
  collectionGroups,
  defaults,
  humanRoles,
  literal as q,
  navigationGroups,
  sqlJson as j,
} from "./lib/studio-ux.mjs";

process.stdout
  .write(`WITH expected_groups(collection,parent) AS (VALUES ${navigationGroups.map(([c, , , parent]) => `(${q(c)},${q(parent)})`).join(",")}),
expected_defaults(collection,fields) AS (VALUES ${Object.entries(defaults)
  .map(([c, v]) => `(${q(c)},${j(v.fields)})`)
  .join(",")}),
expected_parents(collection,parent) AS (VALUES ${Object.entries(collectionGroups)
  .map(([c, p]) => `(${q(c)},${q(p)})`)
  .join(",")}),
human_roles AS (SELECT id FROM directus_roles WHERE name IN (${humanRoles.map(q).join(",")}))
SELECT 'studio_workspace.groups_invalid' AS check_name,count(*)::text AS value FROM expected_groups e
LEFT JOIN directus_collections c ON c.collection=e.collection
WHERE c.collection IS NULL OR c."group" IS DISTINCT FROM e.parent OR c.collapse<>'closed'
UNION ALL
SELECT 'studio_workspace.parents_invalid',count(*)::text FROM expected_parents e LEFT JOIN directus_collections c ON c.collection=e.collection WHERE c."group" IS DISTINCT FROM e.parent
UNION ALL
SELECT 'studio_workspace.defaults_missing',count(*)::text FROM expected_defaults e CROSS JOIN human_roles r
WHERE (EXISTS(SELECT 1 FROM directus_access a JOIN directus_policies p ON p.id=a.policy WHERE a.role=r.id AND p.admin_access)
 OR EXISTS(SELECT 1 FROM directus_access a JOIN directus_permissions p ON p.policy=a.policy WHERE a.role=r.id AND p.collection=e.collection AND p.action='read'))
AND NOT EXISTS(SELECT 1 FROM directus_presets p WHERE p.role=r.id AND p."user" IS NULL AND p.bookmark IS NULL AND p.collection=e.collection AND p.layout='tabular'
 AND (p.layout_query::jsonb #> '{tabular,fields}'=e.fields OR (e.collection='site_pages' AND p.layout_query::jsonb #> '{tabular,fields}'='["editor_label","status","slug"]'::jsonb)
 OR (e.collection='page_sections' AND p.layout_query::jsonb #> '{tabular,fields}'='["sort_order","editor_label","is_active","image"]'::jsonb)))
UNION ALL
SELECT 'studio_workspace.defaults_duplicate',count(*)::text FROM (SELECT role,collection FROM directus_presets WHERE role IN(SELECT id FROM human_roles) AND "user" IS NULL AND bookmark IS NULL GROUP BY role,collection HAVING count(*)>1) d
UNION ALL
SELECT 'studio_workspace.insights_test_leak',count(*)::text FROM directus_panels
WHERE dashboard='f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100' AND options->>'collection'='leads' AND options::jsonb #> '{filter,is_test,_eq}' IS DISTINCT FROM 'false'::jsonb
UNION ALL
SELECT 'studio_workspace.lead_views_test_leak',count(*)::text FROM directus_presets
WHERE collection='leads' AND "user" IS NULL AND role IN(SELECT id FROM human_roles) AND coalesce(bookmark,'') NOT ILIKE '%тест%'
AND NOT (coalesce(filter::jsonb,'{}') @> '{"is_test":{"_eq":false}}')
UNION ALL
SELECT 'studio_workspace.test_view_missing',CASE WHEN EXISTS(SELECT 1 FROM directus_presets WHERE collection='leads' AND "user" IS NULL AND bookmark ILIKE '%тест%' AND filter::jsonb @> '{"is_test":{"_eq":true}}') THEN '0' ELSE '1' END
UNION ALL
SELECT 'studio_workspace.enum_display_missing',count(*)::text FROM directus_fields
WHERE collection NOT LIKE 'directus_%' AND interface='select-dropdown' AND jsonb_typeof(options::jsonb->'choices')='array'
AND (display IS DISTINCT FROM 'labels' OR jsonb_typeof(display_options::jsonb->'choices') IS DISTINCT FROM 'array')
UNION ALL
SELECT 'studio_workspace.visible_collections_without_ru',count(*)::text FROM directus_collections c
WHERE c.collection NOT LIKE 'directus_%' AND c.hidden=false
AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.translations::jsonb,'[]')) t WHERE t->>'language'='ru-RU' AND nullif(t->>'translation','') IS NOT NULL)
UNION ALL
SELECT 'studio_workspace.visible_fields_without_ru',count(*)::text FROM directus_fields f
JOIN directus_collections c ON c.collection=f.collection
WHERE c.collection NOT LIKE 'directus_%' AND c.hidden=false AND f.hidden=false
AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(f.translations::jsonb,'[]')) t WHERE t->>'language'='ru-RU' AND nullif(t->>'translation','') IS NOT NULL)
UNION ALL
SELECT 'studio_workspace.trade_relations_unreadable',count(*)::text FROM directus_fields
WHERE collection IN ('trade_device_configs','trade_condition_rules','trade_settings') AND field IN ('pricing_version','active_pricing_version')
AND (display IS DISTINCT FROM 'related-values' OR display_options->>'template' IS DISTINCT FROM '{{version}}')
UNION ALL
SELECT 'studio_workspace.project_descriptor',CASE WHEN EXISTS(SELECT 1 FROM directus_settings WHERE project_descriptor='Сайт, каталог и продажи') THEN '0' ELSE '1' END;
`);
