"use client";

import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import type { DeviceCardData } from "@/lib/device-card-data";
import {
  CatalogDeviceList,
  CatalogToolbar,
  DEFAULT_CATEGORY_FILTERS,
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
  const controls = useCatalogControls();
  const headingTag = section.content.headingTag === "h1" ? "h1" : "h2";
  const limit =
    typeof section.content.limit === "number" && section.content.limit > 0
      ? section.content.limit
      : 6;
  const categories = categoryFilters.length > 0 ? categoryFilters : DEFAULT_CATEGORY_FILTERS;
  const statuses = statusFilters.length > 0 ? statusFilters : DEFAULT_STATUS_FILTERS;
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

        <CatalogToolbar
          categories={categories}
          statuses={statuses}
          controls={controls}
          categoryLabel={section.subheadline || "Фильтры каталога"}
        />

        <CatalogDeviceList
          devices={visibleDevices}
          emptyMessage="Каталог пока пуст. Измените фильтры или вернитесь позже."
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
