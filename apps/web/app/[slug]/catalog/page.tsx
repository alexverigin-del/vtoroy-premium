import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { DEFAULT_SOCIAL_IMAGE } from "@/app/site-metadata";
import { getStoreLocation } from "@/lib/store-locations";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (!location) return {};
  const title = `Каталог I СВОИ · ${location.city}`;
  const description = `Каталог для города «${location.city}»: техника и аксессуары в местном магазине, а также товары с доставкой из других городов.`;
  return {
    title,
    description,
    alternates: { canonical: `/${slug}/catalog` },
    openGraph: { title, description, url: `/${slug}/catalog`, images: [DEFAULT_SOCIAL_IMAGE] },
  };
}

export default async function CityCatalogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (!location) notFound();
  return <ProductCatalogRoute location={location} searchParams={await searchParams} />;
}
