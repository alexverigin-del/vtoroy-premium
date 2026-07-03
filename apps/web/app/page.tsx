import type { Metadata } from "next";
import { HomeSectionRenderer } from "@/components/HomeSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import {
  getNavigationItems,
  getPublishedDeviceCards,
  getSitePage,
  getSiteSettings,
} from "@/lib/directus";
import { homeSectionsForPage, siteChrome } from "@/lib/site-content";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  DEFAULT_SOCIAL_IMAGE,
} from "./site-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("home");
  const title = page?.title || DEFAULT_SITE_TITLE;
  const description = page?.metaDescription || DEFAULT_SITE_DESCRIPTION;
  const socialImage = page?.ogImage || DEFAULT_SOCIAL_IMAGE;

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
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default async function HomePage() {
  const [page, settings, navigation, devices] = await Promise.all([
    getSitePage("home"),
    getSiteSettings(),
    getNavigationItems(),
    getPublishedDeviceCards(),
  ]);
  const chrome = siteChrome(settings, navigation);
  const sections = homeSectionsForPage(page?.sections);

  return (
    <>
      <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
        <main id="top">
          {sections.map((section) => (
            <HomeSectionRenderer
              key={section.id || section.sectionKey}
              section={section}
              devices={devices}
            />
          ))}
        </main>
      </SiteShell>
    </>
  );
}
