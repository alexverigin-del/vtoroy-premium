import type { ProductCardData } from "@vtoroy/shared";

function normalizedStockStatus(product: ProductCardData): string {
  const status = (product.stockStatus || "available").trim().toLowerCase();
  return status === "in_stock" || !status ? "available" : status;
}

function hasVisibleStock(product: ProductCardData): boolean {
  const status = normalizedStockStatus(product);
  return product.stockQuantity > 0 && (status === "available" || status === "reserved");
}

export function marketingProductCandidates(products: ProductCardData[]): ProductCardData[] {
  return [...products].filter(hasVisibleStock).sort((a, b) => {
    const aAvailable = normalizedStockStatus(a) === "available" ? 0 : 1;
    const bAvailable = normalizedStockStatus(b) === "available" ? 0 : 1;
    return aAvailable - bAvailable || Number(a.sort ?? 0) - Number(b.sort ?? 0);
  });
}

export function marketingDeviceCandidates(products: ProductCardData[]): ProductCardData[] {
  return marketingProductCandidates(products).filter((product) => product.productType === "device");
}

export function marketingExampleDevice(products: ProductCardData[]): ProductCardData | null {
  return marketingDeviceCandidates(products)[0] ?? null;
}

export function marketingProductFacts(product: ProductCardData, limit = 4): string[] {
  const seen = new Set<string>();

  return [...(product.trustFacts ?? []), product.warrantyText, product.stockStatusLabel]
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function marketingProductDescriptor(product: ProductCardData): string {
  return [product.model, product.color, product.brand.name]
    .map((value) => value.trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
}
