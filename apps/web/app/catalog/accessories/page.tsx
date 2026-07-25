import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Новые аксессуары — I СВОИ",
  description:
    "Новые аксессуары разных брендов с точной совместимостью, гарантией и актуальным наличием.",
  alternates: { canonical: "/catalog/accessories" },
};

export default async function AccessoriesCatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return (
    <ProductCatalogRoute
      breadcrumbLabel="Аксессуары"
      presets={{ type: "accessory", condition: "new" }}
      searchParams={await searchParams}
    />
  );
}
