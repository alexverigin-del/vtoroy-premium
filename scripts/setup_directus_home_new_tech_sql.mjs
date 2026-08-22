#!/usr/bin/env node

import {
  databaseSectionContent,
  loadHomepageCopy,
  sqlJson,
  sqlLiteral,
} from "./lib/homepage-copy.mjs";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-home-new-tech");
if (apply && !confirmed) {
  console.error("Apply requires --apply --confirm-home-new-tech");
  process.exit(1);
}

const section = loadHomepageCopy().sections.find((item) => item.section_key === "new_tech");
if (!section) throw new Error("Canonical homepage copy is missing new_tech");

process.stdout.write(`BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $home_guard$
BEGIN
  IF (SELECT count(*) FROM site_pages WHERE slug = 'home') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one home page';
  END IF;
END
$home_guard$;

INSERT INTO page_sections (
  id, page, section_key, variant, eyebrow, headline, body,
  primary_cta_label, primary_cta_url,
  secondary_cta_label, secondary_cta_url,
  sort_order, is_active, content
)
SELECT
  'c9f5ef87-cde7-4bf1-a97b-00134a0f5010'::uuid,
  sp.id,
  ${sqlLiteral(section.section_key)},
  ${sqlLiteral(section.variant)},
  ${sqlLiteral(section.eyebrow)},
  ${sqlLiteral(section.headline)},
  ${sqlLiteral(section.body)},
  ${sqlLiteral(section.primary_cta_label)},
  ${sqlLiteral(section.primary_cta_url)},
  ${sqlLiteral(section.secondary_cta_label)},
  ${sqlLiteral(section.secondary_cta_url)},
  ${section.sort_order},
  true,
  ${sqlJson(databaseSectionContent(section))}
FROM site_pages AS sp
WHERE sp.slug = 'home'
  AND NOT EXISTS (
    SELECT 1
    FROM page_sections AS existing
    WHERE existing.page = sp.id AND existing.section_key = ${sqlLiteral(section.section_key)}
  )
  AND NOT EXISTS (
    SELECT 1 FROM page_sections WHERE id = 'c9f5ef87-cde7-4bf1-a97b-00134a0f5010'::uuid
  );

UPDATE page_sections AS ps
SET variant = 'new.tech', sort_order = 7, is_active = true
FROM site_pages AS sp
WHERE ps.page = sp.id AND sp.slug = 'home' AND ps.section_key = 'new_tech';

UPDATE page_sections AS ps
SET sort_order = CASE ps.section_key
  WHEN 'trade_preview' THEN 8
  WHEN 'faq' THEN 9
  WHEN 'final_cta' THEN 10
  ELSE ps.sort_order
END
FROM site_pages AS sp
WHERE ps.page = sp.id
  AND sp.slug = 'home'
  AND ps.section_key IN ('trade_preview', 'faq', 'final_cta');

DO $section_guard$
BEGIN
  IF (
    SELECT count(*)
    FROM page_sections AS ps
    JOIN site_pages AS sp ON sp.id = ps.page
    WHERE sp.slug = 'home' AND ps.section_key = 'new_tech'
  ) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one home.new_tech section';
  END IF;
END
$section_guard$;

SELECT 'home_new_tech.section_count' AS check_name, count(*)::text AS value
FROM page_sections AS ps
JOIN site_pages AS sp ON sp.id = ps.page
WHERE sp.slug = 'home' AND ps.section_key = 'new_tech'
UNION ALL
SELECT 'home_new_tech.order', string_agg(ps.section_key, ',' ORDER BY ps.sort_order)
FROM page_sections AS ps
JOIN site_pages AS sp ON sp.id = ps.page
WHERE sp.slug = 'home' AND coalesce(ps.is_active, false) = true;

${apply ? "COMMIT;" : "ROLLBACK;"}
`);
