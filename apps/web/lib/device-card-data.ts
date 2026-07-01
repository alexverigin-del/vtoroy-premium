import type { Device } from "@vtoroy/shared";

export type DeviceCardData = Pick<
  Device,
  | "id"
  | "tags"
  | "category"
  | "model"
  | "sort"
  | "title"
  | "specs"
  | "color"
  | "price"
  | "priceText"
  | "grade"
  | "exitText"
  | "stockStatus"
  | "stockStatusLabel"
  | "updatedAt"
  | "updatedText"
  | "listingImage"
  | "listingAlt"
  | "ctaLabel"
  | "detailHref"
>;
