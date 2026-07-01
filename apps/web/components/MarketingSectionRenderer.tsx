import Link from "next/link";
import Image from "next/image";
import type { PageSection } from "@vtoroy/shared";
import { CatalogGrid } from "./CatalogGrid";
import type { DeviceCardData } from "@/lib/device-card-data";
import type { MarketingSlug } from "@/lib/site-content";
import { cn } from "../lib/cn";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

type MarketingSectionRendererProps = {
  section: PageSection;
  slug: MarketingSlug;
  devices?: DeviceCardData[];
  directusEnabled: boolean;
};

type MarketingCard = {
  title: string;
  text: string;
  badge: string;
  url: string;
  label: string;
};

type MarketingStep = {
  title: string;
  text: string;
};

type ComparisonRow = {
  label: string;
  bad: string;
  good: string;
};

type ComparisonContent = {
  ariaLabel: string;
  labelHeader: string;
  badHeader: string;
  goodHeader: string;
  rows: ComparisonRow[];
};

type FaqItem = {
  title: string;
  text: string;
  badge: string;
};

type VisualContent = {
  imageSrc: string;
  imageAlt: string;
  captionTitle: string;
  captionText: string;
};

type MarketingHeroHighlight = {
  label: string;
  value: string;
  text: string;
};

type ClubLevel = {
  badge: string;
  name: string;
  tag: string;
  features: string[];
  featured: boolean;
};

const DEFAULT_HERO_HIGHLIGHTS: Record<MarketingSlug, MarketingHeroHighlight[]> = {
  store: [
    {
      label: "Витрина",
      value: "проверенные вещи",
      text: "Карточки показывают грейд, наличие, гарантию и цену выхода до решения.",
    },
    {
      label: "Проверка",
      value: "при вас",
      text: "Состояние устройства фиксируется открыто, без обещаний со слов продавца.",
    },
    {
      label: "После покупки",
      value: "Passport + гарантия",
      text: "Покупатель получает понятную историю вещи и письменные условия.",
    },
  ],
  trade: [
    {
      label: "Маршрут",
      value: "выкуп / комиссия / обновление",
      text: "После оценки вы выбираете сценарий, а не торгуетесь в переписках.",
    },
    {
      label: "Оценка",
      value: "после диагностики",
      text: "Цена опирается на состояние, комплектацию и понятный спрос внутри круга.",
    },
    {
      label: "Безопасность",
      value: "без случайных встреч",
      text: "Вещь проходит через Store и дальше уходит с зафиксированной историей.",
    },
  ],
  passport: [
    {
      label: "Состояние",
      value: "зафиксировано",
      text: "Экран, корпус, аккумулятор, ремонты и следы влаги не остаются словами.",
    },
    {
      label: "Покупка",
      value: "без тумана",
      text: "Покупатель видит нюансы до решения, а не узнаёт их после сделки.",
    },
    {
      label: "Выход",
      value: "понятный ориентир",
      text: "Passport помогает оценивать не только покупку, но и будущую передачу вещи.",
    },
  ],
  club: [
    {
      label: "Круг",
      value: "разумное владение",
      text: "Устройства не теряются на случайном рынке, а переходят через своих.",
    },
    {
      label: "Обновление",
      value: "без лишнего шума",
      text: "Trade и Store помогают перейти на следующую вещь без объявлений и торга.",
    },
    {
      label: "Отношения",
      value: "после первой сделки",
      text: "Club удерживает историю, доверие и понятные правила следующего шага.",
    },
  ],
};

function strField(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function textField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback: string,
): string {
  const camelField = record[camelKey];
  const snakeField = record[snakeKey];
  if (typeof camelField === "string" && camelField.trim()) return camelField;
  if (typeof snakeField === "string" && snakeField.trim()) return snakeField;
  return fallback;
}

function marketingCards(value: unknown): MarketingCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = strField(record, "title");
    const text = strField(record, "text");
    const badge = strField(record, "badge", String(index + 1).padStart(2, "0"));
    const url = normalizeSiteUrl(strField(record, "url", ""));
    const label = strField(record, "label");
    return title || text ? [{ title, text, badge, url, label }] : [];
  });
}

function marketingSteps(value: unknown): MarketingStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = strField(record, "title");
    const text = strField(record, "text");
    return title || text ? [{ title, text }] : [];
  });
}

function heroHighlights(value: unknown, slug: MarketingSlug): MarketingHeroHighlight[] {
  if (!Array.isArray(value)) return DEFAULT_HERO_HIGHLIGHTS[slug];

  const highlights = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = strField(record, "label");
    const valueText = textField(record, "value", "value_text", "");
    const text = strField(record, "text");
    return label || valueText || text ? [{ label, value: valueText, text }] : [];
  });

  return highlights.length > 0 ? highlights.slice(0, 3) : DEFAULT_HERO_HIGHLIGHTS[slug];
}

function comparisonRows(value: unknown): ComparisonRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = strField(record, "label");
    const bad = strField(record, "bad");
    const good = strField(record, "good");
    return label || bad || good ? [{ label, bad, good }] : [];
  });
}

function comparisonContent(value: unknown): ComparisonContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rows = comparisonRows(record.rows);

  return {
    ariaLabel: textField(record, "ariaLabel", "aria_label", "Сравнение сценариев ISVOI"),
    labelHeader: textField(record, "labelHeader", "label_header", "Что сравниваем"),
    badHeader: textField(record, "badHeader", "bad_header", "Случайный рынок"),
    goodHeader: textField(record, "goodHeader", "good_header", "ISVOI"),
    rows,
  };
}

function faqItems(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = strField(record, "title");
    const text = strField(record, "text");
    const badge = strField(record, "badge", String(index + 1).padStart(2, "0"));
    return title || text ? [{ title, text, badge }] : [];
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function visualContent(value: unknown): VisualContent {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    imageSrc: textField(record, "imageSrc", "image_src", "/assets/store-real-premium-hero.webp"),
    imageAlt: textField(
      record,
      "imageAlt",
      "image_alt",
      "Интерьер премиального бутика: дерево, каменная стойка и графитовые полки с устройствами",
    ),
    captionTitle: textField(record, "captionTitle", "caption_title", "Store как точка доверия."),
    captionText: textField(
      record,
      "captionText",
      "caption_text",
      "Чистая витрина, видимая ответственность и спокойная консультация без давления.",
    ),
  };
}

function clubLevels(value: unknown): ClubLevel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = strField(record, "name");
    const tag = strField(record, "tag");
    const badge = strField(record, "badge");
    const features = stringList(record.features);
    const featured = record.featured === true;
    return name || tag || features.length > 0 ? [{ badge, name, tag, features, featured }] : [];
  });
}

function SectionHeader({ section }: { section: PageSection }) {
  if (!section.eyebrow && !section.headline && !section.body) return null;

  return (
    <div className="mx-auto max-w-copy text-center">
      {section.eyebrow ? (
        <div className="text-sm font-semibold leading-snug text-link-blue">{section.eyebrow}</div>
      ) : null}
      {section.headline ? (
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
          {section.headline}
        </h2>
      ) : null}
      {section.body ? (
        <p className="mt-4 text-copy leading-relaxed text-graphite">{section.body}</p>
      ) : null}
    </div>
  );
}

function DarkSectionHeader({ section }: { section: PageSection }) {
  if (!section.eyebrow && !section.headline && !section.body) return null;

  return (
    <div className="mx-auto max-w-copy text-center">
      {section.eyebrow ? (
        <div className="text-sm font-semibold leading-snug text-signal-blue">{section.eyebrow}</div>
      ) : null}
      {section.headline ? (
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-white md:text-5xl">
          {section.headline}
        </h2>
      ) : null}
      {section.body ? (
        <p className="mt-4 text-copy leading-relaxed text-white/70">{section.body}</p>
      ) : null}
    </div>
  );
}

function XIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function MarketingVisualBandSection({ section }: { section: PageSection }) {
  const visual = visualContent(section.content.visual);
  const imageSrc = section.image || visual.imageSrc;
  const captionTitle = visual.captionTitle || section.headline || "";
  const captionText = visual.captionText || section.body || "";

  if (!imageSrc && !captionTitle && !captionText) return null;

  return (
    <section className="bg-white pb-16 pt-0 md:pb-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="relative min-h-visual-compact overflow-hidden rounded-img border border-hairline bg-frost md:min-h-hero-visual">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={visual.imageAlt || section.headline || ""}
              fill
              sizes="(min-width: 1180px) 1120px, 92vw"
              className="object-cover"
            />
          ) : null}
          {captionTitle || captionText ? (
            <div className="absolute inset-x-4 bottom-4 rounded-card border border-white/70 bg-white/90 p-4 shadow-soft backdrop-blur md:inset-x-auto md:bottom-6 md:left-6 md:max-w-overlay-sm md:p-5">
              {captionTitle ? (
                <strong className="block text-base font-semibold text-carbon">
                  {captionTitle}
                </strong>
              ) : null}
              {captionText ? (
                <span className="mt-1 block text-sm leading-relaxed text-ash">{captionText}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MarketingHeroSection({ section, slug }: { section: PageSection; slug: MarketingSlug }) {
  const primaryLabel = section.primaryCtaLabel || "Войти в круг";
  const primaryUrl = normalizeSiteUrl(section.primaryCtaUrl || "/#final");
  const secondaryLabel = section.secondaryCtaLabel || "Смотреть каталог";
  const secondaryUrl = normalizeSiteUrl(section.secondaryCtaUrl || "/catalog");
  const hasButtons = section.primaryCtaLabel || section.secondaryCtaLabel;
  const highlights = heroHighlights(
    section.content.highlights ?? section.content.hero_highlights ?? section.content.facts,
    slug,
  );

  return (
    <section className="mx-auto max-w-page px-4 pb-14 pt-14 text-center md:px-6 md:pb-16 md:pt-20">
      {section.eyebrow ? (
        <div className="mx-auto inline-flex min-h-9 items-center rounded-pill border border-hairline bg-frost px-4 text-xs font-semibold text-ash">
          {section.eyebrow}
        </div>
      ) : null}
      {section.headline ? (
        <h1 className="mx-auto mt-6 max-w-copy-wide text-5xl font-semibold leading-display tracking-normal text-carbon md:text-7xl">
          {section.headline}
        </h1>
      ) : null}
      {section.body ? (
        <p className="mx-auto mt-5 max-w-measure text-lg leading-relaxed text-graphite md:text-xl">
          {section.body}
        </p>
      ) : null}

      {hasButtons ? (
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          {section.primaryCtaLabel ? (
            <Link href={primaryUrl} className={primaryPillCtaClass}>
              {primaryLabel}
            </Link>
          ) : null}
          {section.secondaryCtaLabel ? (
            <Link href={secondaryUrl} className={secondaryPillCtaClass}>
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      {highlights.length > 0 ? (
        <div className="mx-auto mt-10 grid max-w-content overflow-hidden rounded-card border border-hairline bg-hairline text-left sm:grid-cols-3">
          {highlights.map((highlight) => (
            <article
              key={`${highlight.label}-${highlight.value}`}
              className="min-h-marketing-fact bg-white p-5"
            >
              {highlight.label ? (
                <p className="text-xs font-semibold text-link-blue">{highlight.label}</p>
              ) : null}
              {highlight.value ? (
                <p className="mt-2 text-lg font-semibold leading-snug text-carbon">
                  {highlight.value}
                </p>
              ) : null}
              {highlight.text ? (
                <p className="mt-2 text-sm leading-relaxed text-graphite">{highlight.text}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MarketingLevelsSection({ section }: { section: PageSection }) {
  const levels = clubLevels(section.content.levels);
  if (levels.length === 0) return null;

  return (
    <section className="bg-carbon py-16 text-white md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <DarkSectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-content gap-5 lg:grid-cols-3">
          {levels.map((level) => (
            <article
              key={level.name || level.badge}
              className={cn(
                "flex min-h-marketing-tall flex-col rounded-card border p-7",
                level.featured
                  ? "border-signal-blue bg-white text-carbon shadow-product"
                  : "border-white/15 bg-white/5 text-white",
              )}
            >
              {level.badge ? (
                <div
                  className={cn(
                    "mb-5 inline-flex w-fit rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-caption",
                    level.featured ? "bg-frost text-link-blue" : "bg-white/10 text-signal-blue",
                  )}
                >
                  {level.badge}
                </div>
              ) : null}
              {level.name ? (
                <h3 className="text-3xl font-semibold leading-tight">{level.name}</h3>
              ) : null}
              {level.tag ? (
                <p
                  className={cn(
                    "mt-2 min-h-11 text-sm leading-relaxed",
                    level.featured ? "text-graphite" : "text-white/70",
                  )}
                >
                  {level.tag}
                </p>
              ) : null}
              {level.features.length > 0 ? (
                <ul className="mt-6 grid gap-3">
                  {level.features.map((feature) => (
                    <li
                      key={feature}
                      className={cn(
                        "flex gap-2 text-sm leading-relaxed",
                        level.featured ? "text-graphite" : "text-white/85",
                      )}
                    >
                      <span className="text-signal-blue">
                        <CheckIcon />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {level.name ? (
                <Link
                  href="/#final"
                  className={cn(
                    "focus-ring mt-auto inline-flex min-h-11 items-center justify-center rounded-pill px-5 py-3 text-sm font-semibold transition",
                    level.featured
                      ? "bg-action text-white hover:bg-action-blue"
                      : "border border-white/25 text-white hover:border-signal-blue hover:text-signal-blue",
                  )}
                >
                  Выбрать {level.name}
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketingCompareSection({ section }: { section: PageSection }) {
  const comparison = comparisonContent(section.content.comparison);
  if (comparison.rows.length === 0) return null;

  return (
    <section className="bg-frost py-16 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <SectionHeader section={section} />
        <div
          className="mx-auto mt-10 max-w-content overflow-hidden rounded-card border border-hairline bg-white"
          role="table"
          aria-label={comparison.ariaLabel}
        >
          <div
            className="hidden grid-cols-compare bg-frost text-sm font-semibold text-carbon md:grid"
            role="row"
          >
            <div className="border-r border-hairline p-4" role="columnheader">
              {comparison.labelHeader}
            </div>
            <div className="border-r border-hairline p-4" role="columnheader">
              {comparison.badHeader}
            </div>
            <div className="p-4 text-link-blue" role="columnheader">
              {comparison.goodHeader}
            </div>
          </div>

          {comparison.rows.map((row) => (
            <div
              key={`${row.label}-${row.bad}-${row.good}`}
              className="grid border-t border-hairline md:grid-cols-compare"
              role="row"
            >
              <div
                className="bg-frost p-4 text-sm font-semibold text-carbon md:bg-white"
                role="cell"
              >
                {row.label}
              </div>
              <div
                className="flex gap-2 border-t border-hairline p-4 text-sm leading-relaxed text-graphite md:border-l md:border-t-0"
                role="cell"
              >
                <XIcon />
                <span>{row.bad}</span>
              </div>
              <div
                className="flex gap-2 border-t border-hairline bg-ice p-4 text-sm font-semibold leading-relaxed text-carbon md:border-l md:border-t-0"
                role="cell"
              >
                <CheckIcon />
                <span>{row.good}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketingPageCtaSection({ section }: { section: PageSection }) {
  if (!section.headline && !section.body && !section.primaryCtaLabel && !section.secondaryCtaLabel)
    return null;

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy-wide rounded-card border border-hairline bg-ice p-8 text-center md:p-12">
          {section.headline ? (
            <h2 className="text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? (
            <p className="mx-auto mt-4 max-w-prose-narrow text-copy leading-relaxed text-graphite">
              {section.body}
            </p>
          ) : null}
          {section.primaryCtaLabel || section.secondaryCtaLabel ? (
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {section.primaryCtaLabel ? (
                <Link
                  href={normalizeSiteUrl(section.primaryCtaUrl || "/#final")}
                  className={primaryPillCtaClass}
                >
                  {section.primaryCtaLabel}
                </Link>
              ) : null}
              {section.secondaryCtaLabel ? (
                <Link
                  href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog")}
                  className={secondaryPillCtaClass}
                >
                  {section.secondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MarketingCardsSection({ section }: { section: PageSection }) {
  const cards = marketingCards(section.content.items ?? section.content.cards);
  if (cards.length === 0) return null;
  const isWash = section.variant?.includes("wash");
  const cardGridClass = cn(
    "mx-auto mt-10 grid max-w-content gap-6 sm:grid-cols-2",
    cards.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
  );

  return (
    <section className={cn("py-16 md:py-20", isWash ? "bg-frost" : "bg-white")}>
      <div className="mx-auto max-w-page px-4 md:px-6">
        <SectionHeader section={section} />
        <div className={cardGridClass}>
          {cards.map((card) => (
            <article
              key={`${card.badge}-${card.title}`}
              className="flex min-h-marketing-card flex-col rounded-card border border-hairline bg-white p-7"
            >
              <span className="text-xs font-semibold uppercase tracking-caption text-link-blue">
                {card.badge}
              </span>
              {card.title ? (
                <h3 className="mt-5 text-xl font-semibold leading-tight text-carbon">
                  {card.title}
                </h3>
              ) : null}
              {card.text ? (
                <p className="mt-3 text-sm leading-relaxed text-ash">{card.text}</p>
              ) : null}
              {card.url && card.label ? (
                <Link
                  href={card.url}
                  className="focus-ring mt-auto pt-6 text-sm font-semibold text-link-blue transition hover:text-action"
                >
                  {card.label}
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketingStepsSection({ section }: { section: PageSection }) {
  const steps = marketingSteps(section.content.steps);
  if (steps.length === 0) return null;

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <SectionHeader section={section} />
        <ol className="mx-auto mt-10 grid max-w-content gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={`${step.title}-${index}`} className="border-t border-hairline pt-5">
              <div className="mb-5 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-ice text-sm font-semibold text-link-blue">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
              </div>
              {step.title ? (
                <h3 className="text-xl font-semibold leading-tight text-carbon">{step.title}</h3>
              ) : null}
              {step.text ? (
                <p className="mt-3 text-sm leading-relaxed text-graphite">{step.text}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function MarketingFaqSection({ section }: { section: PageSection }) {
  const items = faqItems(section.content.items);
  if (items.length === 0) return null;

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <SectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-faq gap-3">
          {items.map((item) => (
            <details
              key={`${item.badge}-${item.title}`}
              className="group rounded-card border border-hairline bg-white"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 p-5 text-left marker:hidden md:items-center md:p-6">
                <span className="text-base font-semibold leading-snug text-carbon">
                  {item.title}
                </span>
                <strong className="shrink-0 text-xs font-semibold uppercase tracking-caption text-link-blue">
                  {item.badge}
                </strong>
              </summary>
              {item.text ? (
                <div className="border-t border-hairline px-5 pb-5 pt-4 text-sm leading-relaxed text-graphite md:px-6 md:pb-6">
                  {item.text}
                </div>
              ) : null}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function isHeroSection(section: PageSection): boolean {
  return section.variant === "page.hero" || section.sectionKey.endsWith("_hero");
}

function isVisualBandSection(section: PageSection): boolean {
  return section.variant === "visual.band";
}

function isCompareSection(section: PageSection): boolean {
  return section.variant === "compare" || section.sectionKey.endsWith("_compare");
}

function isLevelsSection(section: PageSection): boolean {
  return section.variant === "levels" || section.sectionKey === "club_levels";
}

function isCardsSection(section: PageSection): boolean {
  if (section.variant === "faq" || section.sectionKey === "faq") return false;
  return Boolean(section.variant === "cards.grid" || section.content.cards);
}

function isStepsSection(section: PageSection): boolean {
  return section.variant === "steps" || section.sectionKey.endsWith("_steps");
}

function isFaqSection(section: PageSection): boolean {
  return section.variant === "faq" || section.sectionKey === "faq";
}

function isPageCtaSection(section: PageSection): boolean {
  return section.variant === "page.cta" || section.sectionKey === "final_cta";
}

export function MarketingSectionRenderer({
  section,
  slug,
  devices = [],
  directusEnabled,
}: MarketingSectionRendererProps) {
  const renderedSection = isHeroSection(section) ? (
    <MarketingHeroSection section={section} slug={slug} />
  ) : isVisualBandSection(section) ? (
    <MarketingVisualBandSection section={section} />
  ) : isCompareSection(section) ? (
    <MarketingCompareSection section={section} />
  ) : isLevelsSection(section) ? (
    <MarketingLevelsSection section={section} />
  ) : isCardsSection(section) ? (
    <MarketingCardsSection section={section} />
  ) : isStepsSection(section) ? (
    <MarketingStepsSection section={section} />
  ) : isFaqSection(section) ? (
    <MarketingFaqSection section={section} />
  ) : isPageCtaSection(section) ? (
    <MarketingPageCtaSection section={section} />
  ) : null;

  if (slug === "store" && section.sectionKey === "final_cta") {
    return (
      <>
        <CatalogGrid devices={devices} directusEnabled={directusEnabled} />
        {renderedSection}
      </>
    );
  }

  return renderedSection;
}
