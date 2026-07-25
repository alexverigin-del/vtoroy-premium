import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { DEFAULT_SOCIAL_IMAGE } from "../../site-metadata";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Новая и б/у техника — I СВОИ",
  description:
    "Техника разных производителей: новые товары и проверенные б/у устройства с Passport.",
  alternates: { canonical: "/catalog/tech" },
  openGraph: {
    title: "Новая и б/у техника — I СВОИ",
    description: "Техника разных производителей: новая и проверенная б/у.",
    url: "/catalog/tech",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export default async function TechCatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return (
    <ProductCatalogRoute
      breadcrumbLabel="Техника"
      presets={{ type: "device" }}
      searchParams={await searchParams}
    />
  );
}
