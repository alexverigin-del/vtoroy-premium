import type { NavigationItem, PageSection, SitePage, SiteSettings } from "@vtoroy/shared";
import marketingPagesData from "@/data/marketing-pages.json";

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
  tagline: "Хорошие вещи проходят через своих.",
  city: "Северодвинск",
  logoHref: "/",
  logoHeight: 22,
  showBrandName: true,
  headerCtaLabel: "Смотреть каталог",
  headerCtaUrl: "/catalog",
  footerNote:
    "I СВОИ — новая и проверенная б/у техника разных брендов, а также новые аксессуары с понятной совместимостью и гарантией.",
  footerBrandText:
    "Техника и аксессуары, о которых всё известно до покупки. Хорошие вещи проходят через своих. Северодвинск.",
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
    id: "header-catalog-tech",
    label: "Техника",
    url: "/catalog/tech",
    location: "header",
    parent: "header-catalog",
    sort: 1,
    isActive: true,
  },
  {
    id: "header-catalog-accessories",
    label: "Аксессуары",
    url: "/catalog/accessories",
    location: "header",
    parent: "header-catalog",
    sort: 2,
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
  { id: "header-club", label: "Club", url: "/club", location: "header", sort: 5, isActive: false },
  {
    id: "footer-club",
    label: "Навигация",
    url: "#top",
    location: "footer",
    sort: 1,
    isActive: true,
  },
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
    label: "Магазин в Северодвинске",
    url: "/store",
    location: "footer",
    parent: "footer-club",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-club-passport",
    label: "Как мы проверяем",
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
    label: "Trade — продать или обменять",
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
    url: "/passport",
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
    label: "Магазин в Северодвинске",
    url: "/store",
    location: "footer",
    parent: "footer-contacts",
    sort: 1,
    isActive: true,
  },
  {
    id: "footer-contacts-check",
    label: "Как мы проверяем",
    url: "/passport",
    location: "footer",
    parent: "footer-contacts",
    sort: 2,
    isActive: true,
  },
  {
    id: "footer-contacts-sell",
    label: "Получить предварительную оценку",
    url: "/trade#final",
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
  eyebrow: "В наличии",
  headline: "Техника и аксессуары в наличии.",
  body: "Точная модель, память, цвет, состояние, батарея, ремонт, цена и наличие.",
  primaryCtaLabel: "Смотреть весь каталог",
  primaryCtaUrl: "/catalog",
  secondaryCtaLabel: "Получить варианты",
  secondaryCtaUrl: "#final",
  sortOrder: 3,
  isActive: true,
  content: {
    limit: 6,
    showFilters: false,
  },
};

const defaultHeroSection: PageSection = {
  id: "hero-fallback",
  sectionKey: "hero",
  variant: "hero.static",
  eyebrow: "I СВОИ · Северодвинск",
  headline: "Техника и аксессуары, о которых всё известно до покупки.",
  body: "Реальные фотографии, состояние батареи, история ремонта, отмеченные дефекты, открытая проверка и письменная гарантия 90 дней.",
  primaryCtaLabel: "Смотреть каталог",
  primaryCtaUrl: "/catalog",
  secondaryCtaLabel: "Оценить свою технику",
  secondaryCtaUrl: "/trade",
  sortOrder: 1,
  isActive: true,
  image: "/assets/hero-apple-like-single-phone-clean.webp",
  content: {
    assurance: ["Реальные фото", "Проверка при посетителе", "Гарантия 90 дней"],
    visual: {
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
      exit_label: "Предварительная стоимость при обновлении через 6 месяцев",
      exit_value: "после повторной диагностики",
      warranty: "Гарантия",
      warranty_strong: "90 дней",
    },
  },
};

const defaultTrustSection: PageSection = {
  id: "trust-fallback",
  sectionKey: "trust",
  variant: "trust.strip",
  eyebrow: "До оплаты",
  headline: "Что вы узнаете об устройстве заранее.",
  sortOrder: 2,
  isActive: true,
  content: {
    items: [
      { title: "Состояние", text: "Грейд и заметные дефекты." },
      { title: "Батарея и функции", text: "Результаты диагностики." },
      { title: "Ремонт", text: "Подтверждённая история вмешательств." },
      { title: "Гарантия", text: "Письменные условия на 90 дней." },
    ],
  },
};

const defaultPassportSection: PageSection = {
  id: "passport-preview-fallback",
  sectionKey: "passport_preview",
  variant: "passport.split",
  eyebrow: "Passport · документ о проверке",
  headline: "Состояние видно до решения о покупке.",
  body: "Дата диагностики, грейд, ремонт, функции и отмеченные дефекты — в одном документе.",
  primaryCtaLabel: "Как мы проверяем",
  primaryCtaUrl: "/passport",
  sortOrder: 4,
  isActive: true,
  content: {},
};

const defaultStoreSection: PageSection = {
  id: "store-preview-fallback",
  sectionKey: "store_preview",
  variant: "store.steps",
  eyebrow: "Магазин в Северодвинске",
  headline: "Как проходит покупка.",
  body: "Выберите устройство, проверьте его в магазине и получите документы с гарантией.",
  primaryCtaLabel: "Условия визита",
  primaryCtaUrl: "/store",
  sortOrder: 5,
  isActive: true,
  content: {},
};

const defaultTradeSection: PageSection = {
  id: "trade-preview-fallback",
  sectionKey: "trade_preview",
  variant: "trade.choices",
  eyebrow: "Trade · продажа или обмен",
  headline: "Оцените свою технику без объявлений.",
  body: "Предварительная оценка уточняется после диагностики.",
  primaryCtaLabel: "Получить предварительную оценку",
  primaryCtaUrl: "/trade",
  sortOrder: 6,
  isActive: true,
  content: {},
};

const defaultFaqSection: PageSection = {
  id: "home-faq-fallback",
  sectionKey: "faq",
  variant: "faq",
  eyebrow: "Коротко о главном",
  headline: "Частые вопросы.",
  sortOrder: 8,
  isActive: true,
  content: {
    items: [
      {
        title: "Можно проверить устройство перед покупкой?",
        text: "Да. Состояние и функции сверяются в магазине до решения о покупке.",
      },
      {
        title: "Предварительная оценка Trade окончательная?",
        text: "Нет. Итоговая сумма подтверждается после повторной диагностики.",
      },
    ],
  },
};

const defaultFinalSection: PageSection = {
  id: "final-cta-fallback",
  sectionKey: "final_cta",
  variant: "final.form",
  eyebrow: "Подбор",
  headline: "Не нашли подходящую модель?",
  body: "Оставьте модель, необязательный бюджет и удобный контакт — предложим доступные варианты.",
  secondaryCtaLabel: "Оценить свою технику",
  secondaryCtaUrl: "/trade",
  sortOrder: 9,
  isActive: true,
  content: {
    form: {
      scenario_options: ["Найти устройство", "Подобрать несколько вариантов"],
      submit_label: "Получить варианты",
      note: "Ответим по указанному контакту.",
    },
  },
};

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

const defaultCircleRulesSection: PageSection = {
  id: "circle-rules-fallback",
  sectionKey: "circle_rules",
  variant: "trust.strip",
  eyebrow: "Правила круга",
  headline: "Доверие держится на проверяемых вещах.",
  body: "Каждое правило должно быть видно в карточке, в Store и в разговоре перед сделкой.",
  sortOrder: 3,
  isActive: true,
  content: {
    items: [
      {
        title: "Открытая проверка",
        text: "Экран, корпус, аккумулятор, связь, камеры и следы влаги проверяются при вас.",
      },
      {
        title: "Фиксация нюансов",
        text: "Дефекты и следы использования не прячутся: они влияют на грейд и цену.",
      },
      {
        title: "Письменная гарантия",
        text: "Условия гарантии показываются до покупки и остаются частью сделки.",
      },
      {
        title: "Предварительная стоимость при обновлении",
        text: "Расчёт помогает планировать обновление и подтверждается повторной диагностикой.",
      },
    ],
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

function conversionNavigation(items: NavigationItem[]): NavigationItem[] {
  const headerLabels: Record<string, string> = {
    "/catalog": "Каталог",
    "/passport": "Как мы проверяем",
    "/trade": "Продать или обменять",
    "/store": "Магазин в Северодвинске",
    "/blog": "Блог",
  };

  return items
    .filter(
      (item) =>
        !(
          item.location === "header" &&
          (normalizeSiteUrl(item.url) === "/club" || item.label.trim().toLowerCase() === "club")
        ),
    )
    .map((item) => {
      const url = normalizeSiteUrl(item.url);
      if (item.location === "header" && headerLabels[url] && item.itemRole !== "cta") {
        return { ...item, label: headerLabels[url], labelShort: headerLabels[url] };
      }
      if (item.location === "footer" && url === "/club") {
        return { ...item, label: "Club — пилот" };
      }
      return item;
    });
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
    defaultCircleRulesSection.sectionKey,
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
    navigation: conversionNavigation(navigation.length > 0 ? navigation : defaultNavigationItems),
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
      logoHref: "/",
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
