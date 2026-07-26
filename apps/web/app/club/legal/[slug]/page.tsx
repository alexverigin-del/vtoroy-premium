import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteShell } from "@/components/SiteShell";
import { secondaryCtaClass } from "@/components/ui-classes";
import { getClubLegalDocument, getClubPageData, isClubIndexingEnabled } from "@/lib/club";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { cn } from "@/lib/cn";
import { clubChrome } from "@/lib/site-content";

type LegalPageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [document, clubData] = await Promise.all([getClubLegalDocument(slug), getClubPageData()]);
  if (!document) return {};
  const indexable = isClubIndexingEnabled(clubData.settings) && document.legalReviewed;
  const canonical = `https://club.isvoi.ru/legal/${document.slug}`;

  return {
    title: `${document.title} — I СВОИ Club`,
    description: document.summary,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
  };
}

export default async function ClubLegalPage({ params }: LegalPageProps) {
  const { slug } = await params;
  const [document, settings, navigation] = await Promise.all([
    getClubLegalDocument(slug),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  if (!document) notFound();
  const chrome = clubChrome(settings, navigation);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white py-16 md:py-24">
        <article className="mx-auto max-w-copy-wide px-5">
          <Link href="/" className="text-sm font-semibold text-link-blue">
            I СВОИ Club
          </Link>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-carbon md:text-6xl">
            {document.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-graphite">{document.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted">
            {document.version ? <span>Версия {document.version}</span> : null}
            {document.effectiveDate ? <span>Действует с {document.effectiveDate}</span> : null}
          </div>
          {document.body ? (
            <div className="mt-10 whitespace-pre-line text-base leading-relaxed text-graphite">
              {document.body}
            </div>
          ) : null}
          {document.fileUrl ? (
            <a
              href={document.fileUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(secondaryCtaClass, "mt-8")}
            >
              Открыть файл
            </a>
          ) : null}
        </article>
      </main>
    </SiteShell>
  );
}
