import type { MetadataRoute } from "next";
import { getBlogCategories, getPublishedBlogPosts } from "@/lib/blog";
import { getPublishedDeviceCards } from "@/lib/directus";

const SITE_URL = "https://isvoi.ru";

const staticRoutes = ["", "/catalog", "/store", "/passport", "/trade", "/club", "/blog"] as const;

function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [devices, blogPosts, blogCategories] = await Promise.all([
    getPublishedDeviceCards(),
    getPublishedBlogPosts({ limit: 100 }),
    getBlogCategories(),
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
    ...devices.map((device) => ({
      url: `${SITE_URL}/device/${device.id}`,
      lastModified: validDate(device.updatedAt) ?? now,
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
