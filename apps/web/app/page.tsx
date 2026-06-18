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
              ? `<a class="btn btn--filled" href="${escapeHtml(section.primaryCtaUrl || "/passport/index.html")}">${escapeHtml(
                  section.primaryCtaLabel,
                )}</a>`
              : ""
          }
          ${
            section.secondaryCtaLabel
              ? `<a class="btn btn--outlined" href="${escapeHtml(section.secondaryCtaUrl || "/catalog/index.html")}">${escapeHtml(
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
          ? `<a class="btn btn--filled" href="${escapeHtml(section.primaryCtaUrl || "/store/index.html")}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(section.secondaryCtaUrl || "/catalog/index.html")}">${escapeHtml(
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
          ? `<a class="btn btn--filled" href="${escapeHtml(section.primaryCtaUrl || "/trade/index.html")}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(section.secondaryCtaUrl || "/#final")}">${escapeHtml(
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
          ? `<a class="btn btn--filled" href="${escapeHtml(section.primaryCtaUrl || "/club/index.html")}">${escapeHtml(
              section.primaryCtaLabel,
            )}</a>`
          : ""
      }
      ${
        section.secondaryCtaLabel
          ? `<a class="btn btn--outlined" href="${escapeHtml(section.secondaryCtaUrl || "/#final")}">${escapeHtml(
              section.secondaryCtaLabel,
            )}</a>`
          : ""
      }
    </div>
  </div>
</section>

`;
}

function applySectionBlocks(markup: string, sections: PageSection[]): string {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section]));
  const trust = byKey.get("trust");
  const pathRouter = byKey.get("path_router");
  const catalogPreview = byKey.get("catalog_preview") ?? defaultCatalogPreviewSection;
  const passportPreview = byKey.get("passport_preview");
  const storePreview = byKey.get("store_preview");
  const tradePreview = byKey.get("trade_preview");
  const clubPreview = byKey.get("club_preview");

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

  if (passportPreview) {
    const rendered = renderPassportSection(passportPreview);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== PASSPORT ============== -->",
        "<!-- ============== STORE ============== -->",
        rendered,
      );
    }
  }

  if (storePreview) {
    const rendered = renderStorePreviewSection(storePreview);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== STORE ============== -->",
        "<!-- ============== TRADE ============== -->",
        rendered,
      );
    }
  }

  if (tradePreview) {
    const rendered = renderTradePreviewSection(tradePreview);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== TRADE ============== -->",
        "<!-- ============== CLUB ============== -->",
        rendered,
      );
    }
  }

  if (clubPreview) {
    const rendered = renderClubPreviewSection(clubPreview);
    if (rendered) {
      nextMarkup = replaceBetween(
        nextMarkup,
        "<!-- ============== CLUB ============== -->",
        "<!-- ============== DIAGNOSTICS + COMPARISON ============== -->",
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
