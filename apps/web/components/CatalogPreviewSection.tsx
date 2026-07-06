"use client";

import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import type { DeviceCardData } from "@/lib/device-card-data";
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
import { homeSectionLabelClass, primaryCtaClass, secondaryCtaClass } from "./ui-classes";

export function CatalogPreviewSection({
  section,
  devices,
}: {
  section: PageSection;
  devices: DeviceCardData[];
}) {
  const categoryFilters = catalogFilterList(section.content.filters);
  const statusFilters = catalogFilterList(section.content.statusFilters);
  const sortOptions = catalogFilterList(section.content.sortOptions);
  const controls = useCatalogControls();
  const headingTag = section.content.headingTag === "h1" ? "h1" : "h2";
  const limit =
    typeof section.content.limit === "number" && section.content.limit > 0
      ? section.content.limit
      : 6;
  const categories = categoryFilters.length > 0 ? categoryFilters : DEFAULT_CATEGORY_FILTERS;
  const statuses = statusFilters.length > 0 ? statusFilters : DEFAULT_STATUS_FILTERS;
  const sorts = sortOptions.length > 0 ? sortOptions : DEFAULT_SORT_OPTIONS;
  const visibleDevices = useVisibleCatalogDevices({ devices, limit, ...controls });

  const Heading = headingTag;

  return (
    <section
      className="bg-white py-16 md:py-20"
      id="catalog"
      data-component="CatalogPreviewSection"
    >
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy text-center">
          {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
          {section.headline ? (
            <Heading className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </Heading>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-copy leading-relaxed text-graphite">{section.body}</p>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-shell px-5">
        <CatalogToolbar
          categories={categories}
          statuses={statuses}
          controls={controls}
          categoryLabel={section.subheadline || "Фильтры каталога"}
          statusLabel={
            typeof section.content.statusFilterLabel === "string"
              ? section.content.statusFilterLabel
              : "Статус устройства"
          }
          sortLabel={
            typeof section.content.sortLabel === "string" ? section.content.sortLabel : "Сортировка"
          }
          sortAriaLabel={
            typeof section.content.sortAriaLabel === "string"
              ? section.content.sortAriaLabel
              : "Сортировка каталога"
          }
          sortOptions={sorts}
        />
      </div>

      <div className="mx-auto max-w-page px-4 md:px-6">
        <CatalogDeviceList
          devices={visibleDevices}
          emptyMessage="Каталог пока пуст. Измените фильтры или вернитесь позже."
          layout="four-up"
        />

        {section.primaryCtaLabel || section.secondaryCtaLabel ? (
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/catalog")}
                className={primaryCtaClass}
              >
                {section.primaryCtaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.secondaryCtaUrl || "#final")}
                className={secondaryCtaClass}
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
