// Domain types for ISVOI devices and their passports.
//
// These mirror the shape of the current static prototype data
// (`data/devices.json`) and are intended to become the canonical contract
// between Directus collections, the Next.js site, and the Python jobs.
//
// When the Directus schema is finalized (see directus/schema/collections.md),
// generated SDK types should be reconciled with these by hand or replaced by
// codegen. Until then, treat this file as the single source of truth.

export type DeviceCategory = "iphone" | "ipad" | "macbook" | string;
export type DeviceStockStatus = "available" | "reserved" | "sold" | "hidden" | string;

/** Grade buckets used in the catalog/passport. Free-form to allow "A−", "B+", etc. */
export type DeviceGrade = string;

/** A red/amber/green-style flag on a passport row or checklist item. */
export type PassportState = "ok" | "warn" | "bad";

export interface GalleryImage {
  src: string;
  label: string;
  alt: string;
  role?: string;
}

export interface PassportSummaryRow {
  label: string;
  value: string;
  state: PassportState;
}

export interface DiagnosticsChecklistItem {
  text: string;
  state: PassportState;
}

export interface Diagnostics {
  status: string;
  checklist: DiagnosticsChecklistItem[];
}

export interface ConditionInfo {
  gradeText: string;
  note: string;
  notes: string[];
  defectPhoto?: string;
  defectPhotoAlt?: string;
}

export interface WarrantyInfo {
  duration: string;
  covered: string;
  notCovered: string;
}

export interface ExitPriceInfo {
  headline: string;
  buyToday: string;
  tradeInEstimate: string;
  condition: string;
  note: string;
}

export interface DevicePassport {
  summaryRows: PassportSummaryRow[];
  repair: string;
  water: string;
  diagnostics: Diagnostics;
  condition: ConditionInfo;
  warranty: WarrantyInfo;
  exitPrice: ExitPriceInfo;
}

export interface TradeOption {
  /** Estimated trade-in value in RUB. */
  value: number;
  label: string;
}

export interface TradeInfo {
  options: TradeOption[];
}

export interface Device {
  /** Stable slug, used in URLs (e.g. "iphone-13-pro"). */
  id: string;
  tags: string[];
  category: DeviceCategory;
  title: string;
  model: string;
  specs: string;
  storage: string;
  color: string;
  /** Masked serial / IMEI for display. */
  serial: string;
  /** Price in RUB as a number. */
  price: number;
  priceText: string;
  grade: DeviceGrade;
  battery: string;
  batteryText: string;
  metaBattery: string;
  warranty: string;
  warrantyText: string;
  exit: string;
  exitText: string;
  availability: string;
  stockStatus?: DeviceStockStatus;
  stockStatusLabel?: string;
  sort?: number;
  updatedAt?: string;
  updatedText?: string;
  shortDescription: string;
  headline: string;
  listingImage: string;
  listingAlt: string;
  ctaLabel: string;
  hasDetailPage: boolean;
  detailHref: string;
  visualClass: string;
  gallery: GalleryImage[];
  passport: DevicePassport;
  trade: TradeInfo;
}

/** Shape of `data/devices.json`. */
export interface DeviceCatalog {
  devices: Device[];
}
