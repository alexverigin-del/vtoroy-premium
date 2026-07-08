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
  DevicePageSettings,
} from "@vtoroy/shared";
import { cache } from "react";
import type { DeviceCardData } from "@/lib/device-card-data";
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

export const fallbackDevicePageSettings: DevicePageSettings = {
  breadcrumbs: {
    homeLabel: "Главная",
    homeHref: "/",
    catalogLabel: "Каталог",
    catalogHref: "/catalog",
    backLabel: "← Store",
  },
  labels: {
    gradePrefix: "грейд",
    updatedPrefix: "Обновлено",
    available: "В наличии",
    reserved: "Бронь",
    sold: "Продано",
    priceNote: "Цена и условия действуют после подтверждения наличия и финальной проверки в Store.",
  },
  sections: {
    conditionTitle: "Состояние и нюансы",
    storyEyebrow: "История вещи",
    storyFallbackTitle: "Путь вещи",
    warrantyTitle: "Гарантия и ориентир выхода",
    warrantyDurationLabel: "Срок гарантии",
    exitPriceLabel: "Ориентир выхода",
    warrantyCoveredLabel: "Покрывается",
    warrantyNotCoveredLabel: "Не покрывается",
    warrantyCoveredFallback: "Функциональные неисправности в рамках условий Store.",
    warrantyNotCoveredFallback: "Механические повреждения после покупки и следы влаги.",
    warrantyDurationFallback: "90 дней",
    tradeTitle: "Обновление через Trade",
    tradeValuePrefix: "зачет до",
    tradeCtaLabel: "Рассчитать Trade",
    tradeCtaHref: "/trade",
    relatedEyebrow: "Еще в Store",
    relatedTitle: "Похожие устройства",
    relatedCtaLabel: "Весь каталог",
    relatedCtaHref: "/catalog",
    relatedPromptTitle: "Больше вариантов в Store",
    relatedPromptBody:
      "Если эта вещь не подходит, проверьте соседние варианты по практичным параметрам.",
    relatedPromptCtaLabel: "Открыть каталог",
    relatedPromptCtaHref: "/catalog",
    relatedPromptCues: ["Память", "Цвет", "Бюджет", "Trade"],
  },
  passport: {
    eyebrow: "I СВОИ Passport",
    title: "Проверка вещи",
    body: "Чеклист функций, которые были проверены перед публикацией.",
    diagnosticsTitle: "Диагностика",
    statusPrefix: "Статус:",
    statusFallback: "зафиксирована",
    verifiedLabel: "Проверено",
  },
  mobile: {
    reservedLabel: "Очередь",
    soldLabel: "Подобрать",
    availableLabel: "Просмотр",
    tradeLabel: "Trade",
    navAriaLabel: "Действия по товару",
  },
  leadForm: {
    available: {
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
      statusNote:
        "Устройство сейчас доступно. После заявки мы подтвердим наличие и время просмотра.",
    },
    reserved: {
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
  },
};

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

const DEVICE_CARD_FIELDS = [
  "id",
  "status",
  "sort",
  "tags",
  "category",
  "title",
  "model",
  "specs",
  "color",
  "price",
  "price_text",
  "grade",
  "battery_text",
  "warranty_text",
  "exit_text",
  "listing_image",
  "listing_alt",
  "cta_label",
  "detail_href",
  "listing_file",
  "passport",
  "updated_at",
  "stock_status",
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
  "story_title",
  "story_body",
  "story_facts",
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
  section: { width: 1200, quality: 80, format: "auto", withoutEnlargement: true },
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
  story: { title: "", body: "", facts: [] },
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
    summaryRows: passport.summaryRows ?? EMPTY_PASSPORT.summaryRows,
    repair: passport.repair ?? EMPTY_PASSPORT.repair,
    water: passport.water ?? EMPTY_PASSPORT.water,
    diagnostics: {
      status: passport.diagnostics?.status ?? EMPTY_PASSPORT.diagnostics.status,
      checklist: passport.diagnostics?.checklist ?? EMPTY_PASSPORT.diagnostics.checklist,
    },
    condition: {
      gradeText: passport.condition?.gradeText ?? EMPTY_PASSPORT.condition.gradeText,
      note: passport.condition?.note ?? EMPTY_PASSPORT.condition.note,
      notes: passport.condition?.notes ?? EMPTY_PASSPORT.condition.notes,
      defectPhoto: defectPhoto || passport.condition?.defectPhoto,
      defectPhotoAlt: passport.condition?.defectPhotoAlt,
    },
    story: {
      title: passport.story?.title ?? EMPTY_PASSPORT.story.title,
      body: passport.story?.body ?? EMPTY_PASSPORT.story.body,
      facts: passport.story?.facts ?? EMPTY_PASSPORT.story.facts,
    },
    warranty: {
      duration: passport.warranty?.duration ?? EMPTY_PASSPORT.warranty.duration,
      covered: passport.warranty?.covered ?? EMPTY_PASSPORT.warranty.covered,
      notCovered: passport.warranty?.notCovered ?? EMPTY_PASSPORT.warranty.notCovered,
    },
    exitPrice: {
      headline: passport.exitPrice?.headline ?? EMPTY_PASSPORT.exitPrice.headline,
      buyToday: passport.exitPrice?.buyToday ?? EMPTY_PASSPORT.exitPrice.buyToday,
      tradeInEstimate:
        passport.exitPrice?.tradeInEstimate ?? EMPTY_PASSPORT.exitPrice.tradeInEstimate,
      condition: passport.exitPrice?.condition ?? EMPTY_PASSPORT.exitPrice.condition,
      note: passport.exitPrice?.note ?? EMPTY_PASSPORT.exitPrice.note,
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
  const summaryRows = passportRowsFromJson(row.summary_rows);
  const diagnosticsChecklist = diagnosticsChecklistFromJson(row.diagnostics_checklist);
  const conditionNotes = stringArrayFromJson(row.condition_notes);
  const storyFacts = stringArrayFromJson(row.story_facts);

  return {
    summaryRows: summaryRows.length > 0 ? summaryRows : legacy.summaryRows,
    repair: str(row.repair) || legacy.repair,
    water: str(row.water) || legacy.water,
    diagnostics: {
      status: str(row.diagnostics_status) || legacy.diagnostics.status,
      checklist:
        diagnosticsChecklist.length > 0 ? diagnosticsChecklist : legacy.diagnostics.checklist,
    },
    condition: {
      gradeText: str(row.condition_grade_text) || legacy.condition.gradeText,
      note: str(row.condition_note) || legacy.condition.note,
      notes: conditionNotes.length > 0 ? conditionNotes : legacy.condition.notes,
      defectPhoto: defectPhoto || legacy.condition.defectPhoto,
      defectPhotoAlt: str(row.defect_photo_alt) || legacy.condition.defectPhotoAlt,
    },
    story: {
      title: str(row.story_title) || legacy.story.title,
      body: str(row.story_body) || legacy.story.body,
      facts: storyFacts.length > 0 ? storyFacts : legacy.story.facts,
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

function cleanTrustFact(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;])/g, "$1")
    .trim();
}

function uniqueTrustFacts(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const fact = cleanTrustFact(value);
    if (!fact) return [];
    const key = fact.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [fact];
  });
}

function passportRowFact(row: DevicePassport["summaryRows"][number]): string {
  const label = cleanTrustFact(row.label);
  const value = cleanTrustFact(row.value);
  if (!label) return value;
  if (!value) return label;
  if (value.toLowerCase().includes(label.toLowerCase())) return value;
  return `${label} ${value}`;
}

function passportTrustFacts(passport: DevicePassport): string[] {
  const preferredRows = passport.summaryRows.filter((row) =>
    /face id|ремонт|вскры|влага/i.test(`${row.label} ${row.value}`),
  );
  const fallbackRows = passport.summaryRows.filter(
    (row) => !/батар|гарант/i.test(`${row.label} ${row.value}`),
  );

  return uniqueTrustFacts([
    ...preferredRows.map(passportRowFact),
    passport.repair ? `Ремонт ${passport.repair}` : "",
    passport.water ? `Влага ${passport.water}` : "",
    ...fallbackRows.map(passportRowFact),
    passport.condition.gradeText ? `Состояние ${passport.condition.gradeText}` : "",
  ]);
}

function deviceCardTrustFacts(
  device: Pick<Device, "batteryText" | "warrantyText">,
  passport: DevicePassport,
): string[] {
  return uniqueTrustFacts([
    device.batteryText,
    device.warrantyText,
    ...passportTrustFacts(passport),
  ]).slice(0, 3);
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

function mapDeviceCardFromDirectus(
  row: Record<string, unknown>,
  imageRows: DeviceImageRow[] = [],
  passportRow?: DevicePassportRow,
): DeviceCardData {
  const stockStatus = normalizeStockStatus(row.stock_status);
  const passport = passportRow
    ? mapStructuredPassportFromDirectus(passportRow, row.passport)
    : mapPassportFromDirectus(row.passport);
  const batteryText = str(row.battery_text);
  const warrantyText = str(row.warranty_text);
  return {
    id: str(row.id),
    tags: json<string[]>(row.tags, []),
    category: str(row.category),
    model: str(row.model),
    sort: num(row.sort),
    title: str(row.title),
    specs: str(row.specs),
    color: str(row.color),
    price: num(row.price),
    priceText: str(row.price_text),
    grade: str(row.grade),
    batteryText,
    warrantyText,
    trustFacts: deviceCardTrustFacts({ batteryText, warrantyText }, passport),
    exitText: str(row.exit_text),
    stockStatus,
    stockStatusLabel: stockStatusLabel(stockStatus),
    updatedAt: str(row.updated_at) || str(row.date_updated),
    listingImage:
      cardImageFromDeviceImages(imageRows) ||
      mediaUrl(row.listing_file, "card") ||
      mediaUrl(row.listing_image),
    listingAlt: str(row.listing_alt),
    ctaLabel: str(row.cta_label),
    detailHref: str(row.detail_href),
  };
}

function mapDeviceCardFromDevice(device: Device): DeviceCardData {
  return {
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
    trustFacts: deviceCardTrustFacts(device, device.passport),
    exitText: device.exitText,
    stockStatus: device.stockStatus,
    stockStatusLabel: device.stockStatusLabel,
    updatedAt: device.updatedAt,
    updatedText: device.updatedText,
    listingImage: device.listingImage,
    listingAlt: device.listingAlt,
    ctaLabel: device.ctaLabel,
    detailHref: device.detailHref,
  };
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
export const getPublishedDevices = cache(async function getPublishedDevices(): Promise<Device[]> {
  const [data, imageRows, passportRows, tradeRows] = await Promise.all([
    directusGet<Record<string, unknown>[]>(
      `/items/devices?filter[status][_eq]=published&filter[stock_status][_neq]=hidden&fields=${DEVICE_FIELDS}&sort=sort,-updated_at`,
    ),
    directusGet<DeviceImageRow[]>(
      `/items/device_images?filter[status][_eq]=published&fields=${DEVICE_IMAGE_FIELDS}&sort=device,sort`,
    ),
    directusGet<DevicePassportRow[]>(
      `/items/device_passports?fields=${DEVICE_PASSPORT_FIELDS}&sort=device`,
    ),
    directusGet<TradeOptionRow[]>(
      `/items/trade_options?filter[is_active][_eq]=true&fields=${TRADE_OPTION_FIELDS}&sort=device,sort`,
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
});

/**
 * Lightweight published devices for catalog cards, previews, related products
 * and sitemap. It reads only compact passport fields needed for card trust facts
 * and avoids trade/detail relations so client catalog components do not receive
 * the full product payload.
 */
export const getPublishedDeviceCards = cache(async function getPublishedDeviceCards(): Promise<
  DeviceCardData[]
> {
  const [data, imageRows, passportRows] = await Promise.all([
    directusGet<Record<string, unknown>[]>(
      `/items/devices?filter[status][_eq]=published&filter[stock_status][_neq]=hidden&fields=${DEVICE_CARD_FIELDS}&sort=sort,-updated_at`,
    ),
    directusGet<DeviceImageRow[]>(
      `/items/device_images?filter[status][_eq]=published&fields=${DEVICE_IMAGE_FIELDS}&sort=device,sort`,
    ),
    directusGet<DevicePassportRow[]>(
      `/items/device_passports?fields=${DEVICE_PASSPORT_FIELDS}&sort=device`,
    ),
  ]);
  if (data && data.length > 0) {
    const images = deviceImagesByDevice(imageRows);
    const passports = passportsByDevice(passportRows);
    return data
      .map((row) =>
        mapDeviceCardFromDirectus(row, images.get(str(row.id)) ?? [], passports.get(str(row.id))),
      )
      .filter((device) => device.stockStatus !== "hidden");
  }
  return directusConfig.catalogFallbackAllowed
    ? fallbackDevices
        .filter((device) => device.stockStatus !== "hidden")
        .map((device) => mapDeviceCardFromDevice(device))
    : [];
});

/**
 * A single device by slug (id). In production this fails closed unless
 * ALLOW_CATALOG_FALLBACK=true is set explicitly.
 *
 *   GET /items/devices?filter[id][_eq]={slug}&fields=*&limit=1
 */
export const getDeviceBySlug = cache(async function getDeviceBySlug(
  slug: string,
): Promise<Device | null> {
  const [data, imageRows, passportRows, tradeRows] = await Promise.all([
    directusGet<Record<string, unknown>[]>(
      `/items/devices?filter[id][_eq]=${encodeURIComponent(slug)}&fields=${DEVICE_FIELDS}&limit=1`,
    ),
    directusGet<DeviceImageRow[]>(
      `/items/device_images?filter[device][_eq]=${encodeURIComponent(slug)}&filter[status][_eq]=published&fields=${DEVICE_IMAGE_FIELDS}&sort=sort`,
    ),
    directusGet<DevicePassportRow[]>(
      `/items/device_passports?filter[device][_eq]=${encodeURIComponent(slug)}&fields=${DEVICE_PASSPORT_FIELDS}&limit=1`,
    ),
    directusGet<TradeOptionRow[]>(
      `/items/trade_options?filter[device][_eq]=${encodeURIComponent(slug)}&filter[is_active][_eq]=true&fields=${TRADE_OPTION_FIELDS}&sort=sort`,
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
});

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
    brandName: str(row.brand_name, "I СВОИ"),
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

function mapDevicePageSettingsFromDirectus(row: Record<string, unknown>): DevicePageSettings {
  const defaults = fallbackDevicePageSettings;
  const relatedPromptCues = stringList(row.related_prompt_cues);
  const leadMode = (
    key: keyof DevicePageSettings["leadForm"],
  ): DevicePageSettings["leadForm"][typeof key] => {
    const prefix = `lead_${key}_`;
    const fallback = defaults.leadForm[key];
    const kind = str(row[`${prefix}kind`], fallback.kind);
    return {
      kind: kind === "selection" ? "selection" : "purchase",
      scenario: str(row[`${prefix}scenario`], fallback.scenario),
      title: str(row[`${prefix}title`], fallback.title),
      contactPlaceholder: str(
        row[`${prefix}contact_placeholder`],
        fallback.contactPlaceholder,
      ),
      messagePlaceholder: str(
        row[`${prefix}message_placeholder`],
        fallback.messagePlaceholder,
      ),
      submitLabel: str(row[`${prefix}submit_label`], fallback.submitLabel),
      submittingLabel: str(row[`${prefix}submitting_label`], fallback.submittingLabel),
      idleNote: str(row[`${prefix}idle_note`], fallback.idleNote),
      successNote: str(row[`${prefix}success_note`], fallback.successNote),
      errorNote: str(row[`${prefix}error_note`], fallback.errorNote),
      statusNote: str(row[`${prefix}status_note`], fallback.statusNote),
    };
  };

  return {
    breadcrumbs: {
      homeLabel: str(row.breadcrumb_home_label, defaults.breadcrumbs.homeLabel),
      homeHref: str(row.breadcrumb_home_href, defaults.breadcrumbs.homeHref),
      catalogLabel: str(row.breadcrumb_catalog_label, defaults.breadcrumbs.catalogLabel),
      catalogHref: str(row.breadcrumb_catalog_href, defaults.breadcrumbs.catalogHref),
      backLabel: str(row.back_label, defaults.breadcrumbs.backLabel),
    },
    labels: {
      gradePrefix: str(row.grade_prefix, defaults.labels.gradePrefix),
      updatedPrefix: str(row.updated_prefix, defaults.labels.updatedPrefix),
      available: str(row.available_label, defaults.labels.available),
      reserved: str(row.reserved_label, defaults.labels.reserved),
      sold: str(row.sold_label, defaults.labels.sold),
      priceNote: str(row.price_note, defaults.labels.priceNote),
    },
    sections: {
      conditionTitle: str(row.condition_title, defaults.sections.conditionTitle),
      storyEyebrow: str(row.story_eyebrow, defaults.sections.storyEyebrow),
      storyFallbackTitle: str(row.story_fallback_title, defaults.sections.storyFallbackTitle),
      warrantyTitle: str(row.warranty_title, defaults.sections.warrantyTitle),
      warrantyDurationLabel: str(
        row.warranty_duration_label,
        defaults.sections.warrantyDurationLabel,
      ),
      exitPriceLabel: str(row.exit_price_label, defaults.sections.exitPriceLabel),
      warrantyCoveredLabel: str(row.warranty_covered_label, defaults.sections.warrantyCoveredLabel),
      warrantyNotCoveredLabel: str(
        row.warranty_not_covered_label,
        defaults.sections.warrantyNotCoveredLabel,
      ),
      warrantyCoveredFallback: str(
        row.warranty_covered_fallback,
        defaults.sections.warrantyCoveredFallback,
      ),
      warrantyNotCoveredFallback: str(
        row.warranty_not_covered_fallback,
        defaults.sections.warrantyNotCoveredFallback,
      ),
      warrantyDurationFallback: str(
        row.warranty_duration_fallback,
        defaults.sections.warrantyDurationFallback,
      ),
      tradeTitle: str(row.trade_title, defaults.sections.tradeTitle),
      tradeValuePrefix: str(row.trade_value_prefix, defaults.sections.tradeValuePrefix),
      tradeCtaLabel: str(row.trade_cta_label, defaults.sections.tradeCtaLabel),
      tradeCtaHref: str(row.trade_cta_href, defaults.sections.tradeCtaHref),
      relatedEyebrow: str(row.related_eyebrow, defaults.sections.relatedEyebrow),
      relatedTitle: str(row.related_title, defaults.sections.relatedTitle),
      relatedCtaLabel: str(row.related_cta_label, defaults.sections.relatedCtaLabel),
      relatedCtaHref: str(row.related_cta_href, defaults.sections.relatedCtaHref),
      relatedPromptTitle: str(row.related_prompt_title, defaults.sections.relatedPromptTitle),
      relatedPromptBody: str(row.related_prompt_body, defaults.sections.relatedPromptBody),
      relatedPromptCtaLabel: str(
        row.related_prompt_cta_label,
        defaults.sections.relatedPromptCtaLabel,
      ),
      relatedPromptCtaHref: str(
        row.related_prompt_cta_href,
        defaults.sections.relatedPromptCtaHref,
      ),
      relatedPromptCues:
        relatedPromptCues.length > 0 ? relatedPromptCues : defaults.sections.relatedPromptCues,
    },
    passport: {
      eyebrow: str(row.passport_eyebrow, defaults.passport.eyebrow),
      title: str(row.passport_title, defaults.passport.title),
      body: str(row.passport_body, defaults.passport.body),
      diagnosticsTitle: str(row.passport_diagnostics_title, defaults.passport.diagnosticsTitle),
      statusPrefix: str(row.passport_status_prefix, defaults.passport.statusPrefix),
      statusFallback: str(row.passport_status_fallback, defaults.passport.statusFallback),
      verifiedLabel: str(row.passport_verified_label, defaults.passport.verifiedLabel),
    },
    mobile: {
      reservedLabel: str(row.mobile_reserved_label, defaults.mobile.reservedLabel),
      soldLabel: str(row.mobile_sold_label, defaults.mobile.soldLabel),
      availableLabel: str(row.mobile_available_label, defaults.mobile.availableLabel),
      tradeLabel: str(row.mobile_trade_label, defaults.mobile.tradeLabel),
      navAriaLabel: str(row.mobile_nav_aria_label, defaults.mobile.navAriaLabel),
    },
    leadForm: {
      available: leadMode("available"),
      reserved: leadMode("reserved"),
      sold: leadMode("sold"),
    },
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
export const getSitePage = cache(async function getSitePage(
  slug: string,
): Promise<SitePage | null> {
  const data = await directusGet<Record<string, unknown>[]>(
    `/items/site_pages?filter[slug][_eq]=${encodeURIComponent(slug)}&filter[status][_eq]=published&fields=*&limit=1`,
  );
  if (data && data.length > 0) {
    const page = mapSitePageFromDirectus(data[0]);
    const sections = await directusGet<Record<string, unknown>[]>(
      `/items/page_sections?filter[page][_eq]=${encodeURIComponent(str(data[0].id))}&filter[is_active][_eq]=true&fields=*&sort=sort_order`,
    );
    const mappedSections = sections?.map(mapPageSectionFromDirectus) ?? [];
    return {
      ...page,
      sections: await enrichFaqSections(str(data[0].id), page.slug, mappedSections),
    };
  }
  return null;
});

/** Active sections for a page slug (convenience wrapper over getSitePage). */
export const getPageSections = cache(async function getPageSections(
  slug: string,
): Promise<PageSection[]> {
  const page = await getSitePage(slug);
  if (!page) return [];
  return page.sections.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
});

/** Global site settings singleton. */
export const getSiteSettings = cache(
  async function getSiteSettings(): Promise<SiteSettings | null> {
    const data = await directusGet<Record<string, unknown> | Record<string, unknown>[]>(
      "/items/site_settings?limit=1",
    );
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapSiteSettingsFromDirectus(row) : null;
  },
);

/** Shared product detail page template copy. */
export const getDevicePageSettings = cache(
  async function getDevicePageSettings(): Promise<DevicePageSettings> {
    const data = await directusGet<Record<string, unknown> | Record<string, unknown>[]>(
      "/items/device_page_settings?limit=1",
    );
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapDevicePageSettingsFromDirectus(row) : fallbackDevicePageSettings;
  },
);

/** Active navigation links for header/footer/mobile chrome. */
export const getNavigationItems = cache(async function getNavigationItems(): Promise<
  NavigationItem[]
> {
  const data = await directusGet<Record<string, unknown>[]>(
    "/items/navigation_items?filter[is_active][_eq]=true&fields=*,page.slug&sort=location,sort",
  );
  return data?.map(mapNavigationItemFromDirectus).filter((item) => item.label && item.url) ?? [];
});

/** Active FAQ items, optionally filtered by category. */
export const getFaqItems = cache(async function getFaqItems(category?: string): Promise<FaqItem[]> {
  const catFilter = category ? `&filter[category][_eq]=${encodeURIComponent(category)}` : "";
  const data = await directusGet<Record<string, unknown>[]>(
    `/items/faq_items?filter[is_active][_eq]=true${catFilter}&sort=sort`,
  );
  return data?.map(mapFaqItemFromDirectus) ?? [];
});
