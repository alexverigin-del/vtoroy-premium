import type { DevicePassport, GalleryImage, TradeInfo } from "./device.js";

export type ProductType = "device" | "accessory";
export type ProductCondition = "new" | "used";
export type SaleMode = "reservation" | "inquiry" | "online";
export type ProductStockStatus = "available" | "reserved" | "sold" | "hidden" | string;
export type StoreLocationStatus = "draft" | "published" | "archived" | string;
export type FulfillmentMethod = "pickup" | "local_delivery" | "intercity_delivery";

export interface StoreLocation {
  id: string;
  slug: string;
  status: StoreLocationStatus;
  name: string;
  city: string;
  region?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  telegram?: string;
  email?: string;
  businessHours?: string;
  mapUrl?: string;
  legalName?: string;
  inn?: string;
  ogrn?: string;
  legalAddress?: string;
  pickupEnabled: boolean;
  localDeliveryEnabled: boolean;
  intercityDeliveryEnabled: boolean;
  seoTitle?: string;
  metaDescription?: string;
  heroTitle?: string;
  heroBody?: string;
  sort: number;
}

export interface ProductOffer {
  id: string;
  productId: string;
  location: StoreLocation;
  localSku: string;
  status: "draft" | "published" | "archived" | string;
  price: number;
  priceText: string;
  stockQuantity: number;
  stockStatus: ProductStockStatus;
  saleMode: SaleMode;
  pickupEnabled: boolean;
  localDeliveryEnabled: boolean;
  intercityDeliveryEnabled: boolean;
  preparationDays?: number;
  deliveryEstimate?: string;
  yandexPayEnabled: boolean;
  yandexSplitEnabled: boolean;
  updatedAt?: string;
}

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
  visibleProductCount?: number;
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
  offers: ProductOffer[];
  selectedOffer?: ProductOffer;
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
  offers: ProductOffer[];
  selectedOffer?: ProductOffer;
  availabilityScope?: "local" | "delivery" | "network" | "unavailable";
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
  city?: string;
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
export type ClubPublicationMode = "pilot_noindex" | "public_index" | "paused";
export type ClubProcessGroup = "scenario" | "passport" | "participation";
export type ClubRuleCategory =
  | "wear"
  | "damage"
  | "return"
  | "buyout"
  | "early_exit"
  | "payment"
  | "loss"
  | "data"
  | "service"
  | string;
export type ClubLegalDocumentType = "privacy" | "pilot_terms" | "contract_draft" | string;

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
  supportLevel?: string;
  serviceResponseText?: string;
  diagnosticsText?: string;
  replacementText?: string;
  earlyExitText?: string;
  damageText?: string;
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
  pricingMode: "manual" | "monthly_from" | string;
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

export interface ClubProcessItem {
  id: string;
  status: ClubPlanStatus | string;
  group: ClubProcessGroup | string;
  slug: string;
  label?: string;
  title: string;
  body: string;
  sort: number;
}

export interface ClubLegalDocument {
  id: string;
  status: ClubPlanStatus | string;
  documentType: ClubLegalDocumentType;
  slug: string;
  title: string;
  summary: string;
  body: string;
  version: string;
  effectiveDate?: string;
  fileUrl?: string;
  fileName?: string;
  legalReviewed: boolean;
  sort: number;
}

export interface ClubPageSettings {
  publicationMode: ClubPublicationMode;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroPrimaryLabel: string;
  heroPrimaryUrl: string;
  heroSecondaryLabel: string;
  heroSecondaryUrl: string;
  heroDisclaimer: string;
  heroPanelEyebrow: string;
  heroPanelTitle: string;
  heroPanelBody: string;
  offersEyebrow: string;
  offersTitle: string;
  offersEmptyTitle: string;
  offersEmptyBody: string;
  monthlyFallback: string;
  offerCtaLabel: string;
  cycleEyebrow: string;
  cycleTitle: string;
  cycleBody: string;
  passportEyebrow: string;
  passportTitle: string;
  passportBody: string;
  plansEyebrow: string;
  plansTitle: string;
  rulesEyebrow: string;
  rulesTitle: string;
  participationEyebrow: string;
  participationTitle: string;
  participationBody: string;
  legalEyebrow: string;
  legalTitle: string;
  legalBody: string;
  finalEyebrow: string;
  finalTitle: string;
  finalBody: string;
  formTitle: string;
  formScenario: string;
  formDeviceLabel: string;
  formDevicePlaceholder: string;
  formDeviceError: string;
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
  formConsentLabel: string;
  consentVersion: string;
  privacyUrl: string;
}
