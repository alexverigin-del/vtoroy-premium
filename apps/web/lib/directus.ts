import type { Device } from "@vtoroy/shared";

// Typed configuration for the Directus backend.
//
// The base URL comes from the environment so the same build can target local
// dev, staging, and production without code changes. NEXT_PUBLIC_ is required
// because the URL is also used in the browser.
export const directusConfig = {
  url: process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "",
} as const;

function ensureUrl(): string {
  if (!directusConfig.url) {
    // Intentionally soft: the scaffold must build/run without a backend.
    // Once Directus is configured, callers should treat a missing URL as fatal.
    return "";
  }
  return directusConfig.url.replace(/\/+$/, "");
}

/**
 * Fetch the published device catalog from Directus.
 *
 * TODO: implement against the real Directus REST/GraphQL API once the
 * `devices` collection exists (see directus/schema/collections.md). Expected
 * REST shape:
 *   GET {DIRECTUS_URL}/items/devices?filter[status][_eq]=published&fields=*
 * Map the Directus rows to the shared `Device` type. Use Next's fetch caching
 * (e.g. `{ next: { revalidate: 300 } }`) for ISR.
 */
export async function fetchDevices(): Promise<Device[]> {
  const base = ensureUrl();
  if (!base) return [];

  // TODO: replace with real request + response mapping.
  // const res = await fetch(`${base}/items/devices?filter[status][_eq]=published`, {
  //   next: { revalidate: 300 },
  // });
  // const json = await res.json();
  // return json.data as Device[];
  return [];
}

/**
 * Fetch a single device (and its passport) by slug.
 *
 * TODO: GET {DIRECTUS_URL}/items/devices?filter[id][_eq]={slug}&fields=*.*
 */
export async function fetchDeviceBySlug(slug: string): Promise<Device | null> {
  const base = ensureUrl();
  if (!base) return null;

  // TODO: implement.
  void slug;
  return null;
}

/** Build an absolute URL to a Directus-stored asset (image) by file id. */
export function directusAssetUrl(fileId: string): string {
  const base = ensureUrl();
  return base ? `${base}/assets/${fileId}` : "";
}
