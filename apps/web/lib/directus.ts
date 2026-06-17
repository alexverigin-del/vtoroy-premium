import type {
  Device,
  DevicePassport,
  GalleryImage,
  SitePage,
  PageSection,
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
//   - If no URL is configured, or any request fails, catalog reads fall back to
//     the bundled data/devices.ts (mirror of the repo-root data/devices.json) so
//     the app builds and runs with NO backend. Content reads return null/[] so
//     callers can render template defaults.

const SERVER_URL = process.env.DIRECTUS_URL ?? "";
const PUBLIC_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "";

export const directusConfig = {
  /** Server-preferred base URL (falls back to the public one). */
  url: (SERVER_URL || PUBLIC_URL).replace(/\/+$/, ""),
  /** Whether a live Directus backend is configured. */
  get enabled(): boolean {
    return this.url.length > 0;
  },
  token: process.env.DIRECTUS_TOKEN ?? "",
} as const;

/** Cache window for ISR-style revalidation (seconds). */
const REVALIDATE = 300;

async function directusGet<T>(path: string): Promise<T | null> {
  if (!directusConfig.url) return null;
  const headers: Record<string, string> = {};
  if (directusConfig.token) {
    headers.Authorization = `Bearer ${directusConfig.token}`;
  }
  try {
    const res = await fetch(`${directusConfig.url}${path}`, {
      headers,
      next: { revalidate: REVALIDATE },
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
export function directusAssetUrl(fileId: string): string {
  return directusConfig.url ? `${directusConfig.url}/assets/${fileId}` : "";
}

// ---------------------------------------------------------------------------
// Directus row -> app Device mapping
// ---------------------------------------------------------------------------
//
// The MVP stores devices in a single `devices` collection (see
// scripts/seed_directus.py): scalars as snake_case columns, and tags/gallery/
// passport/trade as JSON columns. Directus returns those raw, so map them into
// the camelCase `Device` contract used across the app.

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

export function mapDeviceFromDirectus(row: Record<string, unknown>): Device {
  return {
    id: str(row.id),
    tags: json<string[]>(row.tags, []),
    category: str(row.category),
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
    shortDescription: str(row.short_description),
    headline: str(row.headline),
    listingImage: str(row.listing_image),
    listingAlt: str(row.listing_alt),
    ctaLabel: str(row.cta_label),
    hasDetailPage: bool(row.has_detail_page),
    detailHref: str(row.detail_href),
    visualClass: str(row.visual_class),
    gallery: json<GalleryImage[]>(row.gallery, []),
    passport: json<DevicePassport>(row.passport, EMPTY_PASSPORT),
    trade: json<TradeInfo>(row.trade, { options: [] }),
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Published devices for the catalog. Falls back to bundled data when Directus
 * is not configured or unreachable.
 *
 * The MVP `devices` collection stores everything in columns + JSON fields, so a
 * flat `fields=*` is enough; rows are mapped to the app `Device` shape.
 *   GET /items/devices?filter[status][_eq]=published&fields=*&sort=sort
 */
export async function getPublishedDevices(): Promise<Device[]> {
  const data = await directusGet<Record<string, unknown>[]>(
    "/items/devices?filter[status][_eq]=published&fields=*&sort=sort",
  );
  if (data && data.length > 0) return data.map(mapDeviceFromDirectus);
  return fallbackDevices;
}

/**
 * A single device by slug (id). Falls back to bundled data.
 *
 *   GET /items/devices?filter[id][_eq]={slug}&fields=*&limit=1
 */
export async function getDeviceBySlug(slug: string): Promise<Device | null> {
  const data = await directusGet<Record<string, unknown>[]>(
    `/items/devices?filter[id][_eq]=${encodeURIComponent(slug)}&fields=*&limit=1`,
  );
  if (data && data.length > 0) return mapDeviceFromDirectus(data[0]);
  return fallbackDevices.find((d) => d.id === slug) ?? null;
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
    image: str(row.image) ? directusAssetUrl(str(row.image)) : "",
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
  return {
    id: str(row.id),
    key: str(row.key),
    question: str(row.question),
    answer: str(row.answer),
    category: str(row.category),
    sort: num(row.sort),
    isActive: bool(row.is_active, true),
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
  );
  if (data && data.length > 0) {
    const page = mapSitePageFromDirectus(data[0]);
    const sections = await directusGet<Record<string, unknown>[]>(
      `/items/page_sections?filter[page][_eq]=${encodeURIComponent(str(data[0].id))}&filter[is_active][_eq]=true&fields=*&sort=sort_order`,
    );
    return {
      ...page,
      sections: sections?.map(mapPageSectionFromDirectus) ?? [],
    };
  }
  return null;
}

/** Active sections for a page slug (convenience wrapper over getSitePage). */
export async function getPageSections(slug: string): Promise<PageSection[]> {
  const page = await getSitePage(slug);
  if (!page) return [];
  return page.sections
    .filter((s) => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Active FAQ items, optionally filtered by category. */
export async function getFaqItems(category?: string): Promise<FaqItem[]> {
  const catFilter = category
    ? `&filter[category][_eq]=${encodeURIComponent(category)}`
    : "";
  const data = await directusGet<Record<string, unknown>[]>(
    `/items/faq_items?filter[is_active][_eq]=true${catFilter}&sort=sort`,
  );
  return data?.map(mapFaqItemFromDirectus) ?? [];
}
