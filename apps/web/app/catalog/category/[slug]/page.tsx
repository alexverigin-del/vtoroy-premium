import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { getProductCatalogFacets } from "@/lib/product-catalog";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getProductCatalogFacets()).categories.find((item) => item.slug === slug);
  const name = category?.name || "Категория";
  return {
    title: `${name} — каталог I СВОИ`,
    description: `${name}: актуальные товары, цены, совместимость и наличие в I СВОИ.`,
    alternates: { canonical: `/catalog/category/${slug}` },
  };
}

export default async function CategoryCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  return <ProductCatalogRoute presets={{ category: slug }} searchParams={await searchParams} />;
}
