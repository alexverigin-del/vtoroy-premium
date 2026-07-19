import type { Metadata } from "next";
import Link from "next/link";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

import { ProductImage } from "@/components/ProductImage";
import { BlogArticleContent } from "@/components/BlogArticleContent";
import { SiteShell } from "@/components/SiteShell";
import { detailBackLinkClass } from "@/components/ui-classes";
import { getBlogPostPreview, getPublishedBlogPost, getPublishedBlogPosts } from "@/lib/blog";
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

function meaningfulUpdatedAt(publishedAt: string, updatedAt?: string): string | undefined {
  if (!updatedAt) return undefined;
  const published = new Date(publishedAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(published) || !Number.isFinite(updated)) return undefined;
  return updated - published >= 24 * 60 * 60 * 1000 ? updatedAt : undefined;
}

function attributedHref(path: string, slug: string, content: string, hash = ""): string {
  const params = new URLSearchParams({
    utm_source: "blog",
    utm_medium: "editorial",
    utm_campaign: slug,
    utm_content: content,
  });
  return `${path}?${params}${hash}`;
}

function previewAssetUrl(assetId: string, postId: string, version: string, width: number): string {
  const params = new URLSearchParams({ post: postId, version, width: String(width) });
  return `/api/draft/blog-asset/${assetId}?${params}`;
}

function deviceFacts(device: { batteryText?: string; warrantyText?: string }): string[] {
  return [device.batteryText, device.warrantyText].filter((fact): fact is string => Boolean(fact));
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
  const updatedAt = meaningfulUpdatedAt(post.publishedAt, post.updatedAt);
  const relatedPosts = post.category
    ? (await getPublishedBlogPosts({ categorySlug: post.category.slug, limit: 4 }))
        .filter((candidate) => candidate.id !== post.id)
        .slice(0, 3)
    : [];

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white pb-20 sm:pb-28">
        {preview ? (
          <aside className="border-b border-blue-200 bg-blue-50" aria-label="Режим предпросмотра">
            <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-8">
              <p className="font-medium text-carbon">Предпросмотр Directus · {post.status}</p>
              <a
                href="/api/draft/disable"
                className="focus-ring inline-flex min-h-11 items-center font-semibold text-link-blue hover:underline"
              >
                Выйти из предпросмотра
              </a>
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
            <nav aria-label="Навигация по блогу">
              <Link href="/blog" className={detailBackLinkClass}>
                ← Блог
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
              {updatedAt ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Обновлено <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
                  </span>
                </>
              ) : null}
            </div>
          </header>

          {post.coverImage ? (
            <figure className="mx-auto max-w-content px-5 sm:px-8">
              <div className="relative aspect-blog-cover overflow-hidden rounded-card bg-surface">
                <ProductImage
                  src={
                    preview && query.version && post.coverAssetId
                      ? previewAssetUrl(post.coverAssetId, post.id, query.version, 1600)
                      : post.coverImage
                  }
                  alt={post.coverAlt || ""}
                  fill
                  priority
                  sizes="(max-width: 1199px) 100vw, 1200px"
                  className="object-cover"
                  unoptimized={preview && Boolean(query.version && post.coverAssetId)}
                />
              </div>
              {post.coverCaption ? (
                <figcaption className="mt-3 text-sm leading-relaxed text-muted">
                  {post.coverCaption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <BlogArticleContent post={post} previewVersion={preview ? query.version : undefined} />

          <div className="mx-auto max-w-measure px-5 sm:px-8">
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

            <aside className="mt-10 border-y border-hairline py-8" aria-label="Подбор устройства">
              <p className="text-sm font-semibold text-link-blue">Нужен понятный вариант?</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight text-carbon">
                Подберём устройство под задачу и бюджет
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-graphite">
                Сопоставим состояние, батарею, известные ремонты и цену до покупки.
              </p>
              <Link
                href={attributedHref("/", post.slug, "article-end", "#final")}
                className="focus-ring mt-6 inline-flex min-h-11 items-center rounded-pill bg-action-blue px-5 text-sm font-semibold text-white transition hover:bg-link-blue"
              >
                Получить подбор
              </Link>
            </aside>
          </div>
        </article>

        {relatedPosts.length >= 2 ? (
          <section className="mx-auto mt-16 max-w-content border-t border-hairline px-5 pt-10 sm:px-8">
            <p className="text-sm font-semibold text-link-blue">Продолжить чтение</p>
            <h2 className="mt-3 text-3xl font-semibold text-carbon">Читайте также</h2>
            <div className="mt-7 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((related) => (
                <article key={related.id} className="border-t border-hairline pt-5">
                  <Link href={`/blog/${related.slug}`} className="focus-ring group block">
                    {related.coverImage ? (
                      <div className="relative aspect-blog-cover overflow-hidden rounded-card bg-surface">
                        <ProductImage
                          src={related.coverImage}
                          alt={related.coverAlt || ""}
                          fill
                          sizes="(max-width: 767px) 100vw, 33vw"
                          className="object-cover transition duration-300 group-hover:opacity-95"
                        />
                      </div>
                    ) : null}
                    <h3 className="mt-4 text-xl font-semibold leading-tight text-carbon group-hover:text-link-blue">
                      {related.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-graphite">
                      {related.excerpt}
                    </p>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {post.devices.length ? (
          <section className="mx-auto mt-16 max-w-content border-t border-hairline px-5 pt-10 sm:px-8">
            <p className="text-sm font-semibold text-link-blue">По теме материала</p>
            <h2 className="mt-3 text-3xl font-semibold text-carbon">Устройства в Store</h2>
            <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {post.devices.map((device) => (
                <Link
                  key={device.id}
                  href={attributedHref(`/device/${device.id}`, post.slug, "related-device")}
                  className="focus-ring group grid min-h-48 overflow-hidden rounded-card border border-hairline bg-frost transition hover:border-link-blue hover:bg-white sm:grid-cols-related-device"
                >
                  <div className="relative aspect-product bg-surface sm:aspect-auto">
                    {device.listingImage ? (
                      <ProductImage
                        src={device.listingImage}
                        alt={device.listingAlt || device.title}
                        fill
                        sizes="(max-width: 639px) 100vw, 192px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-col justify-between p-5">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-carbon">{device.title}</h3>
                        {device.grade ? (
                          <span className="rounded bg-white px-2 py-1 text-xs font-medium text-muted">
                            {device.grade}
                          </span>
                        ) : null}
                      </div>
                      {deviceFacts(device).length ? (
                        <ul className="mt-3 grid gap-1.5 text-sm leading-relaxed text-graphite">
                          {deviceFacts(device).map((fact) => (
                            <li key={fact}>{fact}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-4">
                      <div>
                        {device.priceText ? (
                          <p className="font-semibold text-carbon">{device.priceText}</p>
                        ) : null}
                        <p className="mt-1 text-sm text-muted">{stockLabel(device.stockStatus)}</p>
                      </div>
                      <span className="text-sm font-medium text-link-blue group-hover:underline">
                        Смотреть
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
