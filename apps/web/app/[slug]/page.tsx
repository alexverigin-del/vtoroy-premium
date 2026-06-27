import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { getNavigationItems, getPublishedDevices, getSitePage, getSiteSettings } from "@/lib/directus";
import {
  getFallbackMarketingPage,
  isMarketingSlug,
  renderMarketingPageMarkup,
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

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260620catalogcore" />
      <div
        dangerouslySetInnerHTML={{
          __html: renderMarketingPageMarkup(slug, page, siteChrome(settings, navigation), devices),
        }}
      />
      <Script src="/interactions.js?v=20260620catalogcore" strategy="afterInteractive" />
    </>
  );
}
