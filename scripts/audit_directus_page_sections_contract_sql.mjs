#!/usr/bin/env node
/**
 * Print SQL that audits page_sections.content variant contracts.
 */

process.stdout.write(String.raw`
CREATE OR REPLACE FUNCTION pg_temp.isvoi_json_string_values(p_value jsonb)
RETURNS TABLE(value text)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p_value
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT e.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END) AS e
      UNION ALL
      SELECT a.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.node) = 'array' THEN walk.node ELSE '[]'::jsonb END) AS a
    ) AS child
  )
  SELECT node #>> '{}'
  FROM walk
  WHERE jsonb_typeof(node) = 'string';
$$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_json_keys(p_value jsonb)
RETURNS TABLE(key text)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p_value
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT e.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END) AS e
      UNION ALL
      SELECT a.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.node) = 'array' THEN walk.node ELSE '[]'::jsonb END) AS a
    ) AS child
  )
  SELECT e.key
  FROM walk
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END
  ) AS e;
$$;

WITH allowed_variants(variant) AS (
  VALUES
    ('blog.index'),
    ('cards.grid'),
    ('cards.three'),
    ('catalog.curated'),
    ('catalog.grid'),
    ('club.levels'),
    ('compare'),
    ('decision.guide'),
    ('diagnostics.compare'),
    ('faq'),
    ('final.form'),
    ('hero.static'),
    ('levels'),
    ('live.example'),
    ('page.cta'),
    ('page.hero'),
    ('passport.split'),
    ('steps'),
    ('store.steps'),
    ('trade.choices'),
    ('trust.strip'),
    ('visual.band')
),
allowed_keys(key) AS (
  VALUES
    ('amount'),
    ('aria_label'),
    ('assurance'),
    ('bad'),
    ('bad_header'),
    ('badge'),
    ('body'),
    ('caption_text'),
    ('caption_title'),
    ('cards'),
    ('choices'),
    ('comparison'),
    ('contact_label'),
    ('contact_placeholder'),
    ('ctaLabel'),
    ('ctaUrl'),
    ('cues'),
    ('device'),
    ('device_label'),
    ('device_placeholder'),
    ('diagnostics'),
    ('emptyState'),
    ('exit_label'),
    ('exit_value'),
    ('featured'),
    ('features'),
    ('filterAriaLabel'),
    ('filters'),
    ('footer_note'),
    ('form'),
    ('from_device'),
    ('from_note'),
    ('good'),
    ('good_header'),
    ('grade'),
    ('grade_label'),
    ('heading'),
    ('headingTag'),
    ('headline'),
    ('icon'),
    ('image_alt'),
    ('items'),
    ('label'),
    ('label_header'),
    ('levels'),
    ('limit'),
    ('mode'),
    ('name'),
    ('note'),
    ('note_label'),
    ('note_text'),
    ('passport'),
    ('proof'),
    ('rows'),
    ('scenario_aria_label'),
    ('scenario_label'),
    ('scenario_options'),
    ('sortAriaLabel'),
    ('sortLabel'),
    ('sortOptions'),
    ('state'),
    ('statusFilterLabel'),
    ('statusFilters'),
    ('steps'),
    ('sub'),
    ('submit_label'),
    ('tag'),
    ('text'),
    ('title'),
    ('to_device'),
    ('to_note'),
    ('url'),
    ('valuation'),
    ('value'),
    ('visual'),
    ('warranty'),
    ('warranty_strong')
)
SELECT 'page_sections.unknown_variants' AS check_name, count(*)::text AS value
FROM page_sections ps
LEFT JOIN allowed_variants av ON av.variant = ps.variant
WHERE av.variant IS NULL
UNION ALL
SELECT 'page_sections.content.unknown_keys', count(*)::text
FROM (
  SELECT DISTINCT k.key
  FROM page_sections ps
  CROSS JOIN LATERAL pg_temp.isvoi_json_keys(ps.content::jsonb) k
) keys
LEFT JOIN allowed_keys ak ON ak.key = keys.key
WHERE ak.key IS NULL
UNION ALL
SELECT 'page_sections.content.local_assets', count(*)::text
FROM page_sections ps
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.isvoi_json_string_values(ps.content::jsonb) s
  WHERE s.value LIKE '/assets/%' OR s.value LIKE 'assets/%'
)
UNION ALL
SELECT 'page_sections.content.direct_asset_urls', count(*)::text
FROM page_sections ps
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.isvoi_json_string_values(ps.content::jsonb) s
  WHERE s.value LIKE '%api.isvoi.ru/assets/%'
)
UNION ALL
SELECT 'page_sections.content.legacy_image_keys', count(*)::text
FROM page_sections ps
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.isvoi_json_keys(ps.content::jsonb) k
  WHERE lower(k.key) IN ('image_src', 'imagesrc')
)
UNION ALL
SELECT 'page_sections.cta.empty_label_with_url', count(*)::text
FROM page_sections
WHERE (nullif(primary_cta_url, '') IS NOT NULL AND nullif(primary_cta_label, '') IS NULL)
   OR (nullif(secondary_cta_url, '') IS NOT NULL AND nullif(secondary_cta_label, '') IS NULL)
UNION ALL
SELECT 'page_sections.cta.label_without_url', count(*)::text
FROM page_sections
WHERE (nullif(primary_cta_label, '') IS NOT NULL AND nullif(primary_cta_url, '') IS NULL)
   OR (nullif(secondary_cta_label, '') IS NOT NULL AND nullif(secondary_cta_url, '') IS NULL)
UNION ALL
SELECT 'page_sections.required_image_missing', count(*)::text
FROM page_sections
WHERE variant IN ('hero.static', 'diagnostics.compare', 'store.steps', 'visual.band')
  AND image IS NULL
UNION ALL
SELECT 'page_sections.inactive_page_active_sections', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE coalesce(ps.is_active, false) = true
  AND sp.status <> 'published'
UNION ALL
SELECT 'page_sections.total', count(*)::text
FROM page_sections;
`);
