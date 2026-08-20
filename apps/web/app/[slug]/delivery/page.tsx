import { notFound } from "next/navigation";

import { CityInfoPage } from "@/components/CityInfoPage";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { getStoreLocation } from "@/lib/store-locations";

export const revalidate = 300;

export default async function CityDeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [location, settings, navigation] = await Promise.all([
    getStoreLocation(slug),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  if (!location) notFound();
  const chrome = siteChrome(settings, navigation);
  return (
    <CityInfoPage
      location={location}
      settings={chrome.settings}
      navigation={chrome.navigation}
      variant="delivery"
    />
  );
}
