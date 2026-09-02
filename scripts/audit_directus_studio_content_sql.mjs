#!/usr/bin/env node
process.stdout.write(`WITH expected_fields(collection,field) AS (VALUES
 ('site_pages','editor_label'),('site_pages','section_views'),('page_sections','editor_label'),
 ('page_sections','editor_note'),('page_sections','editor_disclaimer'),('page_sections','editor_steps'),('page_sections','editor_proof'),
 ('trade_pricing_versions','price_ranges'),('trade_pricing_versions','condition_rules'))
SELECT 'studio_content.fields_missing' AS check_name,count(*)::text AS value FROM expected_fields e
WHERE NOT EXISTS(SELECT 1 FROM directus_fields f WHERE f.collection=e.collection AND f.field=e.field)
UNION ALL
SELECT 'studio_content.internal_labels_missing',count(*)::text FROM (
 SELECT to_jsonb(p)->>'editor_label' label FROM site_pages p UNION ALL SELECT to_jsonb(s)->>'editor_label' FROM page_sections s
) labels WHERE nullif(trim(label),'') IS NULL
UNION ALL
SELECT 'studio_content.section_selection_enabled',CASE WHEN EXISTS(SELECT 1 FROM directus_fields WHERE collection='site_pages' AND field='sections' AND options::jsonb @> '{"enableSelect":false,"enableCreate":false}') THEN '0' ELSE '1' END
UNION ALL
SELECT 'studio_content.section_views_missing',CASE WHEN EXISTS(SELECT 1 FROM directus_fields WHERE collection='site_pages' AND field='section_views' AND interface='presentation-links' AND jsonb_array_length(options::jsonb->'links')=2) THEN '0' ELSE '1' END
UNION ALL
SELECT 'studio_content.unsafe_richtext',count(*)::text FROM directus_fields WHERE collection='page_sections' AND interface='input-rich-text-html' AND field IN ('body','closing_body','editor_note','editor_disclaimer')
AND (options::jsonb->'toolbar' IS NULL OR options::jsonb->'toolbar' ?| ARRAY['code','image','media','h1','customLink','customImage'])
UNION ALL
SELECT 'studio_content.trade_inverse_missing',count(*)::text FROM (VALUES ('trade_device_configs','price_ranges'),('trade_condition_rules','condition_rules')) e(c,f)
WHERE NOT EXISTS(SELECT 1 FROM directus_relations r WHERE many_collection=e.c AND many_field='pricing_version' AND one_collection='trade_pricing_versions' AND one_field=e.f)
UNION ALL
SELECT 'studio_content.ungrouped_consent',count(*)::text FROM directus_fields WHERE collection='integration_consent_settings' AND interface<>'group-detail' AND "group" IS NULL
UNION ALL
SELECT 'studio_content.new_fields_without_ru',count(*)::text FROM expected_fields e JOIN directus_fields f ON f.collection=e.collection AND f.field=e.field
WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(f.translations::jsonb,'[]')) t WHERE t->>'language'='ru-RU' AND nullif(t->>'translation','') IS NOT NULL)
UNION ALL
SELECT 'studio_content.clear_triggers_missing',count(*)::text FROM (VALUES ('editor_note_clear'),('editor_disclaimer_clear'),('editor_steps_clear'),('editor_proof_clear')) e(name)
WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.page_sections'::regclass AND tgname=e.name AND tgenabled='O')
UNION ALL
SELECT 'studio_content.service_fields_missing',count(*)::text FROM directus_permissions p CROSS JOIN (VALUES ('editor_note'),('editor_disclaimer'),('editor_steps'),('editor_proof')) f(name)
WHERE p.collection='page_sections' AND p.action='read' AND 'content'=ANY(string_to_array(p.fields,',')) AND NOT f.name=ANY(string_to_array(p.fields,','));
`);
