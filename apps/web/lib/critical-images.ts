const CRITICAL_DIRECTUS_IMAGE_OVERRIDES = new Map<string, string>([
  ["cd194999-a3b9-456a-a724-55ef798e10c5", "/assets/critical-home-hero.webp"],
  ["95cbc9d4-532d-4c5c-9bba-e9492416c75f", "/assets/critical-store-hero.webp"],
]);

export function priorityImageSrc(src: string): string {
  if (!src) return "";
  try {
    const url = new URL(src);
    if (url.hostname !== "api.isvoi.ru" || !url.pathname.startsWith("/assets/")) return src;

    const directusAssetId = url.pathname.split("/").filter(Boolean).at(-1) || "";
    const override = CRITICAL_DIRECTUS_IMAGE_OVERRIDES.get(directusAssetId);
    if (override) return override;

    url.searchParams.set("width", "1200");
    url.searchParams.set("quality", "80");
    url.searchParams.set("format", "auto");
    url.searchParams.set("withoutEnlargement", "true");
    url.searchParams.delete("height");
    url.searchParams.delete("fit");
    return url.toString();
  } catch {
    return src;
  }
}

export function isCriticalLocalImageSrc(src: string): boolean {
  return src.startsWith("/assets/critical-");
}
