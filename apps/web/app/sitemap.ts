import type { MetadataRoute } from "next";
import { getBlogCategories, getPublishedBlogPosts } from "@/lib/blog";
import { getSitePage } from "@/lib/directus";
import { getAllPublishedProductCards, getProductCatalogFacets } from "@/lib/product-catalog";
import { getStoreLocations } from "@/lib/store-locations";

const SITE_URL = "https://isvoi.ru";

const staticRoutes = ["", "/catalog", "/catalog/tech", "/passport", "/trade", "/blog"] as const;
const managedInfoRoutes = [
  "/about",
  "/contacts",
  "/warranty",
  "/payment",
  "/privacy",
  "/terms",
] as const;

function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [products, facets, blogPosts, blogCategories, infoPages, locations] = await Promise.all([
    getAllPublishedProductCards(),
    getProductCatalogFacets(),
    getPublishedBlogPosts({ limit: 100 }),
    getBlogCategories(),
    Promise.all(
      managedInfoRoutes.map(async (route) => ({
        route,
        page: await getSitePage(route.slice(1)),
      })),
    ),
    getStoreLocations(),
  ]);
  const indexablePosts = blogPosts.filter((post) => !post.noIndex);
  const usedCategorySlugs = new Set(
    indexablePosts.map((post) => post.category?.slug).filter(Boolean),
  );
  const catalogBrandSlugs = new Set(products.map((product) => product.brand.slug));
  const catalogCategorySlugs = new Set(products.map((product) => product.category.slug));
  const hasAccessories = products.some((product) => product.productType === "accessory");

  return [
    ...staticRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: now,
      changeFrequency:
        route === "" || route === "/catalog" ? ("daily" as const) : ("weekly" as const),
      priority: route === "" ? 1 : route === "/catalog" ? 0.9 : 0.7,
    })),
    ...(hasAccessories
      ? [
          {
            url: `${SITE_URL}/catalog/accessories`,
            lastModified: now,
            changeFrequency: "daily" as const,
            priority: 0.7,
          },
        ]
      : []),
    {
      url: `${SITE_URL}/stores`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    ...locations.flatMap((location) => [
      {
        url: `${SITE_URL}/${location.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${location.slug}/catalog`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${location.slug}/contacts`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      },
      {
        url: `${SITE_URL}/${location.slug}/delivery`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      },
    ]),
    ...infoPages
      .filter(({ page }) => page?.status === "published")
      .map(({ route }) => ({
        url: `${SITE_URL}${route}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ...facets.brands
      .filter((brand) => catalogBrandSlugs.has(brand.slug))
      .map((brand) => ({
        url: `${SITE_URL}/catalog/brand/${brand.slug}`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.65,
      })),
    ...facets.categories
      .filter(
        (category) =>
          catalogCategorySlugs.has(category.slug) &&
          (category.visibleProductCount === undefined || category.visibleProductCount > 0),
      )
      .map((category) => ({
        url: `${SITE_URL}/catalog/category/${category.slug}`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.65,
      })),
    ...products.map((product) => ({
      url: `${SITE_URL}/product/${product.id}`,
      lastModified: validDate(product.updatedAt) ?? now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...indexablePosts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: validDate(post.updatedAt || post.publishedAt) ?? now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...blogCategories
      .filter((category) => usedCategorySlugs.has(category.slug))
      .map((category) => ({
        url: `${SITE_URL}/blog/category/${category.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
  ];
}
