"use client";

import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import type { DeviceCardData } from "@/lib/device-card-data";
import { RichText } from "./RichText";
import {
  CatalogDeviceList,
  CatalogToolbar,
  DEFAULT_CATEGORY_FILTERS,
  DEFAULT_SORT_OPTIONS,
  DEFAULT_STATUS_FILTERS,
  catalogFilterList,
  useCatalogControls,
  useVisibleCatalogDevices,
} from "./CatalogClientControls";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { brandZoneEyebrowClass, primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function catalogEyebrow(value: unknown): string {
  const eyebrow = text(value, "");
  if (/^(Store|Каталог|Главная\s*\/\s*(Store|Каталог))$/i.test(eyebrow)) {
    return "I СВОИ · Каталог";
  }

  return text(eyebrow, "I СВОИ · Каталог");
}

function catalogEmptyState(section?: PageSection | null) {
  const value = section?.content.emptyState;
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    headline: text(record.headline, ""),
    body: text(record.body, "Подходящих устройств пока нет. Измените фильтры или вернитесь позже."),
    ctaLabel: text(record.ctaLabel, ""),
    ctaUrl: text(record.ctaUrl, "/#final"),
  };
}

export function CatalogGrid({
  devices,
  directusEnabled,
  headingLevel = "h1",
  section,
}: {
  devices: DeviceCardData[];
  directusEnabled: boolean;
  headingLevel?: "h1" | "h2";
  section?: PageSection | null;
}) {
  const controls = useCatalogControls();
  const visibleDevices = useVisibleCatalogDevices({ devices, ...controls });
  const Heading = headingLevel;
  const categoryFilters = catalogFilterList(section?.content.filters);
  const statusFilters = catalogFilterList(section?.content.statusFilters);
  const sortOptions = catalogFilterList(section?.content.sortOptions);
  const categories = categoryFilters.length > 0 ? categoryFilters : DEFAULT_CATEGORY_FILTERS;
  const statuses = statusFilters.length > 0 ? statusFilters : DEFAULT_STATUS_FILTERS;
  const sorts = sortOptions.length > 0 ? sortOptions : DEFAULT_SORT_OPTIONS;
  const empty = catalogEmptyState(section);
  const eyebrow = catalogEyebrow(section?.eyebrow);
  const headline = text(section?.headline, "Вещи в кругу — сейчас в наличии.");
  const body = text(
    section?.body,
    directusEnabled
      ? "В наличии только проверенные вещи: фото, грейд, гарантия и ориентир выхода обновляются после проверки."
      : "Показаны демонстрационные карточки: они помогают оценить формат Store до подключения живого каталога.",
  );
  const categoryLabel = text(
    section?.subheadline,
    text(section?.content.filterAriaLabel, "Фильтры каталога"),
  );
  const statusLabel = text(section?.content.statusFilterLabel, "Статус устройства");
  const sortLabel = text(section?.content.sortLabel, "Сортировка");
  const sortAriaLabel = text(section?.content.sortAriaLabel, "Сортировка каталога");

  return (
    <section className="bg-white py-16" id="catalog" data-component="CatalogGrid">
      <div className="mx-auto max-w-shell px-5">
        <div className="mx-auto max-w-copy-wide text-center">
          <div className={brandZoneEyebrowClass}>{eyebrow}</div>
          <Heading className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
            {headline}
          </Heading>
          <RichText
            className="mx-auto mt-4 max-w-prose text-copy leading-relaxed text-graphite"
            html={body}
            nodes={section?.bodyRichText}
          />
        </div>

        <CatalogToolbar
          categories={categories}
          statuses={statuses}
          controls={controls}
          categoryLabel={categoryLabel}
          statusLabel={statusLabel}
          sortLabel={sortLabel}
          sortAriaLabel={sortAriaLabel}
          sortOptions={sorts}
          inactiveSurface="transparent"
        />

        <CatalogDeviceList
          devices={visibleDevices}
          emptyHeadline={empty.headline}
          emptyMessage={empty.body}
          emptyCtaLabel={empty.ctaLabel}
          emptyCtaHref={normalizeSiteUrl(empty.ctaUrl)}
          priorityImageCount={1}
          showSelectionCta
        />

        {section?.primaryCtaLabel || section?.secondaryCtaLabel ? (
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/#final")}
                className={primaryPillCtaClass}
              >
                {section.primaryCtaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.secondaryCtaUrl || "/store")}
                className={secondaryPillCtaClass}
              >
                {section.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
