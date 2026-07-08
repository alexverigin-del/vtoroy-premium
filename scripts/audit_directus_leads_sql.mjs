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
  AND device_id IS NULL;
`);
