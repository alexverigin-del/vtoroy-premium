import fs from "node:fs";
import path from "node:path";
import Script from "next/script";
import type { PageSection } from "@vtoroy/shared";
import { getSitePage } from "@/lib/directus";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceText(markup: string, currentText: string, nextText?: string): string {
  if (!nextText) return markup;
  return markup.replace(currentText, escapeHtml(nextText));
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

const defaultCatalogPreviewSection: PageSection = {
  id: "catalog-preview-fallback",
  sectionKey: "catalog_preview",
  variant: "catalog.grid",
  eyebrow: "Store · сейчас в ISVOI",
  headline: "Вещи в кругу — сейчас в наличии.",
  subheadline: "Фильтры каталога",
  body: "Каждая карточка показывает не только цену, но и историю вещи: грейд, батарею, проверку и цену выхода. Это вещи, которые прошли через своих.",
  primaryCtaLabel: "Смотреть весь Store",
  primaryCtaUrl: "/catalog/index.html",
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

function replaceBetween(markup: string, startMarker: string, endMarker: string, replacement: string): string {
  const start = markup.indexOf(startMarker);
  const end = markup.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return markup;
  return `${markup.slice(0, start)}${replacement}${markup.slice(end)}`;
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
          return `<a class="path-card reveal" href="${escapeHtml(card.url)}">
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

function renderCatalogPreviewSection(section: PageSection): string {
  const filters = filterList(section.content.filters);
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
  const actions =
    section.primaryCtaLabel || section.secondaryCtaLabel
      ? `<div class="btn-row reveal" style="margin-top:32px;">
      ${
        section.primaryCtaLabel
          ? `<a class="btn btn--filled" href="${escapeHtml(section.primaryCtaUrl || "/catalog/index.html")}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(section.secondaryCtaUrl || "#final")}">${escapeHtml(
              section.secondaryCtaLabel,
            )}</a>`
          : ""
      }
    </div>`
      : "";

  return `<!-- ============== CATALOG ============== -->
<section class="section catalog-section" id="catalog">
  <div class="wrap">
    <div class="sec-head reveal">
      ${section.eyebrow ? `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>` : ""}
      ${section.headline ? `<h2 class="h2">${escapeHtml(section.headline)}</h2>` : ""}
      ${section.body ? `<p class="lead text-wrap" style="margin-top:16px;">${escapeHtml(section.body)}</p>` : ""}
    </div>

    <div class="catalog-controls reveal" aria-label="${escapeHtml(section.subheadline || "Фильтры каталога")}">
      ${chips
        .map(
          (filter, index) =>
            `<button class="filter-chip${index === 0 ? " is-active" : ""}" type="button" data-filter="${escapeHtml(
              filter.value,
            )}">${escapeHtml(filter.label)}</button>`,
        )
        .join("\n      ")}
    </div>

    <div class="catalog-grid reveal" id="catalogGrid" aria-busy="true"></div>
    ${actions}
    <noscript><p class="lead">Каталог загружается через JavaScript. Включите JavaScript, чтобы увидеть проверенные устройства.</p></noscript>
  </div>
</section>

`;
}

function applySectionBlocks(markup: string, sections: PageSection[]): string {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section]));
  const trust = byKey.get("trust");
  const pathRouter = byKey.get("path_router");
  const catalogPreview = byKey.get("catalog_preview") ?? defaultCatalogPreviewSection;

  let nextMarkup = markup;

  if (trust) {
    const rendered = renderTrustSection(trust);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== TRUST STRIP ============== -->",
        "<!-- ============== CONVERSION PATHS ============== -->",
        rendered,
      );
    }
  }

  if (pathRouter) {
    const rendered = renderPathRouterSection(pathRouter);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== CONVERSION PATHS ============== -->",
        "<!-- ============== CATALOG ============== -->",
        rendered,
      );
    }
  }

  if (catalogPreview) {
    const rendered = renderCatalogPreviewSection(catalogPreview);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== CATALOG ============== -->",
        "<!-- ============== PASSPORT ============== -->",
        rendered,
      );
    }
  }

  return nextMarkup;
}

function applySectionText(markup: string, sections: PageSection[]): string {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section]));
  const hero = byKey.get("hero");
  const finalCta = byKey.get("final_cta");

  let nextMarkup = markup;

  if (hero) {
    nextMarkup = replaceText(
      nextMarkup,
      "ISVOI · клуб разумного владения · Северодвинск",
      hero.eyebrow,
    );
    nextMarkup = replaceText(
      nextMarkup,
      "Хорошие вещи проходят через своих.",
      hero.headline,
    );
    nextMarkup = replaceText(
      nextMarkup,
      "ISVOI — клуб разумного владения. Здесь ценная вещь не теряется после первого владельца, а переходит дальше — с понятной историей, проверенным состоянием и честной ценой выхода. Не рынок, а круг, где вещам доверяют.",
      hero.body,
    );
  }

  if (finalCta) {
    nextMarkup = replaceText(nextMarkup, "Следующий шаг", finalCta.eyebrow);
    nextMarkup = replaceText(nextMarkup, "Войдите в круг ISVOI.", finalCta.headline);
    nextMarkup = replaceText(
      nextMarkup,
      "Оставьте сценарий — найти вещь, передать свою дальше или войти в Club. В ответ вы получите понятные варианты: история, состояние, Passport и цена выхода.",
      finalCta.body,
    );

    const proof = stringList(finalCta.content.proof);
    if (proof[0]) nextMarkup = replaceText(nextMarkup, "варианты под задачу", proof[0]);
    if (proof[1]) nextMarkup = replaceText(nextMarkup, "без агрессивных продаж", proof[1]);
    if (proof[2]) nextMarkup = replaceText(nextMarkup, "сначала проверка — потом решение", proof[2]);
  }

  return applySectionBlocks(nextMarkup, sections);
}

function legacyHomeMarkup(sections: PageSection[] = []): string {
  const candidates = [
    path.join(process.cwd(), "apps", "web", "public", "index.html"),
    path.join(process.cwd(), "public", "index.html"),
    path.join(process.cwd(), "index.html"),
    path.join(process.cwd(), "..", "..", "index.html"),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    throw new Error("Legacy homepage index.html was not found.");
  }

  const html = fs.readFileSync(source, "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  const normalized = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/href="catalog\/index\.html"/g, 'href="/catalog/index.html"')
    .replace(/href="store\/index\.html"/g, 'href="/store/index.html"')
    .replace(/href="passport\/index\.html"/g, 'href="/passport/index.html"')
    .replace(/href="trade\/index\.html"/g, 'href="/trade/index.html"')
    .replace(/href="club\/index\.html"/g, 'href="/club/index.html"')
    .replace(/href="index\.html#/g, 'href="/#')
    .replace(/src="assets\//g, 'src="/assets/')
    .replace(/href="assets\//g, 'href="/assets/');

  return applySectionText(normalized, sections);
}

export default async function HomePage() {
  const page = await getSitePage("home");

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260616a" />
      <div dangerouslySetInnerHTML={{ __html: legacyHomeMarkup(page?.sections) }} />
      <Script src="/data/devices.js?v=20260616a" strategy="afterInteractive" />
      <Script src="/script.js?v=20260617intake" strategy="afterInteractive" />
    </>
  );
}
