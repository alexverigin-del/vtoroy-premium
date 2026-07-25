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
