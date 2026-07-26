import type { DevicePassport, GalleryImage, TradeInfo } from "./device.js";

export type ProductType = "device" | "accessory";
export type ProductCondition = "new" | "used";
export type SaleMode = "reservation" | "inquiry" | "online";
export type ProductStockStatus = "available" | "reserved" | "sold" | "hidden" | string;

export interface ProductBrand {
  id: string;
  slug: string;
  name: string;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  catalogSection: ProductType;
  parentSlug?: string;
}

export interface DeviceModel {
  id: string;
  slug: string;
  name: string;
  family?: string;
  year?: number;
  brand: ProductBrand;
}

export interface DeviceDetails {
  storage?: string;
  serial?: string;
  year?: number;
  modelIdentifier?: string;
  region?: string;
  sim?: string;
  battery?: string;
  batteryText?: string;
  batteryCycles?: number;
  diagnosticDate?: string;
  activationLock?: string;
  mdm?: string;
  diagnosticBy?: string;
  grade?: string;
}

export interface AccessoryDetails {
  compatibilityMode: "universal" | "model_specific";
  material?: string;
  connectionType?: string;
  packageContents?: string;
  specifications: Record<string, string>;
}

export interface CatalogProduct {
  id: string;
  sku: string;
  productType: ProductType;
  condition: ProductCondition;
  saleMode: SaleMode;
  brand: ProductBrand;
  category: ProductCategory;
  deviceModel?: DeviceModel;
  title: string;
  model: string;
  deviceModelSlug?: string;
  color: string;
  shortDescription: string;
  headline: string;
  price: number;
  priceText: string;
  stockQuantity: number;
  stockStatus: ProductStockStatus;
  stockStatusLabel: string;
  warranty: string;
  warrantyText: string;
  completeness: string;
  listingImage: string;
  listingAlt: string;
  gallery: GalleryImage[];
  updatedAt?: string;
  sort?: number;
  ctaLabel: string;
  deviceDetails?: DeviceDetails;
  accessoryDetails?: AccessoryDetails;
  passport?: DevicePassport;
  trade: TradeInfo;
  compatibleModels: DeviceModel[];
}

export interface ProductCardData {
  id: string;
  sku: string;
  productType: ProductType;
  condition: ProductCondition;
  brand: ProductBrand;
  category: ProductCategory;
  title: string;
  model: string;
  deviceModelSlug?: string;
  color: string;
  price: number;
  priceText: string;
  stockQuantity: number;
  stockStatus: ProductStockStatus;
  stockStatusLabel: string;
  warrantyText: string;
  listingImage: string;
  listingAlt: string;
  updatedAt?: string;
  sort?: number;
  ctaLabel: string;
  detailHref: string;
  trustFacts: string[];
}

export type ProductCatalogFilters = {
  q?: string;
  type?: ProductType;
  brand?: string;
  category?: string;
  condition?: ProductCondition;
  compatible?: string;
  stock?: "available" | "reserved" | "sold";
  sort?: "default" | "updated-desc" | "price-asc" | "price-desc";
  page?: number;
  pageSize?: number;
};

export interface ProductCatalogResult {
  products: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ProductCatalogFacets {
  brands: ProductBrand[];
  categories: ProductCategory[];
  models: DeviceModel[];
}

export type ClubPlanStatus = "draft" | "published" | "archived";
export type ClubOfferStatus = "draft" | "approved" | "waitlist" | "paused" | "archived";
export type ClubRuleCategory =
  "wear" | "damage" | "return" | "buyout" | "data" | "service" | string;

export interface ClubPlan {
  id: string;
  slug: string;
  status: ClubPlanStatus | string;
  name: string;
  badge?: string;
  summary: string;
  minTermMonths?: number;
  monthlyNote?: string;
  features: string[];
  isFeatured: boolean;
  isFuture: boolean;
  sort: number;
}

export interface ClubOffer {
  id: string;
  status: ClubOfferStatus | string;
  offerStatus: ClubOfferStatus | string;
  product: ProductCardData;
  plan: ClubPlan;
  termMonths?: number;
  monthlyFrom?: number;
  monthlyText: string;
  termsText?: string;
  badge?: string;
  ctaLabel: string;
  sort: number;
}

export interface ClubRuleItem {
  id: string;
  status: ClubPlanStatus | string;
  category: ClubRuleCategory;
  title: string;
  body: string;
  sort: number;
}

export interface ClubPageSettings {
  heroDisclaimer: string;
  offersEyebrow: string;
  offersTitle: string;
  offersEmptyTitle: string;
  offersEmptyBody: string;
  monthlyFallback: string;
  offerCtaLabel: string;
  plansEyebrow: string;
  plansTitle: string;
  rulesEyebrow: string;
  rulesTitle: string;
  formTitle: string;
  formScenario: string;
  formContactLabel: string;
  formContactPlaceholder: string;
  formBudgetLabel: string;
  formBudgetPlaceholder: string;
  formTermLabel: string;
  formMessageLabel: string;
  formMessagePlaceholder: string;
  formSubmitLabel: string;
  formSubmittingLabel: string;
  formIdleNote: string;
  formSuccessNote: string;
  formErrorNote: string;
  formConsentNote: string;
}
