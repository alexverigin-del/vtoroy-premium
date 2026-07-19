export const SITE_SETTINGS_CACHE_TAG = "directus:site-settings";
export const SITE_PAGES_CACHE_TAG = "directus:site-pages";
export const PAGE_SECTIONS_CACHE_TAG = "directus:page-sections";
export const NAVIGATION_ITEMS_CACHE_TAG = "directus:navigation-items";
export const FAQ_ITEMS_CACHE_TAG = "directus:faq-items";
export const DEVICE_PAGE_SETTINGS_CACHE_TAG = "directus:device-page-settings";
export const BLOG_POSTS_CACHE_TAG = "directus:blog-posts";
export const BLOG_TAXONOMY_CACHE_TAG = "directus:blog-taxonomy";

export const SITE_CONTENT_CACHE_TAGS = [
  SITE_SETTINGS_CACHE_TAG,
  SITE_PAGES_CACHE_TAG,
  PAGE_SECTIONS_CACHE_TAG,
  NAVIGATION_ITEMS_CACHE_TAG,
  FAQ_ITEMS_CACHE_TAG,
  DEVICE_PAGE_SETTINGS_CACHE_TAG,
  BLOG_POSTS_CACHE_TAG,
  BLOG_TAXONOMY_CACHE_TAG,
] as const;
