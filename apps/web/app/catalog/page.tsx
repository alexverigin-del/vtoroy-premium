import { CatalogGrid } from "@/components/CatalogGrid";
import { SiteShell } from "@/components/SiteShell";
import {
  directusConfig,
  getNavigationItems,
  getPublishedDeviceCards,
  getSiteSettings,
} from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { breadcrumbJsonLd, catalogItemListJsonLd, jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";

export const metadata = {
  title: "I СВОИ Store — вещи в кругу",
  description:
    "Проверенные вещи с I СВОИ Passport, гарантией и понятной ценой выхода. Сейчас в наличии в кругу I СВОИ.",
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "I СВОИ Store — вещи в кругу",
    description: "Проверенные вещи с I СВОИ Passport, гарантией и понятной ценой выхода.",
    url: "/catalog",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "I СВОИ Store — вещи в кругу",
    description: "Проверенные вещи с I СВОИ Passport, гарантией и понятной ценой выхода.",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

// Keep Directus catalog edits visible immediately while inventory is being filled.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogPage() {
  const [settings, navigation, devices] = await Promise.all([
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDeviceCards(),
  ]);
  const chrome = siteChrome(settings, navigation);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: "Каталог", path: "/catalog" },
              ]),
            ),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(catalogItemListJsonLd(devices)) }}
        />
        <CatalogGrid devices={devices} directusEnabled={directusConfig.enabled} />
      </main>
    </SiteShell>
  );
}
