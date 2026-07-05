import type { DeviceCardData } from "./device-card-data";

export const SITE_URL = "https://isvoi.ru";
export const PUBLIC_BRAND_NAME = "I СВОИ";

type BreadcrumbItem = {
  name: string;
  path: string;
};

export function siteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: PUBLIC_BRAND_NAME,
    url: SITE_URL,
    logo: siteUrl("/favicon.svg"),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: PUBLIC_BRAND_NAME,
    url: SITE_URL,
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
    inLanguage: "ru-RU",
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}

export function catalogItemListJsonLd(devices: DeviceCardData[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${PUBLIC_BRAND_NAME} Store`,
    itemListElement: devices.map((device, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: siteUrl(`/device/${device.id}`),
      name: device.title,
    })),
  };
}
