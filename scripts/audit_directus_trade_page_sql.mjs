#!/usr/bin/env node

import fs from "node:fs";

const data = JSON.parse(
  fs.readFileSync(new URL("../apps/web/data/marketing-pages.json", import.meta.url), "utf8"),
);
const trade = data.trade;

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value ?? {}))}::jsonb`;
}

const expectedCopyRows = trade.sections
  .map((section) => {
    const content = structuredClone(section.content ?? {});
    if (section.sectionKey === "final_cta") delete content.closing;
    return `(${[
      sqlLiteral(section.sectionKey),
      sqlLiteral(section.eyebrow ?? ""),
      sqlLiteral(section.headline ?? ""),
      sqlLiteral(section.subheadline ?? ""),
      sqlLiteral(section.body ?? ""),
      sqlLiteral(section.primaryCtaLabel ?? ""),
      sqlLiteral(section.primaryCtaUrl ?? ""),
      sqlLiteral(section.secondaryCtaLabel ?? ""),
      sqlLiteral(section.secondaryCtaUrl ?? ""),
      String(section.sortOrder),
      section.isActive === false ? "false" : "true",
      sqlJson(content),
    ].join(",")})`;
  })
  .join(",\n    ");

process.stdout.write(String.raw`
WITH expected(section_key, sort_order) AS (
  VALUES
    ('trade_hero', 10),
    ('trade_paths', 20),
    ('trade_live_example', 30),
    ('trade_steps', 40),
    ('trade_compare', 50),
    ('final_cta', 60)
), expected_copy(
  section_key, eyebrow, headline, subheadline, body,
  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url,
  sort_order, is_active, content
) AS (
  VALUES
    ${expectedCopyRows}
), trade_sections AS (
  SELECT ps.*
  FROM page_sections ps
  JOIN site_pages sp ON sp.id = ps.page
  WHERE sp.slug = 'trade'
)
SELECT 'trade_page.page_missing_or_duplicate' AS check_name,
       abs(1 - count(*))::text AS value
FROM site_pages
WHERE slug = 'trade'
  AND status = 'published'
  AND title = ${sqlLiteral(trade.title)}
  AND meta_description = ${sqlLiteral(trade.metaDescription)}
UNION ALL
SELECT 'trade_page.sections.missing_or_duplicate', count(*)::text
FROM expected e
LEFT JOIN (
  SELECT section_key, count(*) AS row_count
  FROM trade_sections
  WHERE is_active = true
  GROUP BY section_key
) actual ON actual.section_key = e.section_key
WHERE coalesce(actual.row_count, 0) <> 1
UNION ALL
SELECT 'trade_page.sections.order_mismatch', count(*)::text
FROM expected e
JOIN trade_sections ps ON ps.section_key = e.section_key
WHERE ps.sort_order <> e.sort_order OR ps.is_active IS DISTINCT FROM true
UNION ALL
SELECT 'trade_page.sections.copy_mismatch', count(*)::text
FROM expected_copy e
JOIN trade_sections ps ON ps.section_key = e.section_key
WHERE ps.eyebrow IS DISTINCT FROM e.eyebrow
   OR ps.headline IS DISTINCT FROM e.headline
   OR ps.subheadline IS DISTINCT FROM e.subheadline
   OR ps.body IS DISTINCT FROM e.body
   OR ps.primary_cta_label IS DISTINCT FROM e.primary_cta_label
   OR ps.primary_cta_url IS DISTINCT FROM e.primary_cta_url
   OR ps.secondary_cta_label IS DISTINCT FROM e.secondary_cta_label
   OR ps.secondary_cta_url IS DISTINCT FROM e.secondary_cta_url
   OR ps.sort_order IS DISTINCT FROM e.sort_order
   OR ps.is_active IS DISTINCT FROM e.is_active
   OR ps.content::jsonb IS DISTINCT FROM e.content
UNION ALL
SELECT 'trade_page.hero.contract_invalid', count(*)::text
FROM trade_sections
WHERE section_key = 'trade_hero'
  AND (
    eyebrow <> 'I СВОИ · Trade'
    OR headline <> 'Продайте, обменяйте или передайте технику на комиссию.'
    OR primary_cta_url <> '#final'
    OR secondary_cta_url <> '/catalog'
    OR jsonb_array_length(coalesce(content::jsonb -> 'highlights', '[]'::jsonb)) <> 3
    OR nullif(content::jsonb ->> 'note', '') IS NULL
  )
UNION ALL
SELECT 'trade_page.paths.contract_invalid', count(*)::text
FROM trade_sections
WHERE section_key = 'trade_paths'
  AND (
    jsonb_array_length(coalesce(content::jsonb -> 'items', '[]'::jsonb)) <> 3
    OR nullif(content::jsonb ->> 'note', '') IS NULL
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(content::jsonb -> 'items', '[]'::jsonb)) item
      WHERE nullif(item ->> 'heading', '') IS NULL
         OR nullif(item ->> 'label', '') IS NULL
         OR item ->> 'url' <> '#final'
    )
  )
UNION ALL
SELECT 'trade_page.live_example.contract_invalid', count(*)::text
FROM trade_sections
WHERE section_key = 'trade_live_example'
  AND (
    primary_cta_url <> '#final'
    OR nullif(secondary_cta_label, '') IS NULL
    OR nullif(content::jsonb #>> '{valuation,heading}', '') IS NULL
    OR nullif(content::jsonb #>> '{valuation,amount}', '') IS NULL
    OR nullif(content::jsonb #>> '{valuation,from_note}', '') IS NULL
    OR nullif(content::jsonb ->> 'disclaimer', '') IS NULL
    OR nullif(content::jsonb ->> 'grade_label', '') IS NULL
    OR nullif(content::jsonb ->> 'note_label', '') IS NULL
    OR nullif(content::jsonb #>> '{emptyState,ctaLabel}', '') IS NULL
    OR nullif(content::jsonb #>> '{emptyState,ctaUrl}', '') IS NULL
  )
UNION ALL
SELECT 'trade_page.steps.contract_invalid', count(*)::text
FROM trade_sections
WHERE section_key = 'trade_steps'
  AND (
    jsonb_array_length(coalesce(content::jsonb -> 'steps', '[]'::jsonb)) <> 4
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(content::jsonb -> 'steps', '[]'::jsonb)) step
      WHERE nullif(step ->> 'title', '') IS NULL OR nullif(step ->> 'text', '') IS NULL
    )
  )
UNION ALL
SELECT 'trade_page.compare.contract_invalid', count(*)::text
FROM trade_sections
WHERE section_key = 'trade_compare'
  AND (
    jsonb_array_length(coalesce(content::jsonb #> '{comparison,rows}', '[]'::jsonb)) <> 5
    OR content::jsonb #>> '{comparison,bad_header}' <> 'Самостоятельно'
    OR content::jsonb #>> '{comparison,good_header}' <> 'I СВОИ Trade'
    OR nullif(content::jsonb ->> 'note', '') IS NULL
    OR nullif(content::jsonb ->> 'disclaimer', '') IS NULL
  )
UNION ALL
SELECT 'trade_page.form.contract_invalid', count(*)::text
FROM trade_sections
WHERE section_key = 'final_cta'
  AND (
    jsonb_array_length(coalesce(content::jsonb #> '{form,scenario_options}', '[]'::jsonb)) <> 3
    OR nullif(content::jsonb #>> '{form,device_label}', '') IS NULL
    OR nullif(content::jsonb #>> '{form,contact_label}', '') IS NULL
    OR nullif(content::jsonb #>> '{form,consent_note}', '') IS NULL
    OR nullif(closing_headline, '') IS NULL
    OR nullif(closing_body, '') IS NULL
    OR closing_primary_cta_url <> '#final'
    OR closing_secondary_cta_url <> '/catalog'
  )
UNION ALL
SELECT 'trade_page.legacy_copy', count(*)::text
FROM trade_sections
WHERE concat_ws(' ', eyebrow, headline, subheadline, body, content::text)
      ~* '(Передайте вещь дальше|Один из трёх понятных путей|Случайный рынок или Trade)'
UNION ALL
SELECT 'trade_page.studio.basic_editor_fields_missing', count(*)::text
FROM (
  VALUES
    ('sort_order'), ('is_active'), ('eyebrow'), ('headline'), ('subheadline'), ('body'),
    ('primary_cta_label'), ('primary_cta_url'), ('secondary_cta_label'),
    ('secondary_cta_url'), ('closing_headline'), ('closing_body'), ('closing_brand'),
    ('closing_tagline'), ('closing_primary_cta_label'), ('closing_primary_cta_url'),
    ('closing_secondary_cta_label'), ('closing_secondary_cta_url')
) AS expected(field)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions pe
  JOIN directus_policies po ON po.id = pe.policy
  WHERE po.name = 'ISVOI Editor'
    AND pe.collection = 'page_sections'
    AND pe.action = 'update'
    AND (
      pe.fields = '*'
      OR concat(',', pe.fields, ',') LIKE '%,' || expected.field || ',%'
    )
)
UNION ALL
SELECT 'trade_page.studio.advanced_content_permission_missing', count(*)::text
FROM (VALUES ('content')) AS expected(field)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions pe
  JOIN directus_policies po ON po.id = pe.policy
  WHERE po.name = 'ISVOI Advanced Editor'
    AND pe.collection = 'page_sections'
    AND pe.action = 'update'
    AND (
      pe.fields = '*'
      OR concat(',', pe.fields, ',') LIKE '%,' || expected.field || ',%'
    )
)
UNION ALL
SELECT 'trade_page.studio.content_field_metadata_invalid', count(*)::text
FROM directus_fields
WHERE collection = 'page_sections'
  AND field = 'content'
  AND (
    interface IS DISTINCT FROM 'input-code'
    OR readonly IS DISTINCT FROM false
    OR hidden IS DISTINCT FROM false
    OR "group" IS DISTINCT FROM 'group_advanced'
  )
UNION ALL
SELECT 'trade_page.studio.bookmark_missing',
       CASE WHEN EXISTS (
         SELECT 1
         FROM directus_presets preset
         JOIN directus_roles role ON role.id = preset.role
         WHERE role.name = 'ISVOI Editor'
           AND preset.collection = 'page_sections'
           AND preset.bookmark = 'Trade'
           AND preset.filter::jsonb = '{"page":{"slug":{"_eq":"trade"}}}'::jsonb
       ) THEN '0' ELSE '1' END
UNION ALL
SELECT 'trade_page.info.section_count', count(*)::text
FROM trade_sections
WHERE is_active = true;
`);
