type Row = Record<string, unknown>;

export type AvitoListingRow = {
  external_id?: unknown;
  title_override?: unknown;
  description_override?: unknown;
  price_override?: unknown;
  category_mapping?: unknown;
  category_code?: unknown;
  attributes?: unknown;
  product?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function publicAssetUrl(value: unknown, directusPublicUrl: string): string {
  const file = record(value);
  const id = text(file.id) || text(value);
  return id ? `${directusPublicUrl}/assets/${encodeURIComponent(id)}` : "";
}

function attributeElements(value: unknown): string[] {
  const reserved = new Set([
    "Id",
    "Title",
    "Description",
    "Price",
    "Category",
    "Condition",
    "Images",
  ]);
  return Object.entries(record(value)).flatMap(([key, raw]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || reserved.has(key) || raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.flatMap((item) =>
        ["string", "number", "boolean"].includes(typeof item)
          ? [`<${key}>${xml(item)}</${key}>`]
          : [],
      );
    }
    return ["string", "number", "boolean"].includes(typeof raw)
      ? [`<${key}>${xml(raw)}</${key}>`]
      : [];
  });
}

export function buildAvitoFeed(rows: AvitoListingRow[], directusPublicUrl: string): string {
  const ads = rows.flatMap((listing) => {
    const product = record(listing.product);
    const mapping = record(listing.category_mapping);
    const id = text(listing.external_id);
    const title = text(listing.title_override) || text(product.title);
    const category = text(mapping.external_category);
    const goodsType = text(mapping.external_goods_type);
    const attributes: Row = {
      ...record(mapping.default_attributes),
      ...record(listing.attributes),
      ...(goodsType ? { GoodsType: goodsType } : {}),
    };
    const condition = text(attributes.Condition);
    const price = number(listing.price_override) || number(product.price);
    const quantity = number(product.stock_quantity);
    const ready =
      id &&
      title &&
      category &&
      condition &&
      price > 0 &&
      mapping.channel === "avito" &&
      mapping.is_active === true &&
      mapping.is_confirmed === true &&
      product.status === "published" &&
      product.content_status === "ready" &&
      product.stock_status === "available" &&
      quantity > 0;
    if (!ready) return [];

    const description =
      text(listing.description_override) ||
      [text(product.short_description), text(product.warranty_text), text(product.completeness)]
        .filter(Boolean)
        .join("\n\n");
    const images = Array.isArray(product.images)
      ? product.images
          .map((image) => record(image))
          .filter((image) => image.status === "published")
          .map((image) => publicAssetUrl(image.image, directusPublicUrl))
          .filter(Boolean)
      : [];
    if (images.length === 0) return [];

    const elements = [
      `<Id>${xml(id)}</Id>`,
      `<Category>${xml(category)}</Category>`,
      `<Title>${xml(title)}</Title>`,
      `<Description>${xml(description)}</Description>`,
      `<Price>${Math.round(price)}</Price>`,
      `<Condition>${xml(condition)}</Condition>`,
      `<Images>${images.map((url) => `<Image url="${xml(url)}" />`).join("")}</Images>`,
      ...attributeElements(attributes),
    ];
    return [`<Ad>${elements.join("")}</Ad>`];
  });

  return `<?xml version="1.0" encoding="UTF-8"?><Ads formatVersion="3" target="Avito.ru">${ads.join("")}</Ads>`;
}
