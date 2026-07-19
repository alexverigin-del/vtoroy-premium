import type { Metadata } from "next";

import { BlogListing } from "@/components/BlogListing";
import { SiteShell } from "@/components/SiteShell";
import { getBlogCategories, getPublishedBlogPosts } from "@/lib/blog";
import { getNavigationItems, getSitePage, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "../site-metadata";

const title = "Разумный выбор и владение техникой";
const description =
  "Практические разборы I СВОИ: диагностика, состояние, батарея, ремонт, цена выхода и спокойная покупка без чужой неизвестности.";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("blog");
  const metadataTitle = page?.title || `Блог I СВОИ — ${title}`;
  const metadataDescription = page?.metaDescription || description;
  const image = page?.ogImage || DEFAULT_SOCIAL_IMAGE;
  return {
    title: metadataTitle,
    description: metadataDescription,
    alternates: {
      canonical: "/blog",
      types: {
        "application/rss+xml": "/blog/rss.xml",
      },
    },
    openGraph: {
      title: metadataTitle,
      description: metadataDescription,
      url: "/blog",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: metadataTitle,
      description: metadataDescription,
      images: [image],
    },
  };
}

export const revalidate = 300;

export default async function BlogPage() {
  const [posts, categories, page, settings, navigation] = await Promise.all([
    getPublishedBlogPosts(),
    getBlogCategories(),
    getSitePage("blog"),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  const chrome = siteChrome(settings, navigation);
  const indexSection = page?.sections.find(
    (section) => section.isActive && section.variant === "blog.index",
  );

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: "Блог", path: "/blog" },
              ]),
            ),
          }}
        />
        <BlogListing
          title={indexSection?.headline || title}
          description={indexSection?.subheadline || description}
          posts={posts}
          categories={categories}
        />
      </main>
    </SiteShell>
  );
}
