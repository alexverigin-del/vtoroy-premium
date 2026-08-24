#!/usr/bin/env node
/**
 * Native-first Directus Studio UX migration.
 *
 * The migration is forward-only and idempotent. It reorganizes the Content
 * module around operator workflows, makes Catalog V3 the human-facing catalog,
 * migrates Blog related products away from legacy devices, localizes Studio
 * metadata and narrows human-role write permissions.
 */

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = (items) => items.map((item) => `(${item.map(quote).join(",")})`).join(",\n  ");
const rollback = process.argv.includes("--rollback");

const assertUnique = (items, key, label) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  if (duplicates.size > 0) {
    throw new Error(`${label} contains duplicate keys: ${[...duplicates].join(", ")}`);
  }
};

const collectionLabels = [
  ["isvoi_site_content", "Сайт и контент", "web"],
  ["isvoi_catalog", "Карточки сайта", "inventory_2"],
  ["isvoi_sales", "Продажи", "support_agent"],
  ["isvoi_blog", "Блог", "article"],
  ["isvoi_imports", "Импорт каталога", "upload_file"],
  ["isvoi_inventory", "Склад и сверка", "warehouse"],
  ["isvoi_channels", "Avito и экономика", "campaign"],
  ["site_pages", "Страницы", "web_asset"],
  ["page_sections", "Секции страниц", "view_agenda"],
  ["site_settings", "Настройки сайта", "tune"],
  ["navigation_items", "Навигация", "menu_open"],
  ["faq_items", "FAQ", "quiz"],
  ["device_page_settings", "Шаблон товарной страницы", "view_carousel"],
  ["products", "Карточки товаров", "inventory_2"],
  ["product_brands", "Бренды", "sell"],
  ["product_categories", "Категории", "category"],
  ["device_models", "Модели устройств", "devices_other"],
  ["product_images", "Фото товаров", "photo_library"],
  ["device_details", "Характеристики техники", "memory"],
  ["accessory_details", "Характеристики аксессуаров", "cable"],
  ["product_compatible_models", "Совместимые модели", "link"],
  ["device_passports", "Паспорта товаров", "verified_user"],
  ["trade_options", "Trade-варианты", "sync_alt"],
  ["catalog_import_batches", "Партии импорта", "upload_file"],
  ["leads", "Заявки", "support_agent"],
  ["lead_comments", "Комментарии к заявкам", "mode_comment"],
  ["blog_posts", "Материалы", "article"],
  ["blog_categories", "Рубрики", "topic"],
  ["blog_tags", "Теги", "sell"],
  ["blog_authors", "Авторы", "person"],
  ["blog_posts_tags", "Связи тегов", "link"],
  ["blog_posts_devices", "Связанные товары", "inventory_2"],
  ["blog_post_blocks", "Блоки материалов", "view_agenda"],
  ["club_page_settings", "Настройки Club", "tune"],
  ["club_plans", "Тарифы Club", "badge"],
  ["club_offers", "Предложения Club", "devices"],
  ["club_rule_items", "Правила Club", "rule"],
  ["club_process_items", "Шаги Club", "route"],
  ["club_legal_documents", "Документы Club", "gavel"],
  ["inventory_import_batches", "Товарные snapshot", "upload_file"],
  ["inventory_items", "Остатки из учётной системы", "warehouse"],
  ["inventory_receipt_lines", "Строки поступлений", "receipt_long"],
  ["inventory_import_issues", "Проблемы сверки", "report_problem"],
  ["channel_cost_profiles", "Расходы Avito", "calculate"],
  ["channel_category_mappings", "Категории Avito", "account_tree"],
  ["product_channel_listings", "Объявления Avito", "campaign"],
  ["product_unit_economics", "Экономика товара", "monitoring"],
];

const genericFieldLabels = [
  ["id", "ID"],
  ["status", "Статус"],
  ["slug", "URL slug"],
  ["name", "Название"],
  ["title", "Название"],
  ["body", "Текст"],
  ["summary", "Краткое описание"],
  ["note", "Заметка"],
  ["sort", "Порядок"],
  ["created_at", "Создано"],
  ["updated_at", "Обновлено"],
  ["date_created", "Создано"],
  ["date_updated", "Обновлено"],
  ["description", "Описание"],
  ["product", "Товар"],
  ["device", "Legacy-устройство"],
  ["sku", "SKU"],
  ["source_id", "ID в источнике"],
  ["source_system", "Система-источник"],
  ["source_sku", "SKU в источнике"],
  ["source_title", "Название в источнике"],
  ["source_note", "Комментарий источника"],
  ["import_batch", "Партия импорта"],
  ["imported_at", "Дата импорта"],
  ["admin_note", "Редакторская заметка"],
  ["brand", "Бренд"],
  ["category", "Категория"],
  ["model", "Модель"],
  ["device_model", "Точная модель"],
  ["color", "Цвет"],
  ["price", "Цена, ₽"],
  ["price_text", "Цена для показа"],
  ["stock_quantity", "Остаток"],
  ["stock_status", "Наличие"],
  ["sale_mode", "Сценарий продажи"],
  ["product_type", "Тип товара"],
  ["condition", "Состояние"],
  ["content_status", "Готовность карточки"],
  ["short_description", "Короткое описание"],
  ["headline", "Заголовок карточки"],
  ["warranty", "Гарантия"],
  ["warranty_text", "Текст гарантии"],
  ["completeness", "Комплектность"],
  ["listing_file", "Главное фото"],
  ["listing_alt", "Alt главного фото"],
  ["images", "Галерея"],
  ["image", "Изображение"],
  ["alt", "Alt-текст"],
  ["label", "Подпись"],
  ["value", "Значение"],
  ["is_active", "Активно"],
  ["device_details", "Данные техники"],
  ["accessory_details", "Данные аксессуара"],
  ["compatible_models", "Совместимые модели"],
  ["device_models_id", "Модель устройства"],
  ["passport", "Passport"],
  ["trade_options_v3", "Trade-варианты"],
  ["leads", "Связанные заявки"],
  ["specifications", "Характеристики для показа"],
  ["compatibility_mode", "Режим совместимости"],
  ["catalog_section", "Раздел каталога"],
  ["repair", "Ремонт"],
  ["water", "Следы влаги"],
  ["summary_rows", "Краткие факты"],
  ["diagnostics_status", "Статус диагностики"],
  ["diagnostics_checklist", "Чек-лист диагностики"],
  ["condition_grade_text", "Грейд состояния"],
  ["condition_note", "Описание состояния"],
  ["condition_notes", "Факты о состоянии"],
  ["defect_photo", "Фото дефекта"],
  ["defect_photo_alt", "Alt фото дефекта"],
  ["story_title", "Заголовок истории"],
  ["story_body", "История устройства"],
  ["story_facts", "Факты истории"],
  ["warranty_duration", "Срок гарантии"],
  ["warranty_covered", "Что покрывает гарантия"],
  ["warranty_not_covered", "Что не покрывает гарантия"],
  ["exit_headline", "Заголовок сценария выхода"],
  ["exit_buy_today", "Выкуп сегодня"],
  ["exit_trade_in_estimate", "Оценка Trade-in"],
  ["exit_condition", "Условие расчёта"],
  ["exit_note", "Пояснение расчёта"],
  ["batch", "Партия"],
  ["batch_name", "Название snapshot"],
  ["snapshot_at", "Дата snapshot"],
  ["inventory_workbook", "Файл остатков XLSX"],
  ["receipts_workbook", "Файл поступлений XLSX"],
  ["confirm_missing_deactivation", "Разрешить обнуление отсутствующих позиций"],
  ["inventory_rows", "Строк остатков"],
  ["inventory_units", "Единиц товара"],
  ["receipt_rows", "Строк поступлений"],
  ["blocker_count", "Блокеров"],
  ["warning_count", "Предупреждений"],
  ["last_run_mode", "Последний режим запуска"],
  ["last_run_status", "Статус последнего запуска"],
  ["last_run_at", "Время последнего запуска"],
  ["last_run_log", "Лог последнего запуска"],
  ["items", "Позиции snapshot"],
  ["receipt_lines", "Строки поступлений"],
  ["issues", "Проблемы"],
  ["serial_full", "Полный серийный номер"],
  ["imei_full", "Полный IMEI"],
  ["quantity", "Количество"],
  ["purchase_price", "Закупочная цена"],
  ["retail_price", "Розничная цена"],
  ["identity_status", "Проверка идентичности"],
  ["authenticity_status", "Проверка происхождения"],
  ["eligibility_status", "Допуск в каталог"],
  ["review_override", "Ручной допуск"],
  ["review_note", "Основание допуска"],
  ["block_reason", "Причина блокировки"],
  ["severity", "Критичность"],
  ["code", "Код проверки"],
  ["message", "Описание проблемы"],
  ["resolved", "Решено"],
  ["resolution_note", "Как решено"],
  ["received_on", "Дата поступления"],
  ["movement_status", "Место и движение"],
  ["central_office_quantity", "Количество в ЦО"],
  ["match_status", "Статус сопоставления"],
  ["match_note", "Пояснение сопоставления"],
  ["inventory_item", "Складская позиция"],
  ["channel", "Канал"],
  ["mapping_key", "Ключ соответствия"],
  ["product_category", "Категория сайта"],
  ["external_category", "Категория канала"],
  ["external_category_id", "ID категории канала"],
  ["external_goods_type", "Тип товара канала"],
  ["template_version", "Версия шаблона"],
  ["default_attributes", "Общие атрибуты"],
  ["is_confirmed", "Подтверждено"],
  ["category_mapping", "Соответствие категории"],
  ["external_id", "Внешний ID"],
  ["price_override", "Цена для канала"],
  ["attributes", "Атрибуты объявления"],
  ["publication_mode", "Режим публикации"],
  ["singleton_key", "Системный ключ"],
  ["hero_eyebrow", "Eyebrow первого экрана"],
  ["hero_title", "Заголовок первого экрана"],
  ["hero_body", "Описание первого экрана"],
  ["hero_primary_label", "Основная CTA"],
  ["hero_primary_url", "Ссылка основной CTA"],
  ["hero_secondary_label", "Дополнительная CTA"],
  ["hero_secondary_url", "Ссылка дополнительной CTA"],
  ["hero_disclaimer", "Дисклеймер первого экрана"],
  ["hero_panel_eyebrow", "Eyebrow панели"],
  ["hero_panel_title", "Заголовок панели"],
  ["hero_panel_body", "Текст панели"],
  ["offers_eyebrow", "Eyebrow предложений"],
  ["offers_title", "Заголовок предложений"],
  ["offers_empty_title", "Заголовок индивидуального подбора"],
  ["offers_empty_body", "Описание индивидуального подбора"],
  ["monthly_fallback", "Цена при ручном расчёте"],
  ["offer_cta_label", "CTA предложения"],
  ["cycle_eyebrow", "Eyebrow сценариев"],
  ["cycle_title", "Заголовок сценариев"],
  ["cycle_body", "Описание сценариев"],
  ["passport_eyebrow", "Eyebrow Passport"],
  ["passport_title", "Заголовок Passport"],
  ["passport_body", "Описание Passport"],
  ["plans_eyebrow", "Eyebrow тарифов"],
  ["plans_title", "Заголовок тарифов"],
  ["rules_eyebrow", "Eyebrow правил"],
  ["rules_title", "Заголовок правил"],
  ["participation_eyebrow", "Eyebrow участия"],
  ["participation_title", "Заголовок участия"],
  ["participation_body", "Описание участия"],
  ["legal_eyebrow", "Eyebrow документов"],
  ["legal_title", "Заголовок документов"],
  ["legal_body", "Описание документов"],
  ["final_eyebrow", "Eyebrow формы"],
  ["final_title", "Заголовок формы"],
  ["final_body", "Описание формы"],
  ["form_title", "Заголовок формы"],
  ["form_scenario", "Сценарий заявки"],
  ["form_device_label", "Поле устройства"],
  ["form_device_placeholder", "Пример устройства"],
  ["form_device_error", "Ошибка выбора устройства"],
  ["form_contact_label", "Поле контакта"],
  ["form_contact_placeholder", "Пример контакта"],
  ["form_budget_label", "Поле бюджета"],
  ["form_budget_placeholder", "Пример бюджета"],
  ["form_term_label", "Поле срока"],
  ["form_message_label", "Поле комментария"],
  ["form_message_placeholder", "Пример комментария"],
  ["form_submit_label", "Кнопка отправки"],
  ["form_submitting_label", "Текст при отправке"],
  ["form_idle_note", "Подсказка формы"],
  ["form_success_note", "Сообщение об успехе"],
  ["form_error_note", "Сообщение об ошибке"],
  ["form_consent_label", "Текст согласия"],
  ["form_consent_note", "Пояснение согласия"],
  ["privacy_url", "Ссылка на политику"],
  ["consent_version", "Версия согласия"],
  ["offer_status", "Готовность предложения"],
  ["plan", "Тариф"],
  ["term_months", "Минимальный срок, месяцев"],
  ["pricing_mode", "Режим расчёта"],
  ["monthly_from", "Платёж от, ₽/мес"],
  ["terms_text", "Короткие условия"],
  ["badge", "Плашка"],
  ["cta_label", "Подпись CTA"],
  ["features", "Преимущества"],
  ["min_term_months", "Минимальный срок, месяцев"],
  ["monthly_note", "Пояснение цены"],
  ["support_level", "Уровень сопровождения"],
  ["service_response_text", "Срок ответа сервиса"],
  ["diagnostics_text", "Диагностика"],
  ["replacement_text", "Подменное устройство"],
  ["early_exit_text", "Досрочный выход"],
  ["damage_text", "Работа с повреждениями"],
  ["is_featured", "Основной тариф"],
  ["is_future", "Будущий формат"],
  ["group_key", "Раздел процесса"],
  ["document_type", "Тип документа"],
  ["effective_date", "Дата действия"],
  ["file", "Файл документа"],
  ["legal_reviewed", "Проверено юристом"],
  ["version", "Версия"],
  ["utm_source", "UTM-источник"],
  ["utm_medium", "UTM-канал"],
  ["utm_campaign", "UTM-кампания"],
  ["utm_content", "UTM-контент"],
  ["utm_term", "UTM-запрос"],
  ["club_offer", "Предложение Club"],
  ["club_plan", "Тариф Club"],
  ["club_term_months", "Срок Club, месяцев"],
  ["club_budget_text", "Комфортный платёж"],
  ["club_device_request", "Запрошенное устройство"],
  ["club_consent_version", "Версия согласия Club"],
  ["club_consent_at", "Время согласия Club"],
];

const fieldOverrides = [
  ["products", "title", "Название товара"],
  ["products", "id", "URL slug товара"],
  ["products", "group_status", "Статус и готовность"],
  ["products", "group_identity", "Основное"],
  ["products", "group_sale", "Цена и наличие"],
  ["products", "group_content", "Описание"],
  ["products", "group_media", "Фото"],
  ["products", "group_device", "Данные техники"],
  ["products", "group_accessory", "Данные аксессуара"],
  ["products", "group_passport", "Passport и Trade"],
  ["products", "group_system", "Системные данные"],
  ["device_passports", "group_identity", "Связь с товаром"],
  ["device_passports", "group_summary", "Диагностика"],
  ["device_passports", "group_condition", "Состояние"],
  ["device_passports", "group_story", "История устройства"],
  ["device_passports", "group_warranty", "Гарантия и сценарий выхода"],
  ["device_passports", "group_system", "Системные данные"],
  ["trade_options", "group_main", "Trade-вариант"],
  ["trade_options", "group_system", "Системные данные"],
  ["inventory_import_batches", "group_files", "Файлы и параметры"],
  ["inventory_import_batches", "group_run", "Запуск"],
  ["inventory_import_batches", "group_result", "Результат"],
  ["inventory_import_batches", "group_relations", "Связанные данные"],
  ["inventory_import_batches", "group_system", "Техническое"],
  ["inventory_items", "group_item", "Товар"],
  ["inventory_items", "group_identity", "Идентификация"],
  ["inventory_items", "group_review", "Проверка и допуск"],
  ["inventory_items", "group_economics", "Экономика"],
  ["inventory_items", "group_relations", "Связи"],
  ["inventory_import_issues", "group_issue", "Проблема"],
  ["inventory_import_issues", "group_resolution", "Решение"],
  ["inventory_receipt_lines", "group_receipt", "Поступление"],
  ["inventory_receipt_lines", "group_location", "Место и движение"],
  ["inventory_receipt_lines", "group_match", "Сопоставление"],
  ["product_channel_listings", "group_product", "Товар и категория"],
  ["product_channel_listings", "group_price", "Цена"],
  ["product_channel_listings", "group_status", "Статус"],
  ["product_channel_listings", "group_attributes", "Атрибуты"],
  ["product_channel_listings", "group_sync", "Синхронизация"],
  ["blog_posts", "devices", "Связанные товары"],
  ["blog_posts_devices", "products_id", "Товар Catalog V3"],
  ["club_plans", "group_identity", "Публикация и название"],
  ["club_plans", "group_public", "Публичное описание"],
  ["club_plans", "group_comparison", "Сравнение тарифов"],
  ["club_offers", "group_publication", "Публикация"],
  ["club_offers", "group_device", "Устройство и тариф"],
  ["club_offers", "group_pricing", "Цена и условия"],
  ["club_offers", "group_card", "Карточка предложения"],
  ["club_rule_items", "group_publication", "Публикация и категория"],
  ["club_rule_items", "group_content", "Содержание правила"],
  ["club_process_items", "group_publication", "Раздел и публикация"],
  ["club_process_items", "group_content", "Содержание шага"],
  ["club_process_items", "group_advanced", "Расширенные настройки"],
  ["club_legal_documents", "group_publication", "Публикация и проверка"],
  ["club_legal_documents", "group_content", "Содержание документа"],
  ["club_legal_documents", "group_version", "Версия и файл"],
  ["club_page_settings", "group_publication", "Публикация"],
  ["club_page_settings", "group_hero", "Первый экран"],
  ["club_page_settings", "group_offers", "Предложения устройств"],
  ["club_page_settings", "group_story", "Сценарии и правила"],
  ["club_page_settings", "group_legal", "Документы и согласие"],
  ["club_page_settings", "group_form", "Форма заявки"],
  ["club_page_settings", "group_advanced", "Расширенные настройки"],
];

const targetCollections = collectionLabels
  .map(([collection]) => collection)
  .filter((collection) => !collection.startsWith("isvoi_"));

assertUnique(collectionLabels, ([collection]) => collection, "collectionLabels");
assertUnique(genericFieldLabels, ([field]) => field, "genericFieldLabels");
assertUnique(fieldOverrides, ([collection, field]) => `${collection}.${field}`, "fieldOverrides");

process.stdout.write(String.raw`
BEGIN;

ALTER TABLE blog_posts_devices ADD COLUMN IF NOT EXISTS products_id varchar(255);
ALTER TABLE blog_posts_devices ALTER COLUMN devices_id DROP NOT NULL;

UPDATE blog_posts_devices relation
SET products_id=relation.devices_id
WHERE relation.products_id IS NULL
  AND EXISTS (SELECT 1 FROM products product WHERE product.id=relation.devices_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blog_posts_devices_product_fkey') THEN
    ALTER TABLE blog_posts_devices
      ADD CONSTRAINT blog_posts_devices_product_fkey
      FOREIGN KEY (products_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blog_posts_products_unique') THEN
    ALTER TABLE blog_posts_devices
      ADD CONSTRAINT blog_posts_products_unique UNIQUE (blog_posts_id,products_id);
  END IF;
END $$;

CREATE TEMP TABLE isvoi_studio_collection_labels(
  collection varchar PRIMARY KEY, translation text NOT NULL, icon varchar NOT NULL
) ON COMMIT DROP;
INSERT INTO isvoi_studio_collection_labels VALUES
  ${rows(collectionLabels)};

CREATE TEMP TABLE isvoi_studio_field_labels(
  field varchar PRIMARY KEY, translation text NOT NULL
) ON COMMIT DROP;
INSERT INTO isvoi_studio_field_labels VALUES
  ${rows(genericFieldLabels)};

CREATE TEMP TABLE isvoi_studio_field_overrides(
  collection varchar, field varchar, translation text NOT NULL,
  PRIMARY KEY(collection,field)
) ON COMMIT DROP;
INSERT INTO isvoi_studio_field_overrides VALUES
  ${rows(fieldOverrides)};

INSERT INTO directus_collections(
  collection,icon,note,hidden,singleton,sort,translations,collapse
)
SELECT collection,icon,'Рабочий раздел Directus Studio ISVOI.',false,false,
  row_number() OVER (ORDER BY collection)*10,
  json_build_array(json_build_object('language','ru-RU','translation',translation)),
  'open'
FROM isvoi_studio_collection_labels
WHERE collection IN (
  'isvoi_site_content','isvoi_catalog','isvoi_sales','isvoi_blog','isvoi_imports','isvoi_inventory',
  'isvoi_channels'
)
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon,note=EXCLUDED.note,hidden=false,singleton=false,
  translations=EXCLUDED.translations,collapse='open';

UPDATE directus_collections collection
SET translations=json_build_array(json_build_object('language','ru-RU','translation',label.translation)),
  icon=label.icon
FROM isvoi_studio_collection_labels label
WHERE collection.collection=label.collection;

UPDATE directus_collections collection
SET "group"=membership.group_key, sort=membership.sort_order
FROM (VALUES
  ('site_pages','isvoi_site_content',10),('site_settings','isvoi_site_content',20),
  ('navigation_items','isvoi_site_content',30),('faq_items','isvoi_site_content',40),
  ('page_sections','isvoi_site_content',50),
  ('products','isvoi_catalog',10),('device_page_settings','isvoi_catalog',20),
  ('device_passports','isvoi_catalog',30),('trade_options','isvoi_catalog',40),
  ('product_brands','isvoi_catalog',50),('product_categories','isvoi_catalog',60),
  ('device_models','isvoi_catalog',70),('product_images','isvoi_catalog',80),
  ('device_details','isvoi_catalog',90),('accessory_details','isvoi_catalog',100),
  ('product_compatible_models','isvoi_catalog',110),
  ('leads','isvoi_sales',10),('lead_comments','isvoi_sales',20),
  ('blog_posts','isvoi_blog',10),('blog_categories','isvoi_blog',20),
  ('blog_tags','isvoi_blog',30),('blog_authors','isvoi_blog',40),
  ('blog_posts_tags','isvoi_blog',50),('blog_posts_devices','isvoi_blog',60),
  ('blog_post_blocks','isvoi_blog',70),
  ('catalog_import_batches','isvoi_imports',10),
  ('inventory_import_batches','isvoi_inventory',10),
  ('inventory_import_issues','isvoi_inventory',20),('inventory_items','isvoi_inventory',30),
  ('inventory_receipt_lines','isvoi_inventory',40),
  ('product_channel_listings','isvoi_channels',10),
  ('channel_category_mappings','isvoi_channels',20),('channel_cost_profiles','isvoi_channels',30),
  ('product_unit_economics','isvoi_channels',40)
) membership(collection,group_key,sort_order)
WHERE collection.collection=membership.collection;

UPDATE directus_collections SET hidden=true
WHERE collection IN (
  'page_sections','product_images','device_details','accessory_details',
  'product_compatible_models','lead_comments','blog_posts_tags',
  'blog_posts_devices','blog_post_blocks','devices','device_images'
);

UPDATE directus_collections
SET display_template='{{product.title}} · {{condition_grade_text}} · {{warranty_duration}}'
WHERE collection='device_passports';
UPDATE directus_collections
SET display_template='{{product.title}} · {{label}}'
WHERE collection='trade_options';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_upsert_group(
  p_collection varchar,p_field varchar,p_translation text,p_icon varchar,
  p_sort integer,p_start varchar DEFAULT 'closed',p_hidden boolean DEFAULT false,
  p_conditions json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface='group-detail',special='alias,no-data,group',
      options=json_build_object('headerIcon',p_icon,'start',p_start),width='full',
      sort=p_sort,hidden=p_hidden,readonly=false,required=false,conditions=p_conditions,
      translations=json_build_array(json_build_object('language','ru-RU','translation',p_translation))
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,interface,special,options,width,sort,hidden,readonly,required,conditions,translations,note
    ) VALUES (
      p_collection,p_field,'group-detail','alias,no-data,group',
      json_build_object('headerIcon',p_icon,'start',p_start),'full',p_sort,p_hidden,false,false,p_conditions,
      json_build_array(json_build_object('language','ru-RU','translation',p_translation)),p_translation
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_upsert_group('products','group_status','Статус и готовность','fact_check',1,'open');
SELECT pg_temp.isvoi_upsert_group('products','group_identity','Основное','inventory_2',2,'open');
SELECT pg_temp.isvoi_upsert_group('products','group_sale','Цена и наличие','payments',3,'open');
SELECT pg_temp.isvoi_upsert_group('products','group_content','Описание','description',4,'closed');
SELECT pg_temp.isvoi_upsert_group('products','group_media','Фото','photo_library',5,'closed');
SELECT pg_temp.isvoi_upsert_group(
  'products','group_device','Данные техники','memory',6,'closed',true,
  '[{"name":"Техника","rule":{"product_type":{"_eq":"device"}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
);
SELECT pg_temp.isvoi_upsert_group(
  'products','group_accessory','Данные аксессуара','cable',7,'closed',true,
  '[{"name":"Аксессуар","rule":{"product_type":{"_eq":"accessory"}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
);
SELECT pg_temp.isvoi_upsert_group(
  'products','group_passport','Passport и Trade','verified_user',8,'closed',true,
  '[{"name":"Техника","rule":{"product_type":{"_eq":"device"}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
);
SELECT pg_temp.isvoi_upsert_group('products','group_system','Системные данные','settings',9,'closed');
UPDATE directus_fields SET hidden=true,readonly=true WHERE collection='products' AND field='group_details';

UPDATE directus_fields field SET "group"=placement.group_key,sort=placement.sort_order
FROM (VALUES
  ('status','group_status',1),('content_status','group_status',2),
  ('stock_status','group_status',3),('sale_mode','group_status',4),('admin_note','group_status',5),
  ('product_type','group_identity',1),('condition','group_identity',2),('title','group_identity',3),
  ('sku','group_identity',4),('brand','group_identity',5),('category','group_identity',6),
  ('device_model','group_identity',7),('model','group_identity',8),('color','group_identity',9),
  ('price','group_sale',1),('price_text','group_sale',2),('stock_quantity','group_sale',3),('sort','group_sale',4),
  ('short_description','group_content',1),('headline','group_content',2),('warranty','group_content',3),
  ('warranty_text','group_content',4),('completeness','group_content',5),
  ('listing_file','group_media',1),('listing_alt','group_media',2),('images','group_media',3),
  ('device_details','group_device',1),('accessory_details','group_accessory',1),
  ('compatible_models','group_accessory',2),('passport','group_passport',1),
  ('trade_options_v3','group_passport',2),('id','group_system',1),('source_system','group_system',2),
  ('source_id','group_system',3),('import_batch','group_system',4),('imported_at','group_system',5),
  ('created_at','group_system',6),('updated_at','group_system',7),('leads','group_system',8),
  ('inventory_item','group_system',9),('channel_listings','group_system',10)
) placement(field,group_key,sort_order)
WHERE field.collection='products' AND field.field=placement.field;

UPDATE directus_fields SET readonly=true
WHERE collection='products' AND field IN (
  'source_system','source_id','import_batch','imported_at','created_at','updated_at','leads','inventory_item','channel_listings'
);
UPDATE directus_fields SET conditions=
  '[{"name":"Зафиксировать после создания","rule":{"id":{"_nnull":true}},"hidden":false,"readonly":true,"required":true,"options":{}}]'::json
WHERE collection='products' AND field='id';

UPDATE directus_fields SET hidden=true,readonly=true
WHERE collection IN ('device_passports','trade_options') AND field='device';

SELECT pg_temp.isvoi_upsert_group('inventory_import_batches','group_files','Файлы и параметры','upload_file',1,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_import_batches','group_run','Запуск','play_circle',2,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_import_batches','group_result','Результат','fact_check',3,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_import_batches','group_relations','Связанные данные','account_tree',4,'closed');
SELECT pg_temp.isvoi_upsert_group('inventory_import_batches','group_system','Техническое','settings',5,'closed');
SELECT pg_temp.isvoi_upsert_group('inventory_items','group_item','Товар','inventory_2',1,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_items','group_identity','Идентификация','fingerprint',2,'closed');
SELECT pg_temp.isvoi_upsert_group('inventory_items','group_review','Проверка и допуск','fact_check',3,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_items','group_economics','Экономика','payments',4,'closed');
SELECT pg_temp.isvoi_upsert_group('inventory_items','group_relations','Связи','link',5,'closed');
SELECT pg_temp.isvoi_upsert_group('inventory_import_issues','group_issue','Проблема','report_problem',1,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_import_issues','group_resolution','Решение','task_alt',2,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_receipt_lines','group_receipt','Поступление','receipt_long',1,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_receipt_lines','group_location','Место и движение','warehouse',2,'open');
SELECT pg_temp.isvoi_upsert_group('inventory_receipt_lines','group_match','Сопоставление','link',3,'closed');
SELECT pg_temp.isvoi_upsert_group('product_channel_listings','group_product','Товар и категория','inventory_2',1,'open');
SELECT pg_temp.isvoi_upsert_group('product_channel_listings','group_price','Цена','payments',2,'open');
SELECT pg_temp.isvoi_upsert_group('product_channel_listings','group_status','Статус','fact_check',3,'open');
SELECT pg_temp.isvoi_upsert_group('product_channel_listings','group_attributes','Атрибуты','data_object',4,'closed');
SELECT pg_temp.isvoi_upsert_group('product_channel_listings','group_sync','Синхронизация','sync',5,'closed');

UPDATE directus_fields field SET "group"=placement.group_key,sort=placement.sort_order
FROM (VALUES
  ('inventory_import_batches','batch_name','group_files',1),('inventory_import_batches','snapshot_at','group_files',2),
  ('inventory_import_batches','inventory_workbook','group_files',3),('inventory_import_batches','receipts_workbook','group_files',4),
  ('inventory_import_batches','confirm_missing_deactivation','group_files',5),('inventory_import_batches','note','group_files',6),
  ('inventory_import_batches','status','group_run',1),('inventory_import_batches','last_run_mode','group_run',2),
  ('inventory_import_batches','last_run_status','group_run',3),('inventory_import_batches','last_run_at','group_run',4),
  ('inventory_import_batches','last_run_log','group_run',5),('inventory_import_batches','inventory_rows','group_result',1),
  ('inventory_import_batches','inventory_units','group_result',2),('inventory_import_batches','receipt_rows','group_result',3),
  ('inventory_import_batches','blocker_count','group_result',4),('inventory_import_batches','warning_count','group_result',5),
  ('inventory_import_batches','items','group_relations',1),('inventory_import_batches','receipt_lines','group_relations',2),
  ('inventory_import_batches','issues','group_relations',3),('inventory_import_batches','id','group_system',1),
  ('inventory_import_batches','source_system','group_system',2),('inventory_import_batches','created_at','group_system',3),
  ('inventory_import_batches','updated_at','group_system',4),
  ('inventory_items','source_title','group_item',1),('inventory_items','source_sku','group_item',2),
  ('inventory_items','quantity','group_item',3),('inventory_items','product','group_item',4),
  ('inventory_items','source_id','group_identity',1),('inventory_items','serial_full','group_identity',2),
  ('inventory_items','imei_full','group_identity',3),('inventory_items','identity_status','group_review',1),
  ('inventory_items','authenticity_status','group_review',2),('inventory_items','eligibility_status','group_review',3),
  ('inventory_items','review_override','group_review',4),('inventory_items','review_note','group_review',5),
  ('inventory_items','block_reason','group_review',6),('inventory_items','purchase_price','group_economics',1),
  ('inventory_items','retail_price','group_economics',2),('inventory_items','receipt_lines','group_relations',1),
  ('inventory_import_issues','severity','group_issue',1),('inventory_import_issues','batch','group_issue',2),
  ('inventory_import_issues','code','group_issue',3),('inventory_import_issues','message','group_issue',4),
  ('inventory_import_issues','resolved','group_resolution',1),('inventory_import_issues','resolution_note','group_resolution',2),
  ('inventory_receipt_lines','batch','group_receipt',1),('inventory_receipt_lines','received_on','group_receipt',2),
  ('inventory_receipt_lines','source_title','group_receipt',3),('inventory_receipt_lines','source_note','group_receipt',4),
  ('inventory_receipt_lines','movement_status','group_location',1),('inventory_receipt_lines','central_office_quantity','group_location',2),
  ('inventory_receipt_lines','match_status','group_match',1),('inventory_receipt_lines','match_note','group_match',2),
  ('inventory_receipt_lines','inventory_item','group_match',3),
  ('product_channel_listings','product','group_product',1),('product_channel_listings','category_mapping','group_product',2),
  ('product_channel_listings','channel','group_product',3),('product_channel_listings','price_override','group_price',1),
  ('product_channel_listings','status','group_status',1),('product_channel_listings','external_id','group_status',2),
  ('product_channel_listings','attributes','group_attributes',1),('product_channel_listings','last_exported_at','group_sync',1),
  ('product_channel_listings','sync_status','group_sync',2),('product_channel_listings','sync_error','group_sync',3)
) placement(collection,field,group_key,sort_order)
WHERE field.collection=placement.collection AND field.field=placement.field;

UPDATE directus_fields SET readonly=true
WHERE collection='inventory_import_batches' AND field IN (
  'status','inventory_rows','inventory_units','receipt_rows','blocker_count','warning_count',
  'last_run_mode','last_run_status','last_run_at','last_run_log','items','receipt_lines','issues','created_at','updated_at'
);
UPDATE directus_fields SET readonly=true
WHERE collection='inventory_items' AND field NOT IN (
  'authenticity_status','eligibility_status','review_override','review_note'
);
UPDATE directus_fields SET readonly=true
WHERE collection='inventory_import_issues' AND field NOT IN ('resolved','resolution_note');
UPDATE directus_fields SET readonly=true WHERE collection='inventory_receipt_lines';

UPDATE directus_fields SET options=jsonb_set(coalesce(options,'{}'::json)::jsonb,'{start}','"closed"'::jsonb,true)::json
WHERE collection='device_page_settings' AND interface='group-detail';
UPDATE directus_fields SET options=jsonb_set(coalesce(options,'{}'::json)::jsonb,'{start}','"open"'::jsonb,true)::json
WHERE collection='device_page_settings' AND field='group_breadcrumbs';
UPDATE directus_fields SET options=jsonb_set(coalesce(options,'{}'::json)::jsonb,'{start}','"closed"'::jsonb,true)::json
WHERE collection='club_page_settings' AND interface='group-detail';
UPDATE directus_fields SET options=jsonb_set(coalesce(options,'{}'::json)::jsonb,'{start}','"open"'::jsonb,true)::json
WHERE collection='club_page_settings' AND field IN ('group_publication','group_hero');

UPDATE directus_fields field
SET translations=json_build_array(json_build_object(
  'language','ru-RU','translation',coalesce(
    (SELECT override.translation
     FROM isvoi_studio_field_overrides override
     WHERE override.collection=field.collection AND override.field=field.field),
    (SELECT generic.translation
     FROM isvoi_studio_field_labels generic
     WHERE generic.field=field.field),
    (SELECT translation->>'translation'
     FROM jsonb_array_elements(coalesce(field.translations,'[]'::json)::jsonb) translation
     WHERE translation->>'language'='ru-RU'
       AND nullif(translation->>'translation','') IS NOT NULL
     LIMIT 1),
    'Служебное поле: '||field.field
  )
))
WHERE field.collection=ANY(ARRAY[${targetCollections.map(quote).join(",")}]);

CREATE OR REPLACE FUNCTION pg_temp.isvoi_upsert_relation(
  p_many varchar,p_field varchar,p_one varchar,p_one_field varchar,p_action varchar,
  p_junction_field varchar DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many AND many_field=p_field) THEN
    UPDATE directus_relations SET one_collection=p_one,one_field=p_one_field,
      one_deselect_action=p_action,junction_field=p_junction_field
    WHERE many_collection=p_many AND many_field=p_field;
  ELSE
    INSERT INTO directus_relations(
      many_collection,many_field,one_collection,one_field,one_deselect_action,junction_field
    ) VALUES(p_many,p_field,p_one,p_one_field,p_action,p_junction_field);
  END IF;
END $$;

SELECT pg_temp.isvoi_upsert_relation(
  'blog_posts_devices','blog_posts_id','blog_posts','devices','delete','products_id'
);
SELECT pg_temp.isvoi_upsert_relation(
  'blog_posts_devices','products_id','products',NULL,'delete','blog_posts_id'
);

UPDATE directus_fields SET
  options='{"template":"{{products_id.title}} · {{products_id.price_text}}","enableCreate":true,"enableSelect":true,"fields":["sort","products_id"]}'::json,
  note='Опциональные карточки релевантных товаров Catalog V3.',
  translations='[{"language":"ru-RU","translation":"Связанные товары"}]'::json
WHERE collection='blog_posts' AND field='devices';

INSERT INTO directus_fields(
  collection,field,interface,display,options,width,sort,note,special,required,readonly,hidden,translations
)
SELECT 'blog_posts_devices','products_id','select-dropdown-m2o','related-values',
  '{"template":"{{title}} · {{price_text}}"}'::json,'full',3,
  'Товар из единого каталога Catalog V3.','m2o',true,false,false,
  '[{"language":"ru-RU","translation":"Товар"}]'::json
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields WHERE collection='blog_posts_devices' AND field='products_id'
);
UPDATE directus_fields SET interface='select-dropdown-m2o',display='related-values',
  options='{"template":"{{title}} · {{price_text}}"}'::json,width='full',sort=3,
  note='Товар из единого каталога Catalog V3.',special='m2o',required=true,readonly=false,hidden=false,
  translations='[{"language":"ru-RU","translation":"Товар"}]'::json
WHERE collection='blog_posts_devices' AND field='products_id';
UPDATE directus_fields SET hidden=true,readonly=true,required=false,sort=99,
  translations='[{"language":"ru-RU","translation":"Legacy-устройство"}]'::json
WHERE collection='blog_posts_devices' AND field='devices_id';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_permission(
  p_policy text,p_collection varchar,p_action varchar,p_fields text,
  p_permissions json DEFAULT NULL,p_validation json DEFAULT NULL,p_presets json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE policy_id uuid;
BEGIN
  SELECT id INTO policy_id FROM directus_policies WHERE name=p_policy LIMIT 1;
  IF policy_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_permissions WHERE policy=policy_id AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions SET fields=p_fields,permissions=p_permissions,validation=p_validation,presets=p_presets
    WHERE policy=policy_id AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation,presets)
    VALUES(policy_id,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
  END IF;
END $$;

DELETE FROM directus_permissions permission USING directus_policies policy
WHERE permission.policy=policy.id
  AND policy.name IN ('ISVOI Editor','ISVOI Advanced Editor','ISVOI Importer')
  AND permission.collection IN ('devices','device_images');

DELETE FROM directus_permissions permission USING directus_policies policy
WHERE permission.policy=policy.id AND policy.name='ISVOI Importer'
  AND permission.collection IN (
    'products','product_brands','product_categories','device_models','product_images',
    'device_details','accessory_details','product_compatible_models','device_passports','trade_options'
  ) AND permission.action IN ('create','update','delete');

DELETE FROM directus_permissions permission USING directus_policies policy
WHERE permission.policy=policy.id AND policy.name='ISVOI Inventory Manager'
  AND permission.collection='products' AND permission.action IN ('create','update','delete');

SELECT pg_temp.isvoi_permission('ISVOI Editor','products','read',
  'id,sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,admin_note,created_at,updated_at,images,device_details,accessory_details,compatible_models,passport,trade_options_v3,leads',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Editor','products','create',
  'id,sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,admin_note',
  NULL,'{"_and":[{"status":{"_eq":"draft"}},{"content_status":{"_in":["needs_content","needs_photo","review"]}}]}'::json,
  '{"status":"draft","content_status":"needs_content","stock_status":"available","sale_mode":"reservation"}'::json);
SELECT pg_temp.isvoi_permission('ISVOI Editor','products','update',
  'sku,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,admin_note',
  '{"status":{"_eq":"draft"}}'::json,
  '{"_and":[{"status":{"_eq":"draft"}},{"content_status":{"_in":["needs_content","needs_photo","review"]}}]}'::json);

SELECT pg_temp.isvoi_permission('ISVOI Advanced Editor','products','read',
  'id,sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,source_system,source_id,import_batch,imported_at,admin_note,created_at,updated_at,images,device_details,accessory_details,compatible_models,passport,trade_options_v3,leads',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Advanced Editor','products','update',
  'sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,admin_note',NULL);

DO $$
DECLARE collection_name text;
BEGIN
  FOREACH collection_name IN ARRAY ARRAY['product_brands','product_categories','device_models'] LOOP
    DELETE FROM directus_permissions permission USING directus_policies policy
    WHERE permission.policy=policy.id AND policy.name='ISVOI Editor'
      AND permission.collection=collection_name AND permission.action IN ('create','update','delete');
  END LOOP;
END $$;

DO $$
DECLARE collection_name text; read_fields text; write_fields text;
BEGIN
  FOREACH collection_name IN ARRAY ARRAY['product_brands','product_categories','device_models'] LOOP
    read_fields := CASE collection_name
      WHEN 'product_brands' THEN 'id,slug,name,logo_file,is_active,sort,created_at,updated_at,models,products'
      WHEN 'product_categories' THEN 'id,slug,name,catalog_section,parent,is_active,sort,created_at,updated_at,children,products'
      ELSE 'id,slug,brand,name,family,year,is_active,sort,created_at,updated_at,products,compatible_products'
    END;
    write_fields := CASE collection_name
      WHEN 'product_brands' THEN 'id,slug,name,logo_file,is_active,sort'
      WHEN 'product_categories' THEN 'id,slug,name,catalog_section,parent,is_active,sort'
      ELSE 'id,slug,brand,name,family,year,is_active,sort'
    END;
    PERFORM pg_temp.isvoi_permission(
      'ISVOI Advanced Editor',collection_name,'read',read_fields,NULL
    );
    PERFORM pg_temp.isvoi_permission(
      'ISVOI Advanced Editor',collection_name,'create',write_fields,NULL
    );
    PERFORM pg_temp.isvoi_permission(
      'ISVOI Advanced Editor',collection_name,'update',write_fields,NULL
    );
    PERFORM pg_temp.isvoi_permission(
      'ISVOI Advanced Editor',collection_name,'delete','id',NULL
    );
  END LOOP;
END $$;

SELECT pg_temp.isvoi_permission('ISVOI Editor','device_passports','create',
  'product,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Editor','device_passports','update',
  'product,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Editor','trade_options','create','product,value,label,sort,is_active',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Editor','trade_options','update','product,value,label,sort,is_active',NULL);

SELECT pg_temp.isvoi_permission('ISVOI Editor','blog_posts_devices','read','id,blog_posts_id,products_id,sort',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Editor','blog_posts_devices','create','blog_posts_id,products_id,sort',NULL,
  '{"_and":[{"blog_posts_id":{"_nnull":true}},{"products_id":{"_nnull":true}}]}'::json,'{"sort":100}'::json);
SELECT pg_temp.isvoi_permission('ISVOI Editor','blog_posts_devices','update','blog_posts_id,products_id,sort',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Editor','blog_posts_devices','delete','id,blog_posts_id,products_id',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Public Read','blog_posts_devices','read','id,blog_posts_id,products_id,sort',
  '{"blog_posts_id":{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}}'::json);
SELECT pg_temp.isvoi_permission('ISVOI Blog Preview','blog_posts_devices','read','id,blog_posts_id,products_id,sort',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Blog Preview','products','read',
  'id,title,price_text,stock_status,warranty_text,listing_file,listing_alt,device_details',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Blog Preview','device_details','read','id,product,grade,battery_text',NULL);

SELECT pg_temp.isvoi_permission('ISVOI Inventory Manager','inventory_import_batches','create',
  'batch_name,source_system,snapshot_at,inventory_workbook,receipts_workbook,confirm_missing_deactivation,note',NULL,NULL,
  '{"status":"draft","source_system":"store_inventory","confirm_missing_deactivation":false}'::json);
SELECT pg_temp.isvoi_permission('ISVOI Inventory Manager','inventory_import_batches','update',
  'batch_name,snapshot_at,inventory_workbook,receipts_workbook,confirm_missing_deactivation,note',NULL);
SELECT pg_temp.isvoi_permission('ISVOI Inventory Manager','inventory_items','update',
  'authenticity_status,eligibility_status,review_override,review_note',NULL,
  '{"_or":[{"eligibility_status":{"_neq":"eligible"}},{"_and":[{"review_override":{"_eq":true}},{"review_note":{"_nempty":true}},{"authenticity_status":{"_in":["verified","not_required"]}}]}]}'::json);
SELECT pg_temp.isvoi_permission('ISVOI Inventory Manager','inventory_import_issues','update','resolved,resolution_note',NULL);
DELETE FROM directus_permissions permission USING directus_policies policy
WHERE permission.policy=policy.id AND policy.name='ISVOI Inventory Manager'
  AND permission.collection IN ('inventory_items','inventory_receipt_lines','inventory_import_issues')
  AND permission.action IN ('create','delete');
DELETE FROM directus_permissions permission USING directus_policies policy
WHERE permission.policy=policy.id AND policy.name='ISVOI Inventory Manager'
  AND permission.collection='inventory_receipt_lines' AND permission.action='update';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_preset(
  p_role varchar,p_collection varchar,p_bookmark varchar,p_icon varchar,p_color varchar,
  p_filter json,p_fields json,p_sort json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE role_id uuid;
BEGIN
  SELECT id INTO role_id FROM directus_roles WHERE name=p_role LIMIT 1;
  IF role_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_presets WHERE role=role_id AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL) THEN
    UPDATE directus_presets SET icon=p_icon,color=p_color,filter=p_filter,layout='tabular',
      layout_query=json_build_object('tabular',json_build_object('sort',p_sort,'fields',p_fields,'page',1))
    WHERE role=role_id AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets(role,collection,bookmark,icon,color,filter,layout,layout_query)
    VALUES(role_id,p_collection,p_bookmark,p_icon,p_color,p_filter,'tabular',
      json_build_object('tabular',json_build_object('sort',p_sort,'fields',p_fields,'page',1)));
  END IF;
END $$;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_preset(role_name,'products','Нужны фото','photo_camera','#d97706','{"content_status":{"_eq":"needs_photo"}}',
      '["title","sku","product_type","condition","stock_quantity","content_status"]','["sort","title"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Нужен текст','edit_note','#ca8a04','{"content_status":{"_eq":"needs_content"}}',
      '["title","sku","product_type","condition","content_status","admin_note"]','["sort","title"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Нужен Passport или диагностика','verified_user','#dc2626',
      '{"_and":[{"product_type":{"_eq":"device"}},{"condition":{"_eq":"used"}},{"passport":{"_none":{}}}]}',
      '["title","sku","condition","content_status","status"]','["sort","title"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Нет цены или остатка','payments','#dc2626',
      '{"_or":[{"price":{"_lte":0}},{"stock_quantity":{"_lte":0}}]}',
      '["title","sku","price","stock_quantity","stock_status","content_status"]','["sort","title"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Готово к проверке','fact_check','#2563eb','{"content_status":{"_eq":"review"}}',
      '["title","sku","product_type","price","stock_quantity","content_status","status"]','["sort","title"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Опубликовано','public','#059669','{"status":{"_eq":"published"}}',
      '["title","sku","product_type","price","stock_quantity","stock_status","updated_at"]','["sort","title"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Продано или скрыто','visibility_off','#64748b',
      '{"stock_status":{"_in":["sold","hidden"]}}',
      '["title","sku","stock_status","status","content_status","updated_at"]','["-updated_at"]');
    PERFORM pg_temp.isvoi_preset(role_name,'products','Аксессуары без совместимости','link_off','#d97706',
      '{"_and":[{"product_type":{"_eq":"accessory"}},{"accessory_details":{"compatibility_mode":{"_eq":"model_specific"}}},{"compatible_models":{"_none":{}}}]}',
      '["title","sku","brand","category","content_status","status"]','["sort","title"]');
  END LOOP;
END $$;

SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_import_issues','1 · Открытые блокеры','report_problem','#dc2626',
  '{"_and":[{"severity":{"_eq":"blocker"}},{"resolved":{"_eq":false}},{"batch":{"status":{"_neq":"archived"}}}]}',
  '["batch","severity","code","message","resolved","resolution_note"]','["-created_at"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_import_issues','2 · Открытые предупреждения','warning','#d97706',
  '{"_and":[{"severity":{"_eq":"warning"}},{"resolved":{"_eq":false}},{"batch":{"status":{"_neq":"archived"}}}]}',
  '["batch","severity","code","message","resolved","resolution_note"]','["-created_at"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_import_issues','3 · Проблемы активной партии','history','#2563eb',
  '{"_and":[{"resolved":{"_eq":false}},{"batch":{"status":{"_neq":"archived"}}}]}',
  '["batch","severity","code","message","resolved"]','["-created_at"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_items','1 · Проверить происхождение','policy','#dc2626',
  '{"authenticity_status":{"_in":["pending","review","blocked"]}}',
  '["source_title","source_sku","quantity","authenticity_status","eligibility_status","block_reason"]','["source_title"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_items','2 · Исправить идентичность','fingerprint','#dc2626',
  '{"identity_status":{"_eq":"conflict"}}',
  '["source_title","source_sku","quantity","identity_status","authenticity_status","block_reason"]','["source_title"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_items','3 · Готово к передаче','publish','#059669',
  '{"eligibility_status":{"_eq":"eligible"}}',
  '["source_title","source_sku","quantity","retail_price","product","review_note"]','["source_title"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_items','4 · Передано в карточки сайта','check_circle','#2563eb',
  '{"_and":[{"eligibility_status":{"_eq":"eligible"}},{"product":{"_nnull":true}}]}',
  '["source_title","source_sku","quantity","retail_price","product","review_note"]','["source_title"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','inventory_receipt_lines','Требует сверки места','warehouse','#dc2626',
  '{"movement_status":{"_eq":"central_office_inventory_conflict"}}',
  '["received_on","source_title","quantity","movement_status","source_note","inventory_item","match_note"]','["-received_on","source_title"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','channel_category_mappings','Avito: нет подтверждённой категории','rule','#d97706',
  '{"_and":[{"channel":{"_eq":"avito"}},{"is_confirmed":{"_eq":false}}]}',
  '["mapping_key","product_category","external_category","template_version","is_active","is_confirmed"]','["product_category","mapping_key"]');
SELECT pg_temp.isvoi_preset('ISVOI Inventory Manager','product_channel_listings','2 · Avito: готово к QA','fact_check','#2563eb',
  '{"_and":[{"channel":{"_eq":"avito"}},{"status":{"_eq":"ready"}}]}',
  '["external_id","product","status","category_mapping","price_override","sync_status"]','["external_id"]');

DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id AND role.name='ISVOI Editor' AND preset."user" IS NULL
  AND ((preset.collection='faq_items' AND preset.bookmark='Активные FAQ')
    OR (preset.collection='navigation_items' AND preset.bookmark IN ('Footer','Шапка')));

DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id
  AND role.name IN ('ISVOI Editor','ISVOI Advanced Editor','ISVOI Importer','ISVOI Inventory Manager')
  AND preset."user" IS NULL
  AND preset.collection IN ('devices','device_images');

DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id AND role.name='ISVOI Inventory Manager' AND preset."user" IS NULL
  AND (
    (preset.collection='inventory_items' AND preset.bookmark IN (
      'Конфликты','На проверке','Можно в каталог','Требует проверки происхождения',
      'Конфликт идентичности','Можно передать в каталог'
    ))
    OR (preset.collection='inventory_import_issues' AND preset.bookmark IN (
      'Открытые блокеры','Открытые предупреждения','Проблемы последних партий'
    ))
    OR (preset.collection='product_channel_listings' AND preset.bookmark IN (
      'Avito: черновики','Avito: готово к QA','Avito: активные'
    ))
  );

${rollback ? "" : "COMMIT;"}

SELECT 'studio_ux.groups' AS check_name,count(*)::text AS value
FROM directus_collections WHERE collection IN (
  'isvoi_site_content','isvoi_catalog','isvoi_sales','isvoi_blog','isvoi_imports','isvoi_inventory',
  'isvoi_channels'
)
UNION ALL
SELECT 'studio_ux.blog_product_links',count(*)::text FROM blog_posts_devices WHERE products_id IS NOT NULL
UNION ALL
SELECT 'studio_ux.unmatched_blog_links',count(*)::text FROM blog_posts_devices WHERE products_id IS NULL;
${rollback ? "ROLLBACK;" : ""}
`);
