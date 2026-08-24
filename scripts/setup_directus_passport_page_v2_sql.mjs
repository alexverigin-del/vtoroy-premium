#!/usr/bin/env node

import fs from "node:fs";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-passport-v2");
if (apply && !confirmed) {
  console.error("Apply requires --apply --confirm-passport-v2");
  process.exit(1);
}

const data = JSON.parse(
  fs.readFileSync(new URL("../apps/web/data/marketing-pages.json", import.meta.url), "utf8"),
);
const passport = data.passport;
const newSectionIds = {
  passport_principles: "938dd75b-99f3-43f0-a918-5c6574a8b0dd",
  passport_grades: "93782020-53e3-4076-9165-76e35c599de2",
  passport_statement: "8bfdc220-9649-4dcf-9670-bd711c3d2734",
  passport_limits: "40aa0349-bbb5-4b4b-b7d7-933fa831b2f5",
  passport_trade: "981ea73c-6829-448b-802b-124a31fa16b6",
};
const newFaqIds = {
  "passport-history": "3fa2c97f-c46d-409f-ac24-c0674e73eab4",
  "passport-self-check": "0f4f13cc-83e7-43bc-b282-cdf1e0439a6b",
};

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value ?? {}))}::json`;
}

const lines = [
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '30s';",
  String.raw`DO $passport_guard$
BEGIN
  IF (SELECT count(*) FROM site_pages WHERE slug = 'passport') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one passport page';
  END IF;
END
$passport_guard$;`,
];

for (const [sectionKey, id] of Object.entries(newSectionIds)) {
  const section = passport.sections.find((item) => item.sectionKey === sectionKey);
  if (!section) throw new Error(`Missing canonical Passport section: ${sectionKey}`);

  lines.push(`
INSERT INTO page_sections (
  id, page, section_key, variant, eyebrow, headline, subheadline, body,
  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url,
  sort_order, is_active, content
)
SELECT
  ${sqlLiteral(id)}::uuid,
  sp.id,
  ${sqlLiteral(section.sectionKey)},
  ${sqlLiteral(section.variant)},
  ${sqlLiteral(section.eyebrow ?? "")},
  ${sqlLiteral(section.headline ?? "")},
  ${sqlLiteral(section.subheadline ?? "")},
  ${sqlLiteral(section.body ?? "")},
  ${sqlLiteral(section.primaryCtaLabel ?? "")},
  ${sqlLiteral(section.primaryCtaUrl ?? "")},
  ${sqlLiteral(section.secondaryCtaLabel ?? "")},
  ${sqlLiteral(section.secondaryCtaUrl ?? "")},
  ${Number(section.sortOrder)},
  true,
  ${sqlJson(section.content)}
FROM site_pages AS sp
WHERE sp.slug = 'passport'
  AND NOT EXISTS (
    SELECT 1 FROM page_sections AS existing
    WHERE existing.page = sp.id AND existing.section_key = ${sqlLiteral(sectionKey)}
  )
  AND NOT EXISTS (
    SELECT 1 FROM page_sections WHERE id = ${sqlLiteral(id)}::uuid
  );`);
}

const faqSection = passport.sections.find((item) => item.sectionKey === "faq");
const faqKeys = faqSection?.content?.faqKeys ?? [];
const faqItems = faqSection?.content?.items ?? [];
if (faqKeys.length !== faqItems.length) {
  throw new Error("Canonical Passport FAQ keys/items length mismatch");
}

for (const [key, id] of Object.entries(newFaqIds)) {
  const index = faqKeys.indexOf(key);
  const item = faqItems[index];
  if (!item) throw new Error(`Missing canonical Passport FAQ item: ${key}`);
  lines.push(`
INSERT INTO faq_items (id, key, category, page, sort, question, answer, is_active)
SELECT
  ${sqlLiteral(id)}::uuid,
  ${sqlLiteral(key)},
  'passport',
  sp.id,
  ${(index + 1) * 10},
  ${sqlLiteral(item.title)},
  ${sqlLiteral(item.text)},
  true
FROM site_pages AS sp
WHERE sp.slug = 'passport'
  AND NOT EXISTS (SELECT 1 FROM faq_items WHERE key = ${sqlLiteral(key)});`);
}

lines.push(String.raw`
DO $passport_sections_guard$
BEGIN
  IF (
    SELECT count(*)
    FROM page_sections ps
    JOIN site_pages sp ON sp.id = ps.page
    WHERE sp.slug = 'passport'
      AND ps.section_key IN (
        'passport_principles','passport_grades','passport_statement',
        'passport_limits','passport_trade'
      )
  ) <> 5 THEN
    RAISE EXCEPTION 'Expected five managed Passport v2 sections';
  END IF;
END
$passport_sections_guard$;

SELECT 'passport_v2.new_sections' AS check_name, count(*)::text AS value
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'passport'
  AND ps.section_key IN (
    'passport_principles','passport_grades','passport_statement',
    'passport_limits','passport_trade'
  )
UNION ALL
SELECT 'passport_v2.new_faq', count(*)::text
FROM faq_items
WHERE key IN ('passport-history','passport-self-check');`);
lines.push(apply ? "COMMIT;" : "ROLLBACK;");

process.stdout.write(`${lines.join("\n")}\n`);
