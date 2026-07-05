import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingSectionRenderer } from "@/components/MarketingSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import {
  getNavigationItems,
  getPublishedDeviceCards,
  getSitePage,
  getSiteSettings,
} from "@/lib/directus";
import {
  getFallbackMarketingPage,
  isMarketingSlug,
  marketingSectionsForPage,
  siteChrome,
} from "@/lib/site-content";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";

export const dynamic = "force-dynamic";

type MarketingPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return [{ slug: "store" }, { slug: "trade" }, { slug: "passport" }, { slug: "club" }];
}

export async function generateMetadata({ params }: MarketingPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isMarketingSlug(slug)) return {};

  const [directusPage, fallbackPage] = await Promise.all([
    getSitePage(slug),
    Promise.resolve(getFallbackMarketingPage(slug)),
  ]);
  const page = directusPage ?? fallbackPage;

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
  if (!isMarketingSlug(slug)) notFound();

  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage(slug),
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDeviceCards(),
  ]);
  const chrome = siteChrome(settings, navigation);
  const sections = marketingSectionsForPage(slug, page?.sections);
  const currentPage = page ?? getFallbackMarketingPage(slug);
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
        {sections.map((section) => (
          <MarketingSectionRenderer
            key={section.id || section.sectionKey}
            section={section}
            slug={slug}
            devices={devices}
            priorityVisual={section === firstVisualBandSection}
          />
        ))}
      </main>
    </SiteShell>
  );
}
