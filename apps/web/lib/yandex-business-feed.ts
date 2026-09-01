type Row = Record<string, unknown>;

export type YandexBusinessProductRow = {
  id?: unknown;
  product_type?: unknown;
  condition?: unknown;
  status?: unknown;
  content_status?: unknown;
  stock_status?: unknown;
  stock_quantity?: unknown;
  title?: unknown;
  short_description?: unknown;
  headline?: unknown;
  warranty?: unknown;
  warranty_text?: unknown;
  completeness?: unknown;
  listing_file?: unknown;
  brand?: unknown;
  category?: unknown;
  device_details?: unknown;
  offers?: unknown;
};

export type YandexBusinessOffer = {
  id: string;
  name: string;
  vendor: string;
  price: number;
  categoryId: string;
  categoryName: string;
  picture: string;
  description: string;
  shortDescription: string;
  url: string;
};

const CATEGORY_BY_BRAND = {
  apple: { id: "101", name: "iPhone с пробегом" },
  samsung: { id: "102", name: "Samsung Galaxy с пробегом" },
} as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function relation(value: unknown): Row {
  return Array.isArray(value) ? record(value[0]) : record(value);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sentence(value: unknown): string {
  const valueText = text(value).replace(/[.;,:\s]+$/u, "");
  return valueText ? `${valueText}.` : "";
}

function truncate(value: unknown, limit: number): string {
  const valueText = text(value);
  if (valueText.length <= limit) return valueText;
  const shortened = valueText
    .slice(0, limit - 1)
    .replace(/\s+\S*$/u, "")
    .trim();
  return `${shortened}…`;
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function categoryFor(product: YandexBusinessProductRow) {
  const category = relation(product.category);
  if (text(category.slug) !== "smartphones") return null;

  const brand = relation(product.brand);
  const brandKey = text(brand.slug).toLowerCase();
  if (brandKey === "apple" || brandKey === "samsung") return CATEGORY_BY_BRAND[brandKey];

  const brandName = text(brand.name).toLowerCase();
  if (brandName === "apple" || brandName === "samsung") return CATEGORY_BY_BRAND[brandName];
  return null;
}

function offerFor(product: YandexBusinessProductRow): Row | null {
  if (!Array.isArray(product.offers)) return null;
  return (
    product.offers
      .map(record)
      .filter((offer) => {
        const location = relation(offer.location);
        return (
          text(offer.status) === "published" &&
          text(offer.stock_status) === "available" &&
          number(offer.stock_quantity) > 0 &&
          number(offer.price) > 0 &&
          text(location.slug) === "belgorod" &&
          text(location.status) === "published"
        );
      })
      .sort((left, right) => text(right.updated_at).localeCompare(text(left.updated_at)))[0] ?? null
  );
}

function assetId(value: unknown): string {
  const file = relation(value);
  return text(file.id) || text(value);
}

export function selectYandexBusinessOffers(
  rows: YandexBusinessProductRow[],
  options: { directusPublicUrl: string; siteUrl: string },
): YandexBusinessOffer[] {
  const directusPublicUrl = options.directusPublicUrl.replace(/\/+$/u, "");
  const siteUrl = options.siteUrl.replace(/\/+$/u, "");

  return rows.flatMap((product) => {
    const category = categoryFor(product);
    const offer = offerFor(product);
    const id = text(product.id);
    const title = truncate(product.title, 250);
    const listingFileId = assetId(product.listing_file);
    const brand = relation(product.brand);
    const vendor = text(brand.name);
    const details = relation(product.device_details);

    const eligible =
      product.status === "published" &&
      product.content_status === "ready" &&
      product.product_type === "device" &&
      product.condition === "used" &&
      product.stock_status === "available" &&
      number(product.stock_quantity) > 0 &&
      Boolean(category && offer && id && title && listingFileId && vendor);
    if (!eligible || !category || !offer) return [];

    const price = Math.round(number(offer.price));
    const grade = text(details.grade);
    const battery = text(details.battery_text);
    const shortDescription = truncate(
      text(product.headline) ||
        `Проверенное устройство с Passport.${grade ? ` Грейд ${grade}.` : ""}${battery ? ` ${battery}` : ""}`,
      250,
    );
    const description = truncate(
      [
        sentence(product.short_description),
        sentence(grade ? `Состояние: грейд ${grade}` : ""),
        sentence(battery),
        sentence(product.completeness ? `Комплект: ${text(product.completeness)}` : ""),
        sentence(text(product.warranty_text) || text(product.warranty) || "Гарантия 90 дней"),
        "Фактическое состояние показано на фотографиях. Полный Passport устройства доступен в магазине.",
      ]
        .filter(Boolean)
        .join(" "),
      3000,
    );
    const pictureParams = new URLSearchParams({
      width: "1200",
      height: "900",
      fit: "cover",
      format: "jpg",
      quality: "90",
    });
    const trackingParams = new URLSearchParams({
      utm_source: "yandex_business",
      utm_medium: "organic",
      utm_campaign: "products",
    });

    return [
      {
        id,
        name: title,
        vendor,
        price,
        categoryId: category.id,
        categoryName: category.name,
        picture: `${directusPublicUrl}/assets/${encodeURIComponent(listingFileId)}?${pictureParams}`,
        description,
        shortDescription,
        url: `${siteUrl}/product/${encodeURIComponent(id)}?${trackingParams}`,
      },
    ];
  });
}

export function buildYandexBusinessFeed(offers: YandexBusinessOffer[]): string {
  const categories = new Map(offers.map((offer) => [offer.categoryId, offer.categoryName]));
  const categoryXml = [...categories]
    .map(([id, name]) => `            <category id="${xml(id)}">${xml(name)}</category>`)
    .join("\n");
  const offerXml = offers
    .map(
      (offer) => `            <offer id="${xml(offer.id)}">
                <name>${xml(offer.name)}</name>
                <vendor>${xml(offer.vendor)}</vendor>
                <price>${offer.price}</price>
                <currencyId>RUB</currencyId>
                <categoryId>${xml(offer.categoryId)}</categoryId>
                <picture>${xml(offer.picture)}</picture>
                <description>${xml(offer.description)}</description>
                <shortDescription>${xml(offer.shortDescription)}</shortDescription>
                <url>${xml(offer.url)}</url>
            </offer>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog>
    <shop>
        <categories>
${categoryXml}
        </categories>
        <offers>
${offerXml}
        </offers>
    </shop>
</yml_catalog>
`;
}
