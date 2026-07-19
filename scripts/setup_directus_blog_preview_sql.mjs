#!/usr/bin/env node
/**
 * Print SQL that configures Directus Live Preview for blog posts.
 * The one-purpose preview secret is injected at runtime and never committed.
 *
 * Required env:
 *   BLOG_PREVIEW_SECRET
 *
 * Optional env:
 *   BLOG_PREVIEW_URL=https://isvoi.ru/api/draft/blog
 */

const secret = (process.env.BLOG_PREVIEW_SECRET || "").trim();
const endpoint = (process.env.BLOG_PREVIEW_URL || "https://isvoi.ru/api/draft/blog").trim();

if (!secret) {
  console.error("BLOG_PREVIEW_SECRET must be set.");
  process.exit(1);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const separator = endpoint.includes("?") ? "&" : "?";
const previewUrl = `${endpoint}${separator}secret=${encodeURIComponent(secret)}&id={{id}}`;

process.stdout.write(String.raw`
BEGIN;

UPDATE directus_collections
SET versioning = true,
  preview_url = ${sql(previewUrl)}
WHERE collection = 'blog_posts';

COMMIT;

SELECT 'blog.preview_configured' AS check_name, count(*)::text AS value
FROM directus_collections
WHERE collection = 'blog_posts'
  AND versioning = true
  AND preview_url IS NOT NULL;
`);
