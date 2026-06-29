import Link from "next/link";
import Image from "next/image";
import type { Device, PageSection } from "@vtoroy/shared";
import { CatalogGrid } from "./CatalogGrid";
import { renderMarketingSectionMarkup, type MarketingSlug } from "@/lib/site-renderer";
import { normalizeSiteUrl } from "./site-chrome-utils";

type MarketingSectionRendererProps = {
  section: PageSection;
  slug: MarketingSlug;
  devices?: Device[];
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

type ClubLevel = {
  badge: string;
  name: string;
  tag: string;
  features: string[];
  featured: boolean;
};

function strField(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function textField(record: Record<string, unknown>, camelKey: string, snakeKey: string, fallback: string): string {
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
    <div className="mx-auto max-w-[780px] text-center">
      {section.eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-link-blue">{section.eyebrow}</div>
      ) : null}
      {section.headline ? (
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
          {section.headline}
        </h2>
      ) : null}
      {section.body ? <p className="mt-4 text-[17px] leading-relaxed text-graphite">{section.body}</p> : null}
    </div>
  );
}

function DarkSectionHeader({ section }: { section: PageSection }) {
  if (!section.eyebrow && !section.headline && !section.body) return null;

  return (
    <div className="mx-auto max-w-[780px] text-center">
      {section.eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-signal-blue">{section.eyebrow}</div>
      ) : null}
      {section.headline ? (
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-white md:text-5xl">
          {section.headline}
        </h2>
      ) : null}
      {section.body ? <p className="mt-4 text-[17px] leading-relaxed text-white/70">{section.body}</p> : null}
    </div>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <div className="relative min-h-[260px] overflow-hidden rounded-img border border-hairline bg-frost md:min-h-[560px]">
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
            <div className="absolute inset-x-4 bottom-4 rounded-card border border-white/70 bg-white/90 p-4 shadow-soft backdrop-blur md:inset-x-auto md:bottom-6 md:left-6 md:max-w-[390px] md:p-5">
              {captionTitle ? <strong className="block text-base font-semibold text-carbon">{captionTitle}</strong> : null}
              {captionText ? <span className="mt-1 block text-sm leading-relaxed text-ash">{captionText}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MarketingHeroSection({ section }: { section: PageSection }) {
  const primaryLabel = section.primaryCtaLabel || "Войти в круг";
  const primaryUrl = normalizeSiteUrl(section.primaryCtaUrl || "/#final");
  const secondaryLabel = section.secondaryCtaLabel || "Смотреть каталог";
  const secondaryUrl = normalizeSiteUrl(section.secondaryCtaUrl || "/catalog");
  const hasButtons = section.primaryCtaLabel || section.secondaryCtaLabel;

  return (
    <section className="mx-auto max-w-[1180px] px-4 pb-14 pt-14 text-center md:px-6 md:pb-16 md:pt-20">
      {section.eyebrow ? (
        <div className="mx-auto inline-flex min-h-9 items-center rounded-pill border border-hairline bg-frost px-4 text-xs font-semibold uppercase tracking-[0.12em] text-ash">
          {section.eyebrow}
        </div>
      ) : null}
      {section.headline ? (
        <h1 className="mx-auto mt-6 max-w-[980px] text-5xl font-semibold leading-[1.03] tracking-normal text-carbon md:text-7xl">
          {section.headline}
        </h1>
      ) : null}
      {section.body ? (
        <p className="mx-auto mt-5 max-w-[760px] text-lg leading-relaxed text-graphite md:text-xl">{section.body}</p>
      ) : null}

      {hasButtons ? (
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          {section.primaryCtaLabel ? (
            <Link
              href={primaryUrl}
              className="inline-flex min-h-11 items-center justify-center rounded-pill bg-action px-7 py-3 text-sm font-semibold text-white transition hover:bg-action-blue focus-ring"
            >
              {primaryLabel}
            </Link>
          ) : null}
          {section.secondaryCtaLabel ? (
            <Link
              href={secondaryUrl}
              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-hairline bg-white px-7 py-3 text-sm font-semibold text-carbon transition hover:border-link-blue hover:text-link-blue focus-ring"
            >
              {secondaryLabel}
            </Link>
          ) : null}
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
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <DarkSectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-[1120px] gap-5 lg:grid-cols-3">
          {levels.map((level) => (
            <article
              key={level.name || level.badge}
              className={[
                "flex min-h-[360px] flex-col rounded-card border p-7",
                level.featured
                  ? "border-signal-blue bg-white text-carbon shadow-product"
                  : "border-white/15 bg-white/[0.06] text-white",
              ].join(" ")}
            >
              {level.badge ? (
                <div
                  className={[
                    "mb-5 inline-flex w-fit rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]",
                    level.featured ? "bg-frost text-link-blue" : "bg-white/10 text-signal-blue",
                  ].join(" ")}
                >
                  {level.badge}
                </div>
              ) : null}
              {level.name ? <h3 className="text-3xl font-semibold leading-tight">{level.name}</h3> : null}
              {level.tag ? (
                <p className={["mt-2 min-h-11 text-sm leading-relaxed", level.featured ? "text-graphite" : "text-white/70"].join(" ")}>
                  {level.tag}
                </p>
              ) : null}
              {level.features.length > 0 ? (
                <ul className="mt-6 grid gap-3">
                  {level.features.map((feature) => (
                    <li key={feature} className={["flex gap-2 text-sm leading-relaxed", level.featured ? "text-graphite" : "text-white/85"].join(" ")}>
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
                  className={[
                    "mt-auto inline-flex min-h-11 items-center justify-center rounded-pill px-5 py-3 text-sm font-semibold transition focus-ring",
                    level.featured
                      ? "bg-action text-white hover:bg-action-blue"
                      : "border border-white/25 text-white hover:border-signal-blue hover:text-signal-blue",
                  ].join(" ")}
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
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <SectionHeader section={section} />
        <div className="mx-auto mt-10 max-w-[1120px] overflow-hidden rounded-card border border-hairline bg-white" role="table" aria-label={comparison.ariaLabel}>
          <div className="hidden grid-cols-[1.1fr_1fr_1fr] bg-frost text-sm font-semibold text-carbon md:grid" role="row">
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
            <div key={`${row.label}-${row.bad}-${row.good}`} className="grid border-t border-hairline md:grid-cols-[1.1fr_1fr_1fr]" role="row">
              <div className="bg-frost p-4 text-sm font-semibold text-carbon md:bg-white" role="cell">
                {row.label}
              </div>
              <div className="flex gap-2 border-t border-hairline p-4 text-sm leading-relaxed text-graphite md:border-l md:border-t-0" role="cell">
                <XIcon />
                <span>{row.bad}</span>
              </div>
              <div className="flex gap-2 border-t border-hairline bg-ice p-4 text-sm font-semibold leading-relaxed text-carbon md:border-l md:border-t-0" role="cell">
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
  if (!section.headline && !section.body && !section.primaryCtaLabel && !section.secondaryCtaLabel) return null;

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <div className="mx-auto max-w-[980px] rounded-card border border-hairline bg-white/80 p-8 text-center shadow-soft md:p-12">
          {section.headline ? (
            <h2 className="text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">{section.headline}</h2>
          ) : null}
          {section.body ? <p className="mx-auto mt-4 max-w-[700px] text-[17px] leading-relaxed text-graphite">{section.body}</p> : null}
          {section.primaryCtaLabel || section.secondaryCtaLabel ? (
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {section.primaryCtaLabel ? (
                <Link
                  href={normalizeSiteUrl(section.primaryCtaUrl || "/#final")}
                  className="inline-flex min-h-11 items-center justify-center rounded-pill bg-action px-7 py-3 text-sm font-semibold text-white transition hover:bg-action-blue focus-ring"
                >
                  {section.primaryCtaLabel}
                </Link>
              ) : null}
              {section.secondaryCtaLabel ? (
                <Link
                  href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog")}
                  className="inline-flex min-h-11 items-center justify-center rounded-pill border border-hairline bg-white px-7 py-3 text-sm font-semibold text-carbon transition hover:border-link-blue hover:text-link-blue focus-ring"
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

  return (
    <section className={`${isWash ? "bg-frost" : "bg-white"} py-16 md:py-20`}>
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <SectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-[1120px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={`${card.badge}-${card.title}`}
              className="flex min-h-[250px] flex-col rounded-card border border-hairline bg-white p-7"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-link-blue">{card.badge}</span>
              {card.title ? <h3 className="mt-5 text-xl font-semibold leading-tight text-carbon">{card.title}</h3> : null}
              {card.text ? <p className="mt-3 text-sm leading-relaxed text-ash">{card.text}</p> : null}
              {card.url && card.label ? (
                <Link
                  href={card.url}
                  className="mt-auto pt-6 text-sm font-semibold text-link-blue transition hover:text-action focus-ring"
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
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <SectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-[1120px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <article key={`${step.title}-${index}`} className="rounded-card border border-hairline bg-white p-7">
              <div className="text-sm font-semibold uppercase tracking-[0.08em] text-link-blue">
                {String(index + 1).padStart(2, "0")}
              </div>
              {step.title ? <h3 className="mt-4 text-xl font-semibold leading-tight text-carbon">{step.title}</h3> : null}
              {step.text ? <p className="mt-2 text-sm leading-relaxed text-ash">{step.text}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketingFaqSection({ section }: { section: PageSection }) {
  const items = faqItems(section.content.items);
  if (items.length === 0) return null;

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <SectionHeader section={section} />
        <div className="mx-auto mt-10 grid max-w-[880px] gap-3">
          {items.map((item) => (
            <details key={`${item.badge}-${item.title}`} className="group rounded-card border border-hairline bg-white">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 p-5 text-left marker:hidden md:items-center md:p-6">
                <span className="text-base font-semibold leading-snug text-carbon">{item.title}</span>
                <strong className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-link-blue">{item.badge}</strong>
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

function LegacyMarketingSection({ section }: { section: PageSection }) {
  const markup = renderMarketingSectionMarkup(section);
  if (!markup) return null;
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
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
  const renderedSection = isHeroSection(section)
    ? <MarketingHeroSection section={section} />
    : isVisualBandSection(section)
      ? <MarketingVisualBandSection section={section} />
    : isCompareSection(section)
      ? <MarketingCompareSection section={section} />
      : isLevelsSection(section)
        ? <MarketingLevelsSection section={section} />
        : isCardsSection(section)
          ? <MarketingCardsSection section={section} />
          : isStepsSection(section)
            ? <MarketingStepsSection section={section} />
            : isFaqSection(section)
              ? <MarketingFaqSection section={section} />
              : isPageCtaSection(section)
                ? <MarketingPageCtaSection section={section} />
                : <LegacyMarketingSection section={section} />;

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
