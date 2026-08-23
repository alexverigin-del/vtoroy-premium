import { cache } from "react";
import type { StoreLocation } from "@vtoroy/shared";

import { STORE_LOCATIONS_CACHE_TAG } from "./cache-tags";
import { directusAssetUrl } from "./directus";

const DIRECTUS_URL = (
  process.env.DIRECTUS_URL ??
  process.env.NEXT_PUBLIC_DIRECTUS_URL ??
  ""
).replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? "";
const REVALIDATE = 300;

type Row = Record<string, unknown>;
type DirectusResponse<T> = { data: T };

export const DEFAULT_LOCATION: StoreLocation = {
  id: "belgorod",
  slug: "belgorod",
  status: "published",
  name: "I СВОИ Белгород",
  city: "Белгород",
  pickupEnabled: true,
  localDeliveryEnabled: false,
  intercityDeliveryEnabled: true,
  heroTitle: "Техника и аксессуары I СВОИ в Белгороде.",
  heroBody:
    "Смотрите локальное наличие, бронируйте товары и выбирайте доставку из других магазинов сети.",
  sort: 10,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cityCopy(value: unknown, city: string): string | undefined {
  const copy = text(value);
  return copy ? copy.replaceAll("{city}", city) : undefined;
}

function mapLocation(row: Row): StoreLocation {
  const heroFile = text(row.hero_file);
  const city = text(row.city);
  return {
    id: text(row.id) || text(row.slug),
    slug: text(row.slug),
    status: text(row.status) || "draft",
    name: text(row.name),
    city,
    region: text(row.region) || undefined,
    address: text(row.address) || undefined,
    latitude: number(row.latitude),
    longitude: number(row.longitude),
    phone: text(row.phone) || undefined,
    telegram: text(row.telegram) || undefined,
    email: text(row.email) || undefined,
    businessHours: text(row.business_hours) || undefined,
    mapUrl: text(row.map_url) || undefined,
    legalName: text(row.legal_name) || undefined,
    inn: text(row.inn) || undefined,
    ogrn: text(row.ogrn) || undefined,
    legalAddress: text(row.legal_address) || undefined,
    footerEyebrow: text(row.footer_eyebrow) || undefined,
    pickupEnabled: row.pickup_enabled !== false,
    localDeliveryEnabled: row.local_delivery_enabled === true,
    intercityDeliveryEnabled: row.intercity_delivery_enabled === true,
    seoTitle: text(row.seo_title) || undefined,
    metaDescription: text(row.meta_description) || undefined,
    heroEyebrow: cityCopy(row.hero_eyebrow, city),
    heroTitle: text(row.hero_title) || undefined,
    heroBody: text(row.hero_body) || undefined,
    heroImage: heroFile
      ? directusAssetUrl(heroFile, {
          width: 1600,
          quality: 84,
          fit: "cover",
          format: "auto",
          withoutEnlargement: true,
        })
      : undefined,
    heroPrimaryCtaLabel: text(row.hero_primary_cta_label) || undefined,
    heroSecondaryCtaLabel: text(row.hero_secondary_cta_label) || undefined,
    contactEyebrow: text(row.contact_eyebrow) || undefined,
    contactAddressLabel: text(row.contact_address_label) || undefined,
    contactAddressFallback: text(row.contact_address_fallback) || undefined,
    contactHoursLabel: text(row.contact_hours_label) || undefined,
    contactHoursFallback: text(row.contact_hours_fallback) || undefined,
    contactPhoneLabel: text(row.contact_phone_label) || undefined,
    contactTelegramLabel: text(row.contact_telegram_label) || undefined,
    contactMapLabel: text(row.contact_map_label) || undefined,
    catalogEyebrow: cityCopy(row.catalog_eyebrow, city),
    catalogTitle: cityCopy(row.catalog_title, city),
    catalogBody: cityCopy(row.catalog_body, city),
    catalogCtaLabel: text(row.catalog_cta_label) || undefined,
    catalogEmptyTitle: cityCopy(row.catalog_empty_title, city),
    catalogEmptyBody: cityCopy(row.catalog_empty_body, city),
    sort: number(row.sort) ?? 100,
  };
}

async function requestLocations(): Promise<StoreLocation[]> {
  if (!DIRECTUS_URL) return [DEFAULT_LOCATION];
  const headers: Record<string, string> = {};
  if (DIRECTUS_TOKEN) headers.Authorization = `Bearer ${DIRECTUS_TOKEN}`;
  try {
    const params = new URLSearchParams({
      "filter[status][_eq]": "published",
      fields:
        "id,slug,status,name,city,region,address,latitude,longitude,phone,telegram,email,business_hours,map_url,legal_name,inn,ogrn,legal_address,footer_eyebrow,hero_file,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,seo_title,meta_description,hero_eyebrow,hero_title,hero_body,hero_primary_cta_label,hero_secondary_cta_label,contact_eyebrow,contact_address_label,contact_address_fallback,contact_hours_label,contact_hours_fallback,contact_phone_label,contact_telegram_label,contact_map_label,catalog_eyebrow,catalog_title,catalog_body,catalog_cta_label,catalog_empty_title,catalog_empty_body,sort",
      sort: "sort,city",
      limit: "100",
    });
    const response = await fetch(`${DIRECTUS_URL}/items/store_locations?${params}`, {
      headers,
      next: { revalidate: REVALIDATE, tags: [STORE_LOCATIONS_CACHE_TAG] },
    });
    if (!response.ok) return [DEFAULT_LOCATION];
    const payload = (await response.json()) as DirectusResponse<Row[]>;
    const locations = payload.data.map(mapLocation).filter((item) => item.slug && item.city);
    return locations.length > 0 ? locations : [DEFAULT_LOCATION];
  } catch {
    return [DEFAULT_LOCATION];
  }
}

export const getStoreLocations = cache(requestLocations);

export async function getStoreLocation(slug: string): Promise<StoreLocation | null> {
  const locations = await getStoreLocations();
  return locations.find((location) => location.slug === slug) ?? null;
}

export function locationPath(location: StoreLocation, suffix = ""): string {
  const normalized = suffix ? `/${suffix.replace(/^\/+/, "")}` : "";
  return `/${location.slug}${normalized}`;
}
