import type { NavigationItem, SiteSettings } from "@vtoroy/shared";
import type { CSSProperties } from "react";

export function sortNavigation(items: NavigationItem[]): NavigationItem[] {
  return [...items].filter((item) => item.isActive).sort((a, b) => a.sort - b.sort);
}

export function normalizeSiteUrl(url: string | undefined, fallback = "#top"): string {
  const value = (url || fallback).trim();
  if (!value) return fallback;
  if (/^(https?:|mailto:|tel:|#)/i.test(value)) return value;

  const rooted = value.replace(/^\.\.\//, "/");
  const path = rooted.startsWith("/") ? rooted : `/${rooted}`;
  if (path === "/index.html") return "/";
  return path
    .replace(/^\/(catalog|store|passport|trade|club)\/index\.html$/, "/$1")
    .replace(/^\/device\/([^/]+)\/index\.html$/, "/device/$1");
}

function pageSlugToPath(slug: string): string {
  const value = slug.trim();
  if (!value || value === "home") return "/";
  return `/${value.replace(/^\/+/, "")}`;
}

function normalizeAnchor(anchor: string): string {
  return anchor.trim().replace(/^#+/, "");
}

export function navigationHref(item: NavigationItem, fallback = "#top"): string {
  const type = item.linkType || "custom";
  const anchor = normalizeAnchor(item.sectionAnchor || "");
  if (type === "page" && item.page) {
    const path = pageSlugToPath(item.page);
    return normalizeSiteUrl(anchor ? `${path === "/" ? "" : path}#${anchor}` : path, fallback);
  }
  if (type === "section" && anchor) return normalizeSiteUrl(`/#${anchor}`, fallback);
  if (type === "external") return normalizeSiteUrl(item.customUrl || item.url, fallback);
  return normalizeSiteUrl(item.customUrl || item.url, fallback);
}

export function externalLinkAttrs(item: NavigationItem): {
  target?: "_blank";
  rel?: "noopener noreferrer";
} {
  return item.openInNew ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function boundedLogoSize(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function logoSizeStyle(settings: SiteSettings): CSSProperties {
  const width = boundedLogoSize(settings.logoWidth, 28, 360);
  const height = boundedLogoSize(settings.logoHeight, 16, 120);
  return {
    ...(width ? { "--logo-width": `${width}px` } : {}),
    ...(height ? { "--logo-height": `${height}px` } : {}),
  } as CSSProperties;
}
