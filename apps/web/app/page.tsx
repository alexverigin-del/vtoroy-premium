import type { Metadata } from "next";
import Script from "next/script";
import { getNavigationItems, getPublishedDevices, getSitePage, getSiteSettings } from "@/lib/directus";
import { renderHomeMarkup, siteChrome } from "@/lib/site-renderer";
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_TITLE } from "./site-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("home");
  const title = page?.title || DEFAULT_SITE_TITLE;
  const description = page?.metaDescription || DEFAULT_SITE_DESCRIPTION;

  return {
    title,
    description,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title,
      description,
      url: "/",
      ...(page?.ogImage ? { images: [page.ogImage] } : {}),
    },
    twitter: {
      title,
      description,
      ...(page?.ogImage ? { images: [page.ogImage] } : {}),
    },
  };
}

export default async function HomePage() {
  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage("home"),
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDevices(),
  ]);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: renderHomeMarkup(page?.sections, siteChrome(settings, navigation), devices) }} />
      <Script src="/interactions.js?v=20260620catalogcore" strategy="afterInteractive" />
    </>
  );
}
