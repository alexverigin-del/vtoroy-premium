#!/usr/bin/env node

import {
  databaseSectionContent,
  loadHomepageCopy,
  sqlJson,
  sqlLiteral,
} from "./lib/homepage-copy.mjs";

const copy = loadHomepageCopy();
const rollback = process.argv.includes("--rollback");
const sectionIds = {
  hero: "c9f5ef87-cde7-4bf1-a97b-00134a0f5001",
  trust: "c9f5ef87-cde7-4bf1-a97b-00134a0f5002",
  catalog_preview: "c9f5ef87-cde7-4bf1-a97b-00134a0f5003",
  passport_preview: "c9f5ef87-cde7-4bf1-a97b-00134a0f5004",
  circle_rules: "c9f5ef87-cde7-4bf1-a97b-00134a0f5005",
  store_preview: "c9f5ef87-cde7-4bf1-a97b-00134a0f5006",
  trade_preview: "c9f5ef87-cde7-4bf1-a97b-00134a0f5007",
  faq: "c9f5ef87-cde7-4bf1-a97b-00134a0f5008",
  final_cta: "c9f5ef87-cde7-4bf1-a97b-00134a0f5009",
};
const faqIds = {
  "home-used-term": "f44bb929-88de-4d05-a2a3-004a00005001",
  "home-self-check": "f44bb929-88de-4d05-a2a3-004a00005002",
  "home-passport-repairs": "f44bb929-88de-4d05-a2a3-004a00005003",
  "home-warranty": "f44bb929-88de-4d05-a2a3-004a00005004",
  "home-price-difference": "f44bb929-88de-4d05-a2a3-004a00005005",
  "home-trade-estimate": "f44bb929-88de-4d05-a2a3-004a00005006",
};

const lines = ["BEGIN;", "SET LOCAL lock_timeout = '5s';"];

for (const section of copy.sections) {
  const closing = section.content?.closing ?? {};
  const fields = {
    variant: section.variant,
    eyebrow: section.eyebrow,
    headline: section.headline,
    body: section.body,
    primary_cta_label: section.primary_cta_label,
    primary_cta_url: section.primary_cta_url,
    secondary_cta_label: section.secondary_cta_label,
    secondary_cta_url: section.secondary_cta_url,
    closing_headline: closing.headline,
    closing_body: closing.body,
    closing_brand: closing.brand,
    closing_tagline: closing.tagline,
    closing_primary_cta_label: closing.primary_cta_label,
    closing_primary_cta_url: closing.primary_cta_url,
    closing_secondary_cta_label: closing.secondary_cta_label,
    closing_secondary_cta_url: closing.secondary_cta_url,
  };
  lines.push(`
UPDATE page_sections ps
SET variant = ${sqlLiteral(fields.variant)},
    eyebrow = ${sqlLiteral(fields.eyebrow)},
    headline = ${sqlLiteral(fields.headline)},
    body = ${sqlLiteral(fields.body)},
    primary_cta_label = ${sqlLiteral(fields.primary_cta_label)},
    primary_cta_url = ${sqlLiteral(fields.primary_cta_url)},
    secondary_cta_label = ${sqlLiteral(fields.secondary_cta_label)},
    secondary_cta_url = ${sqlLiteral(fields.secondary_cta_url)},
    closing_headline = COALESCE(${sqlLiteral(fields.closing_headline)}, closing_headline),
    closing_body = COALESCE(${sqlLiteral(fields.closing_body)}, closing_body),
    closing_brand = COALESCE(${sqlLiteral(fields.closing_brand)}, closing_brand),
    closing_tagline = COALESCE(${sqlLiteral(fields.closing_tagline)}, closing_tagline),
    closing_primary_cta_label = COALESCE(${sqlLiteral(fields.closing_primary_cta_label)}, closing_primary_cta_label),
    closing_primary_cta_url = COALESCE(${sqlLiteral(fields.closing_primary_cta_url)}, closing_primary_cta_url),
    closing_secondary_cta_label = COALESCE(${sqlLiteral(fields.closing_secondary_cta_label)}, closing_secondary_cta_label),
    closing_secondary_cta_url = COALESCE(${sqlLiteral(fields.closing_secondary_cta_url)}, closing_secondary_cta_url),
    sort_order = ${section.sort_order},
    is_active = true,
    content = ${sqlJson(databaseSectionContent(section))}
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'home' AND ps.section_key = ${sqlLiteral(section.section_key)};

INSERT INTO page_sections (
  id, page, section_key, variant, eyebrow, headline, body,
  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url,
  closing_headline, closing_body, closing_brand, closing_tagline,
  closing_primary_cta_label, closing_primary_cta_url,
  closing_secondary_cta_label, closing_secondary_cta_url,
  sort_order, is_active, content
)
SELECT ${sqlLiteral(sectionIds[section.section_key])}::uuid, sp.id,
  ${sqlLiteral(section.section_key)}, ${sqlLiteral(fields.variant)},
  ${sqlLiteral(fields.eyebrow)}, ${sqlLiteral(fields.headline)}, ${sqlLiteral(fields.body)},
  ${sqlLiteral(fields.primary_cta_label)}, ${sqlLiteral(fields.primary_cta_url)},
  ${sqlLiteral(fields.secondary_cta_label)}, ${sqlLiteral(fields.secondary_cta_url)},
  ${sqlLiteral(fields.closing_headline)}, ${sqlLiteral(fields.closing_body)},
  ${sqlLiteral(fields.closing_brand)}, ${sqlLiteral(fields.closing_tagline)},
  ${sqlLiteral(fields.closing_primary_cta_label)}, ${sqlLiteral(fields.closing_primary_cta_url)},
  ${sqlLiteral(fields.closing_secondary_cta_label)}, ${sqlLiteral(fields.closing_secondary_cta_url)},
  ${section.sort_order}, true, ${sqlJson(databaseSectionContent(section))}
FROM site_pages sp
WHERE sp.slug = 'home'
  AND NOT EXISTS (
    SELECT 1 FROM page_sections ps
    WHERE ps.page = sp.id AND ps.section_key = ${sqlLiteral(section.section_key)}
  );`);
}

lines.push(`
UPDATE page_sections ps
SET is_active = false
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'home'
  AND ps.section_key IN (
    'market_tension', 'path_router', 'club_preview', 'diagnostics_compare', 'social_proof'
  );

UPDATE site_settings
SET tagline = ${sqlLiteral(copy.footer.tagline)},
    footer_brand_text = ${sqlLiteral(copy.footer.footer_brand_text)},
    footer_note = ${sqlLiteral(copy.footer.footer_note)};`);

for (const item of copy.faq_items) {
  lines.push(`
UPDATE faq_items
SET category = 'home',
    page = (SELECT id FROM site_pages WHERE slug = 'home' LIMIT 1),
    sort = ${item.sort},
    question = ${sqlLiteral(item.question)},
    answer = ${sqlLiteral(item.answer)},
    is_active = true
WHERE key = ${sqlLiteral(item.key)};

INSERT INTO faq_items (id, key, category, page, sort, question, answer, is_active)
SELECT ${sqlLiteral(faqIds[item.key])}::uuid, ${sqlLiteral(item.key)}, 'home', sp.id,
  ${item.sort}, ${sqlLiteral(item.question)}, ${sqlLiteral(item.answer)}, true
FROM site_pages sp
WHERE sp.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM faq_items WHERE key = ${sqlLiteral(item.key)});`);
}

lines.push(rollback ? "ROLLBACK;" : "COMMIT;");
process.stdout.write(`${lines.join("\n")}\n`);
