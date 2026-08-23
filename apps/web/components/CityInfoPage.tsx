import Link from "next/link";
import type { NavigationItem, SiteSettings, StoreLocation } from "@vtoroy/shared";

import { SiteShell } from "./SiteShell";
import { brandZoneEyebrowClass, primaryPillCtaClass } from "./ui-classes";

export function CityInfoPage({
  location,
  navigation,
  settings,
}: {
  location: StoreLocation;
  navigation: NavigationItem[];
  settings: SiteSettings;
}) {
  return (
    <SiteShell settings={settings} navigation={navigation}>
      <main id="top" className="bg-white">
        <section className="mx-auto max-w-content px-6 py-16 md:py-24">
          <p className={brandZoneEyebrowClass}>I СВОИ · {location.city}</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-carbon md:text-6xl">
            Получение и доставка.
          </h1>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className="rounded-card border border-hairline bg-frost p-6">
              <h2 className="text-xl font-semibold">Самовывоз</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {location.pickupEnabled
                  ? `Доступен в магазине I СВОИ · ${location.city} после подтверждения резерва.`
                  : "Самовывоз для этой точки пока недоступен."}
              </p>
            </article>
            <article className="rounded-card border border-hairline p-6">
              <h2 className="text-xl font-semibold">Из другого города</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {location.intercityDeliveryEnabled
                  ? "Доступные предложения других магазинов отмечаются в каталоге вместе со сроком доставки."
                  : "Межгородская доставка для этой точки пока недоступна."}
              </p>
            </article>
          </div>
          <div className="mt-10">
            <Link href={`/${location.slug}/catalog`} className={primaryPillCtaClass}>
              Каталог · {location.city}
            </Link>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
