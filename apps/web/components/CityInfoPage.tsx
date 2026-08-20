import Link from "next/link";
import type { NavigationItem, SiteSettings, StoreLocation } from "@vtoroy/shared";

import { SiteShell } from "./SiteShell";
import { brandZoneEyebrowClass, primaryPillCtaClass } from "./ui-classes";

export function CityInfoPage({
  location,
  navigation,
  settings,
  variant,
}: {
  location: StoreLocation;
  navigation: NavigationItem[];
  settings: SiteSettings;
  variant: "contacts" | "delivery";
}) {
  const contacts = variant === "contacts";
  return (
    <SiteShell settings={settings} navigation={navigation}>
      <main id="top" className="bg-white">
        <section className="mx-auto max-w-content px-6 py-16 md:py-24">
          <p className={brandZoneEyebrowClass}>I СВОИ · {location.city}</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-carbon md:text-6xl">
            {contacts ? "Контакты и визит в магазин." : "Получение и доставка."}
          </h1>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {contacts ? (
              <>
                <article className="rounded-card border border-hairline bg-frost p-6">
                  <h2 className="text-xl font-semibold">Магазин</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {location.address || "Точный адрес уточняется перед визитом."}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {location.businessHours || "Часы работы уточняются перед визитом."}
                  </p>
                </article>
                <article className="rounded-card border border-hairline p-6">
                  <h2 className="text-xl font-semibold">Связаться</h2>
                  <div className="mt-4 grid gap-2 text-sm font-medium text-accent">
                    {location.phone ? <a href={`tel:${location.phone}`}>{location.phone}</a> : null}
                    {location.telegram ? <span>{location.telegram}</span> : null}
                    {location.email ? (
                      <a href={`mailto:${location.email}`}>{location.email}</a>
                    ) : null}
                    {!location.phone && !location.telegram && !location.email ? (
                      <p className="font-normal text-muted">Контакты обновляются.</p>
                    ) : null}
                  </div>
                </article>
              </>
            ) : (
              <>
                <article className="rounded-card border border-hairline bg-frost p-6">
                  <h2 className="text-xl font-semibold">Самовывоз</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {location.pickupEnabled
                      ? `Доступен из магазина в городе ${location.city} после подтверждения резерва.`
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
              </>
            )}
          </div>
          <div className="mt-10">
            <Link href={`/${location.slug}/catalog`} className={primaryPillCtaClass}>
              Смотреть каталог города
            </Link>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
