"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { DeviceCardData } from "@/lib/device-card-data";
import { cn } from "../lib/cn";
import { DeviceCard } from "./DeviceCard";

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

const SORT_OPTIONS: CatalogFilterOption[] = [
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
        "min-h-11 rounded-pill border px-4 text-sm font-medium outline-none transition focus-visible:shadow-focus",
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
  inactiveSurface,
}: {
  categories: CatalogFilterOption[];
  statuses: CatalogFilterOption[];
  controls: CatalogControls;
  categoryLabel?: string;
  inactiveSurface?: "transparent" | "white";
}) {
  return (
    <div className="mt-10 flex flex-col gap-4 rounded-card border border-hairline bg-frost p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2" aria-label={categoryLabel}>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2" aria-label="Статус устройства">
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
        <label className="flex min-h-11 items-center gap-2 rounded-pill border border-hairline bg-white px-4 text-sm text-graphite">
          <span>Сортировка</span>
          <select
            aria-label="Сортировка каталога"
            className="min-h-11 bg-transparent font-medium text-carbon outline-none"
            value={controls.sort}
            onChange={(event) => controls.setSort(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
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
}: {
  devices: DeviceCardData[];
  emptyMessage: string;
}) {
  return devices.length > 0 ? (
    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {devices.map((device) => (
        <li key={device.id}>
          <DeviceCard device={device} />
        </li>
      ))}
    </ul>
  ) : (
    <div className="mt-8 rounded-card border border-hairline bg-frost p-8 text-center text-graphite">
      {emptyMessage}
    </div>
  );
}
