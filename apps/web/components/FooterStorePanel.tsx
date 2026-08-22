"use client";

import Link from "next/link";
import type { SiteSettings, StoreLocation } from "@vtoroy/shared";

import { cn } from "../lib/cn";
import { useCity } from "./CityContext";

const contactLinkClass =
  "inline-flex min-h-11 items-center text-base font-medium text-carbon outline-none transition hover:text-link-blue focus-visible:shadow-focus";

function phoneHref(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

function telegramHref(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://t.me/${value.replace(/^@/, "")}`;
}

function valueOrFallback(
  locationValue: string | undefined,
  fallbackValue: string | undefined,
  allowFallback: boolean,
): string | undefined {
  return locationValue || (allowFallback ? fallbackValue : undefined);
}

function cityLabel(template: string, city: string): string {
  return template
    .replaceAll("{city}", city)
    .replace(/\s*·\s*$/, "")
    .trim();
}

function NetworkLocations({
  locations,
  settings,
}: {
  locations: StoreLocation[];
  settings: SiteSettings;
}) {
  return (
    <section className="border-b border-hairline py-10 md:py-12" aria-label="Магазины I СВОИ">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="text-sm font-semibold leading-snug text-link-blue">
            {settings.footerNetworkEyebrow || "I СВОИ · магазины"}
          </p>
          <h2 className="mt-3 max-w-heading text-2xl font-semibold leading-tight text-carbon md:text-3xl">
            {settings.footerNetworkTitle || "Адрес, контакты и реквизиты зависят от города."}
          </h2>
          <p className="mt-3 max-w-copy text-sm leading-relaxed text-graphite">
            {settings.footerNetworkBody ||
              "Выберите магазин, чтобы увидеть актуальные данные перед визитом."}
          </p>
        </div>
        <div className="grid border-t border-hairline sm:grid-cols-2 lg:col-span-7 lg:border-t-0">
          {locations.slice(0, 4).map((location, index) => (
            <Link
              key={location.id}
              href={`/${location.slug}`}
              className={cn(
                "group min-h-24 border-b border-hairline py-5 outline-none transition hover:text-link-blue focus-visible:shadow-focus sm:px-5",
                index % 2 === 1 && "sm:border-l",
              )}
            >
              <span className="block text-lg font-semibold text-carbon group-hover:text-link-blue">
                {location.city}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-ash">
                {location.address || location.name}
              </span>
            </Link>
          ))}
          <Link
            href="/stores"
            className="inline-flex min-h-14 items-center font-semibold text-link-blue outline-none hover:underline focus-visible:shadow-focus sm:px-5"
          >
            {settings.footerAllStoresLabel || "Все магазины"}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FooterStorePanel({ settings }: { settings: SiteSettings }) {
  const { locations, selected } = useCity();
  if (!selected && locations.length > 1) {
    return <NetworkLocations locations={locations} settings={settings} />;
  }

  const location = selected ?? locations[0] ?? null;
  const allowFallback = locations.length <= 1;
  const city = location?.city || settings.city;
  const name = location?.name || settings.brandName;
  const address = valueOrFallback(location?.address, settings.address, allowFallback);
  const phone = valueOrFallback(location?.phone, settings.phone, allowFallback);
  const telegram = valueOrFallback(location?.telegram, settings.telegram, allowFallback);
  const email = valueOrFallback(location?.email, settings.email, allowFallback);
  const businessHours = valueOrFallback(
    location?.businessHours,
    settings.businessHours,
    allowFallback,
  );
  const mapUrl = valueOrFallback(location?.mapUrl, settings.mapUrl, allowFallback);
  const legalName = valueOrFallback(location?.legalName, settings.legalName, allowFallback);
  const inn = valueOrFallback(location?.inn, settings.inn, allowFallback);
  const ogrn = valueOrFallback(location?.ogrn, settings.ogrn, allowFallback);
  const legalAddress = location?.legalAddress;

  const hasContacts = phone || telegram || email;
  const hasLegal = legalName || inn || ogrn || legalAddress;
  const eyebrow =
    location?.footerEyebrow ||
    cityLabel(settings.footerContactEyebrow || "I СВОИ · {city}", city || "");

  return (
    <section
      className="border-b border-hairline py-10 md:py-12"
      aria-label={city ? `Контакты магазина в городе ${city}` : "Контакты магазина"}
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-6">
          <p className="text-sm font-semibold leading-snug text-link-blue">{eyebrow}</p>
          <h2 className="mt-3 max-w-copy text-2xl font-semibold leading-tight text-carbon md:text-3xl">
            {address || name}
          </h2>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
            {mapUrl ? (
              <a
                className="inline-flex min-h-11 items-center text-link-blue outline-none hover:underline focus-visible:shadow-focus"
                href={mapUrl}
                rel="noreferrer"
                target="_blank"
              >
                {settings.footerMapLabel || "Открыть на карте ↗"}
              </a>
            ) : null}
            {location ? (
              <Link
                className="inline-flex min-h-11 items-center text-graphite outline-none hover:text-link-blue hover:underline focus-visible:shadow-focus"
                href={`/${location.slug}`}
              >
                {cityLabel(settings.footerStoreLabel || "Магазин в {city}", location.city)}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid border-t border-hairline sm:grid-cols-2 lg:col-span-6 lg:border-t-0">
          <div className="py-5 sm:pr-6 lg:py-0">
            <h3 className="text-xs font-semibold uppercase tracking-caption text-ash">
              {settings.footerContactHeading || "Связаться"}
            </h3>
            <div className="mt-2 grid">
              {phone ? (
                <a className={contactLinkClass} href={phoneHref(phone)}>
                  {phone}
                </a>
              ) : null}
              {telegram ? (
                <a
                  className={contactLinkClass}
                  href={telegramHref(telegram)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Telegram
                </a>
              ) : null}
              {email ? (
                <a className={contactLinkClass} href={`mailto:${email}`}>
                  {email}
                </a>
              ) : null}
              {!hasContacts ? (
                <span className="mt-3 text-sm text-ash">
                  {settings.footerContactsFallback || "Контакты уточняются"}
                </span>
              ) : null}
            </div>
          </div>
          <div className="border-t border-hairline py-5 sm:border-l sm:border-t-0 sm:pl-6 lg:py-0">
            <h3 className="text-xs font-semibold uppercase tracking-caption text-ash">
              {settings.footerHoursHeading || "Часы работы"}
            </h3>
            <p className="mt-3 max-w-caption text-base font-medium leading-relaxed text-carbon">
              {businessHours || settings.footerHoursFallback || "Уточняются перед визитом"}
            </p>
          </div>
        </div>
      </div>

      {hasLegal ? (
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-4 text-xs leading-relaxed text-ash">
          {legalName ? (
            <span>
              {settings.footerSellerLabel || "Продавец"}: {legalName}
            </span>
          ) : null}
          {inn ? <span>ИНН {inn}</span> : null}
          {ogrn ? <span>ОГРН {ogrn}</span> : null}
          {legalAddress ? (
            <span>
              {settings.footerLegalAddressLabel || "Юридический адрес"}: {legalAddress}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
