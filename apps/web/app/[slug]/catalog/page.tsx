import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
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
  const title = `Каталог I СВОИ в городе ${location.city}`;
  return {
    title,
    description: `Техника и аксессуары в городе ${location.city}, а также товары с доставкой из других магазинов сети.`,
    alternates: { canonical: `/${slug}/catalog` },
    openGraph: { title, url: `/${slug}/catalog` },
  };
}

export default async function CityCatalogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (!location) notFound();
  return <ProductCatalogRoute location={location} searchParams={await searchParams} />;
}
