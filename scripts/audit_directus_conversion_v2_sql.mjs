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
  AND ps.section_key IN ('market_tension', 'path_router', 'club_preview', 'diagnostics_compare')
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
    (
      lower(coalesce(dp.repair, '')) ~ 'не ремонт|не вскрыв|без ремонт'
      AND lower(concat_ws(' ', dp.condition_note, dp.story_title, dp.story_body)) ~
        'после ремонта|был[аио]? в сервис|обслужив[а-я]* в [а-я ]*сервис|ремонтировал|замен(или|ена|ён|ен)'
    )
    OR
    (
      lower(coalesce(dp.repair, '')) ~ 'ремонт|замен|вскрыв|сервис'
      AND lower(concat_ws(' ', dp.condition_note, dp.story_title, dp.story_body)) ~
        'без ремонт|не ремонт|не вскрыв|следов вскрытия нет'
    )
  )
UNION ALL
SELECT 'conversion_v2.unverified_social_proof_published', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.status = 'published' AND ps.is_active = true
  AND ps.section_key = 'social_proof'
  AND jsonb_array_length(coalesce(ps.content::jsonb -> 'testimonials', '[]'::jsonb)) < 3
UNION ALL
SELECT 'conversion_v2.retired_exit_terms', count(*)::text
FROM (
  SELECT concat_ws(' ', sp.title, sp.meta_description, ps.eyebrow, ps.headline, ps.subheadline, ps.body, ps.content::text) AS public_copy
  FROM page_sections ps
  JOIN site_pages sp ON sp.id = ps.page
  WHERE sp.status = 'published' AND ps.is_active = true
  UNION ALL
  SELECT concat_ws(' ', question, answer)
  FROM faq_items
  WHERE is_active = true
  UNION ALL
  SELECT concat_ws(' ', short_description, exit_text)
  FROM devices
  WHERE status = 'published' AND stock_status <> 'hidden'
  UNION ALL
  SELECT concat_ws(' ', dp.exit_headline, dp.exit_note)
  FROM device_passports dp
  JOIN devices d ON d.id = dp.device
  WHERE d.status = 'published' AND d.stock_status <> 'hidden'
) public_rows
WHERE lower(public_copy) ~ '(ориентир|цена)[[:space:]]+выхода'
UNION ALL
SELECT 'conversion_v2.public_question_mark_placeholders', count(*)::text
FROM (
  SELECT concat_ws(' ', ps.body, ps.content::text) AS public_copy
  FROM page_sections ps
  JOIN site_pages sp ON sp.id = ps.page
  WHERE sp.status = 'published' AND ps.is_active = true
  UNION ALL
  SELECT concat_ws(
    ' ',
    lead_available_consent_note,
    lead_reserved_consent_note,
    lead_sold_consent_note
  )
  FROM device_page_settings
) public_rows
WHERE public_copy ~ '\?{5,}'
UNION ALL
SELECT 'conversion_v2.store_club_promotion', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'store' AND sp.status = 'published' AND ps.is_active = true
  AND concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text) ~* '\mClub\M'
UNION ALL
SELECT 'conversion_v2.trade_cross_page_cta', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'trade' AND sp.status = 'published' AND ps.is_active = true
  AND (
    coalesce(ps.primary_cta_url, '') = '/#final'
    OR coalesce(ps.secondary_cta_url, '') = '/#final'
    OR ps.content::text LIKE '%"/#final"%'
  )
UNION ALL
SELECT 'conversion_v2.club_risky_sections_active', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'club' AND sp.status = 'published' AND ps.is_active = true
  AND ps.section_key IN ('club_levels', 'club_rating', 'club_compare')
UNION ALL
SELECT 'conversion_v2.club_nonpilot_cta', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'club' AND sp.status = 'published' AND ps.is_active = true
  AND concat_ws(' ', ps.primary_cta_label, ps.secondary_cta_label) ~* '\mClub\M'
  AND NOT EXISTS (
    SELECT 1
    FROM club_page_settings settings
    WHERE settings.publication_mode IN ('pilot_noindex', 'public_index')
  )
UNION ALL
SELECT 'conversion_v2.catalog_club_filter', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'catalog' AND sp.status = 'published' AND ps.is_active = true
  AND ps.content::text ~* 'Для Club'
UNION ALL
SELECT 'conversion_v2.footer_legacy_positioning', count(*)::text
FROM site_settings
WHERE concat_ws(' ', footer_note, footer_brand_text) ~* 'клуб разумного владения';
`);
