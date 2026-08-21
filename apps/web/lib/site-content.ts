import type { NavigationItem, PageSection, SitePage, SiteSettings } from "@vtoroy/shared";
import homepageCopyData from "@/data/homepage-copy.json";
import marketingPagesData from "@/data/marketing-pages.json";
import { prepareRichText, prepareSectionContentRichText } from "@/lib/rich-text";

export const dynamic = "force-dynamic";

type SiteChrome = {
  settings: SiteSettings;
  navigation: NavigationItem[];
};

export type MarketingSlug = "store" | "trade" | "passport" | "club";
export type InfoSlug = "about" | "contacts" | "warranty" | "payment" | "privacy" | "terms";

const marketingSlugs = new Set<MarketingSlug>(["store", "trade", "passport", "club"]);
const infoSlugs = new Set<InfoSlug>([
  "about",
  "contacts",
  "warranty",
  "payment",
  "privacy",
  "terms",
]);
const marketingFallbackEnhancementKeys: Record<MarketingSlug, Set<string>> = {
  store: new Set(["store_decision", "store_curated_catalog"]),
  trade: new Set(["trade_live_example"]),
  passport: new Set(["passport_live_example"]),
  club: new Set(["club_live_example"]),
};

const defaultSiteSettings: SiteSettings = {
  brandName: "I СВОИ",
  tagline: homepageCopyData.footer.tagline,
  city: "Белгород",
  logoHref: "/",
  logoHeight: 22,
  showBrandName: true,
  headerCtaLabel: "Смотреть каталог",
  headerCtaUrl: "/catalog",
  footerNote: homepageCopyData.footer.footer_note,
  footerBrandText: homepageCopyData.footer.footer_brand_text,
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
    id: "header-catalog-all",
    label: "Весь каталог",
    url: "/catalog",
    location: "header",
    parent: "header-catalog",
    sort: 1,
    isActive: true,
  },
  {
    id: "header-catalog-tech",
    label: "Техника",
    url: "/catalog/tech",
    location: "header",
    parent: "header-catalog",
    sort: 2,
    isActive: true,
  },
  {
    id: "header-catalog-accessories",
    label: "Аксессуары",
    url: "/catalog/accessories",
    location: "header",
    parent: "header-catalog",
    sort: 3,
    isActive: true,
  },
  {
    id: "header-store",
    label: "Магазин в Белгороде",
    url: "/belgorod",
    location: "header",
    sort: 2,
    isActive: true,
  },
  {
    id: "header-passport",
    label: "Как мы проверяем",
    url: "/passport",
    location: "header",
    sort: 3,
    isActive: true,
  },
  {
    id: "header-trade",
    label: "Продать или обменять",
    url: "/trade",
    location: "header",
    sort: 4,
    isActive: true,
  },
  {
    id: "header-blog",
    label: "Блог",
    url: "/blog",
    location: "header",
    sort: 5,
    isActive: true,
  },
  {
    id: "footer-purchase",
    label: "Покупка",
    url: "/",
    location: "footer",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-purchase-catalog",
    label: "Каталог",
    url: "/catalog",
    location: "footer",
    parent: "footer-purchase",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-purchase-tech",
    label: "Техника",
    url: "/catalog/tech",
    location: "footer",
    parent: "footer-purchase",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-purchase-accessories",
    label: "Аксессуары",
    url: "/catalog/accessories",
    location: "footer",
    parent: "footer-purchase",
    sort: 3,
    isActive: true,
  },
  {
    id: "footer-services",
    label: "Сервисы",
    url: "/",
    location: "footer",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-services-passport",
    label: "Как мы проверяем",
    url: "/passport",
    location: "footer",
    parent: "footer-services",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-services-trade",
    label: "Продать или обменять",
    url: "/trade",
    location: "footer",
    parent: "footer-services",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-services-club",
    label: "Club — пилот",
    url: "/club",
    location: "footer",
    parent: "footer-services",
    sort: 3,
    isActive: true,
  },
  {
    id: "footer-isvoi",
    label: "I СВОИ",
    url: "/",
    location: "footer",
    sort: 3,
    isActive: true,
  },
  {
    id: "footer-isvoi-store",
    label: "Магазин в Белгороде",
    url: "/belgorod",
    location: "footer",
    parent: "footer-isvoi",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-isvoi-blog",
    label: "Блог",
    url: "/blog",
    location: "footer",
    parent: "footer-isvoi",
    sort: 2,
    isActive: true,
  },
];

type HomepageCopySection = (typeof homepageCopyData.sections)[number];

function homepageFallbackSection(
  sectionKey: HomepageCopySection["section_key"],
  id: string,
  image?: string,
): PageSection {
  const section = homepageCopyData.sections.find((item) => item.section_key === sectionKey);
  if (!section) throw new Error(`Missing canonical homepage section: ${sectionKey}`);
  const body = prepareRichText(section.body);
  return {
    id,
    sectionKey: section.section_key,
    variant: section.variant,
    eyebrow: section.eyebrow ?? undefined,
    headline: section.headline ?? undefined,
    body: body.html || undefined,
    bodyRichText: body.nodes,
    primaryCtaLabel: section.primary_cta_label ?? undefined,
    primaryCtaUrl: section.primary_cta_url ?? undefined,
    secondaryCtaLabel: section.secondary_cta_label ?? undefined,
    secondaryCtaUrl: section.secondary_cta_url ?? undefined,
    image,
    sortOrder: section.sort_order,
    isActive: true,
    content: prepareSectionContentRichText(section.content as PageSection["content"]),
  };
}

const defaultHeroSection = homepageFallbackSection(
  "hero",
  "hero-fallback",
  "/assets/critical-home-hero.webp",
);
const defaultTrustSection = homepageFallbackSection("trust", "trust-fallback");
const defaultCatalogPreviewSection = homepageFallbackSection(
  "catalog_preview",
  "catalog-preview-fallback",
);
const defaultPassportSection = homepageFallbackSection(
  "passport_preview",
  "passport-preview-fallback",
);
const defaultStoreSection = homepageFallbackSection(
  "store_preview",
  "store-preview-fallback",
  "/assets/store-real-premium-hero.webp",
);
const defaultTradeSection = homepageFallbackSection("trade_preview", "trade-preview-fallback");
const defaultCircleRulesSection = homepageFallbackSection("circle_rules", "circle-rules-fallback");
const defaultFaqSection = homepageFallbackSection("faq", "home-faq-fallback");
const defaultFinalSection = homepageFallbackSection("final_cta", "final-cta-fallback");

const defaultMarketTensionSection: PageSection = {
  id: "market-tension-fallback",
  sectionKey: "market_tension",
  variant: "compare",
  eyebrow: "Не просто витрина",
  headline: "Покупка начинается с ответа: чему здесь можно доверять?",
  body: "Мы показываем разницу до карточки товара: не обещание «как новая», а проверка, нюансы, гарантия и понятный следующий шаг.",
  sortOrder: 2,
  isActive: true,
  content: {
    comparison: {
      label_header: "Что решает покупатель",
      bad_header: "Случайный рынок",
      good_header: "I СВОИ",
      rows: [
        {
          label: "История вещи",
          bad: "зависит от слов продавца",
          good: "собрана в Passport до решения",
        },
        {
          label: "Состояние",
          bad: "нюансы всплывают после встречи",
          good: "фиксируется открыто, включая дефекты",
        },
        {
          label: "После покупки",
          bad: "дальше вы снова одни",
          good: "есть гарантия и предварительная оценка Trade",
        },
      ],
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
    .replace(/^\/device\/([^/]+)(?:\/index\.html)?$/, "/product/$1");
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
  const deprecated = new Set([
    defaultMarketTensionSection.sectionKey,
    "path_router",
    "club_preview",
    "diagnostics_compare",
  ]);
  const active = sections.filter(
    (section) => section.isActive && !deprecated.has(section.sectionKey),
  );
  const byKey = new Map(active.map((section) => [section.sectionKey, section]));

  if (!byKey.has("hero")) {
    byKey.set("hero", defaultHeroSection);
  }
  if (!byKey.has("trust")) byKey.set("trust", defaultTrustSection);
  if (!byKey.has("catalog_preview")) {
    byKey.set("catalog_preview", defaultCatalogPreviewSection);
  }
  if (!byKey.has("passport_preview")) byKey.set("passport_preview", defaultPassportSection);
  if (!byKey.has("circle_rules")) byKey.set("circle_rules", defaultCircleRulesSection);
  if (!byKey.has("store_preview")) byKey.set("store_preview", defaultStoreSection);
  if (!byKey.has("trade_preview")) byKey.set("trade_preview", defaultTradeSection);
  if (!byKey.has("faq")) byKey.set("faq", defaultFaqSection);
  if (!byKey.has("final_cta")) byKey.set("final_cta", defaultFinalSection);

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
        defaultSiteSettings.headerCtaLabel ?? "Оставить заявку",
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

const clubNavigationFallback: NavigationItem[] = [
  {
    id: "club-header-how",
    label: "Как работает",
    url: "/#how-it-works",
    location: "header",
    sort: 1,
    isActive: true,
  },
  {
    id: "club-header-devices",
    label: "Устройства",
    url: "/#devices",
    location: "header",
    sort: 2,
    isActive: true,
  },
  {
    id: "club-header-plans",
    label: "Тарифы",
    url: "/#plans",
    location: "header",
    sort: 3,
    isActive: true,
  },
  {
    id: "club-header-rules",
    label: "Правила",
    url: "/#rules",
    location: "header",
    sort: 4,
    isActive: true,
  },
  {
    id: "club-footer-main",
    label: "I СВОИ",
    url: "https://isvoi.ru/",
    location: "footer",
    sort: 1,
    isActive: true,
  },
  {
    id: "club-footer-catalog",
    label: "Каталог",
    url: "https://isvoi.ru/catalog",
    location: "footer",
    parent: "club-footer-main",
    sort: 1,
    isActive: true,
  },
  {
    id: "club-footer-trade",
    label: "Trade",
    url: "https://isvoi.ru/trade",
    location: "footer",
    parent: "club-footer-main",
    sort: 2,
    isActive: true,
  },
];

function clubNavigation(items: NavigationItem[]): NavigationItem[] {
  const scoped = items
    .filter((item) => item.location === "club_header" || item.location === "club_footer")
    .map((item) => ({
      ...item,
      url: normalizeSiteUrl(item.url),
      location: item.location === "club_header" ? ("header" as const) : ("footer" as const),
      parent: item.parent || undefined,
    }));

  return scoped.length > 0 ? scoped : clubNavigationFallback;
}

export function clubChrome(
  settings: SiteSettings | null,
  navigation: NavigationItem[],
): SiteChrome {
  const chrome = siteChrome(settings, navigation);

  return {
    settings: {
      ...chrome.settings,
      brandName: "I СВОИ Club",
      logoHref: "https://isvoi.ru/",
      headerCtaLabel: "Получить расчёт Club",
      headerCtaUrl: "#club-request",
      footerBrandText:
        "Club — пилотная модель владения техникой по фиксированному ежемесячному сценарию: продлить, сменить, выкупить или вернуть.",
      footerNote: "Club — аренда/подписка. Устройство остаётся собственностью I СВОИ до выкупа.",
    },
    navigation: clubNavigation(navigation),
  };
}

export function isMarketingSlug(slug: string): slug is MarketingSlug {
  return marketingSlugs.has(slug as MarketingSlug);
}

export function isInfoSlug(slug: string): slug is InfoSlug {
  return infoSlugs.has(slug as InfoSlug);
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
