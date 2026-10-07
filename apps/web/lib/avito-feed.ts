type Row = Record<string, unknown>;

export type AvitoListingRow = {
  channel?: unknown;
  status?: unknown;
  external_id?: unknown;
  title_override?: unknown;
  description_override?: unknown;
  price_override?: unknown;
  category_mapping?: unknown;
  attributes?: unknown;
  product?: unknown;
};

export type AvitoFeedOptions = {
  allowedIds: string[];
  preview?: boolean;
};

export type AvitoFeedReport = {
  xml: string;
  exportedIds: string[];
  excluded: { row: number; codes: string[] }[];
  errors: { row: number; codes: string[] }[];
};

// Minimal scalar fields only. Set/BoxSealed stay blocked until their dependent
// XML contract is verified; confirmed kit facts remain in the description.
const ATTRIBUTE_KEYS = [
  "Address",
  "ManagerName",
  "ContactPhone",
  "AdType",
  "Vendor",
  "Model",
  "MemorySize",
  "Color",
  "RamSize",
  "Akb",
  "DeviceFlaws",
  "ScreenCondition",
  "CaseCondition",
] as const;
const ATTRIBUTE_KEY_SET = new Set<string>([...ATTRIBUTE_KEYS, "Condition"]);
const COLORS = new Set([
  "Другое",
  "бежевый",
  "белый",
  "голубой",
  "желтый",
  "зеленый",
  "золотистый",
  "коричневый",
  "красный",
  "оранжевый",
  "розовый",
  "серебристый",
  "серый",
  "синий",
  "темно-серый",
  "фиолетовый",
  "черный",
]);
const SCREEN_CONDITIONS = new Set([
  "Без дефектов",
  "1–2 мелкие царапины",
  "Много мелких царапин",
  "Глубокие царапины",
  "Сколы, трещины",
  "Полосы и битые пиксели",
  "Пятна, блики или выгорание",
  "Был заменен",
]);
const CASE_CONDITIONS = new Set([
  "Без дефектов",
  "Мелкие царапины",
  "Глубокие царапины",
  "Сколы, трещины",
  "Щели, зазоры",
  "Изгиб",
  "Вмятины",
  "Отслоение краски",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function records(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(record) : value ? [record(value)] : [];
}

function numeric(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return NaN;
  if (typeof value === "string" && !value.trim()) return NaN;
  return Number(value);
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validId(value: string): boolean {
  return Boolean(
    value && Array.from(value).length <= 100 && /^[\p{L}\p{N}\\/()[\]\-=]+$/u.test(value),
  );
}

export const AVITO_FEED_MAX_IDS = 6;

export function parseAvitoPilotIds(value: string): string[] {
  const ids = value.split(",").map((id) => id.trim());
  if (ids.length < 1 || ids.length > AVITO_FEED_MAX_IDS || ids.some((id) => !validId(id)))
    return [];
  return new Set(ids).size === ids.length ? ids : [];
}

function imageUrls(product: Row, base: URL): string[] {
  const images = records(product.images)
    .filter((image) => image.status === "published")
    .sort((left, right) => {
      const role = Number(right.role === "card") - Number(left.role === "card");
      return role || (numeric(left.sort) || 0) - (numeric(right.sort) || 0);
    });
  const ids = [product.listing_file, ...images.map((image) => image.image)]
    .map((file) => text(record(file).id) || text(file))
    .filter((id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id));
  return [...new Set(ids)].slice(0, 10).map((id) => {
    const url = new URL(`${base.toString().replace(/\/+$/u, "")}/assets/${encodeURIComponent(id)}`);
    url.search = new URLSearchParams({
      width: "1600",
      height: "1600",
      fit: "inside",
      format: "jpg",
      quality: "90",
    }).toString();
    return url.toString();
  });
}

function privateText(value: string, inventory: Row[]): boolean {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (/(?<!\d)\d{15}(?!\d)/u.test(value)) return true;
  if (/\b(?:IMEI|SERIAL|S\/N)\s*[:#]?\s*[A-Z0-9]{8,}\b/iu.test(value)) return true;
  return inventory.some((item) =>
    [item.serial_full, item.imei_full].some((raw) => {
      const identifier = text(raw)
        .toUpperCase()
        .replace(/[^A-Z0-9]/gu, "");
      return identifier.length >= 8 && normalized.includes(identifier);
    }),
  );
}

export function prepareAvitoFeed(
  rows: AvitoListingRow[],
  directusPublicUrl: string,
  options: AvitoFeedOptions,
): AvitoFeedReport {
  const report: AvitoFeedReport = { xml: "", exportedIds: [], excluded: [], errors: [] };
  const ads: string[] = [];
  const allowedIds = options.allowedIds;
  let base: URL;
  try {
    base = new URL(directusPublicUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
      throw new Error("invalid_asset_origin");
    }
  } catch {
    report.errors.push({ row: -1, codes: ["invalid_asset_origin"] });
    return report;
  }
  if (
    allowedIds.length < 1 ||
    allowedIds.length > AVITO_FEED_MAX_IDS ||
    allowedIds.some((id) => !validId(id)) ||
    new Set(allowedIds).size !== allowedIds.length
  ) {
    report.errors.push({ row: -1, codes: ["invalid_pilot_allowlist"] });
    return report;
  }

  const selected = rows.filter((listing) => allowedIds.includes(text(listing.external_id)));
  if (allowedIds.some((id) => !selected.some((listing) => text(listing.external_id) === id))) {
    report.errors.push({ row: -1, codes: ["missing_pilot_listing"] });
    return report;
  }
  const idCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();
  for (const listing of selected) {
    const id = text(listing.external_id);
    const productId = text(record(listing.product).id);
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    productCounts.set(productId, (productCounts.get(productId) ?? 0) + 1);
  }

  rows.forEach((listing, row) => {
    const id = text(listing.external_id);
    if (!allowedIds.includes(id)) {
      report.excluded.push({ row, codes: ["outside_pilot"] });
      return;
    }
    const product = record(listing.product);
    const mapping = record(listing.category_mapping);
    if (
      listing.channel !== "avito" ||
      (listing.status !== "active" && !(options.preview && listing.status === "draft")) ||
      product.status !== "published" ||
      product.content_status !== "ready" ||
      product.stock_status !== "available" ||
      !(numeric(product.stock_quantity) > 0)
    ) {
      report.excluded.push({ row, codes: ["not_available_for_export"] });
      return;
    }

    const codes: string[] = [];
    const productId = text(product.id);
    const category = record(product.category);
    const mappingCategory =
      text(record(mapping.product_category).id) || text(mapping.product_category);
    const inventory = records(product.inventory_item);
    if (!productId || !validId(id)) codes.push("invalid_identity");
    if ((idCounts.get(id) ?? 0) > 1 || (productCounts.get(productId) ?? 0) > 1) {
      codes.push("duplicate_identity");
    }
    if (
      mapping.channel !== "avito" ||
      mapping.is_active !== true ||
      mapping.is_confirmed !== true ||
      !text(mapping.template_version)
    ) {
      codes.push("unconfirmed_mapping");
    }
    if (
      category.slug !== "smartphones" ||
      !text(category.id) ||
      mappingCategory !== text(category.id) ||
      text(mapping.external_category) !== "Телефоны" ||
      text(mapping.external_goods_type) !== "Мобильные телефоны"
    ) {
      codes.push("unsupported_phone_category");
    }
    if (
      inventory.length !== 1 ||
      inventory[0]?.product !== productId ||
      inventory[0]?.eligibility_status !== "eligible" ||
      !["verified", "not_required"].includes(text(inventory[0]?.authenticity_status)) ||
      !["matched", "not_applicable"].includes(text(inventory[0]?.identity_status)) ||
      inventory[0]?.review_override !== true ||
      !text(inventory[0]?.review_note) ||
      numeric(inventory[0]?.quantity) < numeric(product.stock_quantity) ||
      !(numeric(inventory[0]?.quantity) > 0)
    ) {
      codes.push("inventory_not_approved");
    }

    const attributes = { ...record(mapping.default_attributes), ...record(listing.attributes) };
    if (Object.keys(attributes).some((key) => !ATTRIBUTE_KEY_SET.has(key))) {
      codes.push("unsupported_or_private_attribute");
    }
    if (
      Object.values(attributes).some(
        (value) =>
          value != null &&
          ((typeof value !== "string" && typeof value !== "number") ||
            (typeof value === "number" && !Number.isFinite(value))),
      )
    ) {
      codes.push("invalid_attribute_type");
    }
    const expectedCondition =
      product.condition === "used" ? "Б/у" : product.condition === "new" ? "Новое" : "";
    const condition = text(attributes.Condition) || expectedCondition;
    if (
      !expectedCondition ||
      condition !== expectedCondition ||
      (attributes.Condition != null && typeof attributes.Condition !== "string")
    )
      codes.push("invalid_condition");
    const title = text(listing.title_override) || text(product.title);
    const description =
      text(listing.description_override) ||
      [text(product.short_description), text(product.warranty_text), text(product.completeness)]
        .filter(Boolean)
        .join("\n\n");
    if (!title || Array.from(title).length > 50) codes.push("invalid_title_length");
    if (!description || Array.from(description).length > 7500)
      codes.push("invalid_description_length");
    // Plain text only until the account's supported HTML contract has been reviewed.
    if (/[<>]/u.test(title + description)) codes.push("html_not_supported");
    const price = numeric(listing.price_override ?? product.price);
    if (!Number.isSafeInteger(price) || price <= 0) codes.push("invalid_price");
    if (!Number.isInteger(numeric(product.stock_quantity))) codes.push("invalid_stock_quantity");
    for (const key of ["Address", "AdType", "Vendor", "Model", "MemorySize", "Color", "RamSize"]) {
      if (!text(attributes[key])) codes.push(`missing_${key}`);
    }
    if (Array.from(text(attributes.Address)).length > 256) codes.push("invalid_address");
    if (Array.from(text(attributes.ManagerName)).length > 40) codes.push("invalid_manager_name");
    if (
      attributes.ContactPhone != null &&
      !/^\+?[\d ()-]{10,25}$/u.test(text(attributes.ContactPhone))
    ) {
      codes.push("invalid_contact_phone");
    }
    if (attributes.AdType !== "Товар приобретен на продажу") codes.push("invalid_ad_type");
    if (!COLORS.has(text(attributes.Color))) codes.push("invalid_color");
    if (attributes.Model === "iPhone 16 Pro Max" && attributes.Color === "бежевый")
      codes.push("rejected_model_color_combination");
    if (!/^\d+(?:[.,]\d+)? (?:МБ|ГБ|ТБ)$/u.test(text(attributes.MemorySize))) {
      codes.push("invalid_memory_size");
    }
    if (!/^\d+(?:[.,]\d+)? (?:МБ|ГБ)$/u.test(text(attributes.RamSize)))
      codes.push("invalid_ram_size");
    if (product.condition === "used") {
      if (!["Включается", "Не включается"].includes(text(attributes.DeviceFlaws))) {
        codes.push("invalid_device_flaws");
      }
      if (!SCREEN_CONDITIONS.has(text(attributes.ScreenCondition)))
        codes.push("invalid_screen_condition");
      if (!CASE_CONDITIONS.has(text(attributes.CaseCondition)))
        codes.push("invalid_case_condition");
      if (attributes.Vendor === "Apple") {
        const battery = numeric(attributes.Akb);
        if (!Number.isInteger(battery) || battery < 0 || battery > 100)
          codes.push("invalid_battery");
      }
    }
    const publicValues = [id, title, description, ...Object.values(attributes).map(String)];
    if (publicValues.some((value) => privateText(value, inventory)))
      codes.push("private_identifier");
    if (
      publicValues.some(
        (value) =>
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value) ||
          Array.from(value).some((character) => {
            const point = character.codePointAt(0) ?? 0;
            return point >= 0xd800 && point <= 0xdfff;
          }),
      )
    ) {
      codes.push("invalid_xml_character");
    }
    const images = imageUrls(product, base);
    if (!images.length) codes.push("missing_images");
    if (codes.length) {
      report.errors.push({ row, codes: [...new Set(codes)] });
      return;
    }

    const elements = [
      `<Id>${xml(id)}</Id>`,
      "<Category>Телефоны</Category>",
      "<GoodsType>Мобильные телефоны</GoodsType>",
      `<Title>${xml(title)}</Title>`,
      `<Description>${xml(description)}</Description>`,
      `<Price>${price}</Price>`,
      `<Condition>${xml(condition)}</Condition>`,
      `<Images>${images.map((url) => `<Image url="${xml(url)}" />`).join("")}</Images>`,
      ...ATTRIBUTE_KEYS.flatMap((key) =>
        attributes[key] == null || attributes[key] === ""
          ? []
          : [`<${key}>${xml(attributes[key])}</${key}>`],
      ),
    ];
    ads.push(`<Ad>${elements.join("")}</Ad>`);
    report.exportedIds.push(id);
  });

  // Never serve a partial pilot when one of its exportable listings fails validation.
  if (!report.errors.length) {
    report.xml = `<?xml version="1.0" encoding="UTF-8"?><Ads formatVersion="3" target="Avito.ru">${ads.join("")}</Ads>`;
  } else {
    report.exportedIds = [];
  }
  return report;
}

export function buildAvitoFeed(
  rows: AvitoListingRow[],
  directusPublicUrl: string,
  options: AvitoFeedOptions,
): string {
  return prepareAvitoFeed(rows, directusPublicUrl, options).xml;
}
