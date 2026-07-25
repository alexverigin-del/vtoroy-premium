#!/usr/bin/env node

process.stdout.write(String.raw`
SELECT 'conversion_v2.prototype_copy' AS check_name, count(*)::text AS value
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.status = 'published'
  AND ps.is_active = true
  AND (
    coalesce(ps.body, '') ~* 'Прототип|в реальном запуске|CRM'
    OR ps.content::text ~* 'Прототип|в реальном запуске|CRM'
  )
UNION ALL
SELECT 'conversion_v2.broken_known_links', count(*)::text
FROM navigation_items
WHERE is_active = true
  AND coalesce(custom_url, url) IN ('/store#final', '/store#diagnostics')
UNION ALL
SELECT 'conversion_v2.header_club', count(*)::text
FROM navigation_items
WHERE location = 'header' AND is_active = true
  AND (lower(label) = 'club' OR coalesce(custom_url, url) = '/club')
UNION ALL
SELECT 'conversion_v2.home_deprecated_active', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'home' AND ps.is_active = true
  AND ps.section_key IN ('market_tension', 'circle_rules', 'path_router', 'club_preview', 'diagnostics_compare')
UNION ALL
SELECT 'conversion_v2.published_devices_missing_required_fields.warning', count(*)::text
FROM devices
WHERE status = 'published'
  AND stock_status <> 'hidden'
  AND (
    nullif(brand, '') IS NULL
    OR nullif(model, '') IS NULL
    OR nullif(storage, '') IS NULL
    OR nullif(color, '') IS NULL
    OR nullif(grade, '') IS NULL
    OR nullif(diagnostic_date::text, '') IS NULL
    OR nullif(activation_lock, '') IS NULL
    OR nullif(mdm, '') IS NULL
    OR nullif(completeness, '') IS NULL
  )
UNION ALL
SELECT 'conversion_v2.repair_story_conflicts', count(*)::text
FROM device_passports dp
JOIN devices d ON d.id = dp.device
WHERE d.status = 'published'
  AND (
    (lower(coalesce(dp.repair, '')) ~ 'не ремонт|не вскрыв|без ремонт'
      AND lower(coalesce(dp.story_body, '')) ~ 'после ремонта|был[аио]? в сервис|ремонтировал|замен(или|ена|ён|ен)')
    OR
    (lower(coalesce(dp.repair, '')) ~ 'ремонт|замен|вскрыв|сервис'
      AND lower(coalesce(dp.story_body, '')) ~ 'без ремонт|не ремонт|не вскрыв')
  )
UNION ALL
SELECT 'conversion_v2.unverified_social_proof_published', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.status = 'published' AND ps.is_active = true
  AND ps.section_key = 'social_proof'
  AND jsonb_array_length(coalesce(ps.content::jsonb -> 'testimonials', '[]'::jsonb)) < 3;
`);
