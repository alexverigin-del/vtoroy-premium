import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingSectionRenderer } from "@/components/MarketingSectionRenderer";
import { InfoPageSectionRenderer } from "@/components/InfoPageSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import { getNavigationItems, getSitePage, getSiteSettings } from "@/lib/directus";
import {
  getFallbackMarketingPage,
  isInfoSlug,
  isMarketingSlug,
  marketingSectionsForPage,
  siteChrome,
} from "@/lib/site-content";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";
import { getStoreLocation } from "@/lib/store-locations";
import { getAllPublishedV3ProductCards, getPublishedProducts } from "@/lib/product-catalog";
import { CityHubPage } from "@/components/CityHubPage";
import { getTradePublicConfig } from "@/lib/trade-server";
import { FinalCtaSection } from "@/components/FinalCtaSection";
import { isTradeManagedSection, TradePageSection } from "@/components/TradePageSection";
import { tradePrimaryCtaForRuntime } from "@/lib/marketing-cta";

export const revalidate = 300;

type MarketingPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return [
    { slug: "trade" },
    { slug: "passport" },
    { slug: "about" },
    { slug: "contacts" },
    { slug: "warranty" },
    { slug: "payment" },
    { slug: "privacy" },
    { slug: "terms" },
    { slug: "belgorod" },
  ];
}

export async function generateMetadata({ params }: MarketingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (location) {
    const description =
      location.metaDescription ||
      `I СВОИ · ${location.city}: локальное наличие техники и аксессуаров, самовывоз и доставка из других магазинов сети.`;
    return {
      title: location.seoTitle || `${location.name} — техника и аксессуары`,
      description,
      alternates: { canonical: `/${location.slug}` },
      openGraph: {
        title: location.seoTitle || location.name,
        description,
        url: `/${location.slug}`,
        images: [DEFAULT_SOCIAL_IMAGE],
      },
    };
  }
  if (!isMarketingSlug(slug) && !isInfoSlug(slug)) return {};

  const directusPage = await getSitePage(slug);
  const page = directusPage ?? (isMarketingSlug(slug) ? getFallbackMarketingPage(slug) : null);
  if (!page) return {};

  return {
    title: page.title,
    description: page.metaDescription,
    alternates: {
      canonical: `/${slug}`,
    },
    openGraph: {
      title: page.title,
      description: page.metaDescription,
      url: `/${slug}`,
      images: [page.ogImage || DEFAULT_SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.metaDescription,
      images: [page.ogImage || DEFAULT_SOCIAL_IMAGE],
    },
  };
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (location) {
    const [settings, navigation, catalog] = await Promise.all([
      getSiteSettings(),
      getNavigationItems(),
      getPublishedProducts({ city: location.slug, pageSize: 4 }),
    ]);
    const chrome = siteChrome(settings, navigation);
    return (
      <CityHubPage
        location={location}
        settings={chrome.settings}
        navigation={chrome.navigation}
        products={catalog.products}
      />
    );
  }
  if (!isMarketingSlug(slug) && !isInfoSlug(slug)) notFound();

  const [page, settings, navigation, products, tradeConfig] = await Promise.all([
    getSitePage(slug),
    getSiteSettings(),
    getNavigationItems(),
    isMarketingSlug(slug) ? getAllPublishedV3ProductCards() : Promise.resolve([]),
    slug === "trade" ? getTradePublicConfig() : Promise.resolve(undefined),
  ]);
  if (isInfoSlug(slug) && !page) notFound();
  const chrome = siteChrome(settings, navigation);
  const sourceSections = isMarketingSlug(slug)
    ? marketingSectionsForPage(slug, page?.sections)
    : (page?.sections ?? []).filter((section) => section.isActive);
  const sections = sourceSections.map((section) =>
    slug === "trade"
      ? {
          ...section,
          primaryCtaUrl: tradePrimaryCtaForRuntime(
            section.primaryCtaUrl,
            tradeConfig?.active === true,
          ),
        }
      : section,
  );
  const currentPage = page ?? (isMarketingSlug(slug) ? getFallbackMarketingPage(slug) : null);
  if (!currentPage) notFound();
  const firstVisualBandSection = sections.find((section) => section.variant === "visual.band");

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: currentPage.title, path: `/${slug}` },
              ]),
            ),
          }}
        />
        {sections.map((section) =>
          isMarketingSlug(slug) && slug === "trade" && isTradeManagedSection(section) ? (
            <TradePageSection
              key={section.id || section.sectionKey}
              section={section}
              products={products}
              tradeConfig={tradeConfig}
            />
          ) : isMarketingSlug(slug) &&
            slug === "trade" &&
            (section.variant === "page.cta" || section.sectionKey === "final_cta") ? (
            <FinalCtaSection
              key={section.id || section.sectionKey}
              section={section}
              source="trade_page"
            />
          ) : isMarketingSlug(slug) ? (
            <MarketingSectionRenderer
              key={section.id || section.sectionKey}
              section={section}
              slug={slug}
              products={products}
              priorityVisual={section === firstVisualBandSection}
            />
          ) : (
            <InfoPageSectionRenderer key={section.id || section.sectionKey} section={section} />
          ),
        )}
      </main>
    </SiteShell>
  );
}
