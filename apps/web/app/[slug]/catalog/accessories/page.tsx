import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCatalogRoute, type CatalogSearchParams } from "@/components/ProductCatalogRoute";
import { getPublishedProducts } from "@/lib/product-catalog";
import { getStoreLocation } from "@/lib/store-locations";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [location, result] = await Promise.all([
    getStoreLocation(slug),
    getPublishedProducts({ city: slug, type: "accessory", condition: "new", pageSize: 1 }),
  ]);
  if (!location) return {};
  const available = Boolean(
    result.products[0] && result.products[0].availabilityScope !== "unavailable",
  );
  return {
    title: `Аксессуары в городе ${location.city}`,
    alternates: { canonical: `/${slug}/catalog/accessories` },
    robots: available ? undefined : { index: false, follow: true },
  };
}

export default async function CityAccessoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (!location) notFound();
  return (
    <ProductCatalogRoute
      location={location}
      breadcrumbLabel="Аксессуары"
      presets={{ type: "accessory", condition: "new" }}
      searchParams={await searchParams}
    />
  );
}
