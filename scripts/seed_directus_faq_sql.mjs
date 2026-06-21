#!/usr/bin/env node
/**
 * Print idempotent SQL that seeds reusable FAQ items in Directus.
 *
 * Usage:
 *   node scripts/seed_directus_faq_sql.mjs > /tmp/isvoi_seed_directus_faq_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_seed_directus_faq_sql.sql
 */

const items = [
  {
    key: "general-warranty",
    category: "general",
    page: null,
    sort: 10,
    question: "Есть ли гарантия на устройства?",
    answer: "Да. Устройства продаются с письменной гарантией. Срок и условия указаны в карточке и Passport конкретной вещи.",
  },
  {
    key: "general-payment",
    category: "general",
    page: null,
    sort: 20,
    question: "Как можно оплатить покупку?",
    answer: "Доступные способы оплаты лучше уточнить перед визитом. Мы заранее подтверждаем итоговую цену, комплектацию и условия.",
  },
  {
    key: "general-city",
    category: "general",
    page: null,
    sort: 30,
    question: "Где проходит проверка и передача?",
    answer: "Основной сценарий — спокойная очная проверка в Store. Так можно увидеть состояние, Passport и комплектацию до решения.",
  },
  {
    key: "catalog-reserve",
    category: "catalog",
    page: null,
    sort: 10,
    question: "Можно ли забронировать устройство?",
    answer: "Да, если устройство доступно. В карточке статус помогает понять, свободна вещь, забронирована или уже продана.",
  },
  {
    key: "catalog-photos",
    category: "catalog",
    page: null,
    sort: 20,
    question: "Фотографии в каталоге реальные?",
    answer: "Для товарных карточек используются фотографии конкретного устройства. Если фото ещё на проверке, карточка остаётся в подготовке.",
  },
  {
    key: "catalog-status",
    category: "catalog",
    page: null,
    sort: 30,
    question: "Почему устройство исчезло из каталога?",
    answer: "Обычно это значит, что вещь продана, забронирована или временно скрыта до уточнения состояния, цены или фото.",
  },
  {
    key: "store-visit",
    category: "store",
    page: "store",
    sort: 10,
    question: "Нужно ли записываться в Store заранее?",
    answer: "Лучше написать заранее: так мы подготовим нужные устройства, проверим актуальность статуса и спокойно выделим время.",
  },
  {
    key: "store-check",
    category: "store",
    page: "store",
    sort: 20,
    question: "Можно ли проверить устройство при мне?",
    answer: "Да. Смысл Store в открытой проверке: состояние, функции и комплектация обсуждаются до покупки, а не после.",
  },
  {
    key: "store-choice",
    category: "store",
    page: "store",
    sort: 30,
    question: "Помогаете подобрать устройство под задачу?",
    answer: "Да. Мы отталкиваемся от сценария владения, бюджета, состояния и будущей цены выхода, а не только от модели.",
  },
  {
    key: "trade-assessment",
    category: "trade",
    page: "trade",
    sort: 10,
    question: "Как оценивается моё устройство?",
    answer: "Сначала проверяем модель, память, состояние, батарею, ремонт, комплект и спрос. После этого предлагаем понятный сценарий выхода.",
  },
  {
    key: "trade-options",
    category: "trade",
    page: "trade",
    sort: 20,
    question: "Можно выбрать не только выкуп?",
    answer: "Да. Возможны быстрый выкуп, комиссия или зачёт устройства при обновлении. Подходящий вариант зависит от сроков и цели.",
  },
  {
    key: "trade-documents",
    category: "trade",
    page: "trade",
    sort: 30,
    question: "Что нужно принести для оценки?",
    answer: "Принесите само устройство, зарядку или комплект при наличии, документы о покупке, если они сохранились, и снимите блокировки.",
  },
  {
    key: "trade-time",
    category: "trade",
    page: "trade",
    sort: 40,
    question: "Сколько занимает оценка?",
    answer: "Базовая проверка обычно проходит быстро, но точное время зависит от устройства, состояния и количества вопросов по истории.",
  },
  {
    key: "passport-what",
    category: "passport",
    page: "passport",
    sort: 10,
    question: "Что такое ISVOI Passport?",
    answer: "Это понятная история вещи: состояние, проверка, следы ремонта, гарантия и ориентир цены выхода простым языком.",
  },
  {
    key: "passport-after-purchase",
    category: "passport",
    page: "passport",
    sort: 20,
    question: "Что если дефект нашли после покупки?",
    answer: "Письменная гарантия покрывает функциональные неисправности, которые не были зафиксированы в Passport и не связаны с новым повреждением.",
  },
  {
    key: "passport-exit-price",
    category: "passport",
    page: "passport",
    sort: 30,
    question: "Почему цена выхода не обещание выкупа?",
    answer: "Итог зависит от состояния при повторной проверке, спроса, комплектации и времени. Passport даёт ориентир, а не слепое обещание.",
  },
  {
    key: "passport-diagnostics",
    category: "passport",
    page: "passport",
    sort: 40,
    question: "Можно ли посмотреть диагностику?",
    answer: "Да. Проверка проходит открыто: можно увидеть, какие функции проверены и какие замечания попали в Passport.",
  },
  {
    key: "passport-warranty",
    category: "passport",
    page: "passport",
    sort: 50,
    question: "Гарантия одинаковая для всех устройств?",
    answer: "Нет. Условия зависят от категории, состояния и конкретной вещи. Смотрите гарантийный блок в Passport и карточке устройства.",
  },
  {
    key: "club-what",
    category: "club",
    page: "club",
    sort: 10,
    question: "Что даёт ISVOI Club?",
    answer: "Club помогает владеть вещью спокойнее: понятное обновление, приоритетная проверка, история устройства и сценарий выхода.",
  },
  {
    key: "club-upgrade",
    category: "club",
    page: "club",
    sort: 20,
    question: "Можно обновляться на следующую модель?",
    answer: "Да. Идея Upgrade — заранее понимать состояние текущей вещи и доплату до следующей, без случайной продажи на стороне.",
  },
  {
    key: "club-exit",
    category: "club",
    page: "club",
    sort: 30,
    question: "Что значит цена выхода в Club?",
    answer: "Это ориентир, по которому вещь может пойти дальше через круг ISVOI после повторной проверки и подтверждения состояния.",
  },
  {
    key: "club-conditions",
    category: "club",
    page: "club",
    sort: 40,
    question: "Условия Club одинаковые для всех?",
    answer: "Нет. Условия зависят от устройства, состояния, выбранного уровня и сценария владения. Их лучше уточнить перед вступлением.",
  },
];

function sql(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const lines = [
  "BEGIN;",
  "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
  "",
  "CREATE TABLE IF NOT EXISTS faq_items (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid()",
  ");",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS key varchar(160);",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS question text;",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS answer text;",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS page uuid;",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS category varchar(64);",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS sort integer DEFAULT 100;",
  "ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;",
  "CREATE INDEX IF NOT EXISTS faq_items_key_idx ON faq_items (key);",
  "CREATE INDEX IF NOT EXISTS faq_items_category_sort_idx ON faq_items (category, sort);",
  "",
  "DO $$",
  "BEGIN",
  "  IF NOT EXISTS (",
  "    SELECT 1 FROM information_schema.table_constraints",
  "    WHERE table_schema = 'public'",
  "      AND table_name = 'faq_items'",
  "      AND constraint_name = 'faq_items_page_fkey'",
  "  ) THEN",
  "    ALTER TABLE faq_items",
  "      ADD CONSTRAINT faq_items_page_fkey",
  "      FOREIGN KEY (page) REFERENCES site_pages(id) ON DELETE SET NULL;",
  "  END IF;",
  "END;",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION isvoi_seed_faq_item(",
  "  p_key text,",
  "  p_category text,",
  "  p_page_slug text,",
  "  p_sort integer,",
  "  p_question text,",
  "  p_answer text",
  ") RETURNS void",
  "LANGUAGE plpgsql",
  "AS $$",
  "DECLARE",
  "  v_page uuid;",
  "BEGIN",
  "  SELECT id INTO v_page FROM site_pages WHERE slug = p_page_slug LIMIT 1;",
  "",
  "  UPDATE faq_items",
  "  SET category = p_category,",
  "    page = v_page,",
  "    sort = p_sort,",
  "    question = p_question,",
  "    answer = p_answer,",
  "    is_active = true",
  "  WHERE key = p_key;",
  "",
  "  IF NOT FOUND THEN",
  "    INSERT INTO faq_items (id, key, category, page, sort, question, answer, is_active)",
  "    VALUES (gen_random_uuid(), p_key, p_category, v_page, p_sort, p_question, p_answer, true);",
  "  END IF;",
  "END;",
  "$$;",
];

for (const item of items) {
  lines.push("");
  lines.push(
    `SELECT isvoi_seed_faq_item(${sql(item.key)}, ${sql(item.category)}, ${sql(item.page)}, ${item.sort}, ${sql(item.question)}, ${sql(item.answer)});`,
  );
}

lines.push("");
lines.push("DROP FUNCTION isvoi_seed_faq_item(text, text, text, integer, text, text);");
lines.push("");
lines.push("SELECT 'faq_seed.total_active' AS check_name, count(*)::text AS value");
lines.push("FROM faq_items");
lines.push("WHERE is_active = true");
lines.push("UNION ALL");
lines.push("SELECT 'faq_seed.seeded_keys', count(*)::text");
lines.push("FROM faq_items");
lines.push(`WHERE key IN (${items.map((item) => sql(item.key)).join(", ")})`);
lines.push("UNION ALL");
lines.push("SELECT 'faq_seed.with_page', count(*)::text");
lines.push("FROM faq_items");
lines.push("WHERE is_active = true AND page IS NOT NULL;");
lines.push("");
lines.push("COMMIT;");

process.stdout.write(`${lines.join("\n")}\n`);
