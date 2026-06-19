import Script from "next/script";
import { getNavigationItems, getPublishedDevices, getSitePage, getSiteSettings } from "@/lib/directus";
import { renderHomeMarkup, siteChrome } from "@/lib/site-renderer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage("home"),
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDevices(),
  ]);

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260616a" />
      <div dangerouslySetInnerHTML={{ __html: renderHomeMarkup(page?.sections, siteChrome(settings, navigation), devices) }} />
      <Script src="/interactions.js?v=20260619catalog" strategy="afterInteractive" />
    </>
  );
}
