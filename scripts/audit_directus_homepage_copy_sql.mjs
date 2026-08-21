#!/usr/bin/env node

import { loadHomepageCopy, sqlJson, sqlLiteral } from "./lib/homepage-copy.mjs";

const copy = loadHomepageCopy();
const sectionValues = copy.sections
  .map(
    (section) =>
      `(${sqlLiteral(section.section_key)}, ${sqlLiteral(section.variant)}, ${section.sort_order}, ${sqlLiteral(section.eyebrow)}, ${sqlLiteral(section.headline)}, ${sqlLiteral(section.body)}, ${sqlLiteral(section.primary_cta_label)}, ${sqlLiteral(section.primary_cta_url)}, ${sqlLiteral(section.secondary_cta_label)}, ${sqlLiteral(section.secondary_cta_url)}, ${sqlJson(section.content)})`,
  )
  .join(",\n    ");
const faqValues = copy.faq_items
  .map(
    (item) =>
      `(${sqlLiteral(item.key)}, ${item.sort}, ${sqlLiteral(item.question)}, ${sqlLiteral(item.answer)})`,
  )
  .join(",\n    ");

process.stdout.write(String.raw`
WITH expected_sections(
  section_key, variant, sort_order, eyebrow, headline, body,
  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url, content
) AS (
  VALUES
    ${sectionValues}
), home AS (
  SELECT id FROM site_pages WHERE slug = 'home'
)
SELECT 'homepage_copy.sections.missing_or_duplicate' AS check_name, count(*)::text AS value
FROM expected_sections expected
WHERE (SELECT count(*) FROM page_sections ps, home WHERE ps.page = home.id AND ps.section_key = expected.section_key) <> 1
UNION ALL
SELECT 'homepage_copy.sections.text_mismatch', count(*)::text
FROM expected_sections expected
JOIN home ON true
JOIN page_sections ps ON ps.page = home.id AND ps.section_key = expected.section_key
WHERE ps.variant IS DISTINCT FROM expected.variant
   OR ps.sort_order IS DISTINCT FROM expected.sort_order
   OR ps.eyebrow IS DISTINCT FROM expected.eyebrow
   OR ps.headline IS DISTINCT FROM expected.headline
   OR ps.body IS DISTINCT FROM expected.body
   OR ps.primary_cta_label IS DISTINCT FROM expected.primary_cta_label
   OR ps.primary_cta_url IS DISTINCT FROM expected.primary_cta_url
   OR ps.secondary_cta_label IS DISTINCT FROM expected.secondary_cta_label
   OR ps.secondary_cta_url IS DISTINCT FROM expected.secondary_cta_url
   OR ps.content::jsonb IS DISTINCT FROM expected.content::jsonb
   OR coalesce(ps.is_active, false) IS DISTINCT FROM true
UNION ALL
SELECT 'homepage_copy.sections.unexpected_active', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
LEFT JOIN expected_sections expected ON expected.section_key = ps.section_key
WHERE coalesce(ps.is_active, false) = true AND expected.section_key IS NULL
UNION ALL
SELECT 'homepage_copy.footer.mismatch', count(*)::text
FROM site_settings
WHERE tagline IS DISTINCT FROM ${sqlLiteral(copy.footer.tagline)}
   OR footer_brand_text IS DISTINCT FROM ${sqlLiteral(copy.footer.footer_brand_text)}
   OR footer_note IS DISTINCT FROM ${sqlLiteral(copy.footer.footer_note)}
UNION ALL
SELECT 'homepage_copy.forbidden.city', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text) ILIKE '%Северодвинск%'
UNION ALL
SELECT 'homepage_copy.forbidden.commission', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text) ~* '(комисси|передать на комиссию)'
UNION ALL
SELECT 'homepage_copy.forbidden.demo_values', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text) ~* '(IMEI|19 900|42 000)'
UNION ALL
SELECT 'homepage_copy.info.section_count', count(*)::text
FROM expected_sections;

WITH expected_faq(key, sort, question, answer) AS (
  VALUES
    ${faqValues}
), home AS (
  SELECT id FROM site_pages WHERE slug = 'home'
)
SELECT 'homepage_copy.faq.missing_or_duplicate' AS check_name, count(*)::text AS value
FROM expected_faq expected
WHERE (SELECT count(*) FROM faq_items item WHERE item.key = expected.key) <> 1
UNION ALL
SELECT 'homepage_copy.faq.text_mismatch', count(*)::text
FROM expected_faq expected
JOIN faq_items item ON item.key = expected.key
JOIN home ON true
WHERE item.sort IS DISTINCT FROM expected.sort
   OR item.question IS DISTINCT FROM expected.question
   OR item.answer IS DISTINCT FROM expected.answer
   OR item.page IS DISTINCT FROM home.id
   OR item.category IS DISTINCT FROM 'home'
   OR coalesce(item.is_active, false) IS DISTINCT FROM true
UNION ALL
SELECT 'homepage_copy.info.faq_count', count(*)::text
FROM expected_faq;
`);
