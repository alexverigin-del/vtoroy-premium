import type { NavigationItem, PageSection, SitePage, SiteSettings } from "@vtoroy/shared";
import marketingPagesData from "@/data/marketing-pages.json";

export const dynamic = "force-dynamic";

type SiteChrome = {
  settings: SiteSettings;
  navigation: NavigationItem[];
};

export type MarketingSlug = "store" | "trade" | "passport" | "club";

const marketingSlugs = new Set<MarketingSlug>(["store", "trade", "passport", "club"]);
const marketingFallbackEnhancementKeys: Record<MarketingSlug, Set<string>> = {
  store: new Set(["store_decision", "store_curated_catalog"]),
  trade: new Set(["trade_live_example"]),
  passport: new Set(["passport_live_example"]),
  club: new Set(["club_live_example"]),
};

const defaultSiteSettings: SiteSettings = {
  brandName: "I СВОИ",
  tagline: "Хорошие вещи проходят через своих.",
  city: "Северодвинск",
  logoHref: "/",
  logoHeight: 22,
  showBrandName: true,
  headerCtaLabel: "Войти в круг",
  headerCtaUrl: "/#final",
  footerNote:
    "I СВОИ — клуб разумного владения: проверенные вещи проходят дальше через своих. Наличие, цены, грейды, гарантия и условия выхода подтверждаются перед сделкой. Названия и товарные знаки принадлежат их правообладателям.",
  footerBrandText: "Клуб разумного владения. Хорошие вещи проходят через своих. Северодвинск.",
  footerLegal: "Хорошие вещи проходят через своих.",
  footerCopyright: "© 2026 I СВОИ.",
};

const defaultNavigationItems: NavigationItem[] = [
  {
    id: "header-catalog",
    label: "Каталог",
    url: "/catalog",
    location: "header",
    sort: 1,
    isActive: true,
  },
  {
    id: "header-store",
    label: "Store",
    url: "/store",
    location: "header",
    sort: 2,
    isActive: true,
  },
  {
    id: "header-passport",
    label: "Passport",
    url: "/passport",
    location: "header",
    sort: 3,
    isActive: true,
  },
  {
    id: "header-trade",
    label: "Trade",
    url: "/trade",
    location: "header",
    sort: 4,
    isActive: true,
  },
  { id: "header-club", label: "Club", url: "/club", location: "header", sort: 5, isActive: true },
  { id: "footer-club", label: "Клуб", url: "#top", location: "footer", sort: 1, isActive: true },
  {
    id: "footer-club-catalog",
    label: "Каталог",
    url: "/catalog",
    location: "footer",
    parent: "footer-club",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-club-store",
    label: "Store",
    url: "/store",
    location: "footer",
    parent: "footer-club",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-club-passport",
    label: "I СВОИ Passport",
    url: "/passport",
    location: "footer",
    parent: "footer-club",
    sort: 3,
    isActive: true,
  },
  {
    id: "footer-services",
    label: "Сервисы",
    url: "#top",
    location: "footer",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-services-trade",
    label: "Trade",
    url: "/trade",
    location: "footer",
    parent: "footer-services",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-services-club",
    label: "Club",
    url: "/club",
    location: "footer",
    parent: "footer-services",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-services-check",
    label: "Открытая проверка",
    url: "/store#diagnostics",
    location: "footer",
    parent: "footer-services",
    sort: 3,
    isActive: true,
  },
  {
    id: "footer-contacts",
    label: "Контакты",
    url: "#top",
    location: "footer",
    sort: 3,
    isActive: true,
  },
  {
    id: "footer-contacts-city",
    label: "Северодвинск",
    url: "/#top",
    location: "footer",
    parent: "footer-contacts",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-contacts-check",
    label: "Записаться на проверку",
    url: "/#final",
    location: "footer",
    parent: "footer-contacts",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-contacts-sell",
    label: "Передать вещь дальше",
    url: "/#final",
    location: "footer",
    parent: "footer-contacts",
    sort: 3,
    isActive: true,
  },
];

const defaultCatalogPreviewSection: PageSection = {
  id: "catalog-preview-fallback",
  sectionKey: "catalog_preview",
  variant: "catalog.grid",
  eyebrow: "Store · сейчас в I СВОИ",
  headline: "Вещи в кругу — сейчас в наличии.",
  subheadline: "Фильтры каталога",
  body: "Каждая карточка показывает не только цену, но и историю вещи: грейд, батарею, проверку и цену выхода. Это вещи, которые прошли через своих.",
  primaryCtaLabel: "Смотреть весь Store",
  primaryCtaUrl: "/catalog",
  secondaryCtaLabel: "Подобрать вещь",
  secondaryCtaUrl: "#final",
  sortOrder: 4,
  isActive: true,
  content: {
    filters: [
      { label: "Все", value: "all" },
      { label: "iPhone", value: "iphone" },
      { label: "MacBook", value: "macbook" },
      { label: "iPad", value: "ipad" },
      { label: "Для Club", value: "club" },
    ],
  },
};

const defaultHeroSection: PageSection = {
  id: "hero-fallback",
  sectionKey: "hero",
  variant: "hero.static",
  eyebrow: "I СВОИ · клуб разумного владения · Северодвинск",
  headline: "Хорошие вещи проходят через своих.",
  body: "I СВОИ — клуб разумного владения. Здесь ценная вещь не теряется после первого владельца, а переходит дальше — с понятной историей, проверенным состоянием и честной ценой выхода. Не рынок, а круг, где вещам доверяют.",
  primaryCtaLabel: "Войти в круг",
  primaryCtaUrl: "#final",
  secondaryCtaLabel: "Смотреть Store",
  secondaryCtaUrl: "/catalog",
  sortOrder: 1,
  isActive: true,
  content: {
    assurance: ["В кругу своих", "С историей и проверкой", "Store в Северодвинске"],
    visual: {
      image_src: "/assets/hero-apple-like-single-phone-clean.webp",
      image_alt: "Премиальный графитовый смартфон на светло-серой студийной поверхности",
    },
    passport: {
      aria_label: "I СВОИ Passport вещи",
      device: "iPhone 13 Pro",
      sub: "256 GB · Графитовый",
      grade: "A−",
      grade_label: "Грейд",
      rows: [
        { label: "Батарея", value: "89%", state: "ok" },
        { label: "Ремонт", value: "не вскрывался", state: "ok" },
        { label: "Face ID", value: "работает", state: "ok" },
        { label: "Влага", value: "следов нет", state: "ok" },
      ],
      exit_label: "Цена выхода через 6 мес",
      exit_value: "до 42 000 ₽",
      warranty: "Гарантия",
      warranty_strong: "90 дней",
    },
  },
};

function textField(
  settings: SiteSettings | null,
  key: keyof SiteSettings,
  fallback: string,
): string {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeSiteUrl(url: string, fallback = "#top"): string {
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

function strField(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function boolField(record: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function numField(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeFallbackSection(raw: Record<string, unknown>): PageSection {
  return {
    id: strField(raw, "id", strField(raw, "sectionKey")),
    sectionKey: strField(raw, "sectionKey"),
    variant: strField(raw, "variant"),
    eyebrow: strField(raw, "eyebrow"),
    headline: strField(raw, "headline"),
    subheadline: strField(raw, "subheadline"),
    body: strField(raw, "body"),
    primaryCtaLabel: strField(raw, "primaryCtaLabel"),
    primaryCtaUrl: normalizeSiteUrl(strField(raw, "primaryCtaUrl", "#final")),
    secondaryCtaLabel: strField(raw, "secondaryCtaLabel"),
    secondaryCtaUrl: normalizeSiteUrl(strField(raw, "secondaryCtaUrl", "")),
    image: strField(raw, "image"),
    sortOrder: numField(raw, "sortOrder"),
    isActive: boolField(raw, "isActive", true),
    content: (raw.content && typeof raw.content === "object"
      ? raw.content
      : {}) as PageSection["content"],
  };
}

function marketingSections(slug: MarketingSlug, sections: PageSection[] = []): PageSection[] {
  const active = sections.filter((section) => section.isActive);
  const fallback = getFallbackMarketingPage(slug).sections;
  if (active.length === 0) return fallback.sort((a, b) => a.sortOrder - b.sortOrder);

  const byKey = new Map(active.map((section) => [section.sectionKey, section]));
  for (const fallbackSection of fallback) {
    if (
      marketingFallbackEnhancementKeys[slug].has(fallbackSection.sectionKey) &&
      !byKey.has(fallbackSection.sectionKey)
    ) {
      byKey.set(fallbackSection.sectionKey, fallbackSection);
    }
  }

  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

function homeSections(sections: PageSection[] = []): PageSection[] {
  const active = sections.filter((section) => section.isActive);
  const byKey = new Map(active.map((section) => [section.sectionKey, section]));

  if (!byKey.has("hero")) {
    byKey.set("hero", defaultHeroSection);
  }
  if (!byKey.has("catalog_preview")) {
    byKey.set("catalog_preview", defaultCatalogPreviewSection);
  }

  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function siteChrome(
  settings: SiteSettings | null,
  navigation: NavigationItem[],
): SiteChrome {
  return {
    settings: {
      ...defaultSiteSettings,
      ...settings,
      brandName: textField(settings, "brandName", defaultSiteSettings.brandName),
      tagline: textField(settings, "tagline", defaultSiteSettings.tagline),
      city: textField(settings, "city", defaultSiteSettings.city),
      logoFile: settings?.logoFile,
      logoAlt: textField(
        settings,
        "logoAlt",
        settings?.brandName
          ? `${settings.brandName} logo`
          : `${defaultSiteSettings.brandName} logo`,
      ),
      logoHref: textField(settings, "logoHref", defaultSiteSettings.logoHref ?? "/"),
      logoWidth: settings?.logoWidth ?? defaultSiteSettings.logoWidth,
      logoHeight: settings?.logoHeight ?? defaultSiteSettings.logoHeight,
      logoCaption: settings?.logoCaption?.trim(),
      showBrandName: settings?.showBrandName ?? defaultSiteSettings.showBrandName,
      headerCtaLabel: textField(
        settings,
        "headerCtaLabel",
        defaultSiteSettings.headerCtaLabel ?? "Войти в круг",
      ),
      headerCtaUrl: textField(
        settings,
        "headerCtaUrl",
        defaultSiteSettings.headerCtaUrl ?? "/#final",
      ),
      footerNote: textField(settings, "footerNote", defaultSiteSettings.footerNote ?? ""),
      footerBrandText: textField(
        settings,
        "footerBrandText",
        defaultSiteSettings.footerBrandText ?? "",
      ),
      footerLegal: textField(settings, "footerLegal", defaultSiteSettings.footerLegal ?? ""),
      footerCopyright: textField(
        settings,
        "footerCopyright",
        defaultSiteSettings.footerCopyright ?? "",
      ),
    },
    navigation: navigation.length > 0 ? navigation : defaultNavigationItems,
  };
}

export function isMarketingSlug(slug: string): slug is MarketingSlug {
  return marketingSlugs.has(slug as MarketingSlug);
}

export function getFallbackMarketingPage(slug: MarketingSlug): SitePage {
  const raw = marketingPagesData[slug] as unknown as Record<string, unknown>;
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return {
    slug,
    template: strField(raw, "template", slug),
    status: "published",
    title: strField(raw, "title", "I СВОИ"),
    metaDescription: strField(raw, "metaDescription"),
    sections: sections
      .filter(
        (section): section is Record<string, unknown> => !!section && typeof section === "object",
      )
      .map(normalizeFallbackSection),
  };
}

export function marketingSectionsForPage(
  slug: MarketingSlug,
  sections: PageSection[] = [],
): PageSection[] {
  return marketingSections(slug, sections);
}

export function homeSectionsForPage(sections: PageSection[] = []): PageSection[] {
  return homeSections(sections);
}
