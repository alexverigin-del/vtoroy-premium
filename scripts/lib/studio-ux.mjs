export const humanRoles = [
  "Administrator",
  "ISVOI Editor",
  "ISVOI Advanced Editor",
  "ISVOI Importer",
  "ISVOI Inventory Manager",
];

export const navigationGroups = [
  ["isvoi_site_content", "Сайт и контент", "web", null, 10],
  ["isvoi_catalog", "Каталог", "inventory_2", null, 20],
  ["isvoi_locations", "Магазины", "storefront", null, 30],
  ["isvoi_sales", "Продажи", "support_agent", null, 40],
  ["isvoi_trade", "Trade-in", "sync_alt", null, 50],
  ["isvoi_blog", "Блог", "article", null, 60],
  ["isvoi_club", "I СВОИ Club", "workspace_premium", null, 70],
  ["isvoi_operations", "Склад и импорт", "warehouse", null, 80],
  ["isvoi_inventory", "Склад и сверка", "fact_check", "isvoi_operations", 10],
  ["isvoi_imports", "Импорт каталога", "upload_file", "isvoi_operations", 20],
  ["isvoi_channels", "Каналы продаж", "campaign", null, 90],
  ["isvoi_site_tools", "Интеграции и согласие", "extension", "isvoi_site_content", 60],
  ["isvoi_catalog_reference", "Справочники", "menu_book", "isvoi_catalog", 80],
];

export const collectionGroups = {
  site_integrations: "isvoi_site_tools",
  integration_consent_settings: "isvoi_site_tools",
  trade_settings: "isvoi_trade",
  trade_pricing_versions: "isvoi_trade",
  trade_device_configs: "isvoi_trade",
  trade_condition_rules: "isvoi_trade",
  trade_quotes: "isvoi_trade",
  trade_events: "isvoi_trade",
  product_brands: "isvoi_catalog_reference",
  product_categories: "isvoi_catalog_reference",
  device_models: "isvoi_catalog_reference",
  device_model_specifications: "isvoi_catalog_reference",
};

export const defaults = {
  page_sections: { fields: ["headline", "is_active", "sort_order"], sort: ["sort_order"] },
  products: {
    fields: ["listing_file", "title", "sku", "content_status", "status", "stock_status"],
    sort: ["title"],
  },
  site_pages: { fields: ["title", "status", "slug"], sort: ["slug"] },
  store_locations: { fields: ["city", "address", "status", "phone"], sort: ["sort"] },
  product_offers: {
    fields: ["product.title", "location.city", "price", "stock_quantity", "stock_status", "status"],
    sort: ["location.city", "product.title"],
  },
  leads: {
    fields: ["created_at", "kind", "status", "assigned_to", "next_action_at", "contact"],
    sort: ["-created_at"],
    filter: { is_test: { _eq: false }, status: { _in: ["new", "in_progress", "waiting"] } },
  },
  trade_pricing_versions: {
    fields: ["version", "status", "published_at", "change_reason"],
    sort: ["-created_at"],
  },
  trade_device_configs: {
    fields: [
      "device_model.name",
      "storage",
      "base_min",
      "base_max",
      "pricing_version.version",
      "status",
    ],
    sort: ["sort"],
    filter: { pricing_version: { status: { _eq: "published" } } },
  },
  trade_condition_rules: {
    fields: [
      "question_label",
      "option_label",
      "delta_min",
      "delta_max",
      "pricing_version.version",
      "status",
    ],
    sort: ["question_sort", "option_sort"],
    filter: { pricing_version: { status: { _eq: "published" } } },
  },
  site_integrations: { fields: ["name", "status", "provider", "consent_category"], sort: ["sort"] },
  faq_items: { fields: ["question", "page.title", "is_active", "category"], sort: ["sort"] },
};

export const russianValues = {
  draft: "Черновик",
  published: "Опубликовано",
  archived: "Архив",
  paused: "Приостановлено",
  ready: "Готово",
  review: "На проверке",
  needs_photo: "Нужны фото",
  needs_copy: "Нужен текст",
  available: "В наличии",
  reserved: "Забронировано",
  sold: "Продано",
  hidden: "Скрыто",
  reservation: "Заявка на резерв",
  new: "Новая",
  in_progress: "В работе",
  waiting: "Ждём ответа",
  won: "Успешно завершено",
  closed: "Закрыто",
  device: "Техника",
  accessory: "Аксессуар",
  used: "С пробегом",
  home: "Главная",
  catalog: "Каталог",
  store: "Магазин",
  info: "Информация",
  blog: "Блог",
  trade: "Trade",
  club: "Club",
  passport: "Passport",
};

export function literal(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}
export const sqlJson = (value) => `${literal(JSON.stringify(value))}::jsonb`;

// Top-level predicates are ANDed by Directus; this is stable on repeated setup.
export const workingLeadOptionsSql = (expression) =>
  `(${expression})::jsonb || jsonb_build_object('filter', coalesce((${expression})::jsonb->'filter','{}'::jsonb) || '{"is_test":{"_eq":false}}'::jsonb)`;
