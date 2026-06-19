import Script from "next/script";
import { getNavigationItems, getSitePage, getSiteSettings } from "@/lib/directus";
import { renderHomeMarkup, siteChrome } from "@/lib/site-renderer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [page, settings, navigation] = await Promise.all([
    getSitePage("home"),
    getSiteSettings(),
    getNavigationItems(),
  ]);

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260616a" />
      <div dangerouslySetInnerHTML={{ __html: renderHomeMarkup(page?.sections, siteChrome(settings, navigation)) }} />
      <Script src="/data/devices.js?v=20260616a" strategy="afterInteractive" />
      <Script src="/script.js?v=20260617intake" strategy="afterInteractive" />
    </>
  );
}
