#!/usr/bin/env node
/**
 * Forward-only conversion_v2 migration.
 *
 * This migration intentionally does not publish factual/legal pages or reviews:
 * they remain draft/inactive until the source pack is approved.
 */

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::json`;
}

function pushSectionUpsert(lines, slug, section) {
  const fields = {
    variant: section.variant || "",
    eyebrow: section.eyebrow || "",
    headline: section.headline || "",
    subheadline: section.subheadline || "",
    body: section.body || "",
    primaryCtaLabel: section.primaryCtaLabel || "",
    primaryCtaUrl: section.primaryCtaUrl || "",
    secondaryCtaLabel: section.secondaryCtaLabel || "",
    secondaryCtaUrl: section.secondaryCtaUrl || "",
    sortOrder: section.sortOrder || 0,
    isActive: section.isActive !== false,
    content: section.content || {},
  };

  lines.push(`
UPDATE page_sections ps SET
  variant = ${sqlString(fields.variant)},
  eyebrow = ${sqlString(fields.eyebrow)},
  headline = ${sqlString(fields.headline)},
  subheadline = ${sqlString(fields.subheadline)},
  body = ${sqlString(fields.body)},
  primary_cta_label = ${sqlString(fields.primaryCtaLabel)},
  primary_cta_url = ${sqlString(fields.primaryCtaUrl)},
  secondary_cta_label = ${sqlString(fields.secondaryCtaLabel)},
  secondary_cta_url = ${sqlString(fields.secondaryCtaUrl)},
  sort_order = ${fields.sortOrder},
  is_active = ${fields.isActive ? "true" : "false"},
  content = ${sqlJson(fields.content)}
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = ${sqlString(slug)}
  AND ps.section_key = ${sqlString(section.sectionKey)};

INSERT INTO page_sections (
  page, section_key, variant, eyebrow, headline, subheadline, body,
  primary_cta_label, primary_cta_url, secondary_cta_label, secondary_cta_url,
  sort_order, is_active, content
)
SELECT sp.id, ${sqlString(section.sectionKey)}, ${sqlString(fields.variant)},
  ${sqlString(fields.eyebrow)}, ${sqlString(fields.headline)}, ${sqlString(fields.subheadline)},
  ${sqlString(fields.body)}, ${sqlString(fields.primaryCtaLabel)},
  ${sqlString(fields.primaryCtaUrl)}, ${sqlString(fields.secondaryCtaLabel)},
  ${sqlString(fields.secondaryCtaUrl)}, ${fields.sortOrder},
  ${fields.isActive ? "true" : "false"}, ${sqlJson(fields.content)}
FROM site_pages sp
WHERE sp.slug = ${sqlString(slug)}
  AND NOT EXISTS (
    SELECT 1 FROM page_sections existing
    WHERE existing.page = sp.id
      AND existing.section_key = ${sqlString(section.sectionKey)}
  );`);
}

const homeSections = [
  {
    sectionKey: "hero",
    variant: "hero.static",
    eyebrow: "I СВОИ · Северодвинск",
    headline: "Б/у Apple‑техника, о которой всё известно до покупки.",
    body: "Реальные фотографии, состояние батареи, история ремонта, отмеченные дефекты, открытая проверка и письменная гарантия 90 дней.",
    primaryCtaLabel: "Смотреть устройства",
    primaryCtaUrl: "/catalog",
    secondaryCtaLabel: "Оценить свою технику",
    secondaryCtaUrl: "/trade",
    sortOrder: 1,
    content: {
      assurance: ["Реальные фото", "Проверка при посетителе", "Гарантия 90 дней"],
      visual: {
        image_alt: "Проверенный смартфон Apple на светлой студийной поверхности",
      },
      passport: {
        aria_label: "Пример Passport устройства",
        device: "iPhone 13 Pro",
        sub: "256 GB · графитовый",
        grade: "A−",
        grade_label: "Грейд",
        rows: [
          { label: "Батарея", value: "89%", state: "ok" },
          { label: "Ремонт", value: "указан в Passport", state: "ok" },
          { label: "Face ID", value: "проверен", state: "ok" },
          { label: "Дефекты", value: "отмечены на фото", state: "warn" },
        ],
        exit_label: "Предварительная стоимость при обновлении через 6 месяцев",
        exit_value: "после повторной диагностики",
        warranty: "Гарантия",
        warranty_strong: "90 дней",
      },
    },
  },
  {
    sectionKey: "trust",
    variant: "trust.strip",
    eyebrow: "До оплаты",
    headline: "Что вы узнаете об устройстве заранее.",
    body: "Факты собраны в карточке и Passport — без обещаний со слов продавца.",
    sortOrder: 2,
    content: {
      items: [
        { title: "Состояние", text: "Грейд и все заметные дефекты." },
        { title: "Батарея и функции", text: "Результаты диагностики основных узлов." },
        { title: "Ремонт", text: "Подтверждённая история вмешательств." },
        { title: "Гарантия", text: "Письменные условия на 90 дней." },
      ],
    },
  },
  {
    sectionKey: "catalog_preview",
    variant: "catalog.grid",
    eyebrow: "В наличии",
    headline: "Проверенные устройства Apple.",
    body: "Точная модель, память, цвет, состояние, батарея, ремонт, цена и наличие.",
    primaryCtaLabel: "Смотреть все устройства",
    primaryCtaUrl: "/catalog",
    sortOrder: 3,
    content: { limit: 6, showFilters: false },
  },
  {
    sectionKey: "passport_preview",
    variant: "passport.split",
    eyebrow: "Passport · документ о проверке",
    headline: "Состояние видно до решения о покупке.",
    body: "Дата диагностики, грейд, ремонт, функции и отмеченные дефекты собраны в одном документе.",
    primaryCtaLabel: "Как мы проверяем",
    primaryCtaUrl: "/passport",
    sortOrder: 4,
    content: {
      features: [
        { title: "Дата проверки", text: "Показывает актуальность диагностики." },
        { title: "Функции", text: "Результаты проверок без скрытых допущений." },
        { title: "Дефекты", text: "Связаны с фотографиями устройства." },
      ],
    },
  },
  {
    sectionKey: "store_preview",
    variant: "store.steps",
    eyebrow: "Магазин в Северодвинске",
    headline: "Как проходит покупка.",
    body: "Выберите устройство, проверьте его в магазине и получите документы с гарантией.",
    primaryCtaLabel: "Условия визита",
    primaryCtaUrl: "/store",
    sortOrder: 5,
    content: {
      steps: [
        { title: "Выбор", text: "Смотрите карточку и Passport." },
        { title: "Проверка", text: "Проверяете устройство в магазине." },
        { title: "Документы", text: "Получаете условия сделки и гарантии." },
      ],
    },
  },
  {
    sectionKey: "trade_preview",
    variant: "trade.choices",
    eyebrow: "Trade · продажа или обмен",
    headline: "Оцените свою технику без объявлений.",
    body: "Предварительная оценка уточняется после диагностики. Порядок выплаты и документы — на странице Trade.",
    primaryCtaLabel: "Получить предварительную оценку",
    primaryCtaUrl: "/trade",
    sortOrder: 6,
    content: {
      choices: [
        { title: "Продать", text: "Получить оценку и выбрать способ расчёта." },
        { title: "Обменять", text: "Зачесть устройство при обновлении." },
      ],
    },
  },
  {
    sectionKey: "social_proof",
    variant: "social.proof",
    eyebrow: "Проверяемый опыт",
    headline: "Отзывы покупателей.",
    sortOrder: 7,
    isActive: false,
    content: { testimonials: [] },
  },
  {
    sectionKey: "faq",
    variant: "faq",
    eyebrow: "Коротко о главном",
    headline: "Частые вопросы.",
    sortOrder: 8,
    content: {
      items: [
        {
          title: "Можно проверить устройство перед покупкой?",
          text: "Да. Состояние и основные функции сверяются в магазине до решения о покупке.",
        },
        {
          title: "Что входит в гарантию?",
          text: "Актуальные условия показываются до сделки и фиксируются в документах.",
        },
        {
          title: "Предварительная оценка Trade окончательная?",
          text: "Нет. Итоговая сумма подтверждается после повторной диагностики и проверки комплекта.",
        },
      ],
    },
  },
  {
    sectionKey: "final_cta",
    variant: "final.form",
    eyebrow: "Подбор",
    headline: "Не нашли подходящую модель?",
    body: "Оставьте модель, необязательный бюджет и удобный контакт — предложим доступные варианты.",
    secondaryCtaLabel: "Оценить свою технику",
    secondaryCtaUrl: "/trade",
    sortOrder: 9,
    content: {
      proof: ["по вашему бюджету", "с Passport", "без агрессивных продаж"],
      form: {
        scenario_label: "Что подобрать?",
        scenario_aria_label: "Сценарий подбора",
        scenario_options: ["Найти устройство", "Подобрать несколько вариантов"],
        device_label: "Устройство и бюджет",
        device_placeholder: "Например, iPhone 14 до 55 000 ₽",
        contact_label: "Телефон или Telegram",
        contact_placeholder: "+7 … или @username",
        submit_label: "Получить варианты",
        consent_note: "Отправляя форму, вы соглашаетесь с обработкой данных по правилам сайта.",
        note: "Ответим по указанному контакту.",
      },
      footer_note: "Хорошие вещи проходят через своих.",
    },
  },
];

const draftPages = [
  ["about", "О продавце и команде"],
  ["contacts", "Контакты и магазин в Северодвинске"],
  ["warranty", "Гарантия и возврат"],
  ["payment", "Оплата и получение"],
  ["privacy", "Обработка персональных данных"],
  ["terms", "Условия продажи"],
];

const lines = [
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '30s';",
  "",
  "-- additive schema; old application versions ignore these nullable columns",
  "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS business_hours varchar(240);",
  "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS map_url text;",
  "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS legal_name text;",
  "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS inn varchar(32);",
  "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS ogrn varchar(32);",
  "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS privacy_url text;",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS brand varchar(120) DEFAULT 'Apple';",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS year integer;",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS model_identifier varchar(160);",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS region varchar(120);",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS sim varchar(160);",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_cycles integer;",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS diagnostic_date date;",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS activation_lock varchar(160);",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS mdm varchar(160);",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS completeness text;",
  "ALTER TABLE devices ADD COLUMN IF NOT EXISTS diagnostic_by varchar(200);",
  "",
  "-- P0 public copy and global CTA",
  "UPDATE site_settings SET brand_name = 'I СВОИ', header_cta_label = 'Смотреть устройства', header_cta_url = '/catalog';",
  "UPDATE page_sections SET content = jsonb_set((content::jsonb #- '{form,note}'), '{form,note}', to_jsonb('Ответим по указанному контакту.'::text), true)::json WHERE section_key = 'final_cta';",
  "UPDATE navigation_items SET custom_url = '/passport', url = '/passport', section_anchor = NULL WHERE coalesce(custom_url, url) = '/store#diagnostics';",
  "UPDATE navigation_items SET custom_url = '/#final', url = '/#final', section_anchor = NULL WHERE coalesce(custom_url, url) = '/store#final';",
  "UPDATE navigation_items SET is_active = false WHERE location = 'header' AND (lower(label) = 'club' OR coalesce(custom_url, url) = '/club');",
  "UPDATE navigation_items SET label = 'Смотреть устройства', custom_url = '/catalog', url = '/catalog', section_anchor = NULL WHERE location = 'header' AND item_role = 'cta';",
  "UPDATE navigation_items SET label = 'Club — пилот' WHERE location = 'footer' AND (lower(label) = 'club' OR coalesce(custom_url, url) = '/club');",
  "UPDATE devices SET brand = 'Apple' WHERE nullif(brand, '') IS NULL;",
  "UPDATE devices SET exit_text = replace(exit_text, 'Ориентир выхода', 'Предварительная стоимость при обновлении') WHERE exit_text LIKE '%Ориентир выхода%';",
  "UPDATE device_passports SET exit_note = concat_ws(' ', nullif(exit_note, ''), 'Итоговая стоимость подтверждается после повторной диагностики.') WHERE coalesce(exit_note, '') NOT LIKE '%повторн%диагност%';",
  "",
  "-- iPhone 14: structured Passport is canonical; remove free-text repair claims",
  "UPDATE device_passports SET story_body = 'История ремонта указана в структурированном Passport по результатам диагностики.', story_facts = '[]'::json WHERE device = 'iphone-14' AND (lower(coalesce(story_body, '')) LIKE '%ремонт%' OR lower(coalesce(story_body, '')) LIKE '%сервис%');",
  "",
  "INSERT INTO site_pages (slug, template, status, title, meta_description) VALUES ('home', 'home', 'published', 'I СВОИ — проверенная б/у Apple‑техника', 'Б/у Apple‑техника с реальными фото, диагностикой, историей ремонта и письменной гарантией 90 дней.') ON CONFLICT (slug) DO UPDATE SET template = EXCLUDED.template, title = EXCLUDED.title, meta_description = EXCLUDED.meta_description;",
];

for (const section of homeSections) pushSectionUpsert(lines, "home", section);

lines.push(`
UPDATE page_sections ps
SET is_active = false
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'home'
  AND ps.section_key IN ('market_tension', 'circle_rules', 'path_router', 'club_preview', 'diagnostics_compare');`);

lines.push(`
-- Supporting commercial pages: branded names are explained on first mention.
UPDATE site_pages SET
  title = 'Магазин в Северодвинске — I СВОИ',
  meta_description = 'Проверенная б/у Apple‑техника в Северодвинске: осмотр, диагностика, документы и гарантия.'
WHERE slug = 'store';
UPDATE page_sections ps SET
  eyebrow = 'Store · магазин в Северодвинске',
  headline = 'Проверьте устройство до покупки.',
  primary_cta_label = 'Смотреть устройства',
  primary_cta_url = '/catalog',
  secondary_cta_label = 'Как проходит визит',
  secondary_cta_url = '/store'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_hero';

UPDATE site_pages SET
  title = 'Trade — продать или обменять технику',
  meta_description = 'Предварительная оценка техники с уточнением после диагностики: продажа или обмен в I СВОИ.'
WHERE slug = 'trade';
UPDATE page_sections ps SET
  eyebrow = 'Trade · продажа или обмен',
  headline = 'Получите предварительную оценку своей техники.',
  body = 'Итоговая сумма подтверждается после диагностики, проверки комплекта и документов.',
  primary_cta_label = 'Получить предварительную оценку',
  primary_cta_url = '/trade#final'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'trade' AND ps.section_key = 'trade_hero';
UPDATE page_sections ps SET
  headline = 'Получить предварительную оценку',
  body = 'Укажите устройство, состояние и удобный контакт. Итоговая сумма подтверждается после диагностики.',
  content = jsonb_set(
    jsonb_set(coalesce(ps.content::jsonb, '{}'::jsonb), '{form,submit_label}', to_jsonb('Получить предварительную оценку'::text), true),
    '{form,note}', to_jsonb('Ответим по указанному контакту.'::text), true
  )::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'trade' AND ps.section_key = 'final_cta';

UPDATE site_pages SET
  title = 'Passport — как мы проверяем устройства',
  meta_description = 'Методика диагностики, грейды и пример Passport проверенного устройства I СВОИ.'
WHERE slug = 'passport';
UPDATE page_sections ps SET
  eyebrow = 'Passport · документ о проверке',
  headline = 'Что известно об устройстве до покупки.'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'passport' AND ps.section_key = 'passport_hero';

UPDATE site_pages SET
  title = 'Club — пилот I СВОИ',
  meta_description = 'Пилотный формат Club. Условия предоставляются после индивидуального расчёта.'
WHERE slug = 'club';
UPDATE page_sections ps SET
  eyebrow = 'Club · пилот',
  headline = 'Пилотный формат спокойного обновления.',
  body = 'Полные условия и расчёт предоставляются до участия.',
  primary_cta_label = 'Узнать условия пилота',
  primary_cta_url = '/#final',
  secondary_cta_label = '',
  secondary_cta_url = ''
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'club' AND ps.section_key = 'club_hero';
UPDATE page_sections ps SET is_active = false
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'club' AND ps.section_key = 'club_levels';`);

for (const [slug, title] of draftPages) {
  lines.push(`
INSERT INTO site_pages (slug, template, status, title, meta_description)
VALUES (${sqlString(slug)}, 'info', 'draft', ${sqlString(title)}, '')
ON CONFLICT (slug) DO UPDATE SET template = 'info', title = EXCLUDED.title;`);
  pushSectionUpsert(lines, slug, {
    sectionKey: `${slug}_hero`,
    variant: "page.hero",
    eyebrow: "I СВОИ",
    headline: title,
    sortOrder: 1,
    isActive: false,
    content: {},
  });
  pushSectionUpsert(lines, slug, {
    sectionKey: `${slug}_content`,
    variant: "rich.text",
    headline: "",
    body: "",
    sortOrder: 2,
    isActive: false,
    content: {},
  });
}

lines.push(`
INSERT INTO navigation_items (label, url, custom_url, link_type, location, sort, is_active, item_role)
SELECT 'Информация', '#top', '#top', 'custom', 'footer', 4, false, 'group'
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE location = 'footer' AND label = 'Информация' AND item_role = 'group'
);

INSERT INTO navigation_items (label, url, custom_url, link_type, location, parent, sort, is_active, item_role)
SELECT source.label, source.url, source.url, 'custom', 'footer',
  (SELECT id FROM navigation_items WHERE location = 'footer' AND label = 'Информация' AND item_role = 'group' ORDER BY sort LIMIT 1),
  source.sort, false, 'link'
FROM (VALUES
  ('О продавце', '/about', 20),
  ('Контакты', '/contacts', 21),
  ('Гарантия и возврат', '/warranty', 22),
  ('Оплата и получение', '/payment', 23),
  ('Обработка данных', '/privacy', 24),
  ('Условия продажи', '/terms', 25)
) AS source(label, url, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items existing
  WHERE coalesce(existing.custom_url, existing.url) = source.url
    AND existing.location = 'footer'
);

-- Draft pages remain non-public until facts and legal copy are approved.
UPDATE page_sections ps
SET is_active = false
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug IN ('about', 'contacts', 'warranty', 'payment', 'privacy', 'terms')
  AND sp.status <> 'published';

SELECT 'conversion_v2.home_active_sections' AS check_name, count(*)::text AS value
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'home' AND ps.is_active = true
UNION ALL
SELECT 'conversion_v2.prototype_copy', count(*)::text
FROM page_sections
WHERE coalesce(body, '') ~* 'Прототип|в реальном запуске|CRM'
   OR content::text ~* 'Прототип|в реальном запуске|CRM'
UNION ALL
SELECT 'conversion_v2.header_club', count(*)::text
FROM navigation_items
WHERE location = 'header' AND is_active = true
  AND (lower(label) = 'club' OR coalesce(custom_url, url) = '/club');

COMMIT;`);

process.stdout.write(`${lines.join("\n")}\n`);
