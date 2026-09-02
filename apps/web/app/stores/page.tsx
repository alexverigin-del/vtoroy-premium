import Link from "next/link";

import { SiteShell } from "@/components/SiteShell";
import { brandZoneEyebrowClass } from "@/components/ui-classes";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { getStoreLocations } from "@/lib/store-locations";
import { storesMetadata } from "@/lib/seo-metadata";

export const metadata = storesMetadata;

export const revalidate = 300;

export default async function StoresPage() {
  const [locations, settings, navigation] = await Promise.all([
    getStoreLocations(),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  const chrome = siteChrome(settings, navigation);
  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <section className="mx-auto max-w-shell px-5 py-16 md:py-24">
          <p className={brandZoneEyebrowClass}>I СВОИ · Магазины</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-carbon md:text-6xl">
            Выберите свой город.
          </h1>
          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {locations.map((location) => (
              <li key={location.id}>
                <Link
                  href={`/${location.slug}`}
                  className="block rounded-card border border-hairline bg-frost p-6 transition hover:border-action-blue hover:bg-white"
                >
                  <p className="text-xs font-medium uppercase tracking-eyebrow text-muted">
                    Действующий магазин
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-carbon">{location.city}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {location.address || "Адрес уточняется перед визитом"}
                  </p>
                  <span className="mt-5 inline-flex text-sm font-medium text-accent">
                    Открыть город →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </SiteShell>
  );
}
