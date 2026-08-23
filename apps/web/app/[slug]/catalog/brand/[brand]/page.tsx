import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { DEFAULT_SOCIAL_IMAGE } from "@/app/site-metadata";
import { getPublishedProducts } from "@/lib/product-catalog";
import { getStoreLocation } from "@/lib/store-locations";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; brand: string }>;
}): Promise<Metadata> {
  const { slug, brand } = await params;
  const [location, result] = await Promise.all([
    getStoreLocation(slug),
    getPublishedProducts({ city: slug, brand, pageSize: 1 }),
  ]);
  if (!location) return {};
  const available = Boolean(
    result.products[0] && result.products[0].availabilityScope !== "unavailable",
  );
  const title = `${brand} · ${location.city}`;
  const description = `${brand} в каталоге I СВОИ · ${location.city}: локальное наличие и варианты с доставкой.`;
  return {
    title,
    description,
    alternates: { canonical: `/${slug}/catalog/brand/${brand}` },
    openGraph: {
      title,
      description,
      url: `/${slug}/catalog/brand/${brand}`,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
    robots: available ? undefined : { index: false, follow: true },
  };
}

export default async function CityBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; brand: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug, brand } = await params;
  const location = await getStoreLocation(slug);
  if (!location) notFound();
  return (
    <ProductCatalogRoute
      location={location}
      breadcrumbLabel="Бренд"
      presets={{ brand }}
      searchParams={await searchParams}
    />
  );
}
