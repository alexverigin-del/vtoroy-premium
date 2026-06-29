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

function LegacyMarketingSection({ section }: { section: PageSection }) {
  const markup = renderMarketingSectionMarkup(section);
  if (!markup) return null;
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}

function isHeroSection(section: PageSection): boolean {
  return section.variant === "page.hero" || section.sectionKey.endsWith("_hero");
}

export function MarketingSectionRenderer({
  section,
  slug,
  devices = [],
  directusEnabled,
}: MarketingSectionRendererProps) {
  const renderedSection = isHeroSection(section)
    ? <MarketingHeroSection section={section} />
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
