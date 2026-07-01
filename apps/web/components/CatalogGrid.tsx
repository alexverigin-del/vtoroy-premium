"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { DeviceCardData } from "@/lib/device-card-data";
import { cn } from "../lib/cn";
import { DeviceCard } from "./DeviceCard";

const CATEGORY_FILTERS = [
  { label: "Все", value: "all" },
  { label: "iPhone", value: "iphone" },
  { label: "MacBook", value: "macbook" },
  { label: "iPad", value: "ipad" },
  { label: "Для Club", value: "club" },
];

const STATUS_FILTERS = [
  { label: "Все статусы", value: "all" },
  { label: "В наличии", value: "available" },
  { label: "Бронь", value: "reserved" },
  { label: "Продано", value: "sold" },
];

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
          : "border-hairline bg-transparent text-graphite hover:border-link-blue hover:text-link-blue",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CatalogGrid({
  devices,
  directusEnabled,
}: {
  devices: DeviceCardData[];
  directusEnabled: boolean;
}) {
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("default");

  const visibleDevices = useMemo(() => {
    const filtered = devices.filter((device) => {
      const stockStatus = normalizeStockStatus(device);
      return (
        stockStatus !== "hidden" &&
        matchesCategory(device, category) &&
        (status === "all" || stockStatus === status)
      );
    });
    return sortDevices(filtered, sort);
  }, [category, devices, sort, status]);

  return (
    <section className="bg-white py-16" id="catalog" data-component="CatalogGrid">
      <div className="mx-auto max-w-shell px-5">
        <div className="mx-auto max-w-copy-wide text-center">
          <div className="text-xs font-semibold uppercase tracking-eyebrow text-ash">Store</div>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
            Вещи в кругу — сейчас в наличии.
          </h1>
          <p className="mx-auto mt-4 max-w-prose text-copy leading-relaxed text-graphite">
            {directusEnabled
              ? "Карточки загружаются из Directus: фото, грейд, цена, Passport и цена выхода обновляются без правки кода."
              : "Directus не настроен — показаны демо-данные из data/devices.json."}
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-card border border-hairline bg-frost p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Фильтры каталога">
            {CATEGORY_FILTERS.map((filter) => (
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
              {STATUS_FILTERS.map((filter) => (
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
            Подходящих устройств пока нет. Измените фильтры или добавьте опубликованные устройства в
            Directus.
          </div>
        )}
      </div>
    </section>
  );
}
