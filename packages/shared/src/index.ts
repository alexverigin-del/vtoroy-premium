export * from "./device.js";

import type { Device } from "./device.js";

/** Format a RUB integer amount as "59 900 ₽" (non-breaking thin spaces). */
export function formatRub(amount: number): string {
  return `${amount.toLocaleString("ru-RU").replace(/,/g, " ")} ₽`;
}

/** True if the device should be shown for a given category filter ("all" = no filter). */
export function matchesCategory(device: Device, filter: string): boolean {
  return filter === "all" || device.category === filter || device.tags.includes(filter);
}
