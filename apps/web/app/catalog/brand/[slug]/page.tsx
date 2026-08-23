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
    getPublishedProducts({ brand: slug, pageSize: 1 }),
  ]);
  const brand = facets.brands.find((item) => item.slug === slug);
  const name = brand?.name || "Бренд";
  return {
    title: `${name} — каталог I СВОИ`,
    description: `${name}: новая техника, проверенная техника с пробегом, аксессуары, цены и наличие.`,
    alternates: { canonical: `/catalog/brand/${slug}` },
    robots: products.total > 0 ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${name} — каталог I СВОИ`,
      description: `${name}: техника и аксессуары, цены и наличие.`,
      url: `/catalog/brand/${slug}`,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
}

export default async function BrandCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  return <ProductCatalogRoute presets={{ brand: slug }} searchParams={await searchParams} />;
}
