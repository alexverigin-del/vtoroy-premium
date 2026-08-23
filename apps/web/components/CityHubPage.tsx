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
              <p className={brandZoneEyebrowClass}>I СВОИ · {location.city}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-carbon md:text-6xl">
                {location.heroTitle || `Техника и аксессуары I СВОИ в городе ${location.city}.`}
              </h1>
              <p className="mt-6 max-w-2xl text-copy leading-relaxed text-graphite">
                {location.heroBody ||
                  "Локальное наличие, проверенные б/у устройства и доставка товаров из других магазинов сети."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={`/${location.slug}/catalog`} className={primaryPillCtaClass}>
                  Смотреть каталог города
                </Link>
                <Link href={`/${location.slug}/contacts`} className={secondaryPillCtaClass}>
                  Контакты и часы
                </Link>
              </div>
            </div>

            <aside className="rounded-card border border-hairline bg-white p-6 shadow-soft lg:col-span-2">
              <p className="text-xs font-medium uppercase tracking-eyebrow text-muted">Магазин</p>
              <h2 className="mt-3 text-2xl font-semibold text-carbon">{location.name}</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <div>
                  <dt className="text-muted">Адрес</dt>
                  <dd className="mt-1 font-medium text-carbon">
                    {location.address || "Точный адрес уточняется перед визитом"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Часы работы</dt>
                  <dd className="mt-1 font-medium text-carbon">
                    {location.businessHours || "Уточняются перед визитом"}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium text-accent">
                {location.phone ? <a href={`tel:${location.phone}`}>Позвонить</a> : null}
                {telegramHref ? <a href={telegramHref}>Telegram</a> : null}
                {location.mapUrl ? <a href={location.mapUrl}>Открыть карту</a> : null}
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
              <p className={brandZoneEyebrowClass}>Локальное наличие</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-carbon md:text-4xl">
                Сначала — товары в городе {location.city}.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                Остальные позиции показываем отдельно, если их можно доставить из другой точки.
              </p>
            </div>
            <Link href={`/${location.slug}/catalog`} className={secondaryPillCtaClass}>
              Открыть весь каталог
            </Link>
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
              <h3 className="text-xl font-semibold text-carbon">Локальный каталог обновляется</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Товары появятся после подтверждения цены и остатка для этой точки.
              </p>
            </div>
          )}
        </section>
      </main>
    </SiteShell>
  );
}
