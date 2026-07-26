import type { Metadata } from "next";
import { MarketingSectionRenderer } from "@/components/MarketingSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import {
  ClubCycleSection,
  ClubFinalSection,
  ClubHeroSection,
  ClubOfferSection,
  ClubPassportCycleSection,
  ClubPlansSection,
  ClubRulesSection,
} from "@/components/ClubLandingSections";
import { getNavigationItems, getSitePage, getSiteSettings } from "@/lib/directus";
import { getClubPageData } from "@/lib/club";
import { clubChrome, getFallbackMarketingPage, marketingSectionsForPage } from "@/lib/site-content";
import { jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";

const CLUB_SUBDOMAIN_URL = "https://club.isvoi.ru/";
const CLUB_MAIN_FALLBACK_URL = "https://isvoi.ru/club";

function clubCanonicalUrl() {
  return process.env.CLUB_SUBDOMAIN_ENABLED === "1" ? CLUB_SUBDOMAIN_URL : CLUB_MAIN_FALLBACK_URL;
}

export const revalidate = 300;

function clubBreadcrumbJsonLd(title: string) {
  const url = clubCanonicalUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: title,
        item: url,
      },
    ],
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const directusPage = await getSitePage("club");
  const page = directusPage ?? getFallbackMarketingPage("club");
  const canonicalUrl = clubCanonicalUrl();

  return {
    title: page.title,
    description: page.metaDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: page.title,
      description: page.metaDescription,
      url: canonicalUrl,
      images: [page.ogImage || DEFAULT_SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.metaDescription,
      images: [page.ogImage || DEFAULT_SOCIAL_IMAGE],
    },
  };
}

export default async function ClubPage() {
  const [page, settings, navigation, clubData] = await Promise.all([
    getSitePage("club"),
    getSiteSettings(),
    getNavigationItems(),
    getClubPageData(),
  ]);
  const currentPage = page ?? getFallbackMarketingPage("club");
  const sections = marketingSectionsForPage("club", currentPage.sections);
  const heroSection =
    sections.find((section) => section.sectionKey === "club_hero") ??
    sections.find(
      (section) => section.variant === "page.hero" || section.variant === "hero.static",
    );
  const faqSection = sections.find(
    (section) => section.sectionKey === "faq" || section.variant === "faq",
  );
  const chrome = clubChrome(settings, navigation);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(clubBreadcrumbJsonLd(currentPage.title)),
          }}
        />
        <ClubHeroSection section={heroSection} settings={clubData.settings} />
        <ClubOfferSection offers={clubData.offers} settings={clubData.settings} />
        <ClubCycleSection />
        <ClubPassportCycleSection />
        <ClubPlansSection plans={clubData.plans} settings={clubData.settings} />
        <ClubRulesSection rules={clubData.rules} settings={clubData.settings} />
        {faqSection ? <MarketingSectionRenderer section={faqSection} slug="club" /> : null}
        <ClubFinalSection
          settings={clubData.settings}
          offers={clubData.offers}
          plans={clubData.plans}
        />
      </main>
    </SiteShell>
  );
}
