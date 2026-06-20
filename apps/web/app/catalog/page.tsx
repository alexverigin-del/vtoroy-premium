import Script from "next/script";
import { directusConfig, getNavigationItems, getPublishedDevices, getSiteSettings } from "@/lib/directus";
import { renderCatalogPageMarkup, siteChrome } from "@/lib/site-renderer";

export const metadata = {
  title: "ISVOI Store — вещи в кругу",
  description:
    "Проверенные вещи с ISVOI Passport, гарантией и понятной ценой выхода. Сейчас в наличии в кругу ISVOI.",
};

// Keep Directus catalog edits visible immediately while inventory is being filled.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogPage() {
  const [settings, navigation, devices] = await Promise.all([
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDevices(),
  ]);

  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260620catalogcore" />
      <div
        dangerouslySetInnerHTML={{
          __html: renderCatalogPageMarkup(siteChrome(settings, navigation), devices, directusConfig.enabled),
        }}
      />
      <Script src="/interactions.js?v=20260620catalogcore" strategy="afterInteractive" />
    </>
  );
}
