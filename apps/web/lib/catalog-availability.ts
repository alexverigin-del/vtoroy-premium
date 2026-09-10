import type { ProductCardData, ProductCatalogFilters } from "@vtoroy/shared";

type CatalogAvailabilityProduct = Pick<ProductCardData, "availabilityScope" | "stockStatus">;

export function appendPublicCatalogAvailabilityFilter(params: URLSearchParams): void {
  params.set("filter[_or][0][stock_quantity][_gt]", "0");
  params.set("filter[_or][1][stock_status][_eq]", "sold");
}

export function matchesCityStockFilter(
  product: CatalogAvailabilityProduct,
  stock: ProductCatalogFilters["stock"],
): boolean {
  if (stock === "delivery") return product.availabilityScope === "delivery";
  if (stock === "sold") return product.stockStatus === "sold";
  return product.availabilityScope === "local" && product.stockStatus === stock;
}
