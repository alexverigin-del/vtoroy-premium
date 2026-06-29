import Link from "next/link";
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

function strField(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
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

function LegacyMarketingSection({ section }: { section: PageSection }) {
  const markup = renderMarketingSectionMarkup(section);
  if (!markup) return null;
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}

function isHeroSection(section: PageSection): boolean {
  return section.variant === "page.hero" || section.sectionKey.endsWith("_hero");
}

function isCardsSection(section: PageSection): boolean {
  if (section.variant === "faq" || section.sectionKey === "faq") return false;
  return Boolean(section.variant === "cards.grid" || section.content.cards);
}

function isStepsSection(section: PageSection): boolean {
  return section.variant === "steps" || section.sectionKey.endsWith("_steps");
}

export function MarketingSectionRenderer({
  section,
  slug,
  devices = [],
  directusEnabled,
}: MarketingSectionRendererProps) {
  const renderedSection = isHeroSection(section)
    ? <MarketingHeroSection section={section} />
    : isCardsSection(section)
      ? <MarketingCardsSection section={section} />
      : isStepsSection(section)
        ? <MarketingStepsSection section={section} />
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
