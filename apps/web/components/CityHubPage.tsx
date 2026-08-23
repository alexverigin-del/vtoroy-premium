import Image from "next/image";
import Link from "next/link";
import type { NavigationItem, ProductCardData, SiteSettings, StoreLocation } from "@vtoroy/shared";

import { breadcrumbJsonLd, jsonLdScript, localBusinessJsonLd } from "@/lib/structured-data";
import { ProductCard } from "./ProductCard";
import { SiteShell } from "./SiteShell";
import { brandZoneEyebrowClass, primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

export function CityHubPage({
  location,
  navigation,
  products,
  settings,
}: {
  location: StoreLocation;
  navigation: NavigationItem[];
  products: ProductCardData[];
  settings: SiteSettings;
}) {
  const telegramHref = location.telegram
    ? /^https?:\/\//i.test(location.telegram)
      ? location.telegram
      : `https://t.me/${location.telegram.replace(/^@/, "")}`
    : "";

  return (
    <SiteShell settings={settings} navigation={navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(localBusinessJsonLd(location, settings)),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: location.city, path: `/${location.slug}` },
              ]),
            ),
          }}
        />

        <section className="border-b border-hairline bg-frost py-16 md:py-24">
          <div className="mx-auto grid max-w-shell gap-10 px-5 lg:grid-cols-5 lg:items-end">
            <div className="lg:col-span-3">
              {location.heroEyebrow ? (
                <p className={brandZoneEyebrowClass}>{location.heroEyebrow}</p>
              ) : null}
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-carbon md:text-6xl">
                {location.heroTitle || `${location.city} · Техника и аксессуары I СВОИ.`}
              </h1>
              <p className="mt-6 max-w-2xl text-copy leading-relaxed text-graphite">
                {location.heroBody ||
                  "Локальное наличие, проверенная техника с пробегом и доставка товаров из других магазинов сети."}
              </p>
              {location.heroPrimaryCtaLabel || location.heroSecondaryCtaLabel ? (
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {location.heroPrimaryCtaLabel ? (
                    <Link href={`/${location.slug}/catalog`} className={primaryPillCtaClass}>
                      {location.heroPrimaryCtaLabel}
                    </Link>
                  ) : null}
                  {location.heroSecondaryCtaLabel ? (
                    <Link href="#store-contacts" className={secondaryPillCtaClass}>
                      {location.heroSecondaryCtaLabel}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <aside
              id="store-contacts"
              className="scroll-mt-24 rounded-card border border-hairline bg-white p-6 shadow-soft lg:col-span-2"
            >
              {location.contactEyebrow ? (
                <p className="text-xs font-medium uppercase tracking-eyebrow text-muted">
                  {location.contactEyebrow}
                </p>
              ) : null}
              <h2 className="mt-3 text-2xl font-semibold text-carbon">{location.name}</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                {location.address || location.contactAddressFallback ? (
                  <div>
                    {location.contactAddressLabel ? (
                      <dt className="text-muted">{location.contactAddressLabel}</dt>
                    ) : null}
                    <dd className="mt-1 font-medium text-carbon">
                      {location.address || location.contactAddressFallback}
                    </dd>
                  </div>
                ) : null}
                {location.businessHours || location.contactHoursFallback ? (
                  <div>
                    {location.contactHoursLabel ? (
                      <dt className="text-muted">{location.contactHoursLabel}</dt>
                    ) : null}
                    <dd className="mt-1 font-medium text-carbon">
                      {location.businessHours || location.contactHoursFallback}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium text-accent">
                {location.phone ? (
                  <a href={`tel:${location.phone}`}>
                    {location.contactPhoneLabel || location.phone}
                  </a>
                ) : null}
                {telegramHref ? (
                  <a href={telegramHref}>{location.contactTelegramLabel || location.telegram}</a>
                ) : null}
                {location.mapUrl && location.contactMapLabel ? (
                  <a href={location.mapUrl}>{location.contactMapLabel}</a>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        {location.heroImage ? (
          <section
            className="border-b border-hairline bg-white py-10 md:py-14"
            data-component="CityStorePhoto"
          >
            <div className="mx-auto max-w-shell px-5">
              <figure className="relative aspect-video overflow-hidden rounded-card bg-frost">
                <Image
                  src={location.heroImage}
                  alt={location.heroTitle || location.name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1180px) 1180px, 92vw"
                />
              </figure>
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-shell px-5 py-16 md:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {location.catalogEyebrow ? (
                <p className={brandZoneEyebrowClass}>{location.catalogEyebrow}</p>
              ) : null}
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-carbon md:text-4xl">
                {location.catalogTitle || location.city}
              </h2>
              {location.catalogBody ? (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                  {location.catalogBody}
                </p>
              ) : null}
            </div>
            {location.catalogCtaLabel ? (
              <Link href={`/${location.slug}/catalog`} className={secondaryPillCtaClass}>
                {location.catalogCtaLabel}
              </Link>
            ) : null}
          </div>

          {products.length > 0 ? (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.slice(0, 4).map((product, index) => (
                <li key={product.id}>
                  <ProductCard product={product} imagePriority={index < 2} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-8 rounded-card border border-hairline bg-frost p-8">
              {location.catalogEmptyTitle ? (
                <h3 className="text-xl font-semibold text-carbon">{location.catalogEmptyTitle}</h3>
              ) : null}
              {location.catalogEmptyBody ? (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {location.catalogEmptyBody}
                </p>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </SiteShell>
  );
}
