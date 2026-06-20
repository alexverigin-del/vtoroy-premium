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
  params: {
    slug: string;
  };
};

export function generateStaticParams() {
  return [{ slug: "store" }, { slug: "trade" }, { slug: "passport" }, { slug: "club" }];
}

export async function generateMetadata({ params }: MarketingPageProps): Promise<Metadata> {
  if (!isMarketingSlug(params.slug)) return {};

  const [directusPage, fallbackPage] = await Promise.all([
    getSitePage(params.slug),
    Promise.resolve(getFallbackMarketingPage(params.slug)),
  ]);
  const page = directusPage ?? fallbackPage;

  return {
    title: page.title,
    description: page.metaDescription,
  };
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  if (!isMarketingSlug(params.slug)) notFound();

  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage(params.slug),
    getSiteSettings(),
    getNavigationItems(),
    params.slug === "store" ? getPublishedDevices() : Promise.resolve([]),
  ]);

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260620catalogcore" />
      <div
        dangerouslySetInnerHTML={{
          __html: renderMarketingPageMarkup(params.slug, page, siteChrome(settings, navigation), devices),
        }}
      />
      <Script src="/interactions.js?v=20260620catalogcore" strategy="afterInteractive" />
    </>
  );
}
