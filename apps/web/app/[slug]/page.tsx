import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingSectionRenderer } from "@/components/MarketingSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import { directusConfig, getNavigationItems, getPublishedDevices, getSitePage, getSiteSettings } from "@/lib/directus";
import {
  getFallbackMarketingPage,
  isMarketingSlug,
  marketingSectionsForRender,
  siteChrome,
} from "@/lib/site-renderer";

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
    slug === "store" ? getPublishedDevices() : Promise.resolve([]),
  ]);
  const chrome = siteChrome(settings, navigation);
  const sections = marketingSectionsForRender(slug, page?.sections);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        {sections.map((section) => (
          <MarketingSectionRenderer
            key={section.id || section.sectionKey}
            section={section}
            slug={slug}
            devices={devices}
            directusEnabled={directusConfig.enabled}
          />
        ))}
      </main>
    </SiteShell>
  );
}
