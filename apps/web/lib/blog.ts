import "server-only";

import type {
  BlogAuthor,
  BlogCategory,
  BlogPost,
  BlogPostStatus,
  BlogRelatedDevice,
  BlogTag,
} from "@vtoroy/shared";
import { cache } from "react";

import { BLOG_POSTS_CACHE_TAG, BLOG_TAXONOMY_CACHE_TAG } from "@/lib/cache-tags";
import { directusAssetUrl, directusConfig } from "@/lib/directus";
import { prepareRichText } from "@/lib/rich-text";

const REVALIDATE = 300;

type DirectusFileRow = {
  id?: string;
};

type BlogAuthorRow = {
  id?: string;
  name?: string;
  slug?: string;
  role_title?: string;
  bio?: string;
  avatar?: DirectusFileRow | string | null;
};

type BlogCategoryRow = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
};

type BlogTagRow = {
  id?: string;
  name?: string;
  slug?: string;
};

type BlogRelatedDeviceRow = {
  id?: string;
  title?: string;
  price_text?: string;
  stock_status?: string;
};

type BlogPostRow = {
  id?: string;
  status?: BlogPostStatus;
  slug?: string;
  title?: string;
  excerpt?: string;
  body?: string;
  cover_image?: DirectusFileRow | string | null;
  cover_alt?: string;
  cover_caption?: string;
  category?: BlogCategoryRow | string | null;
  author?: BlogAuthorRow | string | null;
  featured?: boolean;
  published_at?: string;
  date_created?: string;
  date_updated?: string;
  seo_title?: string;
  meta_description?: string;
  canonical_url?: string;
  no_index?: boolean;
  og_image?: DirectusFileRow | string | null;
  tags?: Array<{ blog_tags_id?: BlogTagRow | string | null }>;
  devices?: Array<{
    sort?: number;
    devices_id?: BlogRelatedDeviceRow | string | null;
  }>;
};

const POST_FIELDS = [
  "id",
  "slug",
  "title",
  "excerpt",
  "body",
  "cover_image.id",
  "cover_alt",
  "cover_caption",
  "category.id",
  "category.name",
  "category.slug",
  "category.description",
  "author.id",
  "author.name",
  "author.slug",
  "author.role_title",
  "author.bio",
  "author.avatar.id",
  "featured",
  "published_at",
  "date_updated",
  "seo_title",
  "meta_description",
  "canonical_url",
  "no_index",
  "og_image.id",
  "tags.blog_tags_id.id",
  "tags.blog_tags_id.name",
  "tags.blog_tags_id.slug",
  "devices.sort",
  "devices.devices_id.id",
  "devices.devices_id.title",
  "devices.devices_id.price_text",
  "devices.devices_id.stock_status",
].join(",");

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fileId(value: DirectusFileRow | string | null | undefined): string {
  if (typeof value === "string") return value;
  return text(value?.id);
}

function mapAuthor(value: BlogAuthorRow | string | null | undefined): BlogAuthor | undefined {
  if (!value || typeof value === "string") return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const slug = text(value.slug);
  if (!id || !name || !slug) return undefined;
  const avatarId = fileId(value.avatar);
  return {
    id,
    name,
    slug,
    ...(text(value.role_title) ? { roleTitle: text(value.role_title) } : {}),
    ...(text(value.bio) ? { bio: text(value.bio) } : {}),
    ...(avatarId
      ? {
          avatar: directusAssetUrl(avatarId, {
            width: 320,
            height: 320,
            quality: 82,
            fit: "cover",
            format: "auto",
            withoutEnlargement: true,
          }),
        }
      : {}),
  };
}

function mapCategory(value: BlogCategoryRow | string | null | undefined): BlogCategory | undefined {
  if (!value || typeof value === "string") return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const slug = text(value.slug);
  if (!id || !name || !slug) return undefined;
  return {
    id,
    name,
    slug,
    ...(text(value.description) ? { description: text(value.description) } : {}),
  };
}

function mapTag(value: BlogTagRow | string | null | undefined): BlogTag | undefined {
  if (!value || typeof value === "string") return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const slug = text(value.slug);
  return id && name && slug ? { id, name, slug } : undefined;
}

function mapDevice(
  value: BlogRelatedDeviceRow | string | null | undefined,
): BlogRelatedDevice | undefined {
  if (!value || typeof value === "string") return undefined;
  const id = text(value.id);
  const title = text(value.title);
  if (!id || !title) return undefined;
  return {
    id,
    title,
    ...(text(value.price_text) ? { priceText: text(value.price_text) } : {}),
    ...(text(value.stock_status) ? { stockStatus: text(value.stock_status) } : {}),
  };
}

function mapPost(row: BlogPostRow, allowIncomplete = false): BlogPost | null {
  const id = text(row.id);
  const slug = text(row.slug);
  const title = text(row.title);
  const excerpt = text(row.excerpt) || (allowIncomplete ? "Лид статьи пока не заполнен." : "");
  const publishedAt =
    text(row.published_at) ||
    text(row.date_created) ||
    (allowIncomplete ? new Date().toISOString() : "");
  const richText = prepareRichText(
    text(row.body) || (allowIncomplete ? "<p>Текст статьи пока не заполнен.</p>" : ""),
  );
  const coverId = fileId(row.cover_image);
  const coverAlt = text(row.cover_alt);
  const category = mapCategory(row.category);
  const author = mapAuthor(row.author);
  if (
    !id ||
    !slug ||
    !title ||
    !excerpt ||
    !publishedAt ||
    !richText.html ||
    (!allowIncomplete && !coverId) ||
    (!allowIncomplete && !coverAlt) ||
    (!allowIncomplete && !category) ||
    (!allowIncomplete && !author)
  )
    return null;

  const ogImageId = fileId(row.og_image);
  const tags = (row.tags ?? [])
    .map((relation) => mapTag(relation.blog_tags_id))
    .filter((tag): tag is BlogTag => Boolean(tag));
  const devices = [...(row.devices ?? [])]
    .sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))
    .map((relation) => mapDevice(relation.devices_id))
    .filter((device): device is BlogRelatedDevice => Boolean(device));

  return {
    id,
    status: row.status ?? "published",
    slug,
    title,
    excerpt,
    body: richText.html,
    bodyRichText: richText.nodes,
    ...(coverId
      ? {
          coverImage: directusAssetUrl(coverId, {
            width: 1600,
            height: 1000,
            quality: 84,
            fit: "cover",
            format: "auto",
            withoutEnlargement: true,
          }),
        }
      : {}),
    ...(coverAlt ? { coverAlt } : {}),
    ...(text(row.cover_caption) ? { coverCaption: text(row.cover_caption) } : {}),
    ...(category ? { category } : {}),
    ...(author ? { author } : {}),
    tags,
    devices,
    featured: row.featured === true,
    publishedAt,
    ...(text(row.date_updated) ? { updatedAt: text(row.date_updated) } : {}),
    ...(text(row.seo_title) ? { seoTitle: text(row.seo_title) } : {}),
    ...(text(row.meta_description) ? { metaDescription: text(row.meta_description) } : {}),
    ...(text(row.canonical_url) ? { canonicalUrl: text(row.canonical_url) } : {}),
    noIndex: row.no_index === true,
    ...(ogImageId
      ? {
          ogImage: directusAssetUrl(ogImageId, {
            width: 1200,
            height: 630,
            quality: 84,
            fit: "cover",
            format: "auto",
            withoutEnlargement: true,
          }),
        }
      : {}),
  };
}

async function blogGet<T>(path: string, tags: string[]): Promise<T | null> {
  if (!directusConfig.url) return null;
  const headers: Record<string, string> = {};
  if (directusConfig.token) headers.Authorization = `Bearer ${directusConfig.token}`;

  try {
    const response = await fetch(`${directusConfig.url}${path}`, {
      headers,
      next: { revalidate: REVALIDATE, tags },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { data: T }).data;
  } catch {
    return null;
  }
}

type BlogPostQuery = {
  categorySlug?: string;
  limit?: number;
};

export const getPublishedBlogPosts = cache(async function getPublishedBlogPosts({
  categorySlug,
  limit = 24,
}: BlogPostQuery = {}): Promise<BlogPost[]> {
  const params = new URLSearchParams({
    fields: POST_FIELDS,
    sort: "-featured,-published_at",
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });
  params.set("filter[published_at][_lte]", "$NOW");
  if (categorySlug) params.set("filter[category][slug][_eq]", categorySlug);

  const rows = await blogGet<BlogPostRow[]>(`/items/blog_posts?${params}`, [
    BLOG_POSTS_CACHE_TAG,
    BLOG_TAXONOMY_CACHE_TAG,
  ]);
  return (rows ?? []).map((row) => mapPost(row)).filter((post): post is BlogPost => Boolean(post));
});

export const getPublishedBlogPost = cache(async function getPublishedBlogPost(
  slug: string,
): Promise<BlogPost | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) return null;

  const params = new URLSearchParams({ fields: POST_FIELDS, limit: "1" });
  params.set("filter[slug][_eq]", normalizedSlug);
  params.set("filter[published_at][_lte]", "$NOW");
  const rows = await blogGet<BlogPostRow[]>(`/items/blog_posts?${params}`, [
    BLOG_POSTS_CACHE_TAG,
    BLOG_TAXONOMY_CACHE_TAG,
  ]);
  return rows?.[0] ? mapPost(rows[0]) : null;
});

export async function getBlogPostPreview(id: string, version?: string): Promise<BlogPost | null> {
  if (!directusConfig.url || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const token = (process.env.DIRECTUS_PREVIEW_TOKEN || "").trim();
  if (!token) return null;

  const params = new URLSearchParams({
    fields: `${POST_FIELDS},status,date_created`,
  });
  if (version) params.set("version", version);

  try {
    const response = await fetch(`${directusConfig.url}/items/blog_posts/${id}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const row = ((await response.json()) as { data: BlogPostRow }).data;
    return row ? mapPost(row, true) : null;
  } catch {
    return null;
  }
}

export const getBlogCategories = cache(async function getBlogCategories(): Promise<BlogCategory[]> {
  const params = new URLSearchParams({
    fields: "id,name,slug,description",
    sort: "sort,name",
    limit: "100",
  });
  params.set("filter[is_active][_eq]", "true");
  const rows = await blogGet<BlogCategoryRow[]>(`/items/blog_categories?${params}`, [
    BLOG_TAXONOMY_CACHE_TAG,
  ]);
  return (rows ?? [])
    .map((row) => mapCategory(row))
    .filter((category): category is BlogCategory => Boolean(category));
});

export const getBlogCategory = cache(async function getBlogCategory(
  slug: string,
): Promise<BlogCategory | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) return null;
  const categories = await getBlogCategories();
  return categories.find((category) => category.slug === normalizedSlug) ?? null;
});
