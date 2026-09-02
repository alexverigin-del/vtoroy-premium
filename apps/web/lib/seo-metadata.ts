import type { CatalogProduct, StoreLocation } from "@vtoroy/shared";

export function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function validCoordinates(latitude: unknown, longitude: unknown) {
  const lat = optionalNumber(latitude);
  const lon = optionalNumber(longitude);
  return (
    lat !== undefined &&
    lon !== undefined &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function sitemapLastModified(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? undefined : date;
}

export function productSeoDescription(product: CatalogProduct): string {
  const details = product.deviceDetails;
  const facts = [
    details?.grade ? `Грейд ${details.grade}` : "",
    details?.batteryText || details?.battery || "",
    product.warrantyText ? `Гарантия: ${product.warrantyText}` : "",
  ].filter(Boolean);
  const copy = [product.title, facts.join(" · "), product.shortDescription]
    .filter(Boolean)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
  return copy.length <= 260 ? copy : `${copy.slice(0, 257).replace(/\s+\S*$/, "")}…`;
}

export const storesMetadata = {
  title: "Магазины I СВОИ — адреса и города",
  description: "Магазины I СВОИ: адреса, часы работы, контакты и техника в наличии в вашем городе.",
  alternates: { canonical: "/stores" },
  openGraph: {
    title: "Магазины I СВОИ — адреса и города",
    description: "Адреса, часы работы и контакты магазинов I СВОИ.",
    url: "/stores",
  },
};

export function deliveryMetadata(location: StoreLocation) {
  const title = `Получение и доставка — I СВОИ · ${location.city}`;
  const description = `Получение заказа в I СВОИ · ${location.city}: условия самовывоза и доступные способы доставки.`;
  const path = `/${location.slug}/delivery`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}
