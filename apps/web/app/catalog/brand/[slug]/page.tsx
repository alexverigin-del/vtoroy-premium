import type { Metadata } from "next";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { getProductCatalogFacets } from "@/lib/product-catalog";
import { DEFAULT_SOCIAL_IMAGE } from "../../../site-metadata";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = (await getProductCatalogFacets()).brands.find((item) => item.slug === slug);
  const name = brand?.name || "Бренд";
  return {
    title: `${name} — каталог I СВОИ`,
    description: `${name}: новая и проверенная б/у техника, аксессуары, цены и наличие.`,
    alternates: { canonical: `/catalog/brand/${slug}` },
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
