import type { MetadataRoute } from "next";
import { getBlogCategories, getPublishedBlogPosts } from "@/lib/blog";
import { getSitePage } from "@/lib/directus";
import { getAllPublishedProductCards, getProductCatalogFacets } from "@/lib/product-catalog";

const SITE_URL = "https://isvoi.ru";

const staticRoutes = [
  "",
  "/catalog",
  "/catalog/tech",
  "/catalog/accessories",
  "/store",
  "/passport",
  "/trade",
  "/blog",
] as const;
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
  const [products, facets, blogPosts, blogCategories, infoPages] = await Promise.all([
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
  ]);
  const indexablePosts = blogPosts.filter((post) => !post.noIndex);
  const usedCategorySlugs = new Set(
    indexablePosts.map((post) => post.category?.slug).filter(Boolean),
  );

  return [
    ...staticRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: now,
      changeFrequency:
        route === "" || route === "/catalog" ? ("daily" as const) : ("weekly" as const),
      priority: route === "" ? 1 : route === "/catalog" ? 0.9 : 0.7,
    })),
    ...infoPages
      .filter(({ page }) => page?.status === "published")
      .map(({ route }) => ({
        url: `${SITE_URL}${route}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ...facets.brands.map((brand) => ({
      url: `${SITE_URL}/catalog/brand/${brand.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.65,
    })),
    ...facets.categories
      .filter(
        (category) =>
          category.visibleProductCount === undefined || category.visibleProductCount > 0,
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
