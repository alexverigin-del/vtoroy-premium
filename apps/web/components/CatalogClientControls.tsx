"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { DeviceCardData } from "@/lib/device-card-data";
import { cn } from "../lib/cn";
import { DeviceCard } from "./DeviceCard";
import { primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

export type CatalogFilterOption = {
  label: string;
  value: string;
};

export const DEFAULT_CATEGORY_FILTERS: CatalogFilterOption[] = [
  { label: "Все", value: "all" },
  { label: "iPhone", value: "iphone" },
  { label: "MacBook", value: "macbook" },
  { label: "iPad", value: "ipad" },
  { label: "Для Club", value: "club" },
];

export const DEFAULT_STATUS_FILTERS: CatalogFilterOption[] = [
  { label: "Все статусы", value: "all" },
  { label: "В наличии", value: "available" },
  { label: "Бронь", value: "reserved" },
  { label: "Продано", value: "sold" },
];

export const DEFAULT_SORT_OPTIONS: CatalogFilterOption[] = [
  { label: "По рекомендации", value: "default" },
  { label: "Сначала обновленные", value: "updated-desc" },
  { label: "По статусу", value: "status" },
  { label: "Цена ↑", value: "price-asc" },
  { label: "Цена ↓", value: "price-desc" },
];

type CatalogControls = {
  category: string;
  setCategory: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
};

type UseVisibleCatalogDevicesOptions = {
  devices: DeviceCardData[];
  category: string;
  status: string;
  sort: string;
  limit?: number;
};

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
  inactiveSurface = "white",
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  inactiveSurface?: "transparent" | "white";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-11 shrink-0 rounded-pill border px-4 text-sm font-medium outline-none transition focus-visible:shadow-focus",
        active
          ? "border-link-blue bg-link-blue/5 text-link-blue"
          : cn(
              "border-hairline text-graphite hover:border-link-blue hover:text-link-blue",
              inactiveSurface === "transparent" ? "bg-transparent" : "bg-white",
            ),
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function catalogFilterList(value: unknown): CatalogFilterOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const filterValue = typeof record.value === "string" ? record.value : "";
    return label && filterValue ? [{ label, value: filterValue }] : [];
  });
}

export function useCatalogControls(): CatalogControls {
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("default");

  return { category, setCategory, status, setStatus, sort, setSort };
}

export function useVisibleCatalogDevices({
  devices,
  category,
  status,
  sort,
  limit,
}: UseVisibleCatalogDevicesOptions): DeviceCardData[] {
  return useMemo(() => {
    const filtered = devices.filter((device) => {
      const stockStatus = normalizeStockStatus(device);
      return (
        stockStatus !== "hidden" &&
        matchesCategory(device, category) &&
        (status === "all" || stockStatus === status)
      );
    });
    const sorted = sortDevices(filtered, sort);
    return typeof limit === "number" && limit > 0 ? sorted.slice(0, limit) : sorted;
  }, [category, devices, limit, sort, status]);
}

export function CatalogToolbar({
  categories,
  statuses,
  controls,
  categoryLabel = "Фильтры каталога",
  statusLabel = "Статус устройства",
  sortLabel = "Сортировка",
  sortAriaLabel = "Сортировка каталога",
  sortOptions = DEFAULT_SORT_OPTIONS,
  inactiveSurface,
}: {
  categories: CatalogFilterOption[];
  statuses: CatalogFilterOption[];
  controls: CatalogControls;
  categoryLabel?: string;
  statusLabel?: string;
  sortLabel?: string;
  sortAriaLabel?: string;
  sortOptions?: CatalogFilterOption[];
  inactiveSurface?: "transparent" | "white";
}) {
  return (
    <div className="mt-8 flex flex-col gap-3 rounded-card border border-hairline bg-frost p-3 md:mt-10 md:gap-4 md:p-4 lg:flex-row lg:items-center lg:justify-between">
      <div
        className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
        data-allow-horizontal-scroll="true"
        aria-label={categoryLabel}
      >
        {categories.map((filter) => (
          <FilterChip
            key={filter.value}
            active={controls.category === filter.value}
            inactiveSurface={inactiveSurface}
            onClick={() => controls.setCategory(filter.value)}
          >
            {filter.label}
          </FilterChip>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        <div
          className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
          data-allow-horizontal-scroll="true"
          aria-label={statusLabel}
        >
          {statuses.map((filter) => (
            <FilterChip
              key={filter.value}
              active={controls.status === filter.value}
              inactiveSurface={inactiveSurface}
              onClick={() => controls.setStatus(filter.value)}
            >
              {filter.label}
            </FilterChip>
          ))}
        </div>
        <label className="flex min-h-11 w-full items-center justify-between gap-2 rounded-pill border border-hairline bg-white px-4 text-sm text-graphite sm:w-fit">
          <span>{sortLabel}</span>
          <select
            aria-label={sortAriaLabel}
            className="min-h-11 min-w-0 bg-transparent font-medium text-carbon outline-none"
            value={controls.sort}
            onChange={(event) => controls.setSort(event.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function CatalogDeviceList({
  devices,
  emptyMessage,
  emptyHeadline,
  emptyCtaLabel,
  emptyCtaHref = "/#final",
  priorityImageCount = 0,
  showSelectionCta = false,
  selectionCtaHref = "/store#final",
  layout = "balanced",
}: {
  devices: DeviceCardData[];
  emptyMessage: string;
  emptyHeadline?: string;
  emptyCtaLabel?: string;
  emptyCtaHref?: string;
  priorityImageCount?: number;
  showSelectionCta?: boolean;
  selectionCtaHref?: string;
  layout?: "balanced" | "four-up";
}) {
  if (devices.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-hairline bg-frost p-8 text-center text-graphite">
        {emptyHeadline ? (
          <h2 className="text-2xl font-semibold leading-tight tracking-normal text-carbon">
            {emptyHeadline}
          </h2>
        ) : null}
        <p className={emptyHeadline ? "mx-auto mt-3 max-w-prose text-sm leading-relaxed" : ""}>
          {emptyMessage}
        </p>
        {emptyCtaLabel ? (
          <div className="mt-5">
            <Link href={emptyCtaHref} className={primaryPillCtaClass}>
              {emptyCtaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  const sparseCatalog = devices.length <= 4;
  const singleDevice = devices.length === 1;
  const fourUp = layout === "four-up" && devices.length === 4;

  return (
    <>
      <ul
        className={cn(
          "mt-8 grid gap-6 sm:grid-cols-2",
          fourUp
            ? "lg:grid-cols-4"
            : sparseCatalog
              ? cn(
                  "lg:mx-auto",
                  singleDevice ? "lg:max-w-overlay-wide lg:grid-cols-1" : "lg:max-w-copy-wide",
                )
              : "lg:grid-cols-3",
        )}
      >
        {devices.map((device, index) => (
          <li key={device.id}>
            <DeviceCard device={device} imagePriority={index < priorityImageCount} />
          </li>
        ))}
      </ul>
      {showSelectionCta ? (
        <div className="mx-auto mt-10 max-w-copy rounded-card border border-hairline bg-ice p-5 text-center md:p-7">
          <h2 className="text-2xl font-semibold leading-tight tracking-normal text-carbon">
            Не нашли свою модель?
          </h2>
          <p className="mx-auto mt-3 max-w-prose-narrow text-sm leading-relaxed text-graphite md:text-copy">
            Оставьте контакт и задачу. Мы проверим ближайшие поступления, предложим похожую вещь или
            подскажем спокойный сценарий Trade.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={selectionCtaHref} className={primaryPillCtaClass}>
              Оставить заявку
            </Link>
            <Link href="/trade" className={secondaryPillCtaClass}>
              Рассчитать Trade
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
