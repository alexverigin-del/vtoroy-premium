import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { getProductCatalogFacets, getPublishedProducts } from "@/lib/product-catalog";
import { DEFAULT_SOCIAL_IMAGE } from "../../../site-metadata";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [facets, products] = await Promise.all([
    getProductCatalogFacets(),
    getPublishedProducts({ category: slug, pageSize: 1 }),
  ]);
  const category = facets.categories.find((item) => item.slug === slug);
  const name = category?.name || "Категория";
  return {
    title: `${name} — каталог I СВОИ`,
    description: `${name}: актуальные товары, цены, совместимость и наличие в I СВОИ.`,
    alternates: { canonical: `/catalog/category/${slug}` },
    robots: products.total > 0 ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${name} — каталог I СВОИ`,
      description: `${name}: актуальные товары, цены и наличие.`,
      url: `/catalog/category/${slug}`,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
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
