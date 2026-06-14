import type {
  Device,
  SitePage,
  PageSection,
  FaqItem,
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
// Catalog
// ---------------------------------------------------------------------------

/**
 * Published devices for the catalog. Falls back to bundled data when Directus
 * is not configured or unreachable.
 *
 * Directus REST shape (once the `devices` collection exists):
 *   GET /items/devices?filter[status][_eq]=published&fields=*,gallery.*,passport.*,trade_options.*
 */
export async function getPublishedDevices(): Promise<Device[]> {
  const data = await directusGet<Device[]>(
    "/items/devices?filter[status][_eq]=published&fields=*,gallery.*,passport.*,trade_options.*&sort=sort",
  );
  if (data && data.length > 0) return data;
  return fallbackDevices;
}

/**
 * A single device by slug (id). Falls back to bundled data.
 *
 * Directus REST shape:
 *   GET /items/devices?filter[id][_eq]={slug}&fields=*.* (limit 1)
 */
export async function getDeviceBySlug(slug: string): Promise<Device | null> {
  const data = await directusGet<Device[]>(
    `/items/devices?filter[id][_eq]=${encodeURIComponent(slug)}&fields=*.*&limit=1`,
  );
  if (data && data.length > 0) return data[0];
  return fallbackDevices.find((d) => d.id === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Editable site content (texts)
// ---------------------------------------------------------------------------

/**
 * A published site page by slug, with its active sections.
 *
 * Returns null when Directus is unconfigured/unreachable so the route can fall
 * back to template defaults baked into the component. Content has no bundled
 * fallback by design (the static prototype is the reference, not seed data).
 */
export async function getSitePage(slug: string): Promise<SitePage | null> {
  const data = await directusGet<SitePage[]>(
    `/items/site_pages?filter[slug][_eq]=${encodeURIComponent(slug)}&filter[status][_eq]=published&fields=*,sections.*&limit=1`,
  );
  if (data && data.length > 0) return data[0];
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
  const data = await directusGet<FaqItem[]>(
    `/items/faq_items?filter[is_active][_eq]=true${catFilter}&sort=sort`,
  );
  return data ?? [];
}
