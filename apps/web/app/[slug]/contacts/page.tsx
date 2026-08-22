import { notFound, permanentRedirect } from "next/navigation";

import { getStoreLocation } from "@/lib/store-locations";

export const revalidate = 300;

export default async function CityContactsRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const location = await getStoreLocation(slug);
  if (!location) notFound();
  permanentRedirect(`/${location.slug}`);
}
