#!/usr/bin/env node
/**
 * Generate idempotent SQL for managed marketing pages.
 *
 * Usage:
 *   node scripts/seed_marketing_pages_sql.mjs \
 *     | docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE"
 *
 * Through npm, use --silent before piping:
 *   npm run --silent directus:seed:marketing-pages | ...
 *
 * Source of truth: apps/web/data/marketing-pages.json
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pagesPath = path.join(root, "apps", "web", "data", "marketing-pages.json");
const pages = JSON.parse(readFileSync(pagesPath, "utf8"));

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::json`;
}

function sectionField(section, key) {
  return section[key] == null ? "" : String(section[key]);
}

const lines = [
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '30s';",
];

for (const [slug, page] of Object.entries(pages)) {
  lines.push("");
  lines.push(`-- ${slug}`);
  lines.push(`INSERT INTO site_pages (slug, template, status, title, meta_description)`);
  lines.push(
    `VALUES (${sqlString(slug)}, ${sqlString(page.template || slug)}, 'published', ${sqlString(page.title)}, ${sqlString(page.metaDescription || "")})`,
  );
  lines.push(`ON CONFLICT (slug) DO UPDATE SET`);
  lines.push(`  template = EXCLUDED.template,`);
  lines.push(`  status = EXCLUDED.status,`);
  lines.push(`  title = EXCLUDED.title,`);
  lines.push(`  meta_description = EXCLUDED.meta_description;`);

  for (const section of page.sections ?? []) {
    const sectionKey = sectionField(section, "sectionKey");
    const values = {
      variant: sectionField(section, "variant"),
      eyebrow: sectionField(section, "eyebrow"),
      headline: sectionField(section, "headline"),
      subheadline: sectionField(section, "subheadline"),
      body: sectionField(section, "body"),
      primaryCtaLabel: sectionField(section, "primaryCtaLabel"),
      primaryCtaUrl: sectionField(section, "primaryCtaUrl"),
      secondaryCtaLabel: sectionField(section, "secondaryCtaLabel"),
      secondaryCtaUrl: sectionField(section, "secondaryCtaUrl"),
      sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : 0,
      isActive: section.isActive !== false,
      content: section.content ?? {},
    };

    lines.push("");
    lines.push(`UPDATE page_sections ps SET`);
    lines.push(`  variant = ${sqlString(values.variant)},`);
    lines.push(`  eyebrow = ${sqlString(values.eyebrow)},`);
    lines.push(`  headline = ${sqlString(values.headline)},`);
    lines.push(`  subheadline = ${sqlString(values.subheadline)},`);
    lines.push(`  body = ${sqlString(values.body)},`);
    lines.push(`  primary_cta_label = ${sqlString(values.primaryCtaLabel)},`);
    lines.push(`  primary_cta_url = ${sqlString(values.primaryCtaUrl)},`);
    lines.push(`  secondary_cta_label = ${sqlString(values.secondaryCtaLabel)},`);
    lines.push(`  secondary_cta_url = ${sqlString(values.secondaryCtaUrl)},`);
    lines.push(`  sort_order = ${values.sortOrder},`);
    lines.push(`  is_active = ${values.isActive ? "true" : "false"},`);
    lines.push(`  content = ${sqlJson(values.content)}`);
    lines.push(`FROM site_pages sp`);
    lines.push(`WHERE ps.page = sp.id AND sp.slug = ${sqlString(slug)} AND ps.section_key = ${sqlString(sectionKey)};`);

    lines.push(`INSERT INTO page_sections (`);
    lines.push(`  page, section_key, variant, eyebrow, headline, subheadline, body,`);
    lines.push(`  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url,`);
    lines.push(`  sort_order, is_active, content`);
    lines.push(`)`);
    lines.push(`SELECT sp.id, ${sqlString(sectionKey)}, ${sqlString(values.variant)}, ${sqlString(values.eyebrow)},`);
    lines.push(`  ${sqlString(values.headline)}, ${sqlString(values.subheadline)}, ${sqlString(values.body)},`);
    lines.push(`  ${sqlString(values.primaryCtaLabel)}, ${sqlString(values.primaryCtaUrl)},`);
    lines.push(`  ${sqlString(values.secondaryCtaLabel)}, ${sqlString(values.secondaryCtaUrl)},`);
    lines.push(`  ${values.sortOrder}, ${values.isActive ? "true" : "false"}, ${sqlJson(values.content)}`);
    lines.push(`FROM site_pages sp`);
    lines.push(`WHERE sp.slug = ${sqlString(slug)}`);
    lines.push(`  AND NOT EXISTS (`);
    lines.push(`    SELECT 1 FROM page_sections existing`);
    lines.push(`    WHERE existing.page = sp.id AND existing.section_key = ${sqlString(sectionKey)}`);
    lines.push(`  );`);
  }
}

lines.push("");
lines.push("COMMIT;");

process.stdout.write(`${lines.join("\n")}\n`);
