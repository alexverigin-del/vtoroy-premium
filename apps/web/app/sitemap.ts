import type { MetadataRoute } from "next";
import { getPublishedDevices } from "@/lib/directus";

const SITE_URL = "https://isvoi.ru";

const staticRoutes = ["", "/catalog", "/store", "/passport", "/trade", "/club"] as const;

function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const devices = await getPublishedDevices();

  return [
    ...staticRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: now,
      changeFrequency:
        route === "" || route === "/catalog" ? ("daily" as const) : ("weekly" as const),
      priority: route === "" ? 1 : route === "/catalog" ? 0.9 : 0.7,
    })),
    ...devices.map((device) => ({
      url: `${SITE_URL}/device/${device.id}`,
      lastModified: validDate(device.updatedAt) ?? now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
