#!/usr/bin/env node
/**
 * Print SQL that audits lead workflow maturity.
 */

process.stdout.write(String.raw`
SELECT 'leads.total' AS check_name, count(*)::text AS value
FROM leads
UNION ALL
SELECT 'leads.open', count(*)::text
FROM leads
WHERE status IN ('new', 'in_progress', 'waiting')
UNION ALL
SELECT 'leads.open_without_source_context', count(*)::text
FROM leads
WHERE status IN ('new', 'in_progress', 'waiting')
  AND (nullif(source_path, '') IS NULL OR nullif(source_url, '') IS NULL)
UNION ALL
SELECT 'leads.invalid_status', count(*)::text
FROM leads
WHERE status NOT IN ('new', 'in_progress', 'waiting', 'won', 'closed')
UNION ALL
SELECT 'leads.waiting_without_next_action', count(*)::text
FROM leads
WHERE status = 'waiting'
  AND next_action_at IS NULL
UNION ALL
SELECT 'leads.in_progress_without_assignee', count(*)::text
FROM leads
WHERE status IN ('in_progress', 'waiting')
  AND assigned_to IS NULL
UNION ALL
SELECT 'leads.closed_without_manager_note', count(*)::text
FROM leads
WHERE status IN ('won', 'closed')
  AND nullif(manager_note, '') IS NULL
UNION ALL
SELECT 'leads.device_slug_without_relation', count(*)::text
FROM leads
WHERE nullif(device, '') IS NOT NULL
  AND device_id IS NULL
  AND COALESCE(source_path, '') ~ '^(/[^/]+)?/(device|product)/'
UNION ALL
SELECT 'leads.blog_attribution_bookmarks_missing', count(*)::text
FROM (VALUES ('Блог: заявки'), ('Блог: устройства')) required(bookmark)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_presets preset
  JOIN directus_roles role ON role.id = preset.role
  WHERE role.name = 'ISVOI Editor'
    AND preset.collection = 'leads'
    AND preset.bookmark = required.bookmark
    AND preset."user" IS NULL
)
UNION ALL
SELECT 'leads.blog_utm_without_campaign', count(*)::text
FROM leads
WHERE (
    utm_source = 'blog'
    OR source_url LIKE '%utm_source=blog%'
  )
  AND NULLIF(utm_campaign, '') IS NULL
  AND COALESCE(source_url, '') NOT LIKE '%utm_campaign=%'
UNION ALL
SELECT 'leads.blog_utm_without_content', count(*)::text
FROM leads
WHERE (
    utm_source = 'blog'
    OR source_url LIKE '%utm_source=blog%'
  )
  AND NULLIF(utm_content, '') IS NULL
  AND COALESCE(source_url, '') NOT LIKE '%utm_content=%'
UNION ALL
SELECT 'leads.blog_related_device_without_relation', count(*)::text
FROM leads
WHERE (
    utm_source = 'blog'
    OR source_url LIKE '%utm_source=blog%'
  )
  AND (
    utm_content = 'related-device'
    OR source_url LIKE '%utm_content=related-device%'
  )
  AND device_id IS NULL
UNION ALL
SELECT 'lead_hardening.device_consent_fields_missing', (3 - count(*))::text
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'device_page_settings'
  AND column_name IN (
    'lead_available_consent_note',
    'lead_reserved_consent_note',
    'lead_sold_consent_note'
  )
UNION ALL
SELECT 'lead_hardening.final_cta_consent_copy_missing', count(*)::text
FROM page_sections
WHERE section_key = 'final_cta'
  AND COALESCE(is_active, false) = true
  AND NULLIF(content::jsonb #>> '{form,consent_note}', '') IS NULL;
`);
