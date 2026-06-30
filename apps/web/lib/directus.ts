import type {
  Device,
  DevicePassport,
  GalleryImage,
  SitePage,
  PageSection,
  SiteSettings,
  NavigationItem,
  FaqItem,
  TradeInfo,
} from "@vtoroy/shared";
import { fallbackDevices } from "@/data/devices";

// Directus client for the Catalog MVP.
//
// Source resolution:
//   - Server code prefers DIRECTUS_URL (server-only, not exposed to the browser).
//   - NEXT_PUBLIC_DIRECTUS_URL is the browser-visible fallback (also fine on the
//     server). Use it only when the client genuinely needs the URL.
//   - An optional DIRECTUS_TOKEN authenticates a least-privilege read account.
//
// Fallback behavior:
//   - Catalog fallback data is for local/demo use only by default.
//   - Production fails closed unless ALLOW_CATALOG_FALLBACK=true is set
//     explicitly, so stale bundled stock/prices are not shown when Directus is
//     unavailable. Content reads return null/[] so callers can render template
//     defaults.

const SERVER_URL = process.env.DIRECTUS_URL ?? "";
const PUBLIC_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "";
const ALLOW_CATALOG_FALLBACK = ["1", "true", "yes"].includes(
  (process.env.ALLOW_CATALOG_FALLBACK ?? "").toLowerCase(),
);
const catalogFallbackAllowed = ALLOW_CATALOG_FALLBACK || process.env.NODE_ENV !== "production";

export const directusConfig = {
  /** Server-preferred base URL (falls back to the public one). */
  url: (SERVER_URL || PUBLIC_URL).replace(/\/+$/, ""),
  /** Browser-safe base URL for file assets rendered into HTML. */
  assetUrl: (PUBLIC_URL || SERVER_URL).replace(/\/+$/, ""),
  /** Whether a live Directus backend is configured. */
  get enabled(): boolean {
    return this.url.length > 0;
  },
  token: process.env.DIRECTUS_TOKEN ?? "",
  catalogFallbackAllowed,
} as const;

/** Cache window for ISR-style revalidation (seconds). */
const REVALIDATE = 300;

const FILE_FIELDS = [
  "id",
  "filename_download",
  "type",
  "width",
  "height",
  "focal_point_x",
  "focal_point_y",
].join(",");

const DEVICE_FIELDS = [
  "id",
  "status",
  "sort",
  "tags",
  "category",
  "title",
  "model",
  "specs",
  "storage",
  "color",
  "serial",
  "price",
  "price_text",
  "grade",
  "battery",
  "battery_text",
  "meta_battery",
  "warranty",
  "warranty_text",
  "exit",
  "exit_text",
  "availability",
  "short_description",
  "headline",
  "listing_image",
  "listing_alt",
  "cta_label",
  "has_detail_page",
  "detail_href",
  "visual_class",
  "gallery",
  "passport",
  "trade",
  "listing_file",
  "updated_at",
  "stock_status",
  "content_status",
].join(",");

const DEVICE_IMAGE_FIELDS = [
  "id",
  "status",
  "sort",
  "device",
  "role",
  "label",
  "alt",
  "updated_at",
  "shot_status",
  ...FILE_FIELDS.split(",").map((field) => `image.${field}`),
].join(",");

const DEVICE_PASSPORT_FIELDS = [
  "id",
  "device",
  "repair",
  "water",
  "summary_rows",
  "diagnostics_status",
  "diagnostics_checklist",
  "condition_grade_text",
  "condition_note",
  "condition_notes",
  "defect_photo_alt",
  "warranty_duration",
  "warranty_covered",
  "warranty_not_covered",
  "exit_headline",
  "exit_buy_today",
  "exit_trade_in_estimate",
  "exit_condition",
  "exit_note",
  "updated_at",
  ...FILE_FIELDS.split(",").map((field) => `defect_photo.${field}`),
].join(",");

const TRADE_OPTION_FIELDS = [
  "id",
  "device",
  "value",
  "label",
  "sort",
  "is_active",
  "updated_at",
].join(",");

type AssetTransform = {
  width?: number;
  height?: number;
  quality?: number;
  fit?: "cover" | "contain" | "inside" | "outside";
  format?: "auto" | "jpg" | "png" | "webp" | "tiff";
  withoutEnlargement?: boolean;
};

const ASSET_TRANSFORMS = {
  card: {
    width: 720,
    height: 540,
    quality: 82,
    fit: "cover",
    format: "auto",
    withoutEnlargement: true,
  },
  gallery: {
    width: 1200,
    height: 900,
    quality: 86,
    fit: "cover",
    format: "auto",
    withoutEnlargement: true,
  },
  passport: {
    width: 900,
    height: 675,
    quality: 84,
    fit: "cover",
    format: "auto",
    withoutEnlargement: true,
  },
  section: { width: 1600, quality: 86, format: "auto", withoutEnlargement: true },
} satisfies Record<string, AssetTransform>;

type MediaVariant = keyof typeof ASSET_TRANSFORMS;

type DirectusGetOptions = {
  cache?: "revalidate" | "no-store";
};

async function directusGet<T>(path: string, options: DirectusGetOptions = {}): Promise<T | null> {
  if (!directusConfig.url) return null;
  const headers: Record<string, string> = {};
  if (directusConfig.token) {
    headers.Authorization = `Bearer ${directusConfig.token}`;
  }
  try {
    const cacheMode = options.cache ?? "revalidate";
    const res = await fetch(`${directusConfig.url}${path}`, {
      headers,
      ...(cacheMode === "no-store"
        ? { cache: "no-store" as const }
        : { next: { revalidate: REVALIDATE } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: T };
    return json.data;
  } catch {
    // Network/JSON error — caller decides on fallback.
    return null;
  }
}

/** Build an absolute URL to a Directus-stored asset (image) by file id. */
export function directusAssetUrl(fileId: string, transform?: AssetTransform): string {
  if (!directusConfig.assetUrl) return "";
  const params = new URLSearchParams();
  if (transform?.width) params.set("width", String(transform.width));
  if (transform?.height) params.set("height", String(transform.height));
  if (transform?.quality) params.set("quality", String(transform.quality));
  if (transform?.fit) params.set("fit", transform.fit);
  if (transform?.format) params.set("format", transform.format);
  if (transform?.withoutEnlargement) params.set("withoutEnlargement", "true");
  const query = params.toString();
  return `${directusConfig.assetUrl}/assets/${fileId}${query ? `?${query}` : ""}`;
}

function isExternalOrLocalAsset(value: string): boolean {
  return /^https?:\/\//.test(value) || value.startsWith("/") || value.startsWith("assets/");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function directusFileId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return str(record.id);
}

function mediaUrl(value: unknown, variant: MediaVariant = "gallery"): string {
  const idOrPath = directusFileId(value);
  if (!idOrPath) return "";
  if (isExternalOrLocalAsset(idOrPath)) return idOrPath;
  return isUuid(idOrPath) ? directusAssetUrl(idOrPath, ASSET_TRANSFORMS[variant]) : idOrPath;
}

// ---------------------------------------------------------------------------
// Directus row -> app Device mapping
// ---------------------------------------------------------------------------
//
// The catalog started with a single `devices` collection and JSON columns for
// gallery/passport/trade. Newer Directus setups keep images, passport and trade
// rows in related collections. The mapper reads structured rows first and keeps
// JSON as migration fallback.

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStockStatus(value: unknown): string {
  const raw = str(value, "available").trim().toLowerCase();
  if (!raw || raw === "in_stock") return "available";
  if (raw === "service") return "hidden";
  return raw;
}

function stockStatusLabel(status: string): string {
  switch (status) {
    case "available":
      return "В наличии";
    case "reserved":
      return "Бронь";
    case "sold":
      return "Продано";
    case "hidden":
      return "Скрыто";
    default:
      return status;
  }
}

// JSON columns may arrive already parsed (object/array) or as a string.
function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

const EMPTY_PASSPORT: DevicePassport = {
  summaryRows: [],
  repair: "",
  water: "",
  diagnostics: { status: "", checklist: [] },
  condition: { gradeText: "", note: "", notes: [] },
  warranty: { duration: "", covered: "", notCovered: "" },
  exitPrice: { headline: "", buyToday: "", tradeInEstimate: "", condition: "", note: "" },
};

function mapGalleryFromDirectus(value: unknown): GalleryImage[] {
  const gallery = json<Record<string, unknown>[]>(value, []);
  if (!Array.isArray(gallery)) return [];

  return gallery.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const src = mediaUrl(item.src ?? item.file ?? item.file_id ?? item.image, "gallery");
    const label = str(item.label);
    const alt = str(item.alt);
    return src ? [{ src, label, alt }] : [];
  });
}

function mapPassportFromDirectus(value: unknown): DevicePassport {
  const passport = json<DevicePassport>(value, EMPTY_PASSPORT);
  const defectPhoto = passport.condition?.defectPhoto
    ? mediaUrl(passport.condition.defectPhoto, "passport")
    : "";

  return {
    ...passport,
    condition: {
      ...passport.condition,
      defectPhoto: defectPhoto || passport.condition?.defectPhoto,
    },
  };
}

type DeviceImageRow = Record<string, unknown>;
type DevicePassportRow = Record<string, unknown>;
type TradeOptionRow = Record<string, unknown>;

function deviceIdFromRelation(value: unknown): string {
  return typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? str((value as Record<string, unknown>).id)
      : "";
}

function passportRowsFromJson(value: unknown): DevicePassport["summaryRows"] {
  const rows = json<DevicePassport["summaryRows"]>(value, []);
  return Array.isArray(rows) ? rows : [];
}

function diagnosticsChecklistFromJson(value: unknown): DevicePassport["diagnostics"]["checklist"] {
  const checklist = json<DevicePassport["diagnostics"]["checklist"]>(value, []);
  return Array.isArray(checklist) ? checklist : [];
}

function stringArrayFromJson(value: unknown): string[] {
  const list = json<unknown[]>(value, []);
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const text = str(item).trim();
    return text ? [text] : [];
  });
}

function mapStructuredPassportFromDirectus(
  row: DevicePassportRow,
  legacyValue: unknown,
): DevicePassport {
  const legacy = mapPassportFromDirectus(legacyValue);
  const defectPhoto = mediaUrl(row.defect_photo, "passport");

  return {
    summaryRows:
      passportRowsFromJson(row.summary_rows).length > 0
        ? passportRowsFromJson(row.summary_rows)
        : legacy.summaryRows,
    repair: str(row.repair) || legacy.repair,
    water: str(row.water) || legacy.water,
    diagnostics: {
      status: str(row.diagnostics_status) || legacy.diagnostics.status,
      checklist:
        diagnosticsChecklistFromJson(row.diagnostics_checklist).length > 0
          ? diagnosticsChecklistFromJson(row.diagnostics_checklist)
          : legacy.diagnostics.checklist,
    },
    condition: {
      gradeText: str(row.condition_grade_text) || legacy.condition.gradeText,
      note: str(row.condition_note) || legacy.condition.note,
      notes:
        stringArrayFromJson(row.condition_notes).length > 0
          ? stringArrayFromJson(row.condition_notes)
          : legacy.condition.notes,
      defectPhoto: defectPhoto || legacy.condition.defectPhoto,
      defectPhotoAlt: str(row.defect_photo_alt) || legacy.condition.defectPhotoAlt,
    },
    warranty: {
      duration: str(row.warranty_duration) || legacy.warranty.duration,
      covered: str(row.warranty_covered) || legacy.warranty.covered,
      notCovered: str(row.warranty_not_covered) || legacy.warranty.notCovered,
    },
    exitPrice: {
      headline: str(row.exit_headline) || legacy.exitPrice.headline,
      buyToday: str(row.exit_buy_today) || legacy.exitPrice.buyToday,
      tradeInEstimate: str(row.exit_trade_in_estimate) || legacy.exitPrice.tradeInEstimate,
      condition: str(row.exit_condition) || legacy.exitPrice.condition,
      note: str(row.exit_note) || legacy.exitPrice.note,
    },
  };
}

function passportsByDevice(rows: DevicePassportRow[] | null): Map<string, DevicePassportRow> {
  const grouped = new Map<string, DevicePassportRow>();
  for (const row of rows ?? []) {
    const deviceId = deviceIdFromRelation(row.device);
    if (deviceId) grouped.set(deviceId, row);
  }
  return grouped;
}

function mapTradeOptionsFromDirectus(rows: TradeOptionRow[] = []): TradeInfo {
  return {
    options: rows
      .filter((row) => bool(row.is_active, true))
      .sort((a, b) => num(a.sort) - num(b.sort))
      .map((row) => ({
        value: num(row.value),
        label: str(row.label),
      }))
      .filter((option) => option.label || option.value > 0),
  };
}

function tradeOptionsByDevice(rows: TradeOptionRow[] | null): Map<string, TradeOptionRow[]> {
  const grouped = new Map<string, TradeOptionRow[]>();
  for (const row of rows ?? []) {
    const deviceId = deviceIdFromRelation(row.device);
    if (!deviceId) continue;
    const list = grouped.get(deviceId) ?? [];
    list.push(row);
    grouped.set(deviceId, list);
  }
  return grouped;
}

function mapDeviceImagesFromDirectus(rows: DeviceImageRow[] = []): GalleryImage[] {
  return rows.flatMap((row) => {
    const src = mediaUrl(row.image, "gallery");
    if (!src) return [];
    return [
      {
        src,
        label: str(row.label) || str(row.role),
        alt: str(row.alt),
        role: str(row.role),
      },
    ];
  });
}

function deviceImagesByDevice(rows: DeviceImageRow[] | null): Map<string, DeviceImageRow[]> {
  const grouped = new Map<string, DeviceImageRow[]>();
  for (const row of rows ?? []) {
    const deviceId = deviceIdFromRelation(row.device);
    if (!deviceId) continue;
    const list = grouped.get(deviceId) ?? [];
    list.push(row);
    grouped.set(deviceId, list);
  }
  return grouped;
}

function cardImageFromDeviceImages(rows: DeviceImageRow[] = []): string {
  const preferred =
    rows.find((row) => ["card", "listing", "main"].includes(str(row.role).toLowerCase())) ??
    rows[0];
  return preferred ? mediaUrl(preferred.image, "card") : "";
}

export function mapDeviceFromDirectus(
  row: Record<string, unknown>,
  imageRows: DeviceImageRow[] = [],
  passportRow?: DevicePassportRow,
  tradeRows: TradeOptionRow[] = [],
): Device {
  const directusGallery = mapDeviceImagesFromDirectus(imageRows);
  const detailGallery = directusGallery.filter(
    (image) => !["card", "listing"].includes((image.role ?? "").toLowerCase()),
  );
  const stockStatus = normalizeStockStatus(row.stock_status);
  const structuredTrade = mapTradeOptionsFromDirectus(tradeRows);
  return {
    id: str(row.id),
    tags: json<string[]>(row.tags, []),
    category: str(row.category),
    sort: num(row.sort),
    title: str(row.title),
    model: str(row.model),
    specs: str(row.specs),
    storage: str(row.storage),
    color: str(row.color),
    serial: str(row.serial),
    price: num(row.price),
    priceText: str(row.price_text),
    grade: str(row.grade),
    battery: str(row.battery),
    batteryText: str(row.battery_text),
    metaBattery: str(row.meta_battery),
    warranty: str(row.warranty),
    warrantyText: str(row.warranty_text),
    exit: str(row.exit),
    exitText: str(row.exit_text),
    availability: str(row.availability),
    stockStatus,
    stockStatusLabel: stockStatusLabel(stockStatus),
    updatedAt: str(row.updated_at) || str(row.date_updated),
    shortDescription: str(row.short_description),
    headline: str(row.headline),
    listingImage:
      cardImageFromDeviceImages(imageRows) ||
      mediaUrl(row.listing_file, "card") ||
      mediaUrl(row.listing_image),
    listingAlt: str(row.listing_alt),
    ctaLabel: str(row.cta_label),
    hasDetailPage: bool(row.has_detail_page),
    detailHref: str(row.detail_href),
    visualClass: str(row.visual_class),
    gallery: detailGallery.length > 0 ? detailGallery : mapGalleryFromDirectus(row.gallery),
    passport: passportRow
      ? mapStructuredPassportFromDirectus(passportRow, row.passport)
      : mapPassportFromDirectus(row.passport),
    trade:
      structuredTrade.options.length > 0
        ? structuredTrade
        : json<TradeInfo>(row.trade, { options: [] }),
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Published devices for the catalog. In production this fails closed unless
 * ALLOW_CATALOG_FALLBACK=true is set explicitly.
 *
 * Structured related collections are read first; legacy JSON fields remain as
 * fallback until all rows are migrated.
 */
export async function getPublishedDevices(): Promise<Device[]> {
  const [data, imageRows, passportRows, tradeRows] = await Promise.all([
    directusGet<Record<string, unknown>[]>(
      `/items/devices?filter[status][_eq]=published&filter[stock_status][_neq]=hidden&fields=${DEVICE_FIELDS}&sort=sort,-updated_at`,
      { cache: "no-store" },
    ),
    directusGet<DeviceImageRow[]>(
      `/items/device_images?filter[status][_eq]=published&fields=${DEVICE_IMAGE_FIELDS}&sort=device,sort`,
      { cache: "no-store" },
    ),
    directusGet<DevicePassportRow[]>(
      `/items/device_passports?fields=${DEVICE_PASSPORT_FIELDS}&sort=device`,
      { cache: "no-store" },
    ),
    directusGet<TradeOptionRow[]>(
      `/items/trade_options?filter[is_active][_eq]=true&fields=${TRADE_OPTION_FIELDS}&sort=device,sort`,
      { cache: "no-store" },
    ),
  ]);
  if (data && data.length > 0) {
    const images = deviceImagesByDevice(imageRows);
    const passports = passportsByDevice(passportRows);
    const trades = tradeOptionsByDevice(tradeRows);
    return data
      .map((row) =>
        mapDeviceFromDirectus(
          row,
          images.get(str(row.id)) ?? [],
          passports.get(str(row.id)),
          trades.get(str(row.id)) ?? [],
        ),
      )
      .filter((device) => device.stockStatus !== "hidden");
  }
  return directusConfig.catalogFallbackAllowed
    ? fallbackDevices.filter((device) => device.stockStatus !== "hidden")
    : [];
}

/**
 * A single device by slug (id). In production this fails closed unless
 * ALLOW_CATALOG_FALLBACK=true is set explicitly.
 *
 *   GET /items/devices?filter[id][_eq]={slug}&fields=*&limit=1
 */
export async function getDeviceBySlug(slug: string): Promise<Device | null> {
  const [data, imageRows, passportRows, tradeRows] = await Promise.all([
    directusGet<Record<string, unknown>[]>(
      `/items/devices?filter[id][_eq]=${encodeURIComponent(slug)}&fields=${DEVICE_FIELDS}&limit=1`,
      { cache: "no-store" },
    ),
    directusGet<DeviceImageRow[]>(
      `/items/device_images?filter[device][_eq]=${encodeURIComponent(slug)}&filter[status][_eq]=published&fields=${DEVICE_IMAGE_FIELDS}&sort=sort`,
      { cache: "no-store" },
    ),
    directusGet<DevicePassportRow[]>(
      `/items/device_passports?filter[device][_eq]=${encodeURIComponent(slug)}&fields=${DEVICE_PASSPORT_FIELDS}&limit=1`,
      { cache: "no-store" },
    ),
    directusGet<TradeOptionRow[]>(
      `/items/trade_options?filter[device][_eq]=${encodeURIComponent(slug)}&filter[is_active][_eq]=true&fields=${TRADE_OPTION_FIELDS}&sort=sort`,
      { cache: "no-store" },
    ),
  ]);
  if (data && data.length > 0) {
    const device = mapDeviceFromDirectus(
      data[0],
      imageRows ?? [],
      passportRows?.[0],
      tradeRows ?? [],
    );
    return device.stockStatus === "hidden" ? null : device;
  }
  return directusConfig.catalogFallbackAllowed
    ? (fallbackDevices.find((d) => d.id === slug && d.stockStatus !== "hidden") ?? null)
    : null;
}

// ---------------------------------------------------------------------------
// Editable site content (texts)
// ---------------------------------------------------------------------------

function mapPageSectionFromDirectus(row: Record<string, unknown>): PageSection {
  return {
    id: str(row.id),
    sectionKey: str(row.section_key),
    variant: str(row.variant),
    eyebrow: str(row.eyebrow),
    headline: str(row.headline),
    subheadline: str(row.subheadline),
    body: str(row.body),
    primaryCtaLabel: str(row.primary_cta_label),
    primaryCtaUrl: str(row.primary_cta_url),
    secondaryCtaLabel: str(row.secondary_cta_label),
    secondaryCtaUrl: str(row.secondary_cta_url),
    image: str(row.image) ? mediaUrl(row.image, "section") : "",
    sortOrder: num(row.sort_order),
    isActive: bool(row.is_active, true),
    content: json(row.content, {}),
  };
}

function mapSitePageFromDirectus(row: Record<string, unknown>): SitePage {
  const sections = json<Record<string, unknown>[]>(row.sections, []);
  return {
    slug: str(row.slug),
    template: str(row.template),
    status: str(row.status, "draft") as SitePage["status"],
    title: str(row.title),
    metaDescription: str(row.meta_description),
    ogImage: str(row.og_image) ? directusAssetUrl(str(row.og_image)) : "",
    sections: sections.map(mapPageSectionFromDirectus),
  };
}

function mapFaqItemFromDirectus(row: Record<string, unknown>): FaqItem {
  const page = row.page;
  return {
    id: str(row.id),
    key: str(row.key),
    question: str(row.question),
    answer: str(row.answer),
    category: str(row.category),
    page:
      typeof page === "string"
        ? page
        : page && typeof page === "object"
          ? str((page as Record<string, unknown>).id)
          : null,
    sort: num(row.sort),
    isActive: bool(row.is_active, true),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = str(item).trim();
    return text ? [text] : [];
  });
}

function textFromRichText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function faqSectionKeys(section: PageSection): string[] {
  return [...stringList(section.content.faqKeys), ...stringList(section.content.faq_keys)];
}

function faqSectionItems(items: FaqItem[]): { title: string; text: string; badge: string }[] {
  return items.map((item, index) => ({
    title: item.question,
    text: textFromRichText(item.answer),
    badge: String(index + 1).padStart(2, "0"),
  }));
}

function faqItemsForSection(
  pageId: string,
  slug: string,
  section: PageSection,
  items: FaqItem[],
): FaqItem[] {
  const keys = faqSectionKeys(section);
  if (keys.length > 0) {
    const byKey = new Map(items.map((item) => [item.key, item]));
    return keys.flatMap((key) => {
      const item = byKey.get(key);
      return item?.isActive ? [item] : [];
    });
  }

  return items
    .filter((item) => item.isActive && (item.page === pageId || item.category === slug))
    .sort((a, b) => a.sort - b.sort);
}

async function getActiveFaqItems(): Promise<FaqItem[]> {
  const data = await directusGet<Record<string, unknown>[]>(
    "/items/faq_items?filter[is_active][_eq]=true&fields=*&sort=category,sort",
    { cache: "no-store" },
  );
  return data?.map(mapFaqItemFromDirectus) ?? [];
}

async function enrichFaqSections(
  pageId: string,
  slug: string,
  sections: PageSection[],
): Promise<PageSection[]> {
  if (
    !sections.some(
      (section) => section.isActive && (section.variant === "faq" || section.sectionKey === "faq"),
    )
  ) {
    return sections;
  }

  const faqItems = await getActiveFaqItems();
  if (faqItems.length === 0) return sections;

  return sections.map((section) => {
    if (!(section.variant === "faq" || section.sectionKey === "faq")) return section;
    const items = faqItemsForSection(pageId, slug, section, faqItems);
    if (items.length === 0) return section;
    return {
      ...section,
      content: {
        ...section.content,
        items: faqSectionItems(items),
      },
    };
  });
}

function mapSiteSettingsFromDirectus(row: Record<string, unknown>): SiteSettings {
  const logoFile = directusFileId(row.logo_file);
  return {
    brandName: str(row.brand_name, "ISVOI"),
    tagline: str(row.tagline),
    city: str(row.city),
    logoFile: logoFile ? directusAssetUrl(logoFile) : "",
    logoAlt: str(row.logo_alt),
    logoHref: str(row.logo_href, "/"),
    logoWidth: num(row.logo_width),
    logoHeight: num(row.logo_height),
    logoCaption: str(row.logo_caption),
    showBrandName: bool(row.show_brand_name, true),
    headerCtaLabel: str(row.header_cta_label),
    headerCtaUrl: str(row.header_cta_url),
    phone: str(row.phone),
    telegram: str(row.telegram),
    email: str(row.email),
    address: str(row.address),
    footerNote: str(row.footer_note),
    footerBrandText: str(row.footer_brand_text),
    footerLegal: str(row.footer_legal),
    footerCopyright: str(row.footer_copyright),
    maintenanceMode: bool(row.maintenance_mode),
  };
}

function navPageSlug(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return str(record.slug) || str(record.id);
}

function mapNavigationItemFromDirectus(row: Record<string, unknown>): NavigationItem {
  const parent = row.parent;
  const linkType = str(row.link_type, "custom") as NavigationItem["linkType"];
  const page = navPageSlug(row.page);
  const customUrl = str(row.custom_url);
  const pageUrl = page ? (page === "home" ? "/" : `/${page}`) : "";
  const url = customUrl || str(row.url) || pageUrl || "#";
  return {
    id: str(row.id),
    label: str(row.label),
    url,
    linkType,
    page,
    sectionAnchor: str(row.section_anchor),
    customUrl,
    labelShort: str(row.label_short),
    ariaLabel: str(row.aria_label),
    itemRole: str(row.item_role, "link") as NavigationItem["itemRole"],
    icon: str(row.icon),
    location: str(row.location, "header") as NavigationItem["location"],
    parent:
      typeof parent === "string"
        ? parent
        : parent && typeof parent === "object"
          ? str((parent as Record<string, unknown>).id)
          : null,
    sort: num(row.sort),
    isActive: bool(row.is_active, true),
    openInNew: bool(row.open_in_new),
  };
}

/**
 * A published site page by slug, with its active sections.
 *
 * Returns null when Directus is unconfigured/unreachable so the route can fall
 * back to template defaults baked into the component. Content has no bundled
 * fallback by design (the static prototype is the reference, not seed data).
 */
export async function getSitePage(slug: string): Promise<SitePage | null> {
  const data = await directusGet<Record<string, unknown>[]>(
    `/items/site_pages?filter[slug][_eq]=${encodeURIComponent(slug)}&filter[status][_eq]=published&fields=*&limit=1`,
    { cache: "no-store" },
  );
  if (data && data.length > 0) {
    const page = mapSitePageFromDirectus(data[0]);
    const sections = await directusGet<Record<string, unknown>[]>(
      `/items/page_sections?filter[page][_eq]=${encodeURIComponent(str(data[0].id))}&filter[is_active][_eq]=true&fields=*&sort=sort_order`,
      { cache: "no-store" },
    );
    const mappedSections = sections?.map(mapPageSectionFromDirectus) ?? [];
    return {
      ...page,
      sections: await enrichFaqSections(str(data[0].id), page.slug, mappedSections),
    };
  }
  return null;
}

/** Active sections for a page slug (convenience wrapper over getSitePage). */
export async function getPageSections(slug: string): Promise<PageSection[]> {
  const page = await getSitePage(slug);
  if (!page) return [];
  return page.sections.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Global site settings singleton. */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const data = await directusGet<Record<string, unknown> | Record<string, unknown>[]>(
    "/items/site_settings?limit=1",
    { cache: "no-store" },
  );
  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapSiteSettingsFromDirectus(row) : null;
}

/** Active navigation links for header/footer/mobile chrome. */
export async function getNavigationItems(): Promise<NavigationItem[]> {
  const data = await directusGet<Record<string, unknown>[]>(
    "/items/navigation_items?filter[is_active][_eq]=true&fields=*,page.slug&sort=location,sort",
    { cache: "no-store" },
  );
  return data?.map(mapNavigationItemFromDirectus).filter((item) => item.label && item.url) ?? [];
}

/** Active FAQ items, optionally filtered by category. */
export async function getFaqItems(category?: string): Promise<FaqItem[]> {
  const catFilter = category ? `&filter[category][_eq]=${encodeURIComponent(category)}` : "";
  const data = await directusGet<Record<string, unknown>[]>(
    `/items/faq_items?filter[is_active][_eq]=true${catFilter}&sort=sort`,
  );
  return data?.map(mapFaqItemFromDirectus) ?? [];
}
