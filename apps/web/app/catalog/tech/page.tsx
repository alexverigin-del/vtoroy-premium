import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { DEFAULT_SOCIAL_IMAGE } from "../../site-metadata";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Новая техника и техника с пробегом — I СВОИ",
  description:
    "Техника разных производителей: новые товары и проверенные устройства с пробегом и Passport.",
  alternates: { canonical: "/catalog/tech" },
  openGraph: {
    title: "Новая техника и техника с пробегом — I СВОИ",
    description: "Техника разных производителей: новая и проверенная с пробегом.",
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
