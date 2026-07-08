#!/usr/bin/env node
/**
 * Print idempotent SQL for the audit-v1 public copy upgrade.
 *
 * Usage:
 *   node scripts/update_directus_audit_v1_copy_sql.mjs > /tmp/isvoi_audit_v1_copy.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_audit_v1_copy.sql
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pagesPath = path.join(root, "apps", "web", "data", "marketing-pages.json");
const marketingPages = JSON.parse(readFileSync(pagesPath, "utf8"));

const siteSettings = {
  tagline: "Хорошие вещи проходят через своих.",
  header_cta_label: "Оставить заявку",
  header_cta_url: "/#final",
  footer_note:
    "I СВОИ — клуб разумного владения: проверенные вещи проходят дальше через своих. Наличие, цены, грейды, гарантия и условия выхода подтверждаются перед сделкой. Названия и товарные знаки принадлежат их правообладателям.",
  footer_brand_text: "Клуб разумного владения. Хорошие вещи проходят через своих. Северодвинск.",
  footer_legal:
    "Наличие, цены и условия подтверждаются перед сделкой. Информация на сайте не является публичной офертой.",
};

const homePage = {
  slug: "home",
  template: "home",
  title: "I СВОИ — хорошие вещи проходят через своих",
  metaDescription:
    "I СВОИ в Северодвинске: проверенные вещи с Passport, открытой проверкой, гарантией и понятным ориентиром выхода.",
};

const homeSections = [
  {
    sectionKey: "hero",
    variant: "hero.static",
    eyebrow: "I СВОИ · клуб разумного владения · Северодвинск",
    headline: "Хорошие вещи проходят через своих.",
    body: "На случайном рынке вы покупаете не только устройство, но и чужую неизвестность. В I СВОИ вещь проходит дальше с проверенной историей, открытым состоянием и понятным ориентиром выхода.",
    primaryCtaLabel: "Подобрать проверенную вещь",
    primaryCtaUrl: "/catalog",
    secondaryCtaLabel: "Оценить свою вещь",
    secondaryCtaUrl: "/trade",
    sortOrder: 1,
    isActive: true,
    content: {
      assurance: ["История до покупки", "Проверка при вас", "Ориентир выхода"],
      visual: {
        image_alt: "Премиальный графитовый смартфон на светло-серой студийной поверхности",
      },
      passport: {
        aria_label: "I СВОИ Passport вещи",
        device: "iPhone 13 Pro",
        sub: "256 GB · Графитовый",
        grade: "A−",
        grade_label: "Грейд",
        rows: [
          { label: "Батарея", value: "89%", state: "ok" },
          { label: "Ремонт", value: "не вскрывался", state: "ok" },
          { label: "Face ID", value: "работает", state: "ok" },
          { label: "Влага", value: "следов нет", state: "ok" },
        ],
        exit_label: "Ориентир выхода через 6 мес",
        exit_value: "до 42 000 ₽",
        warranty: "Гарантия",
        warranty_strong: "90 дней",
      },
    },
  },
  {
    sectionKey: "market_tension",
    variant: "compare",
    eyebrow: "Не просто витрина",
    headline: "Покупка начинается с ответа: чему здесь можно доверять?",
    body: "Мы показываем разницу до карточки товара: не обещание «как новая», а проверка, нюансы, гарантия и понятный следующий шаг.",
    sortOrder: 2,
    isActive: true,
    content: {
      comparison: {
        label_header: "Что решает покупатель",
        bad_header: "Случайный рынок",
        good_header: "I СВОИ",
        rows: [
          {
            label: "История вещи",
            bad: "зависит от слов продавца",
            good: "собрана в Passport до решения",
          },
          {
            label: "Состояние",
            bad: "нюансы всплывают после встречи",
            good: "фиксируется открыто, включая дефекты",
          },
          {
            label: "После покупки",
            bad: "дальше вы снова одни",
            good: "есть гарантия, Trade и ориентир выхода",
          },
        ],
      },
    },
  },
  {
    sectionKey: "circle_rules",
    variant: "trust.strip",
    eyebrow: "Правила круга",
    headline: "Доверие держится на проверяемых вещах.",
    body: "Каждое правило должно быть видно в карточке, в Store и в разговоре перед сделкой.",
    sortOrder: 3,
    isActive: true,
    content: {
      items: [
        {
          title: "Открытая проверка",
          text: "Экран, корпус, аккумулятор, связь, камеры и следы влаги проверяются при вас.",
        },
        {
          title: "Фиксация нюансов",
          text: "Дефекты и следы использования не прячутся: они влияют на грейд и цену.",
        },
        {
          title: "Письменная гарантия",
          text: "Условия гарантии показываются до покупки и остаются частью сделки.",
        },
        {
          title: "Ориентир выхода",
          text: "Ориентир выхода помогает планировать обновление, но подтверждается повторной проверкой.",
        },
      ],
    },
  },
];

const homeSortOrders = {
  hero: 1,
  market_tension: 2,
  circle_rules: 3,
  trust: 4,
  path_router: 5,
  catalog_preview: 6,
  passport_preview: 7,
  store_preview: 8,
  trade_preview: 9,
  club_preview: 10,
  diagnostics_compare: 11,
  final_cta: 12,
};

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

function pushPageUpsert(lines, slug, page) {
  lines.push("");
  lines.push(`-- page ${slug}`);
  lines.push("INSERT INTO site_pages (slug, template, status, title, meta_description)");
  lines.push(
    `VALUES (${sqlString(slug)}, ${sqlString(page.template || slug)}, 'published', ${sqlString(page.title)}, ${sqlString(page.metaDescription || "")})`,
  );
  lines.push("ON CONFLICT (slug) DO UPDATE SET");
  lines.push("  template = EXCLUDED.template,");
  lines.push("  status = EXCLUDED.status,");
  lines.push("  title = EXCLUDED.title,");
  lines.push("  meta_description = EXCLUDED.meta_description;");
}

function pushSectionUpsert(lines, slug, section) {
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
  lines.push(`-- ${slug}.${sectionKey}`);
  lines.push("UPDATE page_sections ps SET");
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
  lines.push("FROM site_pages sp");
  lines.push(
    `WHERE ps.page = sp.id AND sp.slug = ${sqlString(slug)} AND ps.section_key = ${sqlString(sectionKey)};`,
  );

  lines.push("INSERT INTO page_sections (");
  lines.push("  page, section_key, variant, eyebrow, headline, subheadline, body,");
  lines.push("  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url,");
  lines.push("  sort_order, is_active, content");
  lines.push(")");
  lines.push(
    `SELECT sp.id, ${sqlString(sectionKey)}, ${sqlString(values.variant)}, ${sqlString(values.eyebrow)},`,
  );
  lines.push(`  ${sqlString(values.headline)}, ${sqlString(values.subheadline)}, ${sqlString(values.body)},`);
  lines.push(`  ${sqlString(values.primaryCtaLabel)}, ${sqlString(values.primaryCtaUrl)},`);
  lines.push(`  ${sqlString(values.secondaryCtaLabel)}, ${sqlString(values.secondaryCtaUrl)},`);
  lines.push(`  ${values.sortOrder}, ${values.isActive ? "true" : "false"}, ${sqlJson(values.content)}`);
  lines.push("FROM site_pages sp");
  lines.push(`WHERE sp.slug = ${sqlString(slug)}`);
  lines.push("  AND NOT EXISTS (");
  lines.push("    SELECT 1 FROM page_sections existing");
  lines.push(`    WHERE existing.page = sp.id AND existing.section_key = ${sqlString(sectionKey)}`);
  lines.push("  );");
}

const lines = [
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '30s';",
  "",
  "-- site settings",
  "DO $$",
  "DECLARE",
  "  v_settings_id site_settings.id%TYPE;",
  "BEGIN",
  "  SELECT id INTO v_settings_id FROM site_settings ORDER BY id LIMIT 1;",
  "  IF v_settings_id IS NULL THEN",
  "    RAISE EXCEPTION 'site_settings singleton row was not found';",
  "  END IF;",
  "  UPDATE site_settings SET",
  `    tagline = ${sqlString(siteSettings.tagline)},`,
  `    header_cta_label = ${sqlString(siteSettings.header_cta_label)},`,
  `    header_cta_url = ${sqlString(siteSettings.header_cta_url)},`,
  `    footer_note = ${sqlString(siteSettings.footer_note)},`,
  `    footer_brand_text = ${sqlString(siteSettings.footer_brand_text)},`,
  `    footer_legal = ${sqlString(siteSettings.footer_legal)}`,
  "  WHERE id = v_settings_id;",
  "END;",
  "$$;",
];

pushPageUpsert(lines, "home", homePage);
for (const section of homeSections) {
  pushSectionUpsert(lines, "home", section);
}

lines.push("");
lines.push("-- keep known homepage sections in the intended reading order");
for (const [sectionKey, sortOrder] of Object.entries(homeSortOrders)) {
  lines.push(
    `UPDATE page_sections ps SET sort_order = ${sortOrder} FROM site_pages sp WHERE ps.page = sp.id AND sp.slug = 'home' AND ps.section_key = ${sqlString(sectionKey)};`,
  );
}

for (const [slug, page] of Object.entries(marketingPages)) {
  pushPageUpsert(lines, slug, page);
  for (const section of page.sections ?? []) {
    pushSectionUpsert(lines, slug, section);
  }
}

lines.push("");
lines.push("-- product-card conversion copy");
lines.push("UPDATE devices");
lines.push("SET cta_label = 'Проверить наличие'");
lines.push("WHERE cta_label IN ('Смотреть паспорт', 'Смотреть Passport');");
lines.push("");
lines.push("UPDATE devices");
lines.push("SET exit_text = replace(exit_text, 'Выход до ', 'Ориентир выхода до ')");
lines.push("WHERE exit_text LIKE 'Выход до %';");
lines.push("");
lines.push("UPDATE devices");
lines.push("SET short_description = replace(short_description, 'цена выхода до', 'ориентир выхода до')");
lines.push("WHERE short_description LIKE '%цена выхода до%';");
lines.push("");
lines.push("UPDATE devices");
lines.push("SET passport = replace(passport::text, 'Цена выхода не является', 'Ориентир выхода не является')::json");
lines.push("WHERE passport::text LIKE '%Цена выхода не является%';");
lines.push("");
lines.push("UPDATE device_passports");
lines.push("SET exit_note = replace(exit_note, 'Цена выхода не является', 'Ориентир выхода не является')");
lines.push("WHERE exit_note LIKE '%Цена выхода не является%';");

lines.push("");
lines.push("SELECT 'audit_v1.site_settings.header_cta_label' AS check_name, header_cta_label AS value");
lines.push("FROM site_settings ORDER BY id LIMIT 1;");
lines.push("");
lines.push("SELECT 'audit_v1.home_sections' AS check_name, count(*)::text AS value");
lines.push("FROM page_sections ps JOIN site_pages sp ON sp.id = ps.page");
lines.push("WHERE sp.slug = 'home' AND ps.section_key IN ('hero', 'market_tension', 'circle_rules');");
lines.push("");
lines.push("SELECT 'audit_v1.device_cta_labels' AS check_name, count(*)::text AS value");
lines.push("FROM devices WHERE cta_label = 'Проверить наличие';");
lines.push("");
lines.push("COMMIT;");

process.stdout.write(`${lines.join("\n")}\n`);
