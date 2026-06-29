import type { Device, NavigationItem, PageSection, SitePage, SiteSettings } from "@vtoroy/shared";
import marketingPagesData from "@/data/marketing-pages.json";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoSvg(): string {
  return `<svg class="logo" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1" y="1" width="32" height="32" rx="9" stroke="currentColor" stroke-width="1.6"/>
        <path d="M9.5 23V11.6c0-.4.46-.62.78-.37l7.2 5.6c.27.2.27.6 0 .8l-7.2 5.6c-.32.25-.78.03-.78-.37Z" fill="currentColor"/>
        <path d="M18 23V11.6c0-.4.46-.62.78-.37l7.2 5.6c.27.2.27.6 0 .8l-7.2 5.6c-.32.25-.78.03-.78-.37Z" fill="currentColor" opacity="0.45"/>
      </svg>`;
}

type SiteChrome = {
  settings: SiteSettings;
  navigation: NavigationItem[];
};

export type MarketingSlug = "store" | "trade" | "passport" | "club";

const marketingSlugs = new Set<MarketingSlug>(["store", "trade", "passport", "club"]);

const defaultSiteSettings: SiteSettings = {
  brandName: "ISVOI",
  tagline: "Хорошие вещи проходят через своих.",
  city: "Северодвинск",
  logoHref: "/",
  logoHeight: 22,
  showBrandName: true,
  headerCtaLabel: "Войти в круг",
  headerCtaUrl: "/#final",
  footerNote:
    "Прототип лендинга. ISVOI — концепт клуба разумного владения: проверенные вещи проходят дальше через своих. Указанные модели устройств, цены, грейды и сроки гарантии приведены как пример и не являются публичной офертой. Названия и товарные знаки принадлежат их правообладателям; устройства показаны схематично.",
  footerBrandText: "Клуб разумного владения. Хорошие вещи проходят через своих. Северодвинск.",
  footerLegal: "Хорошие вещи проходят через своих.",
  footerCopyright: "© 2026 ISVOI. Концепт-прототип.",
};

const defaultNavigationItems: NavigationItem[] = [
  { id: "header-catalog", label: "Каталог", url: "/catalog", location: "header", sort: 1, isActive: true },
  { id: "header-store", label: "Store", url: "/store", location: "header", sort: 2, isActive: true },
  { id: "header-passport", label: "Passport", url: "/passport", location: "header", sort: 3, isActive: true },
  { id: "header-trade", label: "Trade", url: "/trade", location: "header", sort: 4, isActive: true },
  { id: "header-club", label: "Club", url: "/club", location: "header", sort: 5, isActive: true },
  { id: "footer-club", label: "Клуб", url: "#top", location: "footer", sort: 1, isActive: true },
  { id: "footer-club-catalog", label: "Каталог", url: "/catalog", location: "footer", parent: "footer-club", sort: 1, isActive: true },
  { id: "footer-club-store", label: "Store", url: "/store", location: "footer", parent: "footer-club", sort: 2, isActive: true },
  { id: "footer-club-passport", label: "ISVOI Passport", url: "/passport", location: "footer", parent: "footer-club", sort: 3, isActive: true },
  { id: "footer-services", label: "Сервисы", url: "#top", location: "footer", sort: 2, isActive: true },
  { id: "footer-services-trade", label: "Trade", url: "/trade", location: "footer", parent: "footer-services", sort: 1, isActive: true },
  { id: "footer-services-club", label: "Club", url: "/club", location: "footer", parent: "footer-services", sort: 2, isActive: true },
  { id: "footer-services-check", label: "Открытая проверка", url: "/store#diagnostics", location: "footer", parent: "footer-services", sort: 3, isActive: true },
  { id: "footer-contacts", label: "Контакты", url: "#top", location: "footer", sort: 3, isActive: true },
  { id: "footer-contacts-city", label: "Северодвинск", url: "/#top", location: "footer", parent: "footer-contacts", sort: 1, isActive: true },
  { id: "footer-contacts-check", label: "Записаться на проверку", url: "/#final", location: "footer", parent: "footer-contacts", sort: 2, isActive: true },
  { id: "footer-contacts-sell", label: "Передать вещь дальше", url: "/#final", location: "footer", parent: "footer-contacts", sort: 3, isActive: true },
];

function siteChrome(settings: SiteSettings | null, navigation: NavigationItem[]): SiteChrome {
  const text = (value: string | undefined, fallback: string): string => (value && value.trim() ? value : fallback);
  return {
    settings: {
      ...defaultSiteSettings,
      ...settings,
      brandName: text(settings?.brandName, defaultSiteSettings.brandName),
      tagline: text(settings?.tagline, defaultSiteSettings.tagline),
      city: text(settings?.city, defaultSiteSettings.city),
      logoFile: settings?.logoFile,
      logoAlt: text(settings?.logoAlt, settings?.brandName ? `${settings.brandName} logo` : `${defaultSiteSettings.brandName} logo`),
      logoHref: text(settings?.logoHref, defaultSiteSettings.logoHref ?? "/"),
      logoWidth: settings?.logoWidth ?? defaultSiteSettings.logoWidth,
      logoHeight: settings?.logoHeight ?? defaultSiteSettings.logoHeight,
      logoCaption: settings?.logoCaption?.trim(),
      showBrandName: settings?.showBrandName ?? defaultSiteSettings.showBrandName,
      headerCtaLabel: text(settings?.headerCtaLabel, defaultSiteSettings.headerCtaLabel ?? "Войти в круг"),
      headerCtaUrl: text(settings?.headerCtaUrl, defaultSiteSettings.headerCtaUrl ?? "/#final"),
      footerNote: text(settings?.footerNote, defaultSiteSettings.footerNote ?? ""),
      footerBrandText: text(settings?.footerBrandText, defaultSiteSettings.footerBrandText ?? ""),
      footerLegal: text(settings?.footerLegal, defaultSiteSettings.footerLegal ?? ""),
      footerCopyright: text(settings?.footerCopyright, defaultSiteSettings.footerCopyright ?? ""),
    },
    navigation: navigation.length > 0 ? navigation : defaultNavigationItems,
  };
}

function sortNavigation(items: NavigationItem[]): NavigationItem[] {
  return [...items].filter((item) => item.isActive).sort((a, b) => a.sort - b.sort);
}

function linkTargetAttrs(item: NavigationItem): string {
  return item.openInNew ? ' target="_blank" rel="noopener noreferrer"' : "";
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

function pageSlugToPath(slug: string): string {
  const value = slug.trim();
  if (!value || value === "home") return "/";
  return `/${value.replace(/^\/+/, "")}`;
}

function normalizeAnchor(anchor: string): string {
  return anchor.trim().replace(/^#+/, "");
}

function navigationHref(item: NavigationItem, fallback = "#top"): string {
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

function boundedLogoSize(value: number | undefined, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function logoStyle(settings: SiteSettings): string {
  const width = boundedLogoSize(settings.logoWidth, 28, 360);
  const height = boundedLogoSize(settings.logoHeight, 16, 120);
  const rules = [
    width ? `--logo-width:${width}px` : "",
    height ? `--logo-height:${height}px` : "",
  ].filter(Boolean);
  return rules.length ? ` style="${rules.join(";")}"` : "";
}

function renderLogoGraphic(settings: SiteSettings): string {
  if (!settings.logoFile) return logoSvg();
  return `<img class="logo logo--image" src="${escapeHtml(settings.logoFile)}" alt="${escapeHtml(settings.logoAlt || settings.brandName)}" loading="eager" decoding="async">`;
}

function renderLogo(settings: SiteSettings): string {
  return `<span class="brand-logo"${logoStyle(settings)}>
        ${renderLogoGraphic(settings)}
        ${settings.logoCaption ? `<span class="brand-logo__caption">${escapeHtml(settings.logoCaption)}</span>` : ""}
      </span>`;
}

function renderBrandName(settings: SiteSettings): string {
  return settings.showBrandName === false ? "" : `<span class="brandname">${escapeHtml(settings.brandName)}</span>`;
}

function normalizeAssetUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url) || url.startsWith("/")) return url;
  return `/${url}`;
}

function deviceHref(device: Device): string {
  if (device.detailHref) return normalizeSiteUrl(device.detailHref);
  return `/device/${encodeURIComponent(device.id)}`;
}

function normalizeDeviceStockStatus(device: Device): string {
  const raw = (device.stockStatus || "available").trim().toLowerCase();
  if (!raw || raw === "in_stock") return "available";
  if (raw === "service") return "hidden";
  return raw;
}

function deviceStockLabel(status: string): string {
  switch (status) {
    case "available":
      return "В наличии";
    case "reserved":
      return "Бронь";
    case "sold":
      return "Продано";
    default:
      return status;
  }
}

function deviceStatusOrder(status: string): number {
  switch (status) {
    case "available":
      return 1;
    case "reserved":
      return 2;
    case "sold":
      return 3;
    default:
      return 9;
  }
}

function deviceUpdatedText(device: Device): string {
  if (device.updatedText) return device.updatedText;
  if (!device.updatedAt) return "";
  const date = new Date(device.updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `Обновлено ${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)}`;
}

function renderDevicePreviewCard(device: Device): string {
  const stockStatus = normalizeDeviceStockStatus(device);
  const tags = [device.category, ...device.tags].filter(Boolean).join(" ");
  const image = normalizeAssetUrl(device.listingImage);
  const subtitle = [device.specs, device.color].filter(Boolean).join(" · ");
  const updatedText = deviceUpdatedText(device);
  const meta = [
    device.metaBattery || device.batteryText,
    device.warrantyText || (device.warranty ? `Гарантия ${device.warranty}` : ""),
    device.exitText || (device.exit ? `Выход ${device.exit}` : ""),
  ].filter(Boolean);

  return `<article class="device-card" data-device="${escapeHtml(device.id)}" data-type="${escapeHtml(tags)}" data-category="${escapeHtml(device.category)}" data-status="${escapeHtml(stockStatus)}" data-status-order="${deviceStatusOrder(stockStatus)}" data-price="${Number(device.price || 0)}" data-sort="${Number(device.sort ?? 0)}" data-updated="${escapeHtml(device.updatedAt || "")}">
      <div class="device-card__media device-card__media--photo">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(device.listingAlt || device.title)}" loading="lazy" />`
            : `<span>${escapeHtml(device.title)}</span>`
        }
      </div>
      <div class="device-card__body">
        <div class="device-card__badges">
          <span class="stock-badge stock-badge--${escapeHtml(stockStatus)}">${escapeHtml(device.stockStatusLabel || deviceStockLabel(stockStatus))}</span>
          ${updatedText ? `<span class="device-card__updated">${escapeHtml(updatedText)}</span>` : ""}
        </div>
        <div class="device-card__top">
          <div>
            <h3>${escapeHtml(device.title)}</h3>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          ${device.grade ? `<span class="grade-mini">${escapeHtml(device.grade)}</span>` : ""}
        </div>
        ${
          meta.length
            ? `<div class="device-card__meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
            : ""
        }
        ${device.priceText ? `<div class="device-card__price">${escapeHtml(device.priceText)}</div>` : ""}
        <a class="btn btn--outlined device-card__cta" href="${escapeHtml(deviceHref(device))}">${escapeHtml(
          device.ctaLabel || "Смотреть паспорт",
        )}</a>
      </div>
    </article>`;
}

function renderHeaderChrome(chrome: SiteChrome): string {
  const headerItems = sortNavigation(
    chrome.navigation.filter((item) => item.location === "header" && !item.parent && item.itemRole !== "cta"),
  );
  const headerCta =
    sortNavigation(chrome.navigation.filter((item) => item.location === "header" && !item.parent && item.itemRole === "cta"))[0] ??
    (chrome.settings.headerCtaLabel
      ? {
          id: "header-cta",
          label: chrome.settings.headerCtaLabel,
          url: chrome.settings.headerCtaUrl || "/#final",
          location: "header" as const,
          sort: 999,
          isActive: true,
          itemRole: "cta" as const,
        }
      : null);

  return `<!-- ============== NAV ============== -->
<header class="nav">
  <div class="wrap nav__inner">
    <a class="nav__brand" href="${escapeHtml(normalizeSiteUrl(chrome.settings.logoHref || "/"))}" aria-label="${escapeHtml(chrome.settings.brandName)} на главную">
      ${renderLogo(chrome.settings)}
      ${renderBrandName(chrome.settings)}
    </a>
    <nav class="nav__links" id="navLinks" aria-label="Основная навигация">
      ${headerItems
        .map((item) => `<a href="${escapeHtml(navigationHref(item))}"${linkTargetAttrs(item)}${item.ariaLabel ? ` aria-label="${escapeHtml(item.ariaLabel)}"` : ""}>${escapeHtml(item.labelShort || item.label)}</a>`)
        .join("\n      ")}
    </nav>
    <div class="nav__cta">
      ${headerCta ? `<a href="${escapeHtml(navigationHref(headerCta, "/#final"))}" class="btn btn--filled btn--sm"${linkTargetAttrs(headerCta)}>${escapeHtml(headerCta.label)}</a>` : ""}
      <button class="nav__toggle" id="navToggle" aria-label="Открыть меню" aria-expanded="false">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
  </div>
</header>

`;
}

function renderFooterChrome(chrome: SiteChrome): string {
  const footerItems = sortNavigation(chrome.navigation.filter((item) => item.location === "footer"));
  const parentItems = footerItems.filter((item) => !item.parent);
  const columns = parentItems.length
    ? parentItems
    : [{ id: "footer-links", label: "Навигация", url: "#top", location: "footer" as const, sort: 1, isActive: true }];

  return `<!-- ============== FOOTER ============== -->
<footer class="footer">
  <div class="wrap">
    <p class="footer__note">${escapeHtml(chrome.settings.footerNote ?? "")}</p>
    <div class="footer__cols">
      <div class="footer__brand">
        ${renderLogo(chrome.settings)}
        <p>${escapeHtml(chrome.settings.footerBrandText ?? chrome.settings.tagline)}</p>
      </div>
      ${columns
        .map((column) => {
          const links = parentItems.length ? footerItems.filter((item) => item.parent === column.id) : footerItems;
          return `<div>
        <h4>${escapeHtml(column.label)}</h4>
        ${links
          .map((item) => `<a href="${escapeHtml(navigationHref(item))}"${linkTargetAttrs(item)}${item.ariaLabel ? ` aria-label="${escapeHtml(item.ariaLabel)}"` : ""}>${escapeHtml(item.label)}</a>`)
          .join("\n        ")}
      </div>`;
        })
        .join("\n      ")}
    </div>
    <div class="footer__legal">
      <span>${escapeHtml(chrome.settings.footerCopyright ?? "")}</span>
      <span>${escapeHtml(chrome.settings.footerLegal ?? "")}</span>
    </div>
  </div>
</footer>`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function sectionItemList(value: unknown): { title: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    return title || text ? [{ title, text }] : [];
  });
}

function pathCardList(value: unknown): { title: string; text: string; url: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    const url = typeof record.url === "string" ? record.url : "#final";
    const label = typeof record.label === "string" ? record.label : "Подробнее ›";
    return title || text ? [{ title, text, url, label }] : [];
  });
}

function filterList(value: unknown): { label: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const filterValue = typeof record.value === "string" ? record.value : "";
    return label && filterValue ? [{ label, value: filterValue }] : [];
  });
}

function visualContent(
  value: unknown,
): { imageSrc: string; imageAlt: string; captionTitle: string; captionText: string } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };

  return {
    imageSrc: text("imageSrc", "image_src", "/assets/store-real-premium-hero.webp"),
    imageAlt: text(
      "imageAlt",
      "image_alt",
      "Интерьер премиального бутика: дерево, каменная стойка и графитовые полки с устройствами",
    ),
    captionTitle: text("captionTitle", "caption_title", "Store как точка доверия."),
    captionText: text(
      "captionText",
      "caption_text",
      "Чистая витрина, видимая ответственность и спокойная консультация без давления.",
    ),
  };
}

function heroVisualContent(value: unknown): { imageSrc: string; imageAlt: string } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };

  return {
    imageSrc: text("imageSrc", "image_src", "/assets/hero-apple-like-single-phone-clean.webp"),
    imageAlt: text(
      "imageAlt",
      "image_alt",
      "Премиальный графитовый смартфон на светло-серой студийной поверхности",
    ),
  };
}

function featureList(value: unknown): { title: string; text: string; icon: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    const icon = typeof record.icon === "string" ? record.icon : ["device", "shield", "clock", "chart"][index] ?? "device";
    return title || text ? [{ title, text, icon }] : [];
  });
}

function choiceList(value: unknown): { title: string; text: string; icon: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    const icon = typeof record.icon === "string" ? record.icon : ["money", "chart", "swap"][index] ?? "money";
    return title || text ? [{ title, text, icon }] : [];
  });
}

function clubLevelList(value: unknown): { badge: string; name: string; tag: string; features: string[]; featured: boolean }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const badge = typeof record.badge === "string" ? record.badge : "";
    const name = typeof record.name === "string" ? record.name : "";
    const tag = typeof record.tag === "string" ? record.tag : "";
    const features = stringList(record.features);
    const featured = typeof record.featured === "boolean" ? record.featured : false;
    return name || tag || features.length > 0 ? [{ badge, name, tag, features, featured }] : [];
  });
}

function valuationContent(value: unknown): {
  heading: string;
  fromDevice: string;
  fromNote: string;
  toDevice: string;
  toNote: string;
  label: string;
  amount: string;
} {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };

  return {
    heading: text("heading", "heading", "Пример оценки и перехода"),
    fromDevice: text("fromDevice", "from_device", "iPhone 12"),
    fromNote: text("fromNote", "from_note", "ваш, грейд B · 128 GB"),
    toDevice: text("toDevice", "to_device", "iPhone 13 Pro / 14 Pro"),
    toNote: text("toNote", "to_note", "проверенный, с Passport"),
    label: text("label", "label", "Доплата при переходе — от"),
    amount: text("amount", "amount", "19 900 ₽"),
  };
}

function diagnosticsContent(value: unknown): { imageSrc: string; imageAlt: string; noteLabel: string; noteText: string } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };

  return {
    imageSrc: text("imageSrc", "image_src", "/assets/generated-diagnostics.webp"),
    imageAlt: text(
      "imageAlt",
      "image_alt",
      "Открытая диагностика смартфона на чистом белом столе в премиальной сервисной зоне",
    ),
    noteLabel: text("noteLabel", "note_label", "Открытая проверка"),
    noteText: text("noteText", "note_text", "Состояние видно до решения о покупке."),
  };
}

function comparisonContent(value: unknown): {
  ariaLabel: string;
  labelHeader: string;
  badHeader: string;
  goodHeader: string;
  rows: { label: string; bad: string; good: string }[];
} {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };
  const rows = Array.isArray(record.rows)
    ? record.rows.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const label = typeof row.label === "string" ? row.label : "";
        const bad = typeof row.bad === "string" ? row.bad : "";
        const good = typeof row.good === "string" ? row.good : "";
        return label || bad || good ? [{ label, bad, good }] : [];
      })
    : [];

  return {
    ariaLabel: text("ariaLabel", "aria_label", "Сравнение случайного рынка и круга ISVOI"),
    labelHeader: text("labelHeader", "label_header", "Что вы получаете"),
    badHeader: text("badHeader", "bad_header", "Случайный рынок"),
    goodHeader: text("goodHeader", "good_header", "Круг ISVOI"),
    rows:
      rows.length > 0
        ? rows
        : [
            { label: "История вещи", bad: "неизвестна", good: "ISVOI Passport" },
            { label: "Через кого вещь", bad: "через незнакомца", good: "через своих" },
            { label: "Цена", bad: "только сегодня", good: "цена выхода известна" },
            { label: "Состояние", bad: "вера на слово", good: "проверка при вас" },
          ],
  };
}

function finalCtaFormContent(value: unknown): {
  scenarioLabel: string;
  scenarioAriaLabel: string;
  scenarioOptions: string[];
  deviceLabel: string;
  devicePlaceholder: string;
  contactLabel: string;
  contactPlaceholder: string;
  submitLabel: string;
  note: string;
} {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };
  const scenarioOptions = stringList(record.scenarioOptions).length
    ? stringList(record.scenarioOptions)
    : stringList(record.scenario_options);

  return {
    scenarioLabel: text("scenarioLabel", "scenario_label", "Что хотите сделать?"),
    scenarioAriaLabel: text("scenarioAriaLabel", "scenario_aria_label", "Сценарий обращения"),
    scenarioOptions:
      scenarioOptions.length > 0
        ? scenarioOptions
        : ["Найти вещь в кругу", "Передать свою вещь дальше", "Обновиться на следующую", "Узнать про Club"],
    deviceLabel: text("deviceLabel", "device_label", "Какая вещь интересна?"),
    devicePlaceholder: text("devicePlaceholder", "device_placeholder", "Например, iPhone 13 Pro или MacBook Air"),
    contactLabel: text("contactLabel", "contact_label", "Контакт для ответа"),
    contactPlaceholder: text("contactPlaceholder", "contact_placeholder", "Телефон или Telegram"),
    submitLabel: text("submitLabel", "submit_label", "Войти в круг"),
    note: text("note", "note", "Прототип формы: в реальном запуске здесь будет отправка заявки в CRM или мессенджер."),
  };
}

function passportRows(value: unknown): { label: string; value: string; state: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const rowValue = typeof record.value === "string" ? record.value : "";
    const state = typeof record.state === "string" ? record.state : "ok";
    return label && rowValue ? [{ label, value: rowValue, state }] : [];
  });
}

function passportIconSvg(icon: string): string {
  if (icon === "shield") {
    return `<svg class="fi-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>`;
  }
  if (icon === "clock") {
    return `<svg class="fi-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  }
  if (icon === "chart") {
    return `<svg class="fi-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 17l6-6 4 4 6-7"/><path d="M20 8v4h-4"/></svg>`;
  }
  return `<svg class="fi-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h6"/></svg>`;
}

function tradeIconSvg(icon: string): string {
  if (icon === "chart") {
    return `<svg class="choice__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 17l6-6 4 4 6-7"/><path d="M20 8v4h-4"/></svg>`;
  }
  if (icon === "swap") {
    return `<svg class="choice__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5"/></svg>`;
  }
  return `<svg class="choice__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`;
}

function passportQrSvg(): string {
  return `<svg class="qr" viewBox="0 0 44 44" aria-hidden="true" role="img">
              <rect width="44" height="44" rx="6" fill="#f5f5f7"/>
              <g fill="#1d1d1f">
                <rect x="6" y="6" width="11" height="11"/><rect x="9" y="9" width="5" height="5" fill="#f5f5f7"/>
                <rect x="27" y="6" width="11" height="11"/><rect x="30" y="9" width="5" height="5" fill="#f5f5f7"/>
                <rect x="6" y="27" width="11" height="11"/><rect x="9" y="30" width="5" height="5" fill="#f5f5f7"/>
                <rect x="21" y="6" width="3" height="3"/><rect x="21" y="14" width="3" height="3"/>
                <rect x="21" y="21" width="3" height="3"/><rect x="27" y="21" width="3" height="3"/>
                <rect x="33" y="21" width="3" height="3"/><rect x="21" y="27" width="3" height="3"/>
                <rect x="27" y="27" width="3" height="3"/><rect x="33" y="33" width="3" height="3"/>
                <rect x="27" y="33" width="3" height="3"/><rect x="33" y="27" width="3" height="3"/>
              </g>
            </svg>`;
}

function heroPassportContent(value: unknown): {
  ariaLabel: string;
  device: string;
  sub: string;
  grade: string;
  gradeLabel: string;
  rows: { label: string; value: string; state: string }[];
  exitLabel: string;
  exitValue: string;
  warranty: string;
  warrantyStrong: string;
} {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelField = record[camelKey];
    const snakeField = record[snakeKey];
    if (typeof camelField === "string") return camelField;
    if (typeof snakeField === "string") return snakeField;
    return fallback;
  };
  const rows = passportRows(record.rows);

  return {
    ariaLabel: text("ariaLabel", "aria_label", "ISVOI Passport вещи"),
    device: text("device", "device", "iPhone 13 Pro"),
    sub: text("sub", "sub", "256 GB · Графитовый"),
    grade: text("grade", "grade", "A−"),
    gradeLabel: text("gradeLabel", "grade_label", "Грейд"),
    rows:
      rows.length > 0
        ? rows
        : [
            { label: "Батарея", value: "89%", state: "ok" },
            { label: "Ремонт", value: "не вскрывался", state: "ok" },
            { label: "Face ID", value: "работает", state: "ok" },
            { label: "Влага", value: "следов нет", state: "ok" },
          ],
    exitLabel: text("exitLabel", "exit_label", "Цена выхода через 6 мес"),
    exitValue: text("exitValue", "exit_value", "до 42 000 ₽"),
    warranty: text("warranty", "warranty", "Гарантия"),
    warrantyStrong: text("warrantyStrong", "warranty_strong", "90 дней"),
  };
}

const defaultCatalogPreviewSection: PageSection = {
  id: "catalog-preview-fallback",
  sectionKey: "catalog_preview",
  variant: "catalog.grid",
  eyebrow: "Store · сейчас в ISVOI",
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
  eyebrow: "ISVOI · клуб разумного владения · Северодвинск",
  headline: "Хорошие вещи проходят через своих.",
  body:
    "ISVOI — клуб разумного владения. Здесь ценная вещь не теряется после первого владельца, а переходит дальше — с понятной историей, проверенным состоянием и честной ценой выхода. Не рынок, а круг, где вещам доверяют.",
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
      aria_label: "ISVOI Passport вещи",
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

function renderHeroSection(section: PageSection): string {
  const assurance = stringList(section.content.assurance);
  const visual = heroVisualContent(section.content.visual);
  const passport = heroPassportContent(section.content.passport);
  const imageSrc = section.image || visual.imageSrc;
  const primaryLabel = section.primaryCtaLabel || "Войти в круг";
  const primaryUrl = normalizeSiteUrl(section.primaryCtaUrl || "#final");
  const secondaryLabel = section.secondaryCtaLabel || "Смотреть Store";
  const secondaryUrl = normalizeSiteUrl(section.secondaryCtaUrl || "/catalog");
  const assuranceItems =
    assurance.length > 0 ? assurance : ["В кругу своих", "С историей и проверкой", "Store в Северодвинске"];

  return `<!-- ============== HERO ============== -->
<section class="hero wrap">
  ${section.eyebrow ? `<div class="hero__kicker reveal">${escapeHtml(section.eyebrow)}</div>` : ""}
  ${section.headline ? `<h1 class="display reveal">${escapeHtml(section.headline)}</h1>` : ""}
  ${section.body ? `<p class="lead reveal">${escapeHtml(section.body)}</p>` : ""}
  <div class="btn-row center reveal">
    <a href="${escapeHtml(primaryUrl)}" class="btn btn--filled">${escapeHtml(primaryLabel)}</a>
    <a href="${escapeHtml(secondaryUrl)}" class="btn btn--outlined">${escapeHtml(secondaryLabel)}</a>
  </div>
  <div class="hero__assurance reveal" aria-label="Принципы клуба">
    ${assuranceItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("\n    ")}
  </div>

  <div class="hero-stage reveal">
    <img class="hero-photo" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(visual.imageAlt)}" />

    <div class="passport passport-float" aria-label="${escapeHtml(passport.ariaLabel)}">
      <div class="passport__head">
        <div>
          <div class="passport__device">${escapeHtml(passport.device)}</div>
          <div class="passport__sub">${escapeHtml(passport.sub)}</div>
        </div>
        <div class="grade"><b>${escapeHtml(passport.grade)}</b><span>${escapeHtml(passport.gradeLabel)}</span></div>
      </div>
      <div class="passport__rows">
        ${passport.rows
          .map(
            (row) =>
              `<div class="prow"><span class="lbl"><span class="dot dot--${escapeHtml(row.state)}"></span>${escapeHtml(
                row.label,
              )}</span><span class="val val--${escapeHtml(row.state)}">${escapeHtml(row.value)}</span></div>`,
          )
          .join("\n        ")}
      </div>
      <div class="passport__exit">
        <span class="x-lbl">${escapeHtml(passport.exitLabel)}</span>
        <span class="x-val">${escapeHtml(passport.exitValue)}</span>
      </div>
      <div class="passport__foot">
        <span class="passport__warranty">${escapeHtml(passport.warranty)} <b>${escapeHtml(passport.warrantyStrong)}</b></span>
        ${passportQrSvg()}
      </div>
    </div>
  </div>
</section>

`;
}

function renderTrustSection(section: PageSection): string {
  const items = sectionItemList(section.content.items);
  if (items.length === 0) return "";

  return `<!-- ============== TRUST STRIP ============== -->
<section class="trust" aria-label="${escapeHtml(section.eyebrow || "Принципы клуба")}">
  <div class="wrap">
    <div class="trust__grid">
      ${items
        .map(
          (item) =>
            `<div class="trust__item"><div class="big">${escapeHtml(item.title)}</div><div class="cap">${escapeHtml(item.text)}</div></div>`,
        )
        .join("\n      ")}
    </div>
  </div>
</section>

`;
}

function renderPathRouterSection(section: PageSection): string {
  const cards = pathCardList(section.content.cards);
  if (cards.length === 0) return "";

  return `<!-- ============== CONVERSION PATHS ============== -->
<section class="section conversion-paths" aria-label="${escapeHtml(section.eyebrow || "Выберите свой сценарий")}">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>
    <div class="path-grid">
      ${cards
        .map((card, index) => {
          const number = String(index + 1).padStart(2, "0");
          return `<a class="path-card reveal" href="${escapeHtml(normalizeSiteUrl(card.url))}">
        <span class="path-card__num">${number}</span>
        <strong>${escapeHtml(card.title)}</strong>
        <p>${escapeHtml(card.text)}</p>
        <span class="path-card__link">${escapeHtml(card.label)}</span>
      </a>`;
        })
        .join("\n      ")}
    </div>
  </div>
</section>

`;
}

function renderCatalogPreviewSection(section: PageSection, devices: Device[] = []): string {
  const filters = filterList(section.content.filters);
  const statusFilters = filterList(section.content.statusFilters);
  const headlineTag = section.content.headingTag === "h1" ? "h1" : "h2";
  const chips =
    filters.length > 0
      ? filters
      : [
          { label: "Все", value: "all" },
          { label: "iPhone", value: "iphone" },
          { label: "MacBook", value: "macbook" },
          { label: "iPad", value: "ipad" },
          { label: "Для Club", value: "club" },
        ];
  const statusChips =
    statusFilters.length > 0
      ? statusFilters
      : [
          { label: "Все статусы", value: "all" },
          { label: "В наличии", value: "available" },
          { label: "Бронь", value: "reserved" },
          { label: "Продано", value: "sold" },
        ];
  const actions =
    section.primaryCtaLabel || section.secondaryCtaLabel
      ? `<div class="btn-row reveal" style="margin-top:32px;">
      ${
        section.primaryCtaLabel
          ? `<a class="btn btn--filled" href="${escapeHtml(normalizeSiteUrl(section.primaryCtaUrl || "/catalog"))}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(normalizeSiteUrl(section.secondaryCtaUrl || "#final"))}">${escapeHtml(
              section.secondaryCtaLabel,
            )}</a>`
          : ""
      }
    </div>`
      : "";
  const visibleDevices = devices.filter((device) => normalizeDeviceStockStatus(device) !== "hidden");
  const cards = visibleDevices.map(renderDevicePreviewCard).join("\n      ");
  const emptyState = `<p class="lead text-wrap">Каталог пока пуст. Добавьте опубликованные устройства в Directus.</p>`;

  return `<!-- ============== CATALOG ============== -->
<section class="section catalog-section" id="catalog">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<${headlineTag} class="h2">${escapeHtml(section.headline)}</${headlineTag}>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>

    <div class="catalog-toolbar reveal">
      <div class="catalog-controls" data-filter-group="category" aria-label="${escapeHtml(section.subheadline || "Фильтры каталога")}">
        ${chips
          .map(
            (filter, index) =>
              `<button class="filter-chip${index === 0 ? " is-active" : ""}" type="button" data-filter-field="category" data-filter="${escapeHtml(
                filter.value,
              )}">${escapeHtml(filter.label)}</button>`,
          )
          .join("\n        ")}
      </div>
      <div class="catalog-controls catalog-controls--status" data-filter-group="status" aria-label="Статус устройства">
        ${statusChips
          .map(
            (filter, index) =>
              `<button class="filter-chip${index === 0 ? " is-active" : ""}" type="button" data-filter-field="status" data-filter="${escapeHtml(
                filter.value,
              )}">${escapeHtml(filter.label)}</button>`,
          )
          .join("\n        ")}
      </div>
      <label class="catalog-sort">
        <span>Сортировка</span>
        <select data-catalog-sort aria-label="Сортировка каталога">
          <option value="default">По умолчанию</option>
          <option value="price-asc">Цена: ниже</option>
          <option value="price-desc">Цена: выше</option>
          <option value="updated-desc">Сначала обновленные</option>
          <option value="status">По статусу</option>
        </select>
      </label>
    </div>

    <div class="catalog-grid reveal" id="catalogGrid">${cards || emptyState}</div>
    ${actions}
  </div>
</section>

`;
}

function renderPassportSection(section: PageSection): string {
  const features = featureList(section.content.features);
  const card = section.content.passport && typeof section.content.passport === "object" ? section.content.passport : {};
  const cardRecord = card as Record<string, unknown>;
  const cardText = (camelKey: string, snakeKey: string, fallback: string): string => {
    const camelValue = cardRecord[camelKey];
    const snakeValue = cardRecord[snakeKey];
    if (typeof camelValue === "string") return camelValue;
    if (typeof snakeValue === "string") return snakeValue;
    return fallback;
  };
  const rows = passportRows(cardRecord.rows);
  const device = cardText("device", "device", "iPhone 13 Pro");
  const sub = cardText("sub", "sub", "256 GB · Графитовый · IMEI ···4821");
  const grade = cardText("grade", "grade", "A−");
  const gradeLabel = cardText("gradeLabel", "grade_label", "Грейд");
  const exitLabel = cardText("exitLabel", "exit_label", "Цена выхода через 6 мес");
  const exitValue = cardText("exitValue", "exit_value", "до 42 000 ₽");
  const warranty = cardText("warranty", "warranty", "Гарантия");
  const warrantyStrong = cardText("warrantyStrong", "warranty_strong", "90 дней");
  const defaultRows =
    rows.length > 0
      ? rows
      : [
          { label: "Батарея", value: "89%", state: "ok" },
          { label: "Ремонт", value: "не вскрывался", state: "ok" },
          { label: "Face ID", value: "работает", state: "ok" },
          { label: "Влага", value: "следов нет", state: "ok" },
          { label: "Экран / корпус", value: "микроцарапины", state: "ok" },
        ];
  const renderedFeatures =
    features.length > 0
      ? features
      : [
          {
            title: "Состояние и грейд",
            text: "Батарея, корпус, экран — оценка по прозрачной шкале A / B / C.",
            icon: "device",
          },
          {
            title: "История и проверка",
            text: "Ремонт, вскрытие, влага, Face ID — зафиксировано по результатам диагностики.",
            icon: "shield",
          },
          {
            title: "Гарантия 90 дней",
            text: "Письменная гарантия, а не «верьте на слово».",
            icon: "clock",
          },
          {
            title: "Цена выхода",
            text: "Сколько вещь будет стоить, когда пойдёт дальше через своих — известно заранее.",
            icon: "chart",
          },
        ];

  return `<!-- ============== PASSPORT ============== -->
<section class="section passport-section" id="passport">
  <div class="wrap">
    <div class="layout">
      <div class="reveal">
        ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
        ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
        ${section.body ? `<p class="lead" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
        <ul class="feature-list">
          ${renderedFeatures
            .map(
              (feature) => `<li>
            ${passportIconSvg(feature.icon)}
            <div><div class="fi-title">${escapeHtml(feature.title)}</div><div class="fi-desc">${escapeHtml(feature.text)}</div></div>
          </li>`,
            )
            .join("\n          ")}
        </ul>
        <div class="btn-row" style="margin-top:32px;">
          ${
            section.primaryCtaLabel
              ? `<a class="btn btn--filled" href="${escapeHtml(normalizeSiteUrl(section.primaryCtaUrl || "/passport"))}">${escapeHtml(
                  section.primaryCtaLabel,
                )}</a>`
              : ""
          }
          ${
            section.secondaryCtaLabel
              ? `<a class="btn btn--outlined" href="${escapeHtml(normalizeSiteUrl(section.secondaryCtaUrl || "/catalog"))}">${escapeHtml(
                  section.secondaryCtaLabel,
                )}</a>`
              : ""
          }
        </div>
      </div>

      <div class="reveal">
        <div class="passport">
          <div class="passport__head">
            <div>
              <div class="passport__device">${escapeHtml(device)}</div>
              <div class="passport__sub">${escapeHtml(sub)}</div>
            </div>
            <div class="grade"><b>${escapeHtml(grade)}</b><span>${escapeHtml(gradeLabel)}</span></div>
          </div>
          <div class="passport__rows">
            ${defaultRows
              .map((row) => {
                const isOk = row.state === "ok";
                return `<div class="prow"><span class="lbl"><span class="dot${isOk ? " dot--ok" : ""}"></span>${escapeHtml(
                  row.label,
                )}</span><span class="val${isOk ? " val--ok" : ""}">${escapeHtml(row.value)}</span></div>`;
              })
              .join("\n            ")}
          </div>
          <div class="passport__exit">
            <span class="x-lbl">${escapeHtml(exitLabel)}</span>
            <span class="x-val">${escapeHtml(exitValue)}</span>
          </div>
          <div class="passport__foot">
            <span class="passport__warranty">${escapeHtml(warranty)} <b>${escapeHtml(warrantyStrong)}</b> · проверка пройдена</span>
            ${passportQrSvg()}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

`;
}

function renderStorePreviewSection(section: PageSection): string {
  const visual = visualContent(section.content.visual);
  const steps = sectionItemList(section.content.steps);
  const renderedSteps =
    steps.length > 0
      ? steps
      : [
          {
            title: "Выбираете",
            text: "Подбираем вещь под задачу и бюджет. Каждая — с Passport и грейдом.",
          },
          {
            title: "Проверяете",
            text: "Открытая проверка при вас. Сначала история и состояние — потом решение.",
          },
          {
            title: "Забираете",
            text: "Получаете Passport, чек и письменную гарантию на 90 дней.",
          },
          {
            title: "Передаёте дальше",
            text: "Захотели обновиться — знаете цену выхода заранее. Вещь идёт дальше через своих.",
          },
        ];

  return `<!-- ============== STORE ============== -->
<section class="section section--wash" id="store">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>
    <div class="store-visual reveal">
      <img src="${escapeHtml(section.image || visual.imageSrc)}" alt="${escapeHtml(visual.imageAlt)}" />
      <div class="store-visual__caption">
        <strong>${escapeHtml(visual.captionTitle)}</strong>
        <span>${escapeHtml(visual.captionText)}</span>
      </div>
    </div>
    <div class="steps">
      ${renderedSteps
        .map((step, index) => {
          const number = String(index + 1).padStart(2, "0");
          return `<div class="step reveal"><div class="step__num">${number}</div><div class="step__title">${escapeHtml(
            step.title,
          )}</div><div class="step__desc">${escapeHtml(step.text)}</div></div>`;
        })
        .join("\n      ")}
    </div>
    <div class="btn-row center reveal" style="margin-top:40px;">
      ${
        section.primaryCtaLabel
          ? `<a class="btn btn--filled" href="${escapeHtml(normalizeSiteUrl(section.primaryCtaUrl || "/store"))}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(normalizeSiteUrl(section.secondaryCtaUrl || "/catalog"))}">${escapeHtml(
              section.secondaryCtaLabel,
            )}</a>`
          : ""
      }
    </div>
  </div>
</section>

`;
}

function renderTradePreviewSection(section: PageSection): string {
  const choices = choiceList(section.content.choices);
  const valuation = valuationContent(section.content.valuation);
  const renderedChoices =
    choices.length > 0
      ? choices
      : [
          {
            title: "Получить деньги сейчас",
            text: "Спокойный выкуп по честной оценке. Деньги в день обращения, без ожидания случайного покупателя.",
            icon: "money",
          },
          {
            title: "Передать дальше через комиссию",
            text: "Мы проводим вещь дальше за вас — с Passport и проверкой. Вы получаете больше, круг получает проверенную вещь.",
            icon: "chart",
          },
          {
            title: "Обновиться на следующую",
            text: "Передаёте текущую вещь в зачёт и доплачиваете разницу. Обновление без продажи и хлопот.",
            icon: "swap",
          },
        ];

  return `<!-- ============== TRADE ============== -->
<section class="section" id="trade">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>
    <div class="trade-choices">
      ${renderedChoices
        .map(
          (choice) => `<div class="choice reveal">
        ${tradeIconSvg(choice.icon)}
        <div class="choice__title">${escapeHtml(choice.title)}</div>
        <div class="choice__desc">${escapeHtml(choice.text)}</div>
      </div>`,
        )
        .join("\n      ")}
    </div>

    <div class="valuation reveal">
      <div class="valuation__head">${escapeHtml(valuation.heading)}</div>
      <div class="valuation__flow">
        <div class="val-box">
          <div class="device-name">${escapeHtml(valuation.fromDevice)}</div>
          <div class="device-note">${escapeHtml(valuation.fromNote)}</div>
        </div>
        <svg class="val-arrow" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <div class="val-box">
          <div class="device-name">${escapeHtml(valuation.toDevice)}</div>
          <div class="device-note">${escapeHtml(valuation.toNote)}</div>
        </div>
      </div>
      <div class="valuation__topup">
        <div class="lbl">${escapeHtml(valuation.label)}</div>
        <div class="amount">${escapeHtml(valuation.amount)}</div>
      </div>
    </div>
    <div class="btn-row center reveal" style="margin-top:40px;">
      ${
        section.primaryCtaLabel
          ? `<a class="btn btn--filled" href="${escapeHtml(normalizeSiteUrl(section.primaryCtaUrl || "/trade"))}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(normalizeSiteUrl(section.secondaryCtaUrl || "/#final"))}">${escapeHtml(
              section.secondaryCtaLabel,
            )}</a>`
          : ""
      }
    </div>
  </div>
</section>

`;
}

function renderCheckIcon(): string {
  return `<svg class="ck" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4 10-10"/></svg>`;
}

function renderCompareXIcon(): string {
  return `<svg class="x-mark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
}

function renderCompareCheckIcon(): string {
  return `<svg class="v-mark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4 10-10"/></svg>`;
}

function renderClubPreviewSection(section: PageSection): string {
  const levels = clubLevelList(section.content.levels);
  const renderedLevels =
    levels.length > 0
      ? levels
      : [
          {
            badge: "Care",
            name: "Care",
            tag: "Спокойное владение с защитой и приоритетным сервисом.",
            features: ["Продлённая гарантия", "Приоритетная диагностика", "Зафиксированная цена выкупа"],
            featured: false,
          },
          {
            badge: "Популярный",
            name: "Upgrade",
            tag: "Плановое обновление на следующую вещь без потери в цене.",
            features: ["Всё из уровня Care", "Обновление по известной цене выхода", "Ранний доступ к новым лотам в кругу"],
            featured: true,
          },
          {
            badge: "Flex",
            name: "Flex",
            tag: "Максимум гибкости: пользуйтесь, выкупайте или возвращайте.",
            features: ["Всё из уровня Upgrade", "Право возврата устройства", "Выкуп в собственность в любой момент"],
            featured: false,
          },
        ];

  return `<!-- ============== CLUB ============== -->
<section class="section section--carbon" id="club">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>
    <div class="club-levels">
      ${renderedLevels
        .map(
          (level) => `<div class="level${level.featured ? " level--featured" : ""} reveal">
        ${level.badge ? `<div class="level__badge">${escapeHtml(level.badge)}</div>` : ""}
        ${level.name ? `<div class="level__name">${escapeHtml(level.name)}</div>` : ""}
        ${level.tag ? `<div class="level__tag">${escapeHtml(level.tag)}</div>` : ""}
        <ul class="level__features">
          ${level.features
            .map((feature) => `<li>${renderCheckIcon()}${escapeHtml(feature)}</li>`)
            .join("\n          ")}
        </ul>
      </div>`,
        )
        .join("\n      ")}
    </div>
    <div class="btn-row center reveal" style="margin-top:40px;">
      ${
        section.primaryCtaLabel
          ? `<a class="btn btn--filled" href="${escapeHtml(normalizeSiteUrl(section.primaryCtaUrl || "/club"))}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(normalizeSiteUrl(section.secondaryCtaUrl || "/#final"))}">${escapeHtml(
              section.secondaryCtaLabel,
            )}</a>`
          : ""
      }
    </div>
  </div>
</section>

`;
}

function renderDiagnosticsCompareSection(section: PageSection): string {
  const diagnostics = diagnosticsContent(section.content.diagnostics);
  const comparison = comparisonContent(section.content.comparison);

  return `<!-- ============== DIAGNOSTICS + COMPARISON ============== -->
<section class="section" id="diagnostics">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>

    <div class="diagnostics-photo reveal">
      <img src="${escapeHtml(section.image || diagnostics.imageSrc)}" alt="${escapeHtml(diagnostics.imageAlt)}" />
      <div class="diagnostics-photo__note">
        <span>${escapeHtml(diagnostics.noteLabel)}</span>
        <strong>${escapeHtml(diagnostics.noteText)}</strong>
      </div>
    </div>

    <div class="compare reveal" role="table" aria-label="${escapeHtml(comparison.ariaLabel)}">
      <div class="compare__row compare__head" role="row">
        <div class="compare__cell compare__cell--label" role="columnheader">${escapeHtml(comparison.labelHeader)}</div>
        <div class="compare__cell compare__cell--bad" role="columnheader">${escapeHtml(comparison.badHeader)}</div>
        <div class="compare__cell compare__cell--good" role="columnheader">${escapeHtml(comparison.goodHeader)}</div>
      </div>
      ${comparison.rows
        .map(
          (row) => `<div class="compare__row" role="row">
        <div class="compare__cell compare__cell--label" role="cell">${escapeHtml(row.label)}</div>
        <div class="compare__cell compare__cell--bad" role="cell">${renderCompareXIcon()}${escapeHtml(row.bad)}</div>
        <div class="compare__cell compare__cell--good" role="cell">${renderCompareCheckIcon()}${escapeHtml(row.good)}</div>
      </div>`,
        )
        .join("\n      ")}
    </div>
  </div>
</section>

`;
}

function renderFinalCtaSection(section: PageSection): string {
  const proof = stringList(section.content.proof);
  const renderedProof =
    proof.length > 0
      ? proof
      : ["варианты под задачу", "без агрессивных продаж", "сначала проверка — потом решение"];
  const form = finalCtaFormContent(section.content.form);
  const footerNote =
    typeof section.content.footerNote === "string"
      ? section.content.footerNote
      : typeof section.content.footer_note === "string"
        ? section.content.footer_note
        : "Северодвинск. Мы здесь. Нас можно найти. Мы отвечаем за то, что проходит через своих.";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const turnstileWidget = turnstileSiteKey
    ? `<div class="lead-form__turnstile" data-turnstile-widget data-sitekey="${escapeHtml(turnstileSiteKey)}"></div>`
    : "";

  return `<!-- ============== FINAL CTA ============== -->
<section class="section section--wash final-cta" id="final">
  <div class="wrap">
    <div class="final-panel reveal">
      <div class="final-panel__copy">
        ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
        ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
        ${section.body ? `<p class="lead">${escapeHtml(section.body)}</p>` : ""}
        <div class="final-panel__proof">
          ${renderedProof.map((item) => `<span>${escapeHtml(item)}</span>`).join("\n          ")}
        </div>
      </div>
      <form class="lead-form" id="leadForm">
        <label>
          <span>${escapeHtml(form.scenarioLabel)}</span>
          <select name="scenario" aria-label="${escapeHtml(form.scenarioAriaLabel)}">
            ${form.scenarioOptions.map((option) => `<option>${escapeHtml(option)}</option>`).join("\n            ")}
          </select>
        </label>
        <label>
          <span>${escapeHtml(form.deviceLabel)}</span>
          <input name="device" type="text" placeholder="${escapeHtml(form.devicePlaceholder)}" />
        </label>
        <label>
          <span>${escapeHtml(form.contactLabel)}</span>
          <input name="contact" type="text" placeholder="${escapeHtml(form.contactPlaceholder)}" />
        </label>
        <input name="website" type="text" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;height:1px;width:1px;opacity:0;" />
        <input name="turnstile_token" type="hidden" value="" />
        ${turnstileWidget}
        <button class="btn btn--filled lead-form__submit" type="submit">${escapeHtml(form.submitLabel)}</button>
        <p class="lead-form__note" id="formNote">${escapeHtml(form.note)}</p>
      </form>
    </div>
    <p class="muted reveal" style="margin-top:24px;font-size:var(--text-body-sm);">${escapeHtml(footerNote)}</p>
  </div>
</section>

`;
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
    content: (raw.content && typeof raw.content === "object" ? raw.content : {}) as PageSection["content"],
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
    title: strField(raw, "title", "ISVOI"),
    metaDescription: strField(raw, "metaDescription"),
    sections: sections
      .filter((section): section is Record<string, unknown> => !!section && typeof section === "object")
      .map(normalizeFallbackSection),
  };
}

function marketingSections(slug: MarketingSlug, sections: PageSection[] = []): PageSection[] {
  const active = sections.filter((section) => section.isActive);
  const fallback = getFallbackMarketingPage(slug).sections;
  return (active.length > 0 ? active : fallback).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function marketingSectionsForRender(slug: MarketingSlug, sections: PageSection[] = []): PageSection[] {
  return marketingSections(slug, sections);
}

function renderHomeSection(section: PageSection, devices: Device[] = []): string {
  switch (section.sectionKey) {
    case "hero":
      return renderHeroSection(section);
    case "trust":
      return renderTrustSection(section);
    case "path_router":
      return renderPathRouterSection(section);
    case "catalog_preview":
      return renderCatalogPreviewSection(section, devices);
    case "passport_preview":
      return renderPassportSection(section);
    case "store_preview":
      return renderStorePreviewSection(section);
    case "trade_preview":
      return renderTradePreviewSection(section);
    case "club_preview":
      return renderClubPreviewSection(section);
    case "diagnostics_compare":
      return renderDiagnosticsCompareSection(section);
    case "final_cta":
      return renderFinalCtaSection(section);
    default:
      return "";
  }
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

export function homeSectionsForRender(sections: PageSection[] = []): PageSection[] {
  return homeSections(sections);
}

export function renderHomeSectionMarkup(section: PageSection, devices: Device[] = []): string {
  return renderHomeSection(section, devices);
}

export function renderHomeMarkup(
  sections: PageSection[] = [],
  chrome: SiteChrome = siteChrome(null, []),
  devices: Device[] = [],
): string {
  return `${renderHeaderChrome(chrome)}${renderHomeBodyMarkup(sections, devices)}

${renderFooterChrome(chrome)}
`;
}

export function renderHomeBodyMarkup(
  sections: PageSection[] = [],
  devices: Device[] = [],
): string {
  const renderedSections = homeSections(sections)
    .map((section) => renderHomeSection(section, devices))
    .filter(Boolean)
    .join("\n");

  return `<main id="top">

${renderedSections}</main>`;
}


export { siteChrome };
