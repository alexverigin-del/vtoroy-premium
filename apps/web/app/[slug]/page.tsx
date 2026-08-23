import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingSectionRenderer } from "@/components/MarketingSectionRenderer";
import { InfoPageSectionRenderer } from "@/components/InfoPageSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import {
  getNavigationItems,
  getPublishedDeviceCards,
  getSitePage,
  getSiteSettings,
} from "@/lib/directus";
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
import { getPublishedProducts } from "@/lib/product-catalog";
import { CityHubPage } from "@/components/CityHubPage";

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

  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage(slug),
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDeviceCards(),
  ]);
  if (isInfoSlug(slug) && !page) notFound();
  const chrome = siteChrome(settings, navigation);
  const sections = isMarketingSlug(slug)
    ? marketingSectionsForPage(slug, page?.sections)
    : (page?.sections ?? []).filter((section) => section.isActive);
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
          isMarketingSlug(slug) ? (
            <MarketingSectionRenderer
              key={section.id || section.sectionKey}
              section={section}
              slug={slug}
              devices={devices}
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
