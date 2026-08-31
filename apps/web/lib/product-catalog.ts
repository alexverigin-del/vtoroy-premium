import { cache } from "react";
import type {
  AccessoryDetails,
  CatalogProduct,
  DeviceDetails,
  DeviceModel,
  DevicePassport,
  GalleryImage,
  ProductBrand,
  ProductCardData,
  ProductCatalogFacets,
  ProductCatalogFilters,
  ProductCatalogResult,
  ProductCategory,
  ProductOffer,
  ProductType,
  StoreLocation,
  TradeInfo,
} from "@vtoroy/shared";

import { getDeviceBySlug, getPublishedDeviceCards, directusAssetUrl } from "./directus";
import { PRODUCTS_CACHE_TAG } from "./cache-tags";
import { cityScopedLabel } from "./city-copy";

const DIRECTUS_URL = (
  process.env.DIRECTUS_URL ??
  process.env.NEXT_PUBLIC_DIRECTUS_URL ??
  ""
).replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? "";
const REVALIDATE = 300;
const DEFAULT_PAGE_SIZE = 24;

export type CatalogSource = "legacy" | "v3";

export function getCatalogSource(): CatalogSource {
  return process.env.CATALOG_SOURCE === "v3" ? "v3" : "legacy";
}

type Row = Record<string, unknown>;
type DirectusResponse<T> = {
  data: T;
  meta?: {
    filter_count?: number;
    total_count?: number;
  };
};

const PRODUCT_CARD_FIELDS = [
  "id",
  "sku",
  "product_type",
  "condition",
  "sale_mode",
  "status",
  "content_status",
  "stock_status",
  "stock_quantity",
  "sort",
  "title",
  "model",
  "color",
  "price",
  "price_text",
  "warranty",
  "warranty_text",
  "completeness",
  "short_description",
  "headline",
  "listing_alt",
  "updated_at",
  "listing_file.id",
  "brand.id",
  "brand.slug",
  "brand.name",
  "category.id",
  "category.slug",
  "category.name",
  "category.catalog_section",
  "category.parent.slug",
  "device_model.id",
  "device_model.slug",
  "device_model.name",
  "device_model.family",
  "device_model.year",
  "device_model.brand.id",
  "device_model.brand.slug",
  "device_model.brand.name",
  "device_details.storage",
  "device_details.grade",
  "device_details.battery_text",
  "device_details.diagnostic_date",
  "accessory_details.compatibility_mode",
  "accessory_details.material",
  "accessory_details.connection_type",
  "offers.id",
  "offers.product",
  "offers.local_sku",
  "offers.status",
  "offers.price",
  "offers.price_text",
  "offers.stock_quantity",
  "offers.stock_status",
  "offers.sale_mode",
  "offers.pickup_enabled",
  "offers.local_delivery_enabled",
  "offers.intercity_delivery_enabled",
  "offers.preparation_days",
  "offers.delivery_estimate",
  "offers.yandex_pay_enabled",
  "offers.yandex_split_enabled",
  "offers.updated_at",
  "offers.location.id",
  "offers.location.slug",
  "offers.location.status",
  "offers.location.name",
  "offers.location.city",
  "offers.location.region",
  "offers.location.address",
  "offers.location.phone",
  "offers.location.telegram",
  "offers.location.email",
  "offers.location.business_hours",
  "offers.location.map_url",
  "offers.location.pickup_enabled",
  "offers.location.local_delivery_enabled",
  "offers.location.intercity_delivery_enabled",
  "offers.location.sort",
].join(",");

const PRODUCT_DETAIL_FIELDS = [
  PRODUCT_CARD_FIELDS,
  "device_details.year",
  "device_details.model_identifier",
  "device_details.region",
  "device_details.sim",
  "device_details.battery",
  "device_details.battery_cycles",
  "device_details.activation_lock",
  "device_details.mdm",
  "device_details.diagnostic_by",
  "device_details.imei_primary_last4",
  "device_details.imei_secondary_last4",
  "accessory_details.package_contents",
  "accessory_details.specifications",
].join(",");

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Row;
}

function relation(value: unknown): Row {
  if (Array.isArray(value)) return record(value[0]);
  return record(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const valueText = text(item);
    return valueText ? [valueText] : [];
  });
}

function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function assetUrl(value: unknown, width = 1200, height = 900): string {
  const file = relation(value);
  const id = text(file.id) || text(value);
  return id
    ? directusAssetUrl(id, {
        width,
        height,
        quality: 84,
        fit: "cover",
        format: "auto",
        withoutEnlargement: true,
      })
    : "";
}

function certificateAssetUrls(value: unknown): { preview: string; download: string } {
  const file = relation(value);
  const id = text(file.id) || text(value);
  if (!id) return { preview: "", download: "" };
  return {
    preview: directusAssetUrl(id, {
      width: 1400,
      quality: 92,
      fit: "inside",
      format: "png",
      withoutEnlargement: true,
    }),
    download: directusAssetUrl(id),
  };
}

async function directusRequest<T>(
  path: string,
  options: { noStore?: boolean } = {},
): Promise<DirectusResponse<T> | null> {
  if (!DIRECTUS_URL) return null;
  const headers: Record<string, string> = {};
  if (DIRECTUS_TOKEN) headers.Authorization = `Bearer ${DIRECTUS_TOKEN}`;

  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      headers,
      ...(options.noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate: REVALIDATE, tags: [PRODUCTS_CACHE_TAG] } }),
    });
    if (!response.ok) return null;
    return (await response.json()) as DirectusResponse<T>;
  } catch {
    return null;
  }
}

function mapBrand(value: unknown, fallbackName = ""): ProductBrand {
  const row = relation(value);
  const name = text(row.name, fallbackName);
  return {
    id: text(row.id, text(row.slug, name.toLowerCase().replace(/\s+/g, "-"))),
    slug: text(row.slug, name.toLowerCase().replace(/\s+/g, "-")),
    name,
  };
}

function mapCategory(value: unknown, fallback = ""): ProductCategory {
  const row = relation(value);
  const parent = relation(row.parent);
  const name = text(row.name, fallback);
  const section = text(row.catalog_section) === "accessory" ? "accessory" : "device";
  return {
    id: text(row.id, text(row.slug, fallback)),
    slug: text(row.slug, fallback),
    name,
    catalogSection: section,
    parentSlug: text(parent.slug) || undefined,
  };
}

function mapModel(value: unknown, fallbackBrand?: ProductBrand): DeviceModel | undefined {
  const row = relation(value);
  const name = text(row.name);
  if (!name) return undefined;
  return {
    id: text(row.id, text(row.slug)),
    slug: text(row.slug),
    name,
    family: text(row.family) || undefined,
    year: number(row.year) || undefined,
    brand: mapBrand(row.brand, fallbackBrand?.name),
  };
}

function mapDeviceDetails(value: unknown): DeviceDetails | undefined {
  const row = relation(value);
  if (Object.keys(row).length === 0) return undefined;
  return {
    storage: text(row.storage) || undefined,
    serial: text(row.serial) || undefined,
    imeiPrimaryLast4: text(row.imei_primary_last4) || undefined,
    imeiSecondaryLast4: text(row.imei_secondary_last4) || undefined,
    year: number(row.year) || undefined,
    modelIdentifier: text(row.model_identifier) || undefined,
    region: text(row.region) || undefined,
    sim: text(row.sim) || undefined,
    battery: text(row.battery) || undefined,
    batteryText: text(row.battery_text) || undefined,
    batteryCycles: number(row.battery_cycles) || undefined,
    diagnosticDate: text(row.diagnostic_date) || undefined,
    activationLock: text(row.activation_lock) || undefined,
    mdm: text(row.mdm) || undefined,
    diagnosticBy: text(row.diagnostic_by) || undefined,
    grade: text(row.grade) || undefined,
  };
}

function mapAccessoryDetails(value: unknown): AccessoryDetails | undefined {
  const row = relation(value);
  if (Object.keys(row).length === 0) return undefined;
  const rawSpecifications = record(row.specifications);
  const specifications = Object.fromEntries(
    Object.entries(rawSpecifications).flatMap(([key, value]) => {
      const valueText = text(value);
      return valueText ? [[key, valueText]] : [];
    }),
  );
  return {
    compatibilityMode:
      text(row.compatibility_mode) === "model_specific" ? "model_specific" : "universal",
    material: text(row.material) || undefined,
    connectionType: text(row.connection_type) || undefined,
    packageContents: text(row.package_contents) || undefined,
    specifications,
  };
}

function stockLabel(value: string, quantity: number): string {
  if (value === "reserved") return "Бронь";
  if (value === "sold" || quantity <= 0) return "Нет в наличии";
  return "В наличии";
}

function offerHasStock(offer: ProductOffer | undefined): boolean {
  return Boolean(
    offer &&
    offer.stockStatus !== "hidden" &&
    offer.stockStatus !== "sold" &&
    offer.stockQuantity > 0,
  );
}

function offerCanDeliver(offer: ProductOffer | undefined): boolean {
  return Boolean(
    offerHasStock(offer) && offer?.stockStatus === "available" && offer.intercityDeliveryEnabled,
  );
}

function mapOfferLocation(value: unknown): StoreLocation {
  const row = relation(value);
  return {
    id: text(row.id, text(row.slug)),
    slug: text(row.slug),
    status: text(row.status, "published"),
    name: text(row.name),
    city: text(row.city),
    region: text(row.region) || undefined,
    address: text(row.address) || undefined,
    phone: text(row.phone) || undefined,
    telegram: text(row.telegram) || undefined,
    email: text(row.email) || undefined,
    businessHours: text(row.business_hours) || undefined,
    mapUrl: text(row.map_url) || undefined,
    pickupEnabled: row.pickup_enabled !== false,
    localDeliveryEnabled: row.local_delivery_enabled === true,
    intercityDeliveryEnabled: row.intercity_delivery_enabled === true,
    sort: number(row.sort, 100),
  };
}

function mapOffers(value: unknown, productId: string): ProductOffer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const location = mapOfferLocation(row.location);
    if (!text(row.id) || !location.slug || text(row.status) !== "published") return [];
    const price = number(row.price);
    return [
      {
        id: text(row.id),
        productId: text(row.product, productId),
        location,
        localSku: text(row.local_sku),
        status: text(row.status),
        price,
        priceText: text(row.price_text, formatRub(price)),
        stockQuantity: number(row.stock_quantity),
        stockStatus: text(row.stock_status, "sold"),
        saleMode:
          text(row.sale_mode) === "online"
            ? "online"
            : text(row.sale_mode) === "inquiry"
              ? "inquiry"
              : "reservation",
        pickupEnabled: row.pickup_enabled !== false,
        localDeliveryEnabled: row.local_delivery_enabled === true,
        intercityDeliveryEnabled: row.intercity_delivery_enabled === true,
        preparationDays: number(row.preparation_days) || undefined,
        deliveryEstimate: text(row.delivery_estimate) || undefined,
        yandexPayEnabled: row.yandex_pay_enabled === true,
        yandexSplitEnabled: row.yandex_split_enabled === true,
        updatedAt: text(row.updated_at) || undefined,
      },
    ];
  });
}

function selectOffer(offers: ProductOffer[], city?: string): ProductOffer | undefined {
  const stocked = offers.filter(offerHasStock);
  if (city) {
    return (
      stocked.find((offer) => offer.location.slug === city) ??
      stocked.find((offer) => offerCanDeliver(offer))
    );
  }
  return stocked.sort((a, b) => a.price - b.price)[0] ?? offers[0];
}

function trustFacts(row: Row): string[] {
  const productType = text(row.product_type) === "accessory" ? "accessory" : "device";
  const condition = text(row.condition) === "new" ? "new" : "used";
  const device = mapDeviceDetails(row.device_details);
  const accessory = mapAccessoryDetails(row.accessory_details);
  const values =
    productType === "accessory"
      ? [
          accessory?.compatibilityMode === "model_specific"
            ? "Совместимость по модели"
            : "Универсальный аксессуар",
          accessory?.material,
          accessory?.connectionType,
          text(row.warranty_text) || text(row.warranty),
        ]
      : condition === "used"
        ? [
            device?.grade ? `Грейд ${device.grade}` : "С пробегом",
            device?.batteryText,
            "Passport",
            text(row.warranty_text) || text(row.warranty),
          ]
        : [
            "Новое",
            device?.storage,
            text(row.completeness),
            text(row.warranty_text) || text(row.warranty),
          ];

  return values.flatMap((value) => (value ? [value] : [])).slice(0, 3);
}

function mapProductCard(row: Row, city?: string, cityName?: string): ProductCardData {
  const productType = text(row.product_type) === "accessory" ? "accessory" : "device";
  const condition = text(row.condition) === "new" ? "new" : "used";
  const offers = mapOffers(row.offers, text(row.id));
  const selectedOffer = selectOffer(offers, city);
  const selectedOfferHasStock = offerHasStock(selectedOffer);
  const selectedOfferIsLocal = Boolean(city && selectedOffer?.location.slug === city);
  const stockQuantity = selectedOffer?.stockQuantity ?? (city ? 0 : number(row.stock_quantity));
  const stockStatus =
    selectedOffer?.stockStatus ??
    (city ? "sold" : text(row.stock_status, stockQuantity > 0 ? "available" : "sold"));
  const price = selectedOffer?.price ?? number(row.price);
  const networkPrices = new Set(
    offers
      .filter((offer) => offer.stockStatus !== "hidden" && offer.stockQuantity > 0)
      .map((offer) => offer.price),
  );
  const priceText =
    !city && selectedOffer && networkPrices.size > 1
      ? `от ${selectedOffer.priceText}`
      : (selectedOffer?.priceText ?? text(row.price_text, formatRub(price)));
  const brand = mapBrand(row.brand);
  return {
    id: text(row.id),
    sku: text(row.sku),
    productType,
    condition,
    brand,
    category: mapCategory(row.category),
    title: text(row.title),
    model: text(row.model),
    deviceModelSlug: text(relation(row.device_model).slug) || undefined,
    color: text(row.color),
    price,
    priceText,
    stockQuantity,
    stockStatus,
    stockStatusLabel: selectedOffer
      ? selectedOfferIsLocal
        ? cityScopedLabel(
            selectedOffer.location.city,
            stockLabel(selectedOffer.stockStatus, selectedOffer.stockQuantity),
          )
        : city && offerCanDeliver(selectedOffer)
          ? `${selectedOffer.location.city} · Доставка${selectedOffer.deliveryEstimate ? ` · ${selectedOffer.deliveryEstimate}` : ""}`
          : cityScopedLabel(
              selectedOffer.location.city,
              stockLabel(selectedOffer.stockStatus, selectedOffer.stockQuantity),
            )
      : city
        ? cityScopedLabel(cityName || city, "Нет в наличии")
        : stockLabel(stockStatus, stockQuantity),
    warrantyText: text(row.warranty_text, text(row.warranty)),
    listingImage: assetUrl(row.listing_file, 720, 540),
    listingAlt: text(row.listing_alt, text(row.title)),
    updatedAt: text(row.updated_at) || undefined,
    sort: number(row.sort),
    ctaLabel:
      stockStatus === "sold" || stockQuantity <= 0
        ? "Узнать о поступлении"
        : productType === "accessory"
          ? "Забронировать"
          : "Записаться на просмотр",
    detailHref: `/product/${text(row.id)}`,
    trustFacts: trustFacts(row),
    offers,
    selectedOffer,
    availabilityScope: selectedOfferHasStock
      ? selectedOfferIsLocal
        ? "local"
        : city && offerCanDeliver(selectedOffer)
          ? "delivery"
          : city
            ? "unavailable"
            : "network"
      : city
        ? "unavailable"
        : stockQuantity > 0 && stockStatus !== "sold" && stockStatus !== "hidden"
          ? "network"
          : "unavailable",
  };
}

function mapLegacyCards(
  cards: Awaited<ReturnType<typeof getPublishedDeviceCards>>,
  categories: ProductCategory[] = [],
): ProductCardData[] {
  const categorySlugs: Record<string, string> = {
    iphone: "smartphones",
    ipad: "tablets",
    macbook: "laptops",
    watch: "watches",
    airpods: "headphones",
  };
  return cards.map((card) => {
    const categorySlug = categorySlugs[card.category] ?? card.category;
    const category = categories.find((item) => item.slug === categorySlug) ?? {
      id: categorySlug,
      slug: categorySlug,
      name: card.category,
      catalogSection: "device" as const,
    };
    return {
      id: card.id,
      sku: card.id,
      productType: "device",
      condition: "used",
      brand: { id: "apple", slug: "apple", name: "Apple" },
      category,
      title: card.title,
      model: card.model,
      deviceModelSlug: undefined,
      color: card.color,
      price: card.price,
      priceText: card.priceText,
      stockQuantity: card.stockStatus === "sold" ? 0 : 1,
      stockStatus: card.stockStatus || "available",
      stockStatusLabel: card.stockStatusLabel || "В наличии",
      warrantyText: card.warrantyText,
      listingImage: card.listingImage,
      listingAlt: card.listingAlt,
      updatedAt: card.updatedAt,
      sort: card.sort,
      ctaLabel: "Записаться на просмотр",
      detailHref: `/product/${card.id}`,
      trustFacts: card.trustFacts ?? [],
      offers: [],
      availabilityScope: "network",
    };
  });
}

const getActiveCatalogCategories = cache(async function getActiveCatalogCategories(): Promise<
  ProductCategory[]
> {
  const response = await directusRequest<Row[]>(
    "/items/product_categories?filter[is_active][_eq]=true&fields=id,slug,name,catalog_section,parent.slug&sort=sort,name&limit=500",
  );
  return response?.data.map((row) => mapCategory(row)).filter((item) => item.name) ?? [];
});

function productSort(sort = "default"): string {
  if (sort === "price-asc") return "price,sort";
  if (sort === "price-desc") return "-price,sort";
  if (sort === "updated-desc") return "-updated_at,sort";
  return "sort,-updated_at";
}

function normalizePage(value?: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
}

function normalizePageSize(value?: number): number {
  if (!Number.isFinite(value) || Number(value) <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(Number(value)), 48);
}

export async function getPublishedProducts(
  filters: ProductCatalogFilters = {},
): Promise<ProductCatalogResult> {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);

  if (getCatalogSource() === "legacy") {
    const legacy = mapLegacyCards(
      await getPublishedDeviceCards(),
      await getActiveCatalogCategories(),
    ).filter((product) => {
      if (filters.type && filters.type !== "device") return false;
      if (filters.brand && filters.brand !== product.brand.slug) return false;
      if (filters.category && filters.category !== product.category.slug) return false;
      if (filters.condition && filters.condition !== "used") return false;
      if (filters.stock && filters.stock !== product.stockStatus) return false;
      if (filters.q) {
        const haystack = `${product.title} ${product.model} ${product.brand.name}`.toLowerCase();
        if (!haystack.includes(filters.q.toLowerCase())) return false;
      }
      return true;
    });
    const start = (page - 1) * pageSize;
    return {
      products: legacy.slice(start, start + pageSize),
      total: legacy.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(legacy.length / pageSize)),
    };
  }

  const cityMode = Boolean(filters.city);
  const params = new URLSearchParams({
    "filter[status][_eq]": "published",
    "filter[content_status][_eq]": "ready",
    "filter[stock_status][_neq]": "hidden",
    "filter[stock_quantity][_gt]": "0",
    fields: PRODUCT_CARD_FIELDS,
    limit: cityMode ? "500" : String(pageSize),
    offset: cityMode ? "0" : String((page - 1) * pageSize),
    sort: productSort(filters.sort),
    meta: "filter_count",
  });

  if (filters.q) params.set("search", filters.q);
  if (filters.type) params.set("filter[product_type][_eq]", filters.type);
  if (filters.brand) params.set("filter[brand][slug][_eq]", filters.brand);
  if (filters.category) params.set("filter[category][slug][_eq]", filters.category);
  if (filters.condition) params.set("filter[condition][_eq]", filters.condition);
  if (filters.stock && filters.stock !== "delivery" && !cityMode) {
    params.set("filter[stock_status][_eq]", filters.stock);
  }
  if (filters.compatible) {
    params.set("filter[compatible_models][device_models_id][slug][_eq]", filters.compatible);
  }

  const response = await directusRequest<Row[]>(`/items/products?${params}`);
  if (response) {
    let products = response.data.map((row) => mapProductCard(row, filters.city, filters.cityName));
    if (cityMode) {
      if (filters.stock) {
        products = products.filter((product) => {
          if (filters.stock === "delivery") return product.availabilityScope === "delivery";
          if (filters.stock === "sold") return product.availabilityScope === "unavailable";
          return product.availabilityScope === "local" && product.stockStatus === filters.stock;
        });
      }
      products.sort((a, b) => {
        const rank = { local: 0, delivery: 1, network: 2, unavailable: 3 } as const;
        return rank[a.availabilityScope ?? "network"] - rank[b.availabilityScope ?? "network"];
      });
      const total = products.length;
      const start = (page - 1) * pageSize;
      return {
        products: products.slice(start, start + pageSize),
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    }
    const total = number(response.meta?.filter_count, products.length);
    return {
      products,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  return {
    products: [],
    total: 0,
    page,
    pageSize,
    pageCount: 1,
  };
}

export async function getAllPublishedProductCards(): Promise<ProductCardData[]> {
  const products: ProductCardData[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await getPublishedProducts({ page, pageSize: 48 });
    products.push(...result.products);
    pageCount = result.pageCount;
    page += 1;
  } while (page <= pageCount && page <= 12);
  return products;
}

export async function getAllPublishedV3ProductCards(
  options: { noStore?: boolean } = {},
): Promise<ProductCardData[]> {
  const products: ProductCardData[] = [];
  const pageSize = 48;

  for (let page = 1; page <= 12; page += 1) {
    const params = new URLSearchParams({
      "filter[status][_eq]": "published",
      "filter[content_status][_eq]": "ready",
      "filter[stock_status][_neq]": "hidden",
      "filter[stock_quantity][_gt]": "0",
      fields: PRODUCT_CARD_FIELDS,
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
      sort: productSort(),
    });
    const response = await directusRequest<Row[]>(`/items/products?${params}`, options);
    if (!response) {
      if (options.noStore) throw new Error("Trade catalog unavailable");
      return [];
    }

    const pageProducts = response.data.map((row) => mapProductCard(row));
    products.push(...pageProducts);
    if (pageProducts.length < pageSize) break;
  }

  return products;
}

// Submission checks must bypass the storefront cache and never depend on list pagination.
export async function getPublishedV3ProductForTrade(
  productId: string,
): Promise<ProductCardData | null> {
  const params = new URLSearchParams({
    "filter[id][_eq]": productId,
    "filter[status][_eq]": "published",
    "filter[content_status][_eq]": "ready",
    "filter[stock_status][_neq]": "hidden",
    "filter[stock_quantity][_gt]": "0",
    fields: PRODUCT_CARD_FIELDS,
    limit: "1",
  });
  const response = await directusRequest<Row[]>(`/items/products?${params}`, { noStore: true });
  if (!response) throw new Error("Trade catalog unavailable");
  const row = response.data.find((item) => text(item.id) === productId);
  return row ? mapProductCard(row) : null;
}

export const getProductCatalogFacets = cache(
  async function getProductCatalogFacets(): Promise<ProductCatalogFacets> {
    const source = getCatalogSource();
    const [brands, categories, models, visibleProducts] = await Promise.all([
      directusRequest<Row[]>(
        "/items/product_brands?filter[is_active][_eq]=true&fields=id,slug,name&sort=sort,name&limit=500",
      ),
      getActiveCatalogCategories(),
      directusRequest<Row[]>(
        "/items/device_models?filter[is_active][_eq]=true&fields=id,slug,name,family,year,brand.id,brand.slug,brand.name&sort=brand.name,name&limit=1000",
      ),
      source === "v3"
        ? directusRequest<Row[]>(
            "/items/products?filter[status][_eq]=published&filter[content_status][_eq]=ready&filter[stock_status][_neq]=hidden&filter[stock_quantity][_gt]=0&fields=product_type,brand.slug,category.slug&limit=500",
          )
        : Promise.resolve(null),
    ]);

    const legacyProducts =
      source === "legacy" ? mapLegacyCards(await getPublishedDeviceCards(), categories) : [];
    const visibleRows = visibleProducts?.data ?? [];

    const hasCountSource = source === "legacy" || Boolean(visibleProducts);
    const brandCounts = hasCountSource
      ? source === "legacy"
        ? legacyProducts.reduce((counts, product) => {
            counts.set(product.brand.slug, (counts.get(product.brand.slug) ?? 0) + 1);
            return counts;
          }, new Map<string, number>())
        : visibleRows.reduce((counts, row) => {
            const slug = text(relation(row.brand).slug);
            if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
            return counts;
          }, new Map<string, number>())
      : null;
    const categoryCounts = hasCountSource
      ? source === "legacy"
        ? legacyProducts.reduce((counts, product) => {
            counts.set(product.category.slug, (counts.get(product.category.slug) ?? 0) + 1);
            return counts;
          }, new Map<string, number>())
        : visibleRows.reduce((counts, row) => {
            const slug = text(relation(row.category).slug);
            if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
            return counts;
          }, new Map<string, number>())
      : null;
    const visibleProductCounts = hasCountSource
      ? source === "legacy"
        ? ({ device: legacyProducts.length } satisfies Partial<Record<ProductType, number>>)
        : visibleRows.reduce<Partial<Record<ProductType, number>>>((counts, row) => {
            const productType = text(row.product_type);
            if (productType === "device" || productType === "accessory") {
              counts[productType] = (counts[productType] ?? 0) + 1;
            }
            return counts;
          }, {})
      : undefined;

    return {
      brands: brands?.data
        .map((row) => mapBrand(row))
        .filter((item) => item.name)
        .map((brand) => ({
          ...brand,
          visibleProductCount: brandCounts ? (brandCounts.get(brand.slug) ?? 0) : undefined,
        })) ?? [{ id: "apple", slug: "apple", name: "Apple" }],
      categories: categories.map((category) => ({
        ...category,
        visibleProductCount: categoryCounts ? (categoryCounts.get(category.slug) ?? 0) : undefined,
      })),
      models:
        models?.data.flatMap((row) => {
          const model = mapModel(row);
          return model ? [model] : [];
        }) ?? [],
      visibleProductCounts,
    };
  },
);

function mapGallery(rows: Row[]): GalleryImage[] {
  return rows.flatMap((row) => {
    const src = assetUrl(row.image);
    if (!src) return [];
    return [
      {
        src,
        zoomSrc: assetUrl(row.image, 2400, 1800),
        label: text(row.label, text(row.role)),
        alt: text(row.alt),
        role: text(row.role),
      },
    ];
  });
}

function mapPassport(row: Row | undefined): DevicePassport | undefined {
  if (!row) return undefined;
  return {
    summaryRows: Array.isArray(row.summary_rows)
      ? (row.summary_rows as DevicePassport["summaryRows"])
      : [],
    repair: text(row.repair),
    water: text(row.water),
    diagnostics: {
      status: text(row.diagnostics_status),
      checklist: Array.isArray(row.diagnostics_checklist)
        ? (row.diagnostics_checklist as DevicePassport["diagnostics"]["checklist"])
        : [],
    },
    condition: {
      gradeText: text(row.condition_grade_text),
      note: text(row.condition_note),
      notes: stringList(row.condition_notes),
      defectPhoto: assetUrl(row.defect_photo),
      defectPhotoAlt: text(row.defect_photo_alt),
    },
    story: {
      title: text(row.story_title),
      body: text(row.story_body),
      facts: stringList(row.story_facts),
    },
    warranty: {
      duration: text(row.warranty_duration),
      covered: text(row.warranty_covered),
      notCovered: text(row.warranty_not_covered),
    },
    exitPrice: {
      headline: text(row.exit_headline),
      buyToday: text(row.exit_buy_today),
      tradeInEstimate: text(row.exit_trade_in_estimate),
      condition: text(row.exit_condition),
      note: text(row.exit_note),
    },
  };
}

function mapModelSpecifications(rows: Row[]): NonNullable<DeviceModel["specifications"]> {
  return rows.map((row) => ({
    id: text(row.id),
    groupKey: text(row.group_key),
    groupLabel: text(row.group_label),
    label: text(row.label),
    value: text(row.value),
    sourceUrl: text(row.source_url) || undefined,
    sourceCheckedAt: text(row.source_checked_at) || undefined,
    sort: number(row.sort, 100),
  }));
}

function mapDiagnosticReport(row: Row | undefined): DevicePassport["diagnosticReport"] {
  if (!row) return undefined;
  const certificate = certificateAssetUrls(row.public_file);
  return {
    provider: text(row.provider),
    testedAt: text(row.tested_at),
    status: text(row.status),
    publicCertificateUrl: certificate.preview || undefined,
    publicCertificateDownloadUrl: certificate.download || undefined,
    publicNote: text(row.public_note) || undefined,
  };
}

function mapTrade(rows: Row[]): TradeInfo {
  return {
    options: rows
      .filter((row) => row.is_active !== false)
      .map((row) => ({ value: number(row.value), label: text(row.label) }))
      .filter((item) => item.value > 0 || item.label),
  };
}

function mapCompatibility(rows: Row[], fallbackBrand?: ProductBrand): DeviceModel[] {
  return rows.flatMap((row) => {
    const model = mapModel(row.device_models_id, fallbackBrand);
    return model ? [model] : [];
  });
}

function legacyProduct(
  slug: string,
  device: NonNullable<Awaited<ReturnType<typeof getDeviceBySlug>>>,
): CatalogProduct {
  const card = mapLegacyCards([
    {
      id: device.id,
      tags: device.tags,
      category: device.category,
      model: device.model,
      sort: device.sort,
      title: device.title,
      specs: device.specs,
      color: device.color,
      price: device.price,
      priceText: device.priceText,
      grade: device.grade,
      batteryText: device.batteryText,
      warrantyText: device.warrantyText,
      exitText: device.exitText,
      stockStatus: device.stockStatus,
      stockStatusLabel: device.stockStatusLabel,
      updatedAt: device.updatedAt,
      updatedText: device.updatedText,
      listingImage: device.listingImage,
      listingAlt: device.listingAlt,
      ctaLabel: device.ctaLabel,
      detailHref: `/product/${slug}`,
      trustFacts: [],
    },
  ])[0];
  return {
    ...card,
    saleMode: "reservation",
    shortDescription: device.shortDescription,
    headline: device.headline,
    warranty: device.warranty,
    completeness: device.completeness || "",
    gallery: device.gallery,
    deviceDetails: {
      storage: device.storage,
      serial: device.serial,
      year: device.year,
      modelIdentifier: device.modelIdentifier,
      region: device.region,
      sim: device.sim,
      battery: device.battery,
      batteryText: device.batteryText,
      batteryCycles: device.batteryCycles,
      diagnosticDate: device.diagnosticDate,
      activationLock: device.activationLock,
      mdm: device.mdm,
      diagnosticBy: device.diagnosticBy,
      grade: device.grade,
    },
    passport: device.passport,
    trade: device.trade,
    compatibleModels: [],
  };
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  if (getCatalogSource() === "legacy") {
    const device = await getDeviceBySlug(slug);
    return device ? legacyProduct(slug, device) : null;
  }

  const encoded = encodeURIComponent(slug);
  const [product, images, deviceDetails, accessoryDetails, passport, trade, compatibility] =
    await Promise.all([
      directusRequest<Row[]>(
        `/items/products?filter[id][_eq]=${encoded}&filter[status][_eq]=published&fields=${PRODUCT_DETAIL_FIELDS}&limit=1`,
      ),
      directusRequest<Row[]>(
        `/items/product_images?filter[product][_eq]=${encoded}&filter[status][_eq]=published&fields=id,role,label,alt,sort,image.id&sort=sort&limit=100`,
      ),
      directusRequest<Row[]>(
        `/items/device_details?filter[product][_eq]=${encoded}&fields=*&limit=1`,
      ),
      directusRequest<Row[]>(
        `/items/accessory_details?filter[product][_eq]=${encoded}&fields=*&limit=1`,
      ),
      directusRequest<Row[]>(
        `/items/device_passports?filter[product][_eq]=${encoded}&fields=*&limit=1`,
      ),
      directusRequest<Row[]>(
        `/items/trade_options?filter[product][_eq]=${encoded}&filter[is_active][_eq]=true&fields=*&sort=sort&limit=100`,
      ),
      directusRequest<Row[]>(
        `/items/product_compatible_models?filter[product][_eq]=${encoded}&fields=device_models_id.id,device_models_id.slug,device_models_id.name,device_models_id.family,device_models_id.year,device_models_id.brand.id,device_models_id.brand.slug,device_models_id.brand.name&limit=500`,
      ),
    ]);

  const row = product?.data[0];
  if (!row) return null;

  const card = mapProductCard(row);
  const brand = card.brand;
  const structuredDeviceDetails =
    mapDeviceDetails(deviceDetails?.data[0]) ?? mapDeviceDetails(row.device_details);
  const structuredAccessoryDetails =
    mapAccessoryDetails(accessoryDetails?.data[0]) ?? mapAccessoryDetails(row.accessory_details);
  const modelId = text(relation(row.device_model).id);
  const [modelSpecifications, diagnosticReports] = await Promise.all([
    modelId
      ? directusRequest<Row[]>(
          `/items/device_model_specifications?filter[device_model][_eq]=${encodeURIComponent(modelId)}&filter[is_active][_eq]=true&fields=id,group_key,group_label,label,value,source_url,source_checked_at,sort&sort=sort&limit=100`,
        )
      : Promise.resolve(null),
    directusRequest<Row[]>(
      `/items/device_diagnostic_reports?filter[product][_eq]=${encoded}&filter[status][_eq]=current&fields=provider,tested_at,status,public_note,public_file.id&sort=-tested_at&limit=1`,
    ),
  ]);
  const mappedPassport = mapPassport(passport?.data[0]);
  if (mappedPassport) {
    mappedPassport.diagnosticReport = mapDiagnosticReport(diagnosticReports?.data[0]);
  }
  const mappedModel = mapModel(row.device_model, brand);
  if (mappedModel)
    mappedModel.specifications = mapModelSpecifications(modelSpecifications?.data ?? []);
  return {
    ...card,
    saleMode:
      text(row.sale_mode) === "online"
        ? "online"
        : text(row.sale_mode) === "inquiry"
          ? "inquiry"
          : "reservation",
    deviceModel: mappedModel,
    shortDescription: text(row.short_description),
    headline: text(row.headline, card.title),
    warranty: text(row.warranty),
    completeness: text(row.completeness),
    gallery: mapGallery(images?.data ?? []),
    deviceDetails: structuredDeviceDetails,
    accessoryDetails: structuredAccessoryDetails,
    passport: mappedPassport,
    trade: mapTrade(trade?.data ?? []),
    compatibleModels: mapCompatibility(compatibility?.data ?? [], brand),
  };
}

export async function getRelatedProducts(
  product: CatalogProduct,
): Promise<{ accessories: ProductCardData[]; devices: ProductCardData[] }> {
  if (product.productType === "device" && product.deviceModel?.slug) {
    const accessories = await getPublishedProducts({
      type: "accessory",
      compatible: product.deviceModel.slug,
      pageSize: 6,
    });
    return { accessories: accessories.products, devices: [] };
  }

  if (product.productType === "accessory" && product.compatibleModels.length > 0) {
    const devices = await getPublishedProducts({
      type: "device",
      pageSize: 12,
    });
    const modelSlugs = new Set(product.compatibleModels.map((model) => model.slug));
    return {
      accessories: [],
      devices: devices.products
        .filter((item) => item.deviceModelSlug && modelSlugs.has(item.deviceModelSlug))
        .slice(0, 6),
    };
  }

  return { accessories: [], devices: [] };
}
