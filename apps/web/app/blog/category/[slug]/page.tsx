import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogListing } from "@/components/BlogListing";
import { SiteShell } from "@/components/SiteShell";
import { getBlogCategories, getBlogCategory, getPublishedBlogPosts } from "@/lib/blog";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

type BlogCategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

export async function generateMetadata({ params }: BlogCategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getBlogCategory(slug);
  if (!category) return {};
  const description =
    category.description ||
    `Материалы I СВОИ по теме «${category.name}»: практические разборы и проверенные ориентиры.`;
  return {
    title: `${category.name} — блог I СВОИ`,
    description,
    alternates: { canonical: `/blog/category/${category.slug}` },
    openGraph: {
      title: `${category.name} — блог I СВОИ`,
      description,
      url: `/blog/category/${category.slug}`,
    },
  };
}

export default async function BlogCategoryPage({ params }: BlogCategoryPageProps) {
  const { slug } = await params;
  const [category, categories, posts, settings, navigation] = await Promise.all([
    getBlogCategory(slug),
    getBlogCategories(),
    getPublishedBlogPosts({ categorySlug: slug }),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  if (!category) notFound();
  const chrome = siteChrome(settings, navigation);
  const description =
    category.description ||
    `Практические материалы I СВОИ по теме «${category.name}» — без кликбейта и лишней неизвестности.`;

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
                { name: category.name, path: `/blog/category/${category.slug}` },
              ]),
            ),
          }}
        />
        <BlogListing
          title={category.name}
          description={description}
          posts={posts}
          categories={categories}
          activeCategorySlug={category.slug}
        />
      </main>
    </SiteShell>
  );
}
