import type { Metadata } from "next";
import Link from "next/link";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

import { ProductImage } from "@/components/ProductImage";
import { RichText } from "@/components/RichText";
import { SiteShell } from "@/components/SiteShell";
import { getBlogPostPreview, getPublishedBlogPost } from "@/lib/blog";
import { getNavigationItems, getSiteSettings } from "@/lib/directus";
import { siteChrome } from "@/lib/site-content";
import { blogPostingJsonLd, breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";
import { DEFAULT_SOCIAL_IMAGE } from "@/app/site-metadata";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string; version?: string }>;
};

export const revalidate = 300;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function stockLabel(status?: string): string {
  if (status === "available") return "В наличии";
  if (status === "reserved") return "Бронь";
  if (status === "sold") return "Продано";
  return "Смотреть карточку";
}

async function resolvePost(
  slug: string,
  previewId?: string,
  requestedVersion?: string,
): Promise<{ post: Awaited<ReturnType<typeof getPublishedBlogPost>>; preview: boolean }> {
  const draft = await draftMode();
  const canPreview = draft.isEnabled && Boolean(previewId && /^[0-9a-f-]{36}$/i.test(previewId));
  const version =
    requestedVersion && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(requestedVersion)
      ? requestedVersion
      : undefined;
  if (canPreview && previewId) {
    return { post: await getBlogPostPreview(previewId, version), preview: true };
  }
  return { post: await getPublishedBlogPost(slug), preview: false };
}

export async function generateMetadata({
  params,
  searchParams,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const { post, preview } = await resolvePost(slug, query.preview, query.version);
  if (!post) return {};
  const title = post.seoTitle || post.title;
  const description = post.metaDescription || post.excerpt;
  const canonical = post.canonicalUrl || `/blog/${post.slug}`;
  const image = post.ogImage || post.coverImage || DEFAULT_SOCIAL_IMAGE;

  return {
    title,
    description,
    alternates: { canonical },
    robots: post.noIndex || preview ? { index: false, follow: !preview } : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: post.author ? [post.author.name] : undefined,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function BlogPostPage({ params, searchParams }: BlogPostPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const [resolved, settings, navigation] = await Promise.all([
    resolvePost(slug, query.preview, query.version),
    getSiteSettings(),
    getNavigationItems(),
  ]);
  const { post, preview } = resolved;
  if (!post) notFound();
  const chrome = siteChrome(settings, navigation);

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white pb-20 sm:pb-28">
        {preview ? (
          <aside className="border-b border-blue-200 bg-blue-50" aria-label="Режим предпросмотра">
            <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-8">
              <p className="font-medium text-carbon">Предпросмотр Directus · {post.status}</p>
              <Link
                href="/api/draft/disable"
                className="focus-ring inline-flex min-h-11 items-center font-semibold text-link-blue hover:underline"
              >
                Выйти из предпросмотра
              </Link>
            </div>
          </aside>
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(blogPostingJsonLd(post)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: "Блог", path: "/blog" },
                { name: post.title, path: `/blog/${post.slug}` },
              ]),
            ),
          }}
        />

        <article>
          <header className="mx-auto max-w-measure px-5 pb-10 pt-10 sm:px-8 sm:pb-14 sm:pt-14 lg:pt-20">
            <nav aria-label="Хлебные крошки">
              <Link
                href="/blog"
                className="focus-ring inline-flex min-h-11 items-center text-sm font-medium text-link-blue hover:underline"
              >
                Блог
              </Link>
            </nav>
            <p className="mt-5 text-sm font-semibold text-link-blue">{post.category?.name}</p>
            <h1 className="leading-display mt-4 text-4xl font-semibold tracking-normal text-carbon sm:text-5xl md:text-6xl">
              {post.title}
            </h1>
            <p className="mt-6 text-xl leading-relaxed text-graphite sm:text-2xl">{post.excerpt}</p>
            <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              {post.author ? <span>{post.author.name}</span> : null}
              {post.author?.roleTitle ? <span>· {post.author.roleTitle}</span> : null}
              <span aria-hidden="true">·</span>
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            </div>
          </header>

          {post.coverImage ? (
            <figure className="mx-auto max-w-content px-5 sm:px-8">
              <div className="aspect-blog-cover relative overflow-hidden rounded-card bg-surface">
                <ProductImage
                  src={post.coverImage}
                  alt={post.coverAlt || ""}
                  fill
                  priority
                  sizes="(max-width: 1199px) 100vw, 1200px"
                  className="object-cover"
                />
              </div>
              {post.coverCaption ? (
                <figcaption className="mt-3 text-sm leading-relaxed text-muted">
                  {post.coverCaption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <div className="mx-auto max-w-measure px-5 pt-10 sm:px-8 sm:pt-14">
            <RichText
              html={post.body}
              nodes={post.bodyRichText}
              className="text-lg leading-article text-carbon"
            />

            {post.tags.length ? (
              <div className="mt-12 border-t border-hairline pt-6">
                <p className="text-sm font-semibold text-carbon">Темы</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {post.tags.map((tag) => tag.name).join(" · ")}
                </p>
              </div>
            ) : null}

            {post.author ? (
              <aside className="mt-10 border-t border-hairline pt-8" aria-label="Об авторе">
                <p className="text-sm font-semibold text-link-blue">Автор</p>
                <h2 className="mt-2 text-2xl font-semibold text-carbon">{post.author.name}</h2>
                {post.author.roleTitle ? (
                  <p className="mt-1 text-sm text-muted">{post.author.roleTitle}</p>
                ) : null}
                {post.author.bio ? (
                  <p className="mt-4 max-w-2xl leading-relaxed text-graphite">{post.author.bio}</p>
                ) : null}
              </aside>
            ) : null}
          </div>
        </article>

        {post.devices.length ? (
          <section className="mx-auto mt-16 max-w-content border-t border-hairline px-5 pt-10 sm:px-8">
            <p className="text-sm font-semibold text-link-blue">По теме материала</p>
            <h2 className="mt-3 text-3xl font-semibold text-carbon">Устройства в Store</h2>
            <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {post.devices.map((device) => (
                <Link
                  key={device.id}
                  href={`/device/${device.id}`}
                  className="focus-ring flex min-h-32 flex-col justify-between rounded-card border border-hairline bg-frost p-5 transition hover:border-link-blue hover:bg-white"
                >
                  <div>
                    <p className="text-lg font-semibold text-carbon">{device.title}</p>
                    {device.priceText ? (
                      <p className="mt-2 text-sm text-graphite">{device.priceText}</p>
                    ) : null}
                  </div>
                  <p className="mt-5 text-sm font-medium text-link-blue">
                    {stockLabel(device.stockStatus)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
