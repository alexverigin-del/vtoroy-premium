import type { CatalogFilterOption } from "../components/CatalogClientControls";
export const DEFAULT_CATEGORY_FILTERS: CatalogFilterOption[] = [
  { label: "Все", value: "all" },
  { label: "iPhone", value: "iphone" },
  { label: "MacBook", value: "macbook" },
  { label: "iPad", value: "ipad" },
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
