#!/usr/bin/env node

/**
 * Forward-only consistency pass after conversion_v2.
 *
 * The migration aligns supporting pages with the commercial promise established
 * on the homepage. It is idempotent and deliberately avoids publishing draft
 * information pages or unverified social proof.
 */

process.stdout.write(String.raw`
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Global positioning and footer journey.
UPDATE site_settings
SET
  footer_note = 'I СВОИ — проверенная б/у Apple‑техника с открытой диагностикой и письменной гарантией. Наличие, цены и состояние подтверждаются перед сделкой.',
  footer_brand_text = 'Б/у Apple‑техника с прозрачной историей. Хорошие вещи проходят через своих. Северодвинск.';

UPDATE navigation_items
SET label = 'Навигация'
WHERE location = 'footer'
  AND item_role = 'group'
  AND label = 'Клуб';

UPDATE navigation_items
SET label = 'Магазин в Северодвинске'
WHERE location = 'footer'
  AND coalesce(custom_url, url) = '/store';

UPDATE navigation_items
SET label = 'Как мы проверяем'
WHERE location = 'footer'
  AND coalesce(custom_url, url) = '/passport';

UPDATE navigation_items
SET label = 'Trade — продать или обменять'
WHERE location = 'footer'
  AND coalesce(custom_url, url) = '/trade';

UPDATE navigation_items
SET label = 'Смотреть устройства', url = '/catalog', custom_url = '/catalog', section_anchor = NULL
WHERE location = 'footer'
  AND label = 'Найти вещь в кругу';

UPDATE navigation_items
SET label = 'Как мы проверяем', url = '/passport', custom_url = '/passport', section_anchor = NULL
WHERE location = 'footer'
  AND label = 'Записаться на проверку';

UPDATE navigation_items
SET label = 'Получить предварительную оценку', url = '/trade#final', custom_url = '/trade#final', section_anchor = NULL
WHERE location = 'footer'
  AND label = 'Передать вещь дальше';

UPDATE navigation_items
SET label = 'Магазин в Северодвинске', url = '/store', custom_url = '/store', section_anchor = NULL
WHERE location = 'footer'
  AND label = 'Северодвинск';

-- Catalog: a product catalog, not a second Store or a Club entry point.
UPDATE site_pages
SET
  title = 'Каталог проверенной б/у Apple‑техники — I СВОИ',
  meta_description = 'Проверенная б/у Apple‑техника: реальные фото, состояние, батарея, известный ремонт, цена и наличие.'
WHERE slug = 'catalog';

UPDATE page_sections ps
SET
  eyebrow = 'I СВОИ · Каталог',
  headline = 'Проверенная б/у Apple‑техника в наличии.',
  body = 'Реальные фото, грейд, батарея, известный ремонт, цена и наличие. Подробности проверки — в карточке устройства.',
  primary_cta_label = 'Получить варианты',
  primary_cta_url = '/#final',
  secondary_cta_label = 'Магазин в Северодвинске',
  secondary_cta_url = '/store',
  content = jsonb_set(
    jsonb_set(
      coalesce(ps.content::jsonb, '{}'::jsonb),
      '{filters}',
      '[{"label":"Все","value":"all"},{"label":"iPhone","value":"iphone"},{"label":"MacBook","value":"macbook"},{"label":"iPad","value":"ipad"}]'::jsonb,
      true
    ),
    '{emptyState}',
    '{"headline":"Каталог скоро обновится.","body":"Сейчас нет опубликованных устройств. Оставьте модель и контакт — предложим доступные варианты.","ctaLabel":"Получить варианты","ctaUrl":"/#final"}'::jsonb,
    true
  )::json
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'catalog'
  AND ps.section_key = 'catalog_page_live';

-- Device cards and product details use one explicit preliminary-value term.
UPDATE devices
SET
  cta_label = 'Смотреть устройство',
  short_description = CASE
    WHEN coalesce(short_description, '') ~* 'ориентир выхода|цена выхода'
      AND coalesce(short_description, '') !~* 'после повторной диагностик' THEN
      regexp_replace(
        regexp_replace(
          regexp_replace(short_description, 'ориентир выхода', 'предварительная стоимость при обновлении', 'gi'),
          'цена выхода',
          'предварительная стоимость при обновлении',
          'gi'
        ),
        '\.$',
        ''
      ) || ' после повторной диагностики.'
    WHEN coalesce(short_description, '') ~* 'ориентир выхода|цена выхода' THEN
      regexp_replace(
        regexp_replace(short_description, 'ориентир выхода', 'предварительная стоимость при обновлении', 'gi'),
        'цена выхода',
        'предварительная стоимость при обновлении',
        'gi'
      )
    ELSE short_description
  END,
  exit_text = CASE
    WHEN nullif(exit_text, '') IS NULL THEN exit_text
    WHEN exit_text ~* 'после повторной диагностик' THEN
      regexp_replace(exit_text, 'ориентир выхода', 'Предварительная стоимость при обновлении', 'gi')
    ELSE
      regexp_replace(exit_text, 'ориентир выхода', 'Предварительная стоимость при обновлении', 'gi')
      || ' после повторной диагностики'
  END
WHERE status = 'published';

UPDATE device_passports
SET
  exit_headline = regexp_replace(
    coalesce(exit_headline, ''),
    'ориентир выхода|цена выхода',
    'Предварительная стоимость при обновлении',
    'gi'
  ),
  exit_note = regexp_replace(
    coalesce(exit_note, ''),
    'ориентир выхода|цена выхода',
    'Предварительная стоимость при обновлении',
    'gi'
  );

UPDATE device_page_settings
SET
  warranty_title = 'Гарантия и условия обновления',
  exit_price_label = 'Предварительная стоимость при обновлении',
  trade_value_prefix = 'Предварительная оценка',
  trade_cta_label = 'Получить предварительную оценку';

-- iPhone 14: structured repair value is canonical; remove the contradictory
-- "no opening traces" statement from free copy.
UPDATE device_passports
SET condition_note = 'Устройство в почти безупречном состоянии. История обслуживания отражена в Passport. Корпус и экран без значимых повреждений.'
WHERE device = 'iphone-14'
  AND lower(coalesce(repair, '')) ~ 'сервис|ремонт|замен'
  AND lower(coalesce(condition_note, '')) ~ 'не вскрыв|следов вскрытия нет|без ремонт';

-- Store: remove Club from the purchase path and keep each CTA task-specific.
UPDATE page_sections ps
SET
  body = 'Store — магазин, где до решения видны состояние, нюансы, известная история ремонта и гарантия устройства.',
  secondary_cta_label = 'Как мы проверяем',
  secondary_cta_url = '/passport'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_hero';

UPDATE page_sections ps
SET
  headline = 'Проверку устройства показывают открыто.',
  body = 'На встрече можно осмотреть устройство, сверить Passport и задать вопросы до решения о покупке.'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_location';

UPDATE page_sections ps
SET
  body = 'Store помогает быстро выбрать сценарий: посмотреть устройство с Passport, понять результаты проверки или получить предварительную оценку своей техники.',
  content = jsonb_set(
    coalesce(ps.content::jsonb, '{}'::jsonb),
    '{items}',
    '[
      {"title":"Хочу купить без риска","text":"Смотрите устройства с Passport, гарантией и отмеченными нюансами до разговора с менеджером.","badge":"Покупка","url":"/catalog","label":"Смотреть устройства"},
      {"title":"Хочу обновиться","text":"Выберите следующее устройство и получите предварительную оценку своей техники после диагностики.","badge":"Trade","url":"/trade#final","label":"Получить предварительную оценку"},
      {"title":"Хочу понять результаты проверки","text":"Показываем, что входит в Passport, как читается грейд и где зафиксированы дефекты.","badge":"Passport","url":"/passport","label":"Как мы проверяем"}
    ]'::jsonb,
    true
  )::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_decision';

UPDATE page_sections ps
SET
  body = 'Каждая зона решает свою задачу: выбор устройства, открытая проверка, предварительная оценка и оформление документов.',
  content = jsonb_set(
    coalesce(ps.content::jsonb, '{}'::jsonb),
    '{items}',
    '[
      {"title":"Проверенная витрина","text":"Устройства представлены с грейдом, Passport, гарантией и известными нюансами.","badge":"01"},
      {"title":"Стол открытой проверки","text":"Показываем при вас, что именно проверено и в каком состоянии.","badge":"02"},
      {"title":"Предварительная оценка","text":"Диагностика вашей техники и расчёт продажи или обмена без объявлений и торга.","badge":"03"},
      {"title":"Документы и гарантия","text":"Перед покупкой показываем письменные условия сделки и гарантии.","badge":"04"}
    ]'::jsonb,
    true
  )::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_offer';

UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{steps}',
  '[
    {"title":"Записаться или прийти","text":"Договоритесь о времени или зайдите в Store — встретим и сориентируем без спешки."},
    {"title":"Выбрать или принести","text":"Выберите устройство из каталога или принесите свою технику для предварительной оценки."},
    {"title":"Открытая проверка","text":"Проверяем при вас экран, корпус, аккумулятор, известные ремонты и следы влаги."},
    {"title":"Решение","text":"Заберите устройство с Passport и документами или получите предварительную оценку своей техники."}
  ]'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_steps';

UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{comparison}',
  '{
    "label_header":"Что сравниваем",
    "bad_header":"Случайный рынок",
    "good_header":"I СВОИ Store",
    "rows":[
      {"label":"История устройства","bad":"неизвестна","good":"зафиксирована в Passport"},
      {"label":"Проверка","bad":"со слов продавца","good":"открытая, при вас"},
      {"label":"Гарантия","bad":"обычно нет","good":"письменные условия"},
      {"label":"Обновление","bad":"условия неизвестны","good":"предварительная стоимость после повторной диагностики"}
    ]
  }'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_compare';

UPDATE page_sections ps
SET
  headline = 'Посмотрите устройство в магазине.',
  body = 'Выберите модель в каталоге — после заявки подтвердим наличие и время просмотра.',
  primary_cta_label = 'Смотреть устройства',
  primary_cta_url = '/catalog',
  secondary_cta_label = 'Получить предварительную оценку',
  secondary_cta_url = '/trade#final'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'final_cta';

UPDATE page_sections ps
SET
  body = 'Показываем ближайшие проверенные варианты. В полном каталоге можно сравнить состояние, батарею, известный ремонт, цену и наличие.',
  secondary_cta_label = 'Получить варианты',
  secondary_cta_url = '/#final'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'store' AND ps.section_key = 'store_curated_catalog';

-- Trade keeps every transactional CTA on its own form and repairs the form copy.
UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{items}',
  '[
    {"title":"Быстрый выкуп","text":"Подходит, когда нужна оплата после проверки и согласования итоговой суммы.","badge":"01","url":"/trade#final","label":"Получить предварительную оценку"},
    {"title":"Комиссия","text":"Подходит, если готовы ждать покупателя и заранее согласовать условия комиссии.","badge":"02","url":"/trade#final","label":"Обсудить комиссию"},
    {"title":"Обновление","text":"Предварительная оценка текущего устройства и расчёт доплаты до следующего.","badge":"03","url":"/trade#final","label":"Рассчитать обновление"}
  ]'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'trade' AND ps.section_key = 'trade_paths';

UPDATE page_sections ps
SET
  body = 'Берём актуальную карточку Store как цель обновления: цена и состояние уже известны, а стоимость вашей техники уточняется после открытой диагностики.',
  primary_cta_label = 'Получить предварительную оценку',
  primary_cta_url = '/trade#final'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'trade' AND ps.section_key = 'trade_live_example';

UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{comparison}',
  '{
    "label_header":"Что сравниваем",
    "bad_header":"Объявления",
    "good_header":"Trade в I СВОИ",
    "rows":[
      {"label":"Покупатель","bad":"поиск и ожидание","good":"предложение после диагностики"},
      {"label":"Торг","bad":"переписки и встречи","good":"согласованные условия в Store"},
      {"label":"Состояние","bad":"споры после осмотра","good":"открытая диагностика"},
      {"label":"Обновление","bad":"сначала продай, потом ищи","good":"предварительный расчёт доплаты"}
    ]
  }'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'trade' AND ps.section_key = 'trade_compare';

UPDATE page_sections ps
SET
  content = jsonb_set(
    jsonb_set(
      coalesce(ps.content::jsonb, '{}'::jsonb),
      '{proof}',
      '["предварительно — до визита","итог — после диагностики","без обязательств"]'::jsonb,
      true
    ),
    '{form}',
    '{
      "scenario_label":"Что хотите сделать?",
      "scenario_aria_label":"Сценарий Trade",
      "scenario_options":["Продать устройство","Обменять с доплатой","Передать на комиссию"],
      "device_label":"Модель и состояние",
      "device_placeholder":"Например, iPhone 13 Pro, батарея 86%, есть царапина",
      "contact_label":"Телефон или Telegram",
      "contact_placeholder":"+7 … или @username",
      "submit_label":"Получить предварительную оценку",
      "consent_note":"Отправляя форму, вы соглашаетесь с обработкой контакта для ответа по заявке.",
      "note":"Ответим по указанному контакту."
    }'::jsonb,
    true
  )::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'trade' AND ps.section_key = 'final_cta';

UPDATE page_sections ps
SET
  primary_cta_url = '/trade#final'
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'trade'
  AND ps.is_active = true
  AND coalesce(ps.primary_cta_url, '') = '/#final';

-- Passport explains facts first and uses the same preliminary-value language.
UPDATE site_pages
SET meta_description = 'I СВОИ Passport: состояние, диагностика, известная история ремонта, отмеченные дефекты и гарантия устройства.'
WHERE slug = 'passport';

UPDATE page_sections ps
SET body = 'I СВОИ Passport показывает состояние, результаты диагностики, известную историю ремонта, дефекты и гарантию устройства. Не «как новая», а честно проверенная.'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'passport' AND ps.section_key = 'passport_hero';

UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{items}',
  '[
    {"title":"Состояние и грейд","text":"Корпус, экран и общий вид по понятной шкале.","badge":"01"},
    {"title":"Батарея","text":"Ёмкость или циклы и доступные признаки износа.","badge":"02"},
    {"title":"Ремонт","text":"Известные вмешательства и результаты проверки.","badge":"03"},
    {"title":"Функции","text":"Камеры, связь, биометрия, динамики и датчики.","badge":"04"},
    {"title":"Гарантия","text":"Письменные условия, показанные до сделки.","badge":"05"},
    {"title":"Предварительная стоимость при обновлении","text":"Уточняется после повторной диагностики и не является обещанием выкупа.","badge":"06"}
  ]'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'passport' AND ps.section_key = 'passport_explainer';

UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{steps}',
  '[
    {"title":"Осмотр","text":"Фиксируем корпус, экран, комплектность и доступные признаки подлинности."},
    {"title":"Диагностика","text":"Тестируем аккумулятор, функции, связь, камеры и датчики."},
    {"title":"Фиксация дефектов","text":"Все найденные нюансы вносим в Passport, даже если они снижают цену."},
    {"title":"Решение","text":"Получаете Passport, грейд и зафиксированные результаты проверки."}
  ]'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'passport' AND ps.section_key = 'passport_steps';

UPDATE page_sections ps
SET
  body = 'Каждое устройство в I СВОИ проходит проверку и получает понятную историю. Предварительная стоимость при обновлении подтверждается повторной диагностикой.'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'passport' AND ps.section_key = 'final_cta';

UPDATE page_sections ps
SET content = '{
  "items": [
    {
      "title": "Что если дефект нашли после покупки?",
      "text": "Письменная гарантия покрывает функциональные неисправности, не зафиксированные в Passport."
    },
    {
      "title": "Почему предварительная стоимость при обновлении не окончательная?",
      "text": "Итог зависит от состояния при повторной диагностике, спроса и комплектации."
    },
    {
      "title": "Можно ли посмотреть диагностику?",
      "text": "Да. Проверка проходит открыто в Store."
    }
  ]
}'::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'passport' AND ps.section_key = 'faq';

-- Club remains a clearly labelled pilot without unverified plan/rating claims.
UPDATE page_sections ps
SET
  headline = 'Пилот обсуждается вокруг конкретного устройства.',
  body = 'Показываем Passport устройства и отдельно рассчитываем условия участия. До подтверждения расчёта никаких обязательств нет.',
  primary_cta_label = 'Узнать условия пилота',
  primary_cta_url = '/#final'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'club' AND ps.section_key = 'club_live_example';

UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{steps}',
  '[
    {"title":"Выбираете устройство","text":"Подбираем проверенное устройство под вашу задачу."},
    {"title":"Изучаете Passport","text":"Видите состояние, известную историю ремонта и гарантию."},
    {"title":"Получаете расчёт пилота","text":"Стоимость, сроки и обязательства показываем до участия."},
    {"title":"Принимаете решение","text":"Можно отказаться или согласовать участие на подтверждённых условиях."}
  ]'::jsonb,
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'club' AND ps.section_key = 'club_steps';

UPDATE page_sections ps
SET is_active = false
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.slug = 'club'
  AND ps.section_key IN ('club_levels', 'club_rating', 'club_compare');

UPDATE page_sections ps
SET
  eyebrow = 'Условия пилота',
  headline = 'Что важно понять до участия.',
  content = '{
    "items": [
      {
        "title": "Club — это готовая подписка?",
        "text": "Нет. Это пилотный сценарий вокруг конкретного устройства, его Passport и предполагаемого срока владения."
      },
      {
        "title": "Можно ли заранее узнать итоговые условия?",
        "text": "До участия мы показываем индивидуальный расчёт. Условия вступают в силу только после отдельного подтверждения."
      },
      {
        "title": "Предварительная стоимость при обновлении окончательная?",
        "text": "Нет. Итог зависит от состояния устройства при повторной диагностике, комплектации и спроса."
      }
    ]
  }'::json
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'club' AND ps.section_key = 'faq';

UPDATE page_sections ps
SET
  headline = 'Обсудите участие в пилоте.',
  body = 'Подберём устройство, покажем Passport и подготовим индивидуальный расчёт. Решение — только после знакомства с условиями.',
  primary_cta_label = 'Узнать условия пилота',
  primary_cta_url = '/#final',
  secondary_cta_label = 'Смотреть устройства',
  secondary_cta_url = '/catalog'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'club' AND ps.section_key = 'final_cta';

-- Repair any legacy encoding placeholders in CTA consent copy without changing
-- the page-specific form fields or scenario.
UPDATE page_sections ps
SET content = jsonb_set(
  coalesce(ps.content::jsonb, '{}'::jsonb),
  '{form,consent_note}',
  to_jsonb('Отправляя форму, вы соглашаетесь с обработкой контакта для ответа по заявке.'::text),
  true
)::json
FROM site_pages sp
WHERE ps.page = sp.id
  AND sp.status = 'published'
  AND ps.is_active = true
  AND ps.section_key = 'final_cta';

-- Managed FAQ copy follows the same terminology and pilot limitations.
UPDATE faq_items
SET
  question = 'Почему предварительная стоимость при обновлении не окончательная?',
  answer = 'Итог зависит от состояния при повторной диагностике, спроса и комплектации. Предварительный расчёт не является обещанием выкупа.'
WHERE key = 'passport-exit-price';

UPDATE faq_items
SET answer = 'Это понятная история устройства: состояние, диагностика, известные ремонты, отмеченные дефекты и гарантия простым языком.'
WHERE key = 'passport-what';

UPDATE faq_items
SET
  question = 'Что такое пилот I СВОИ Club?',
  answer = 'Это тестовый формат обновления вокруг конкретного проверенного устройства. Стоимость, сроки и обязательства рассчитываются индивидуально и показываются до участия.'
WHERE key = 'club-what';

UPDATE faq_items
SET
  question = 'Можно ли заранее узнать условия обновления?',
  answer = 'Да. До участия вы получите индивидуальный расчёт. Итоговая стоимость техники подтверждается после диагностики.'
WHERE key = 'club-upgrade';

UPDATE faq_items
SET
  question = 'Предварительная стоимость при обновлении окончательная?',
  answer = 'Нет. Итог зависит от состояния устройства при повторной диагностике, комплектации и спроса.'
WHERE key = 'club-exit';

UPDATE faq_items
SET
  question = 'Условия пилота одинаковые для всех?',
  answer = 'Нет. Они зависят от конкретного устройства и согласованного сценария. Полный расчёт предоставляется до принятия решения.'
WHERE key = 'club-conditions';

-- Blog index describes the editorial benefit without the retired internal term.
UPDATE site_pages
SET meta_description = 'Практические разборы I СВОИ: диагностика, состояние, батарея, ремонт и спокойная покупка техники с понятной историей.'
WHERE slug = 'blog';

UPDATE page_sections ps
SET body = 'Практические разборы о диагностике, состоянии, батарее и ремонте — без кликбейта и чужой неизвестности.'
FROM site_pages sp
WHERE ps.page = sp.id AND sp.slug = 'blog' AND ps.section_key = 'blog_index_live';

COMMIT;
`);
