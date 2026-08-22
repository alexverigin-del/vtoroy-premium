#!/usr/bin/env node

import {
  databaseSectionContent,
  loadHomepageCopy,
  sqlJson,
  sqlLiteral,
} from "./lib/homepage-copy.mjs";

const copy = loadHomepageCopy();
const sectionValues = copy.sections
  .map(
    (section) =>
      `(${sqlLiteral(section.section_key)}, ${sqlLiteral(section.variant)}, ${section.sort_order}, ${sqlLiteral(section.eyebrow)}, ${sqlLiteral(section.headline)}, ${sqlLiteral(section.body)}, ${sqlLiteral(section.primary_cta_label)}, ${sqlLiteral(section.primary_cta_url)}, ${sqlLiteral(section.secondary_cta_label)}, ${sqlLiteral(section.secondary_cta_url)}, ${sqlJson(databaseSectionContent(section))})`,
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
SELECT 'homepage_copy.sections.contract_mismatch', count(*)::text
FROM expected_sections expected
JOIN home ON true
JOIN page_sections ps ON ps.page = home.id AND ps.section_key = expected.section_key
WHERE ps.variant IS DISTINCT FROM expected.variant
   OR nullif(btrim(ps.headline), '') IS NULL
UNION ALL
SELECT 'homepage_copy.sections.unexpected_active', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
LEFT JOIN expected_sections expected ON expected.section_key = ps.section_key
WHERE coalesce(ps.is_active, false) = true AND expected.section_key IS NULL
UNION ALL
SELECT 'homepage_copy.closing.required_fields', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE ps.section_key = 'final_cta'
  AND (
    nullif(btrim(ps.closing_headline), '') IS NULL
    OR nullif(btrim(ps.closing_body), '') IS NULL
    OR nullif(btrim(ps.closing_brand), '') IS NULL
    OR nullif(btrim(ps.closing_tagline), '') IS NULL
    OR nullif(btrim(ps.closing_primary_cta_label), '') IS NULL
    OR nullif(btrim(ps.closing_primary_cta_url), '') IS NULL
    OR nullif(btrim(ps.closing_secondary_cta_label), '') IS NULL
    OR nullif(btrim(ps.closing_secondary_cta_url), '') IS NULL
  )
UNION ALL
SELECT 'homepage_copy.closing.legacy_json', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE ps.section_key = 'final_cta' AND ps.content::jsonb ? 'closing'
UNION ALL
SELECT 'homepage_copy.footer.required_copy', count(*)::text
FROM site_settings
WHERE nullif(btrim(tagline), '') IS NULL
   OR nullif(btrim(footer_brand_text), '') IS NULL
   OR nullif(btrim(footer_note), '') IS NULL
UNION ALL
SELECT 'homepage_copy.forbidden.city', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text,
  ps.closing_headline, ps.closing_body, ps.closing_brand, ps.closing_tagline) ILIKE '%Северодвинск%'
UNION ALL
SELECT 'homepage_copy.forbidden.commission', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text,
  ps.closing_headline, ps.closing_body, ps.closing_brand, ps.closing_tagline) ~* '(комисси|передать на комиссию)'
UNION ALL
SELECT 'homepage_copy.forbidden.demo_values', count(*)::text
FROM page_sections ps
JOIN home ON ps.page = home.id
WHERE concat_ws(' ', ps.eyebrow, ps.headline, ps.body, ps.content::text,
  ps.closing_headline, ps.closing_body, ps.closing_brand, ps.closing_tagline) ~* '(IMEI|19 900|42 000)'
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
SELECT 'homepage_copy.faq.contract_invalid', count(*)::text
FROM expected_faq expected
JOIN faq_items item ON item.key = expected.key
JOIN home ON true
WHERE item.page IS DISTINCT FROM home.id
   OR item.category IS DISTINCT FROM 'home'
   OR coalesce(item.is_active, false) IS DISTINCT FROM true
   OR nullif(btrim(item.question), '') IS NULL
   OR nullif(btrim(item.answer), '') IS NULL
UNION ALL
SELECT 'homepage_copy.info.faq_count', count(*)::text
FROM expected_faq;
`);
