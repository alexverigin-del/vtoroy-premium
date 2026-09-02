#!/usr/bin/env node

import { sectionAuditViewSql } from "./lib/studio-section-content.mjs";

process.stdout.write(String.raw`
${sectionAuditViewSql}
WITH expected(section_key, sort_order) AS (
  VALUES
    ('passport_hero', 10),
    ('passport_principles', 20),
    ('passport_explainer', 30),
    ('passport_grades', 40),
    ('passport_statement', 50),
    ('passport_live_example', 60),
    ('passport_steps', 70),
    ('passport_limits', 80),
    ('passport_trade', 90),
    ('faq', 100),
    ('final_cta', 110)
), passport_sections AS (
  SELECT ps.*
  FROM page_sections ps
  JOIN site_pages sp ON sp.id = ps.page
  WHERE sp.slug = 'passport'
)
SELECT 'passport_page.page_missing_or_duplicate' AS check_name,
       abs(1 - count(*))::text AS value
FROM site_pages
WHERE slug = 'passport' AND status = 'published'
UNION ALL
SELECT 'passport_page.sections.missing_or_duplicate', count(*)::text
FROM expected e
LEFT JOIN (
  SELECT section_key, count(*) AS row_count
  FROM passport_sections
  WHERE is_active = true
  GROUP BY section_key
) actual ON actual.section_key = e.section_key
WHERE coalesce(actual.row_count, 0) <> 1
UNION ALL
SELECT 'passport_page.sections.order_mismatch', count(*)::text
FROM expected e
JOIN passport_sections ps ON ps.section_key = e.section_key
WHERE ps.sort_order <> e.sort_order OR ps.is_active IS DISTINCT FROM true
UNION ALL
SELECT 'passport_page.grades.contract_invalid', count(*)::text
FROM passport_sections ps
WHERE ps.section_key = 'passport_grades'
  AND (
    ps.headline <> 'Что говорит грейд — и чего он не говорит.'
    OR jsonb_array_length(coalesce(ps.content::jsonb -> 'items', '[]'::jsonb)) <> 4
    OR jsonb_array_length(coalesce(ps.content::jsonb -> 'proof', '[]'::jsonb)) < 2
    OR jsonb_array_length(coalesce(ps.content::jsonb -> 'cues', '[]'::jsonb)) < 4
  )
UNION ALL
SELECT 'passport_page.faq.missing_or_duplicate', count(*)::text
FROM (
  VALUES
    ('passport-what'),('passport-history'),('passport-after-purchase'),
    ('passport-diagnostics'),('passport-warranty'),('passport-exit-price'),
    ('passport-self-check')
) expected_faq(key)
LEFT JOIN (
  SELECT key, count(*) AS row_count
  FROM faq_items
  WHERE is_active = true
  GROUP BY key
) actual ON actual.key = expected_faq.key
WHERE coalesce(actual.row_count, 0) <> 1
UNION ALL
SELECT 'passport_page.legacy_used_terminology', count(*)::text
FROM passport_sections ps
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.subheadline, ps.body, ps.content::text)
      ILIKE '%б/у%'
UNION ALL
SELECT 'passport_page.cta.invalid_process_anchor', count(*)::text
FROM passport_sections
WHERE section_key IN ('passport_hero','final_cta')
  AND secondary_cta_url <> '#passport-steps'
UNION ALL
SELECT 'passport_page.info.section_count', count(*)::text
FROM passport_sections
WHERE is_active = true
UNION ALL
SELECT 'passport_page.info.faq_count', count(*)::text
FROM faq_items f
JOIN site_pages sp ON sp.id = f.page
WHERE sp.slug = 'passport' AND f.is_active = true;
`);
