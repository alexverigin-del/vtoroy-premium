import { CatalogGrid } from "@/components/CatalogGrid";
import { SiteShell } from "@/components/SiteShell";
import { directusConfig, getNavigationItems, getPublishedDevices, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";

export const metadata = {
  title: "ISVOI Store — вещи в кругу",
  description:
    "Проверенные вещи с ISVOI Passport, гарантией и понятной ценой выхода. Сейчас в наличии в кругу ISVOI.",
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "ISVOI Store — вещи в кругу",
    description:
      "Проверенные вещи с ISVOI Passport, гарантией и понятной ценой выхода.",
    url: "/catalog",
  },
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
  const chrome = siteChrome(settings, navigation);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <CatalogGrid devices={devices} directusEnabled={directusConfig.enabled} />
      </main>
    </SiteShell>
  );
}
