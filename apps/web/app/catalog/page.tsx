import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Каталог техники и аксессуаров — I СВОИ",
  description:
    "Новая и проверенная б/у техника разных производителей, новые аксессуары, точная совместимость, гарантия и актуальное наличие.",
  alternates: { canonical: "/catalog" },
  openGraph: {
    title: "Каталог техники и аксессуаров — I СВОИ",
    description: "Техника и аксессуары, о которых всё известно до покупки.",
    url: "/catalog",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <ProductCatalogRoute searchParams={await searchParams} />;
}
