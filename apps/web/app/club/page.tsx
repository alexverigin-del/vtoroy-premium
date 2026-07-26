import type { Metadata } from "next";
import { MarketingSectionRenderer } from "@/components/MarketingSectionRenderer";
import { SiteShell } from "@/components/SiteShell";
import {
  ClubCycleSection,
  ClubFinalSection,
  ClubHeroSection,
  ClubLegalSection,
  ClubOfferSection,
  ClubParticipationSection,
  ClubPassportCycleSection,
  ClubPlansSection,
  ClubRulesSection,
} from "@/components/ClubLandingSections";
import { getNavigationItems, getSitePage, getSiteSettings } from "@/lib/directus";
import { getClubPageData, isClubIndexingEnabled } from "@/lib/club";
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
  const [directusPage, clubData] = await Promise.all([getSitePage("club"), getClubPageData()]);
  const page = directusPage ?? getFallbackMarketingPage("club");
  const canonicalUrl = clubCanonicalUrl();
  const indexable = isClubIndexingEnabled(clubData.settings);

  return {
    title: page.title,
    description: page.metaDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: {
        index: indexable,
        follow: indexable,
      },
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

export default async function ClubPage({
  searchParams,
}: {
  searchParams?: Promise<{ club_offer?: string | string[] }>;
}) {
  const [page, settings, navigation, clubData] = await Promise.all([
    getSitePage("club"),
    getSiteSettings(),
    getNavigationItems(),
    getClubPageData(),
  ]);
  const currentPage = page ?? getFallbackMarketingPage("club");
  const sections = marketingSectionsForPage("club", currentPage.sections);
  const faqSection = sections.find(
    (section) => section.sectionKey === "faq" || section.variant === "faq",
  );
  const chrome = clubChrome(settings, navigation);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedOffer = resolvedSearchParams.club_offer;
  const selectedOfferId = Array.isArray(requestedOffer) ? requestedOffer[0] : requestedOffer;
  const passportItems = clubData.processes.filter((item) => item.group === "passport");

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(clubBreadcrumbJsonLd(currentPage.title)),
          }}
        />
        <ClubHeroSection settings={clubData.settings} passportItems={passportItems} />
        <ClubOfferSection offers={clubData.offers} settings={clubData.settings} />
        <ClubCycleSection settings={clubData.settings} items={clubData.processes} />
        <ClubPassportCycleSection settings={clubData.settings} items={clubData.processes} />
        <ClubPlansSection plans={clubData.plans} settings={clubData.settings} />
        <ClubRulesSection rules={clubData.rules} settings={clubData.settings} />
        <ClubParticipationSection settings={clubData.settings} items={clubData.processes} />
        {faqSection ? <MarketingSectionRenderer section={faqSection} slug="club" /> : null}
        <ClubLegalSection settings={clubData.settings} documents={clubData.legalDocuments} />
        <ClubFinalSection
          settings={clubData.settings}
          offers={clubData.offers}
          plans={clubData.plans}
          selectedOfferId={selectedOfferId}
        />
      </main>
    </SiteShell>
  );
}
