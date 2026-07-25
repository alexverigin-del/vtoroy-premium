#!/usr/bin/env node
/**
 * Idempotent QA content for conversion_v2.
 *
 * All inserted copy is explicitly marked as test data and remains non-public:
 * information pages stay draft, their sections stay inactive, and homepage
 * social proof stays inactive.
 */

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const pageBodies = {
  about:
    "<h2>Тестовые данные: команда</h2><p>Это черновик для проверки редактирования страницы в Directus Studio. Перед публикацией замените текст подтверждёнными сведениями о продавце и команде.</p>",
  contacts:
    "<h2>Тестовые данные: визит</h2><p>Адрес: тестовый адрес, Северодвинск. Часы работы: ежедневно, 10:00–19:00. Перед публикацией замените адрес, часы, карту и правила записи подтверждёнными данными.</p>",
  warranty:
    "<h2>Тестовые данные: гарантия и возврат</h2><p>Черновик проверяет rich-text и редакционный процесс. Условия гарантии и возврата должны пройти профильную правовую проверку до публикации.</p>",
  payment:
    "<h2>Тестовые данные: оплата и получение</h2><p>Черновик для проверки структуры страницы. Перед публикацией укажите только реально доступные способы оплаты и получения.</p>",
  privacy:
    "<h2>Тестовые данные: обработка персональных данных</h2><p>Не является политикой обработки данных. Текст должен быть заменён документом, прошедшим профильную правовую проверку.</p>",
  terms:
    "<h2>Тестовые данные: условия продажи</h2><p>Не является офертой или условиями договора. Черновик предназначен только для проверки Directus Studio.</p>",
};

const testimonials = [
  {
    name: "Тестовый клиент 1",
    model: "iPhone · тестовый кейс",
    date: "2026-07-25",
    text: "Тестовый отзыв для проверки карточки и ссылки на источник.",
    sourceLabel: "Тестовый источник",
    sourceUrl: "https://example.com/isvoi-test-review-1",
  },
  {
    name: "Тестовый клиент 2",
    model: "MacBook · тестовый кейс",
    date: "2026-07-25",
    text: "Тестовый отзыв для проверки длинного текста и адаптивной сетки.",
    sourceLabel: "Тестовый источник",
    sourceUrl: "https://example.com/isvoi-test-review-2",
  },
  {
    name: "Тестовый клиент 3",
    model: "iPad · тестовый кейс",
    date: "2026-07-25",
    text: "Тестовый отзыв для проверки третьей карточки social proof.",
    sourceLabel: "Тестовый источник",
    sourceUrl: "https://example.com/isvoi-test-review-3",
  },
];

const lines = [
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '30s';",
  "",
  "UPDATE site_pages SET status = 'draft' WHERE slug IN ('about','contacts','warranty','payment','privacy','terms');",
];

for (const [slug, body] of Object.entries(pageBodies)) {
  lines.push(`
UPDATE page_sections ps
SET body = ${sqlString(body)},
    is_active = false
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = ${sqlString(slug)}
  AND ps.section_key = ${sqlString(`${slug}_content`)};`);
}

lines.push(`
UPDATE page_sections ps
SET is_active = false,
    content = ${sqlString(JSON.stringify({ testimonials }))}::json
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'home'
  AND ps.section_key = 'social_proof';

SELECT 'conversion_v2_test.draft_pages' AS check_name, count(*)::text AS value
FROM site_pages
WHERE slug IN ('about','contacts','warranty','payment','privacy','terms')
  AND status = 'draft'
UNION ALL
SELECT 'conversion_v2_test.inactive_info_sections', count(*)::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug IN ('about','contacts','warranty','payment','privacy','terms')
  AND ps.is_active = false
UNION ALL
SELECT 'conversion_v2_test.inactive_reviews', jsonb_array_length(ps.content::jsonb -> 'testimonials')::text
FROM page_sections ps
JOIN site_pages sp ON sp.id = ps.page
WHERE sp.slug = 'home'
  AND ps.section_key = 'social_proof'
  AND ps.is_active = false;

COMMIT;`);

process.stdout.write(`${lines.join("\n")}\n`);
