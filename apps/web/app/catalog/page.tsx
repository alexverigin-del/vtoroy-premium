import type { Metadata } from "next";
import { CatalogGrid } from "@/components/CatalogGrid";
import { SiteShell } from "@/components/SiteShell";
import {
  directusConfig,
  getNavigationItems,
  getPublishedDeviceCards,
  getSitePage,
  getSiteSettings,
} from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { breadcrumbJsonLd, catalogItemListJsonLd, jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";

const fallbackTitle = "I СВОИ Store — вещи в кругу";
const fallbackDescription =
  "Проверенные вещи с I СВОИ Passport, гарантией и понятной ценой выхода. Сейчас в наличии в кругу I СВОИ.";

function catalogSection(page: Awaited<ReturnType<typeof getSitePage>>) {
  return (
    page?.sections.find(
      (section) =>
        section.isActive &&
        (section.sectionKey === "catalog_page_live" || section.variant === "catalog.grid"),
    ) ?? null
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("catalog");
  const title = page?.title || fallbackTitle;
  const description = page?.metaDescription || fallbackDescription;
  const image = page?.ogImage || DEFAULT_SOCIAL_IMAGE;

  return {
    title,
    description,
    alternates: {
      canonical: "/catalog",
    },
    openGraph: {
      title,
      description,
      url: "/catalog",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

// Public catalog content is ISR-cached; Directus Studio edits refresh on the next 5-minute revalidation.
export const revalidate = 300;

export default async function CatalogPage() {
  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage("catalog"),
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
        <CatalogGrid
          devices={devices}
          directusEnabled={directusConfig.enabled}
          section={catalogSection(page)}
        />
      </main>
    </SiteShell>
  );
}
