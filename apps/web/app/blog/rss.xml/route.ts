import { getPublishedBlogPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/structured-data";

export const revalidate = 300;

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const posts = (await getPublishedBlogPosts({ limit: 100 })).filter((post) => !post.noIndex);
  const items = posts
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      return [
        "<item>",
        `<title>${xml(post.title)}</title>`,
        `<link>${xml(url)}</link>`,
        `<guid isPermaLink="true">${xml(url)}</guid>`,
        `<description>${xml(post.excerpt)}</description>`,
        `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`,
        post.author ? `<dc:creator>${xml(post.author.name)}</dc:creator>` : "",
        post.category ? `<category>${xml(post.category.name)}</category>` : "",
        "</item>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    "<title>Блог I СВОИ</title>",
    `<link>${SITE_URL}/blog</link>`,
    "<description>Практические материалы о проверке, выборе и разумном владении техникой.</description>",
    "<language>ru-RU</language>",
    items,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
