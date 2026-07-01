"use client";

import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { DeviceCardData } from "@/lib/device-card-data";
import { cn } from "../lib/cn";
import { DeviceCard } from "./DeviceCard";
import { normalizeSiteUrl } from "./site-chrome-utils";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

type FilterOption = {
  label: string;
  value: string;
};

const DEFAULT_CATEGORY_FILTERS: FilterOption[] = [
  { label: "Все", value: "all" },
  { label: "iPhone", value: "iphone" },
  { label: "MacBook", value: "macbook" },
  { label: "iPad", value: "ipad" },
  { label: "Для Club", value: "club" },
];

const DEFAULT_STATUS_FILTERS: FilterOption[] = [
  { label: "Все статусы", value: "all" },
  { label: "В наличии", value: "available" },
  { label: "Бронь", value: "reserved" },
  { label: "Продано", value: "sold" },
];

function filterList(value: unknown): FilterOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const filterValue = typeof record.value === "string" ? record.value : "";
    return label && filterValue ? [{ label, value: filterValue }] : [];
  });
}

function normalizeStockStatus(device: DeviceCardData): string {
  const raw = (device.stockStatus || "available").trim().toLowerCase();
  if (!raw || raw === "in_stock") return "available";
  if (raw === "service") return "hidden";
  return raw;
}

function statusOrder(status: string): number {
  switch (status) {
    case "available":
      return 1;
    case "reserved":
      return 2;
    case "sold":
      return 3;
    default:
      return 9;
  }
}

function updatedTime(device: DeviceCardData): number {
  if (!device.updatedAt) return 0;
  const time = Date.parse(device.updatedAt);
  return Number.isFinite(time) ? time : 0;
}

function matchesCategory(device: DeviceCardData, category: string): boolean {
  if (category === "all") return true;
  return device.category === category || device.tags.includes(category);
}

function sortDevices(devices: DeviceCardData[], sort: string): DeviceCardData[] {
  return [...devices].sort((a, b) => {
    if (sort === "price-asc") return Number(a.price || 0) - Number(b.price || 0);
    if (sort === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
    if (sort === "updated-desc") return updatedTime(b) - updatedTime(a);
    if (sort === "status") {
      return (
        statusOrder(normalizeStockStatus(a)) - statusOrder(normalizeStockStatus(b)) ||
        Number(a.sort ?? 0) - Number(b.sort ?? 0)
      );
    }
    return Number(a.sort ?? 0) - Number(b.sort ?? 0);
  });
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-11 rounded-pill border px-4 text-sm font-medium outline-none transition focus-visible:shadow-focus",
        active
          ? "border-link-blue bg-link-blue/5 text-link-blue"
          : "border-hairline bg-white text-graphite hover:border-link-blue hover:text-link-blue",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CatalogPreviewSection({
  section,
  devices,
}: {
  section: PageSection;
  devices: DeviceCardData[];
}) {
  const categoryFilters = filterList(section.content.filters);
  const statusFilters = filterList(section.content.statusFilters);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("default");
  const headingTag = section.content.headingTag === "h1" ? "h1" : "h2";
  const limit =
    typeof section.content.limit === "number" && section.content.limit > 0
      ? section.content.limit
      : 6;
  const categories = categoryFilters.length > 0 ? categoryFilters : DEFAULT_CATEGORY_FILTERS;
  const statuses = statusFilters.length > 0 ? statusFilters : DEFAULT_STATUS_FILTERS;

  const visibleDevices = useMemo(() => {
    const filtered = devices.filter((device) => {
      const stockStatus = normalizeStockStatus(device);
      return (
        stockStatus !== "hidden" &&
        matchesCategory(device, category) &&
        (status === "all" || stockStatus === status)
      );
    });
    return sortDevices(filtered, sort).slice(0, limit);
  }, [category, devices, limit, sort, status]);

  const Heading = headingTag;

  return (
    <section
      className="bg-white py-16 md:py-20"
      id="catalog"
      data-component="CatalogPreviewSection"
    >
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy text-center">
          {section.eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-label text-link-blue">
              {section.eyebrow}
            </div>
          ) : null}
          {section.headline ? (
            <Heading className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </Heading>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-copy leading-relaxed text-graphite">{section.body}</p>
          ) : null}
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-card border border-hairline bg-frost p-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap gap-2"
            aria-label={section.subheadline || "Фильтры каталога"}
          >
            {categories.map((filter) => (
              <FilterChip
                key={filter.value}
                active={category === filter.value}
                onClick={() => setCategory(filter.value)}
              >
                {filter.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2" aria-label="Статус устройства">
              {statuses.map((filter) => (
                <FilterChip
                  key={filter.value}
                  active={status === filter.value}
                  onClick={() => setStatus(filter.value)}
                >
                  {filter.label}
                </FilterChip>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-pill border border-hairline bg-white px-4 text-sm text-graphite">
              <span>Сортировка</span>
              <select
                className="bg-transparent font-medium text-carbon outline-none"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="default">По рекомендации</option>
                <option value="updated-desc">Сначала обновлённые</option>
                <option value="status">По статусу</option>
                <option value="price-asc">Цена ↑</option>
                <option value="price-desc">Цена ↓</option>
              </select>
            </label>
          </div>
        </div>

        {visibleDevices.length > 0 ? (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDevices.map((device) => (
              <li key={device.id}>
                <DeviceCard device={device} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-card border border-hairline bg-frost p-8 text-center text-graphite">
            Каталог пока пуст. Добавьте опубликованные устройства в Directus или измените фильтры.
          </div>
        )}

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
