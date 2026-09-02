import type { MetadataRoute } from "next";
import { getBlogCategories, getPublishedBlogPosts } from "@/lib/blog";
import { getSitePage } from "@/lib/directus";
import { getAllPublishedProductCards, getProductCatalogFacets } from "@/lib/product-catalog";
import { getStoreLocations } from "@/lib/store-locations";
import { sitemapLastModified } from "@/lib/seo-metadata";

const SITE_URL = "https://isvoi.ru";

const staticRoutes = ["", "/catalog", "/catalog/tech", "/passport", "/trade", "/blog"] as const;
const managedInfoRoutes = ["/about", "/warranty", "/payment", "/privacy", "/terms"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
      changeFrequency:
        route === "" || route === "/catalog" ? ("daily" as const) : ("weekly" as const),
      priority: route === "" ? 1 : route === "/catalog" ? 0.9 : 0.7,
    })),
    ...(hasAccessories
      ? [
          {
            url: `${SITE_URL}/catalog/accessories`,
            changeFrequency: "daily" as const,
            priority: 0.7,
          },
        ]
      : []),
    {
      url: `${SITE_URL}/stores`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    ...locations.flatMap((location) => [
      {
        url: `${SITE_URL}/${location.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${location.slug}/catalog`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${location.slug}/delivery`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      },
    ]),
    ...infoPages
      .filter(({ page }) => page?.status === "published")
      .map(({ route }) => ({
        url: `${SITE_URL}${route}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ...facets.brands
      .filter((brand) => catalogBrandSlugs.has(brand.slug))
      .map((brand) => ({
        url: `${SITE_URL}/catalog/brand/${brand.slug}`,
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
        changeFrequency: "daily" as const,
        priority: 0.65,
      })),
    ...products.map((product) => ({
      url: `${SITE_URL}/product/${product.id}`,
      lastModified: sitemapLastModified(product.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...indexablePosts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: sitemapLastModified(post.updatedAt || post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...blogCategories
      .filter((category) => usedCategorySlugs.has(category.slug))
      .map((category) => ({
        url: `${SITE_URL}/blog/category/${category.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
  ];
}
