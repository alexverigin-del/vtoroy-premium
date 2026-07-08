#!/usr/bin/env node
/**
 * Print idempotent SQL that creates the product detail page template singleton.
 *
 * Usage:
 *   node scripts/setup_directus_device_page_settings_sql.mjs > /tmp/isvoi_device_page_settings.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_device_page_settings.sql
 */

const leadModeDefaults = {
  available: {
    label: "В наличии",
    groupSort: 150,
    kind: "purchase",
    scenario: "Записаться на просмотр",
    title: "Проверить наличие и записаться",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, хочу посмотреть сегодня после 18:00",
    submitLabel: "Записаться на просмотр",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка будет привязана к этой карточке и текущим условиям.",
    successNote: "Заявка принята. Мы свяжемся и подтвердим наличие.",
    errorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
    statusNote: "Устройство сейчас доступно. После заявки мы подтвердим наличие и время просмотра.",
  },
  reserved: {
    label: "Бронь",
    groupSort: 170,
    kind: "purchase",
    scenario: "Встать в лист ожидания по брони",
    title: "Встать в лист ожидания",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, если бронь освободится, готов посмотреть сегодня",
    submitLabel: "Встать в лист ожидания",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка будет привязана к этой карточке и текущему статусу.",
    successNote:
      "Заявка принята. Мы свяжемся, если бронь освободится или появится близкая альтернатива.",
    errorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
    statusNote:
      "Устройство сейчас в брони. Мы не обещаем продажу, но можем поставить вас следующим в очередь.",
  },
  sold: {
    label: "Продано",
    groupSort: 190,
    kind: "selection",
    scenario: "Подобрать похожее устройство",
    title: "Подобрать альтернативу",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, хочу похожий iPhone с таким же объёмом памяти",
    submitLabel: "Подобрать альтернативу",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка сохранит контекст этой карточки, чтобы подбор был точнее.",
    successNote:
      "Заявка принята. Мы предложим похожую вещь из круга или сообщим, когда она появится.",
    errorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
    statusNote: "Эта вещь уже продана. Можно оставить заявку на похожую модель.",
  },
};

const leadFieldSpecs = [
  {
    suffix: "kind",
    db: "varchar",
    interface: "select-dropdown",
    width: "half",
    note: "Тип заявки, который попадёт в leads.kind.",
    translation: "Тип заявки",
    options: `{"choices":[{"text":"Покупка / бронь","value":"purchase"},{"text":"Подбор","value":"selection"}]}`,
  },
  {
    suffix: "scenario",
    db: "varchar",
    interface: "input",
    width: "half",
    note: "Сценарий заявки, который попадёт менеджеру в leads.scenario.",
    translation: "Сценарий",
  },
  {
    suffix: "title",
    db: "varchar",
    interface: "input",
    width: "half",
    note: "Заголовок формы на товарной странице.",
    translation: "Заголовок формы",
  },
  {
    suffix: "contact_placeholder",
    db: "varchar",
    interface: "input",
    width: "half",
    note: "Placeholder поля контакта.",
    translation: "Placeholder контакта",
  },
  {
    suffix: "message_placeholder",
    db: "text",
    interface: "input-multiline",
    width: "full",
    note: "Placeholder поля комментария.",
    translation: "Placeholder комментария",
  },
  {
    suffix: "submit_label",
    db: "varchar",
    interface: "input",
    width: "half",
    note: "Текст кнопки отправки.",
    translation: "Кнопка",
  },
  {
    suffix: "submitting_label",
    db: "varchar",
    interface: "input",
    width: "half",
    note: "Текст кнопки во время отправки.",
    translation: "Кнопка при отправке",
  },
  {
    suffix: "status_note",
    db: "text",
    interface: "input-multiline",
    width: "full",
    note: "Пояснение под заголовком формы для текущего статуса устройства.",
    translation: "Статусный текст",
  },
  {
    suffix: "idle_note",
    db: "text",
    interface: "input-multiline",
    width: "full",
    note: "Текст под формой до отправки.",
    translation: "Текст до отправки",
  },
  {
    suffix: "success_note",
    db: "text",
    interface: "input-multiline",
    width: "full",
    note: "Текст успешной отправки.",
    translation: "Успешная отправка",
  },
  {
    suffix: "error_note",
    db: "text",
    interface: "input-multiline",
    width: "full",
    note: "Текст ошибки отправки.",
    translation: "Ошибка отправки",
  },
];

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function leadColumnName(mode, suffix) {
  return `lead_${mode}_${suffix}`;
}

const leadTextFields = Object.keys(leadModeDefaults).flatMap((mode) =>
  leadFieldSpecs.map((spec) => leadColumnName(mode, spec.suffix)),
);

const leadCreateColumns = Object.entries(leadModeDefaults)
  .flatMap(([mode, values]) =>
    leadFieldSpecs.map((spec) => {
      const valueKey = spec.suffix.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      return `  ${leadColumnName(mode, spec.suffix)} ${spec.db} DEFAULT ${sqlLiteral(values[valueKey])}`;
    }),
  )
  .join(",\n");

const leadAlterColumns = Object.entries(leadModeDefaults)
  .flatMap(([mode, values]) =>
    leadFieldSpecs.map((spec) => {
      const valueKey = spec.suffix.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      return `  ADD COLUMN IF NOT EXISTS ${leadColumnName(mode, spec.suffix)} ${spec.db} DEFAULT ${sqlLiteral(values[valueKey])}`;
    }),
  )
  .join(",\n");

const leadSeedAssignments = Object.entries(leadModeDefaults)
  .flatMap(([mode, values]) =>
    leadFieldSpecs.map((spec) => {
      const valueKey = spec.suffix.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      const column = leadColumnName(mode, spec.suffix);
      return `  ${column} = coalesce(nullif(${column}, ''), ${sqlLiteral(values[valueKey])})`;
    }),
  )
  .join(",\n");

const leadFieldSql = Object.entries(leadModeDefaults)
  .map(([mode, values]) => {
    const group = `group_lead_${mode}`;
    const fields = leadFieldSpecs.map((spec, index) => {
      const options = spec.options ? `'${spec.options}'::json` : "NULL";
      return `SELECT isvoi_upsert_directus_field('device_page_settings', '${leadColumnName(mode, spec.suffix)}', '${spec.interface}', NULL, ${options}, '${spec.width}', ${values.groupSort + index + 1}, '${spec.note}', false, NULL, '${group}', false, false, '${spec.translation}');`;
    });
    return [
      `SELECT isvoi_upsert_directus_field('device_page_settings', '${group}', 'group-detail', NULL, '{"headerIcon":"edit_note","start":"closed"}'::json, 'full', ${values.groupSort}, 'Тексты формы заявки для stock_status=${mode}. Эти поля управляют сайтом и тем, что видит менеджер в сценарии заявки.', false, 'alias,no-data,group', NULL, false, false, 'Форма заявки: ${values.label}');`,
      ...fields,
    ].join("\n");
  })
  .join("\n");

const textFields = [
  "breadcrumb_home_label",
  "breadcrumb_home_href",
  "breadcrumb_catalog_label",
  "breadcrumb_catalog_href",
  "back_label",
  "grade_prefix",
  "updated_prefix",
  "available_label",
  "reserved_label",
  "sold_label",
  "price_note",
  "condition_title",
  "story_eyebrow",
  "story_fallback_title",
  "warranty_title",
  "warranty_duration_label",
  "exit_price_label",
  "warranty_covered_label",
  "warranty_not_covered_label",
  "warranty_covered_fallback",
  "warranty_not_covered_fallback",
  "warranty_duration_fallback",
  "trade_title",
  "trade_value_prefix",
  "trade_cta_label",
  "trade_cta_href",
  "related_eyebrow",
  "related_title",
  "related_cta_label",
  "related_cta_href",
  "related_prompt_title",
  "related_prompt_body",
  "related_prompt_cta_label",
  "related_prompt_cta_href",
  "passport_eyebrow",
  "passport_title",
  "passport_body",
  "passport_diagnostics_title",
  "passport_status_prefix",
  "passport_status_fallback",
  "passport_verified_label",
  "mobile_reserved_label",
  "mobile_sold_label",
  "mobile_available_label",
  "mobile_trade_label",
  "mobile_nav_aria_label",
  ...leadTextFields,
];

const readFields = ["id", "singleton_key", ...textFields, "related_prompt_cues"].join(",");
const writeFields = [...textFields, "related_prompt_cues"].join(",");

process.stdout.write(String.raw`
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS device_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key varchar UNIQUE DEFAULT 'default',
  breadcrumb_home_label varchar DEFAULT 'Главная',
  breadcrumb_home_href varchar DEFAULT '/',
  breadcrumb_catalog_label varchar DEFAULT 'Каталог',
  breadcrumb_catalog_href varchar DEFAULT '/catalog',
  back_label varchar DEFAULT '← Store',
  grade_prefix varchar DEFAULT 'грейд',
  updated_prefix varchar DEFAULT 'Обновлено',
  available_label varchar DEFAULT 'В наличии',
  reserved_label varchar DEFAULT 'Бронь',
  sold_label varchar DEFAULT 'Продано',
  price_note text DEFAULT 'Цена и условия действуют после подтверждения наличия и финальной проверки в Store.',
  condition_title varchar DEFAULT 'Состояние и нюансы',
  story_eyebrow varchar DEFAULT 'История вещи',
  story_fallback_title varchar DEFAULT 'Путь вещи',
  warranty_title varchar DEFAULT 'Гарантия и ориентир выхода',
  warranty_duration_label varchar DEFAULT 'Срок гарантии',
  exit_price_label varchar DEFAULT 'Ориентир выхода',
  warranty_covered_label varchar DEFAULT 'Покрывается',
  warranty_not_covered_label varchar DEFAULT 'Не покрывается',
  warranty_covered_fallback text DEFAULT 'Функциональные неисправности в рамках условий Store.',
  warranty_not_covered_fallback text DEFAULT 'Механические повреждения после покупки и следы влаги.',
  warranty_duration_fallback varchar DEFAULT '90 дней',
  trade_title varchar DEFAULT 'Обновление через Trade',
  trade_value_prefix varchar DEFAULT 'зачет до',
  trade_cta_label varchar DEFAULT 'Рассчитать Trade',
  trade_cta_href varchar DEFAULT '/trade',
  related_eyebrow varchar DEFAULT 'Еще в Store',
  related_title varchar DEFAULT 'Похожие устройства',
  related_cta_label varchar DEFAULT 'Весь каталог',
  related_cta_href varchar DEFAULT '/catalog',
  related_prompt_title varchar DEFAULT 'Больше вариантов в Store',
  related_prompt_body text DEFAULT 'Если эта вещь не подходит, проверьте соседние варианты по практичным параметрам.',
  related_prompt_cta_label varchar DEFAULT 'Открыть каталог',
  related_prompt_cta_href varchar DEFAULT '/catalog',
  related_prompt_cues json DEFAULT '["Память","Цвет","Бюджет","Trade"]'::json,
  passport_eyebrow varchar DEFAULT 'I СВОИ Passport',
  passport_title varchar DEFAULT 'Проверка вещи',
  passport_body text DEFAULT 'Чеклист функций, которые были проверены перед публикацией.',
  passport_diagnostics_title varchar DEFAULT 'Диагностика',
  passport_status_prefix varchar DEFAULT 'Статус:',
  passport_status_fallback varchar DEFAULT 'зафиксирована',
  passport_verified_label varchar DEFAULT 'Проверено',
  mobile_reserved_label varchar DEFAULT 'Очередь',
  mobile_sold_label varchar DEFAULT 'Подобрать',
  mobile_available_label varchar DEFAULT 'Просмотр',
  mobile_trade_label varchar DEFAULT 'Trade',
  mobile_nav_aria_label varchar DEFAULT 'Действия по товару',
${leadCreateColumns},
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE device_page_settings
  ADD COLUMN IF NOT EXISTS singleton_key varchar UNIQUE DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS breadcrumb_home_label varchar DEFAULT 'Главная',
  ADD COLUMN IF NOT EXISTS breadcrumb_home_href varchar DEFAULT '/',
  ADD COLUMN IF NOT EXISTS breadcrumb_catalog_label varchar DEFAULT 'Каталог',
  ADD COLUMN IF NOT EXISTS breadcrumb_catalog_href varchar DEFAULT '/catalog',
  ADD COLUMN IF NOT EXISTS back_label varchar DEFAULT '← Store',
  ADD COLUMN IF NOT EXISTS grade_prefix varchar DEFAULT 'грейд',
  ADD COLUMN IF NOT EXISTS updated_prefix varchar DEFAULT 'Обновлено',
  ADD COLUMN IF NOT EXISTS available_label varchar DEFAULT 'В наличии',
  ADD COLUMN IF NOT EXISTS reserved_label varchar DEFAULT 'Бронь',
  ADD COLUMN IF NOT EXISTS sold_label varchar DEFAULT 'Продано',
  ADD COLUMN IF NOT EXISTS price_note text DEFAULT 'Цена и условия действуют после подтверждения наличия и финальной проверки в Store.',
  ADD COLUMN IF NOT EXISTS condition_title varchar DEFAULT 'Состояние и нюансы',
  ADD COLUMN IF NOT EXISTS story_eyebrow varchar DEFAULT 'История вещи',
  ADD COLUMN IF NOT EXISTS story_fallback_title varchar DEFAULT 'Путь вещи',
  ADD COLUMN IF NOT EXISTS warranty_title varchar DEFAULT 'Гарантия и ориентир выхода',
  ADD COLUMN IF NOT EXISTS warranty_duration_label varchar DEFAULT 'Срок гарантии',
  ADD COLUMN IF NOT EXISTS exit_price_label varchar DEFAULT 'Ориентир выхода',
  ADD COLUMN IF NOT EXISTS warranty_covered_label varchar DEFAULT 'Покрывается',
  ADD COLUMN IF NOT EXISTS warranty_not_covered_label varchar DEFAULT 'Не покрывается',
  ADD COLUMN IF NOT EXISTS warranty_covered_fallback text DEFAULT 'Функциональные неисправности в рамках условий Store.',
  ADD COLUMN IF NOT EXISTS warranty_not_covered_fallback text DEFAULT 'Механические повреждения после покупки и следы влаги.',
  ADD COLUMN IF NOT EXISTS warranty_duration_fallback varchar DEFAULT '90 дней',
  ADD COLUMN IF NOT EXISTS trade_title varchar DEFAULT 'Обновление через Trade',
  ADD COLUMN IF NOT EXISTS trade_value_prefix varchar DEFAULT 'зачет до',
  ADD COLUMN IF NOT EXISTS trade_cta_label varchar DEFAULT 'Рассчитать Trade',
  ADD COLUMN IF NOT EXISTS trade_cta_href varchar DEFAULT '/trade',
  ADD COLUMN IF NOT EXISTS related_eyebrow varchar DEFAULT 'Еще в Store',
  ADD COLUMN IF NOT EXISTS related_title varchar DEFAULT 'Похожие устройства',
  ADD COLUMN IF NOT EXISTS related_cta_label varchar DEFAULT 'Весь каталог',
  ADD COLUMN IF NOT EXISTS related_cta_href varchar DEFAULT '/catalog',
  ADD COLUMN IF NOT EXISTS related_prompt_title varchar DEFAULT 'Больше вариантов в Store',
  ADD COLUMN IF NOT EXISTS related_prompt_body text DEFAULT 'Если эта вещь не подходит, проверьте соседние варианты по практичным параметрам.',
  ADD COLUMN IF NOT EXISTS related_prompt_cta_label varchar DEFAULT 'Открыть каталог',
  ADD COLUMN IF NOT EXISTS related_prompt_cta_href varchar DEFAULT '/catalog',
  ADD COLUMN IF NOT EXISTS related_prompt_cues json DEFAULT '["Память","Цвет","Бюджет","Trade"]'::json,
  ADD COLUMN IF NOT EXISTS passport_eyebrow varchar DEFAULT 'I СВОИ Passport',
  ADD COLUMN IF NOT EXISTS passport_title varchar DEFAULT 'Проверка вещи',
  ADD COLUMN IF NOT EXISTS passport_body text DEFAULT 'Чеклист функций, которые были проверены перед публикацией.',
  ADD COLUMN IF NOT EXISTS passport_diagnostics_title varchar DEFAULT 'Диагностика',
  ADD COLUMN IF NOT EXISTS passport_status_prefix varchar DEFAULT 'Статус:',
  ADD COLUMN IF NOT EXISTS passport_status_fallback varchar DEFAULT 'зафиксирована',
  ADD COLUMN IF NOT EXISTS passport_verified_label varchar DEFAULT 'Проверено',
  ADD COLUMN IF NOT EXISTS mobile_reserved_label varchar DEFAULT 'Очередь',
  ADD COLUMN IF NOT EXISTS mobile_sold_label varchar DEFAULT 'Подобрать',
  ADD COLUMN IF NOT EXISTS mobile_available_label varchar DEFAULT 'Просмотр',
  ADD COLUMN IF NOT EXISTS mobile_trade_label varchar DEFAULT 'Trade',
  ADD COLUMN IF NOT EXISTS mobile_nav_aria_label varchar DEFAULT 'Действия по товару',
${leadAlterColumns},
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

INSERT INTO device_page_settings (singleton_key)
VALUES ('default')
ON CONFLICT (singleton_key) DO NOTHING;

UPDATE device_page_settings
SET
${leadSeedAssignments};

INSERT INTO directus_collections (
  collection, icon, note, display_template, hidden, singleton, accountability, archive_app_filter
)
VALUES (
  'device_page_settings',
  'view_carousel',
  'Singleton: общий шаблон товарной страницы. Здесь редактируются breadcrumbs, подписи секций, CTA, Passport и блок похожих устройств.',
  'Шаблон товарной страницы',
  false,
  true,
  'all',
  true
)
ON CONFLICT (collection) DO UPDATE SET
  icon = EXCLUDED.icon,
  note = EXCLUDED.note,
  display_template = EXCLUDED.display_template,
  hidden = false,
  singleton = true,
  accountability = 'all',
  archive_app_filter = true;

CREATE OR REPLACE FUNCTION isvoi_upsert_directus_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_readonly boolean,
  p_special varchar,
  p_group varchar,
  p_required boolean DEFAULT false,
  p_hidden boolean DEFAULT false,
  p_translation text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_translations json;
BEGIN
  v_translations := CASE
    WHEN p_translation IS NULL THEN NULL
    ELSE json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json
  END;

  IF EXISTS (
    SELECT 1 FROM directus_fields WHERE collection = p_collection AND field = p_field
  ) THEN
    UPDATE directus_fields
    SET interface = p_interface,
      display = p_display,
      options = p_options,
      width = p_width,
      sort = p_sort,
      note = p_note,
      readonly = p_readonly,
      hidden = p_hidden,
      required = p_required,
      special = p_special,
      "group" = p_group,
      translations = v_translations
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, special, interface, display, options,
      readonly, hidden, sort, width, translations, note, required, "group"
    ) VALUES (
      p_collection, p_field, p_special, p_interface, p_display, p_options,
      p_readonly, p_hidden, p_sort, p_width, v_translations, p_note, p_required, p_group
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_directus_field('device_page_settings', 'id', 'input', NULL, NULL, 'half', 1, 'Системный id singleton.', true, NULL, NULL, false, true, 'ID');
SELECT isvoi_upsert_directus_field('device_page_settings', 'singleton_key', 'input', NULL, NULL, 'half', 2, 'Системный ключ singleton. Не менять.', true, NULL, NULL, true, true, 'Системный ключ');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_breadcrumbs', 'group-detail', NULL, '{"headerIcon":"account_tree","start":"open"}'::json, 'full', 10, 'Навигация и хлебные крошки товарной страницы.', false, 'alias,no-data,group', NULL, false, false, 'Навигация');
SELECT isvoi_upsert_directus_field('device_page_settings', 'breadcrumb_home_label', 'input', NULL, NULL, 'half', 11, 'Название первого пункта в structured breadcrumbs.', false, NULL, 'group_breadcrumbs', false, false, 'Главная');
SELECT isvoi_upsert_directus_field('device_page_settings', 'breadcrumb_home_href', 'input', NULL, NULL, 'half', 12, 'URL первого пункта breadcrumbs. Обычно /.', false, NULL, 'group_breadcrumbs', false, false, 'Ссылка главной');
SELECT isvoi_upsert_directus_field('device_page_settings', 'breadcrumb_catalog_label', 'input', NULL, NULL, 'half', 13, 'Название пункта каталога в breadcrumbs.', false, NULL, 'group_breadcrumbs', false, false, 'Каталог');
SELECT isvoi_upsert_directus_field('device_page_settings', 'breadcrumb_catalog_href', 'input', NULL, NULL, 'half', 14, 'URL каталога. Обычно /catalog.', false, NULL, 'group_breadcrumbs', false, false, 'Ссылка каталога');
SELECT isvoi_upsert_directus_field('device_page_settings', 'back_label', 'input', NULL, NULL, 'half', 15, 'Видимая ссылка над карточкой устройства.', false, NULL, 'group_breadcrumbs', false, false, 'Ссылка назад');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_status', 'group-detail', NULL, '{"headerIcon":"sell","start":"open"}'::json, 'full', 30, 'Короткие подписи статусов, грейда и цены.', false, 'alias,no-data,group', NULL, false, false, 'Статусы и цена');
SELECT isvoi_upsert_directus_field('device_page_settings', 'grade_prefix', 'input', NULL, NULL, 'half', 31, 'Префикс перед грейдом устройства.', false, NULL, 'group_status', false, false, 'Префикс грейда');
SELECT isvoi_upsert_directus_field('device_page_settings', 'updated_prefix', 'input', NULL, NULL, 'half', 32, 'Префикс перед датой обновления карточки.', false, NULL, 'group_status', false, false, 'Префикс даты');
SELECT isvoi_upsert_directus_field('device_page_settings', 'available_label', 'input', NULL, NULL, 'third', 33, 'Публичная подпись stock_status=available.', false, NULL, 'group_status', false, false, 'В наличии');
SELECT isvoi_upsert_directus_field('device_page_settings', 'reserved_label', 'input', NULL, NULL, 'third', 34, 'Публичная подпись stock_status=reserved.', false, NULL, 'group_status', false, false, 'Бронь');
SELECT isvoi_upsert_directus_field('device_page_settings', 'sold_label', 'input', NULL, NULL, 'third', 35, 'Публичная подпись stock_status=sold.', false, NULL, 'group_status', false, false, 'Продано');
SELECT isvoi_upsert_directus_field('device_page_settings', 'price_note', 'input-multiline', NULL, NULL, 'full', 36, 'Мелкое пояснение под CTA в карточке устройства.', false, NULL, 'group_status', false, false, 'Примечание к цене');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_sections', 'group-detail', NULL, '{"headerIcon":"view_agenda","start":"open"}'::json, 'full', 50, 'Заголовки секций и fallback-тексты гарантии.', false, 'alias,no-data,group', NULL, false, false, 'Секции');
SELECT isvoi_upsert_directus_field('device_page_settings', 'condition_title', 'input', NULL, NULL, 'half', 51, 'Заголовок блока состояния.', false, NULL, 'group_sections', false, false, 'Состояние');
SELECT isvoi_upsert_directus_field('device_page_settings', 'story_eyebrow', 'input', NULL, NULL, 'half', 52, 'Верхняя подпись блока истории вещи.', false, NULL, 'group_sections', false, false, 'Eyebrow истории');
SELECT isvoi_upsert_directus_field('device_page_settings', 'story_fallback_title', 'input', NULL, NULL, 'half', 53, 'Заголовок истории, если у конкретного устройства он не заполнен.', false, NULL, 'group_sections', false, false, 'Fallback истории');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_title', 'input', NULL, NULL, 'half', 54, 'Заголовок блока гарантии и цены выхода.', false, NULL, 'group_sections', false, false, 'Гарантия');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_duration_label', 'input', NULL, NULL, 'half', 55, 'Подпись карточки срока гарантии.', false, NULL, 'group_sections', false, false, 'Срок гарантии');
SELECT isvoi_upsert_directus_field('device_page_settings', 'exit_price_label', 'input', NULL, NULL, 'half', 56, 'Подпись карточки цены выхода.', false, NULL, 'group_sections', false, false, 'Ориентир выхода');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_covered_label', 'input', NULL, NULL, 'half', 57, 'Подпись абзаца, что покрывается гарантией.', false, NULL, 'group_sections', false, false, 'Покрывается');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_not_covered_label', 'input', NULL, NULL, 'half', 58, 'Подпись абзаца, что не покрывается гарантией.', false, NULL, 'group_sections', false, false, 'Не покрывается');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_covered_fallback', 'input-multiline', NULL, NULL, 'half', 59, 'Fallback, если у конкретного Passport не заполнено поле warranty_covered.', false, NULL, 'group_sections', false, false, 'Fallback покрытия');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_not_covered_fallback', 'input-multiline', NULL, NULL, 'half', 60, 'Fallback, если у конкретного Passport не заполнено поле warranty_not_covered.', false, NULL, 'group_sections', false, false, 'Fallback исключений');
SELECT isvoi_upsert_directus_field('device_page_settings', 'warranty_duration_fallback', 'input', NULL, NULL, 'half', 61, 'Fallback срока гарантии, если в устройстве и Passport пусто.', false, NULL, 'group_sections', false, false, 'Fallback срока');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_trade', 'group-detail', NULL, '{"headerIcon":"sync_alt","start":"closed"}'::json, 'full', 70, 'Подписи Trade на товарной странице.', false, 'alias,no-data,group', NULL, false, false, 'Trade');
SELECT isvoi_upsert_directus_field('device_page_settings', 'trade_title', 'input', NULL, NULL, 'half', 71, 'Заголовок блока Trade options.', false, NULL, 'group_trade', false, false, 'Заголовок Trade');
SELECT isvoi_upsert_directus_field('device_page_settings', 'trade_value_prefix', 'input', NULL, NULL, 'half', 72, 'Префикс перед суммой зачёта.', false, NULL, 'group_trade', false, false, 'Префикс суммы');
SELECT isvoi_upsert_directus_field('device_page_settings', 'trade_cta_label', 'input', NULL, NULL, 'half', 73, 'Подпись кнопки Trade рядом с заявкой.', false, NULL, 'group_trade', false, false, 'CTA Trade');
SELECT isvoi_upsert_directus_field('device_page_settings', 'trade_cta_href', 'input', NULL, NULL, 'half', 74, 'URL кнопки Trade.', false, NULL, 'group_trade', false, false, 'Ссылка Trade');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_passport', 'group-detail', NULL, '{"headerIcon":"verified_user","start":"closed"}'::json, 'full', 90, 'Тексты виджета Passport на товарной странице.', false, 'alias,no-data,group', NULL, false, false, 'Passport');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_eyebrow', 'input', NULL, NULL, 'half', 91, 'Верхняя подпись блока Passport.', false, NULL, 'group_passport', false, false, 'Eyebrow Passport');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_title', 'input', NULL, NULL, 'half', 92, 'Заголовок блока Passport.', false, NULL, 'group_passport', false, false, 'Заголовок Passport');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_body', 'input-multiline', NULL, NULL, 'full', 93, 'Короткое пояснение под заголовком Passport.', false, NULL, 'group_passport', false, false, 'Описание Passport');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_diagnostics_title', 'input', NULL, NULL, 'half', 94, 'Заголовок внутреннего блока диагностики.', false, NULL, 'group_passport', false, false, 'Диагностика');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_status_prefix', 'input', NULL, NULL, 'half', 95, 'Префикс перед статусом диагностики.', false, NULL, 'group_passport', false, false, 'Префикс статуса');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_status_fallback', 'input', NULL, NULL, 'half', 96, 'Fallback статуса диагностики.', false, NULL, 'group_passport', false, false, 'Fallback статуса');
SELECT isvoi_upsert_directus_field('device_page_settings', 'passport_verified_label', 'input', NULL, NULL, 'half', 97, 'Текст бейджа проверки.', false, NULL, 'group_passport', false, false, 'Бейдж проверки');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_related', 'group-detail', NULL, '{"headerIcon":"devices_other","start":"closed"}'::json, 'full', 110, 'Блок похожих устройств и prompt при малом количестве карточек.', false, 'alias,no-data,group', NULL, false, false, 'Похожие устройства');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_eyebrow', 'input', NULL, NULL, 'half', 111, 'Eyebrow блока похожих устройств.', false, NULL, 'group_related', false, false, 'Eyebrow');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_title', 'input', NULL, NULL, 'half', 112, 'Заголовок блока похожих устройств.', false, NULL, 'group_related', false, false, 'Заголовок');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_cta_label', 'input', NULL, NULL, 'half', 113, 'Кнопка на весь каталог, когда похожих карточек достаточно.', false, NULL, 'group_related', false, false, 'CTA каталога');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_cta_href', 'input', NULL, NULL, 'half', 114, 'URL кнопки на весь каталог.', false, NULL, 'group_related', false, false, 'Ссылка CTA');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_prompt_title', 'input', NULL, NULL, 'half', 115, 'Заголовок prompt-карточки, если похожих устройств меньше трёх.', false, NULL, 'group_related', false, false, 'Заголовок prompt');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_prompt_body', 'input-multiline', NULL, NULL, 'full', 116, 'Текст prompt-карточки.', false, NULL, 'group_related', false, false, 'Текст prompt');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_prompt_cta_label', 'input', NULL, NULL, 'half', 117, 'Кнопка prompt-карточки.', false, NULL, 'group_related', false, false, 'CTA prompt');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_prompt_cta_href', 'input', NULL, NULL, 'half', 118, 'URL prompt-кнопки.', false, NULL, 'group_related', false, false, 'Ссылка prompt');
SELECT isvoi_upsert_directus_field('device_page_settings', 'related_prompt_cues', 'list', NULL, NULL, 'full', 119, 'Короткие подсказки в prompt-карточке: массив строк.', false, 'cast-json', 'group_related', false, false, 'Подсказки prompt');

SELECT isvoi_upsert_directus_field('device_page_settings', 'group_mobile', 'group-detail', NULL, '{"headerIcon":"smartphone","start":"closed"}'::json, 'full', 130, 'Короткие подписи мобильной sticky-панели.', false, 'alias,no-data,group', NULL, false, false, 'Mobile CTA');
SELECT isvoi_upsert_directus_field('device_page_settings', 'mobile_reserved_label', 'input', NULL, NULL, 'third', 131, 'Кнопка для устройства в брони.', false, NULL, 'group_mobile', false, false, 'Бронь');
SELECT isvoi_upsert_directus_field('device_page_settings', 'mobile_sold_label', 'input', NULL, NULL, 'third', 132, 'Кнопка для проданного устройства.', false, NULL, 'group_mobile', false, false, 'Продано');
SELECT isvoi_upsert_directus_field('device_page_settings', 'mobile_available_label', 'input', NULL, NULL, 'third', 133, 'Кнопка для устройства в наличии.', false, NULL, 'group_mobile', false, false, 'В наличии');
SELECT isvoi_upsert_directus_field('device_page_settings', 'mobile_trade_label', 'input', NULL, NULL, 'half', 134, 'Короткая подпись второй кнопки.', false, NULL, 'group_mobile', false, false, 'Trade');
SELECT isvoi_upsert_directus_field('device_page_settings', 'mobile_nav_aria_label', 'input', NULL, NULL, 'half', 135, 'ARIA label мобильной панели.', false, NULL, 'group_mobile', false, false, 'ARIA панели');

${leadFieldSql}

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar, varchar, boolean, boolean, text);

CREATE OR REPLACE FUNCTION isvoi_upsert_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar,
  p_fields text,
  p_permissions json DEFAULT NULL,
  p_validation json DEFAULT NULL,
  p_presets json DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy = v_policy AND collection = p_collection AND action = p_action
  ) THEN
    UPDATE directus_permissions
    SET fields = p_fields,
      permissions = p_permissions,
      validation = p_validation,
      presets = p_presets
    WHERE policy = v_policy AND collection = p_collection AND action = p_action;
  ELSE
    INSERT INTO directus_permissions (
      policy, collection, action, fields, permissions, validation, presets
    ) VALUES (
      v_policy, p_collection, p_action, p_fields, p_permissions, p_validation, p_presets
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_permission('ISVOI Editor', 'device_page_settings', 'read', '${readFields}', NULL);
SELECT isvoi_upsert_permission('ISVOI Editor', 'device_page_settings', 'update', '${writeFields}', NULL);
SELECT isvoi_upsert_permission('ISVOI Public Read', 'device_page_settings', 'read', '${readFields}', NULL);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);

SELECT 'device_page_settings.rows' AS check_name, count(*)::text AS value
FROM device_page_settings
UNION ALL
SELECT 'device_page_settings.singleton_metadata', count(*)::text
FROM directus_collections
WHERE collection = 'device_page_settings'
  AND coalesce(singleton, false) = true
UNION ALL
SELECT 'device_page_settings.editor_permissions', count(*)::text
FROM directus_permissions pe
JOIN directus_policies po ON po.id = pe.policy
WHERE po.name = 'ISVOI Editor'
  AND pe.collection = 'device_page_settings'
  AND pe.action IN ('read', 'update')
UNION ALL
SELECT 'device_page_settings.public_read', count(*)::text
FROM directus_permissions pe
JOIN directus_policies po ON po.id = pe.policy
WHERE po.name = 'ISVOI Public Read'
  AND pe.collection = 'device_page_settings'
  AND pe.action = 'read';

COMMIT;
`);
