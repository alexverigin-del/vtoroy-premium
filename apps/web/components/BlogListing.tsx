import type { BlogCategory, BlogPost } from "@vtoroy/shared";
import Link from "next/link";

import { ProductImage } from "@/components/ProductImage";
import { brandZoneEyebrowClass } from "@/components/ui-classes";
import { cn } from "@/lib/cn";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function CategoryNavigation({
  categories,
  activeSlug,
}: {
  categories: BlogCategory[];
  activeSlug?: string;
}) {
  return (
    <nav aria-label="Рубрики блога" className="border-b border-hairline">
      <div className="mx-auto flex max-w-content gap-6 overflow-x-auto px-5 sm:px-8">
        <Link
          href="/blog"
          aria-current={!activeSlug ? "page" : undefined}
          className={cn(
            "focus-ring shrink-0 border-b-2 py-4 text-sm font-medium",
            !activeSlug
              ? "border-carbon text-carbon"
              : "border-transparent text-muted hover:text-carbon",
          )}
        >
          Все материалы
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/blog/category/${category.slug}`}
            aria-current={activeSlug === category.slug ? "page" : undefined}
            className={cn(
              "focus-ring shrink-0 border-b-2 py-4 text-sm font-medium",
              activeSlug === category.slug
                ? "border-carbon text-carbon"
                : "border-transparent text-muted hover:text-carbon",
            )}
          >
            {category.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ArticleMeta({ post }: { post: BlogPost }) {
  return (
    <p className="text-sm leading-relaxed text-muted">
      {post.category?.name}
      <span aria-hidden="true"> · </span>
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
    </p>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="border-t border-hairline pt-5">
      <Link href={`/blog/${post.slug}`} className="focus-ring group block">
        {post.coverImage ? (
          <div className="relative aspect-blog-cover overflow-hidden rounded-card bg-surface">
            <ProductImage
              src={post.coverImage}
              alt={post.coverAlt || ""}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
              className="object-cover transition duration-300 group-hover:opacity-95"
            />
          </div>
        ) : null}
        <div className="pt-5">
          <ArticleMeta post={post} />
          <h2 className="mt-3 text-2xl font-semibold leading-tight text-carbon group-hover:text-link-blue">
            {post.title}
          </h2>
          <p className="mt-3 line-clamp-3 text-base leading-relaxed text-graphite">
            {post.excerpt}
          </p>
        </div>
      </Link>
    </article>
  );
}

export function BlogListing({
  title,
  description,
  posts,
  categories,
  activeCategorySlug,
}: {
  title: string;
  description: string;
  posts: BlogPost[];
  categories: BlogCategory[];
  activeCategorySlug?: string;
}) {
  const featured = posts.find((post) => post.featured) ?? posts[0];
  const remaining = posts.filter((post) => post.id !== featured?.id);

  return (
    <>
      <section className="border-b border-hairline bg-frost">
        <div className="mx-auto max-w-content px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <p className={brandZoneEyebrowClass}>I СВОИ · Блог</p>
          <h1 className="leading-display mt-4 max-w-4xl text-4xl font-semibold tracking-normal text-carbon sm:text-5xl md:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-graphite sm:text-xl">
            {description}
          </p>
        </div>
      </section>

      <CategoryNavigation categories={categories} activeSlug={activeCategorySlug} />

      <section className="mx-auto max-w-content px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        {!featured ? (
          <div className="max-w-2xl border-t border-hairline pt-8">
            <h2 className="text-2xl font-semibold text-carbon">Материалы готовятся</h2>
            <p className="mt-3 leading-relaxed text-graphite">
              Здесь появятся практические разборы о проверке, выборе и разумном владении техникой.
            </p>
          </div>
        ) : (
          <>
            <article className="grid items-center gap-8 border-b border-hairline pb-12 md:grid-cols-2 md:gap-12 lg:pb-16">
              <Link
                href={`/blog/${featured.slug}`}
                className="focus-ring group relative aspect-blog-cover overflow-hidden rounded-card bg-surface"
              >
                {featured.coverImage ? (
                  <ProductImage
                    src={featured.coverImage}
                    alt={featured.coverAlt || ""}
                    fill
                    priority
                    sizes="(max-width: 767px) 100vw, 50vw"
                    className="object-cover transition duration-300 group-hover:opacity-95"
                  />
                ) : null}
              </Link>
              <div>
                <ArticleMeta post={featured} />
                <h2 className="mt-4 text-3xl font-semibold leading-tight text-carbon sm:text-4xl">
                  <Link href={`/blog/${featured.slug}`} className="focus-ring hover:text-link-blue">
                    {featured.title}
                  </Link>
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-graphite">{featured.excerpt}</p>
                <Link
                  href={`/blog/${featured.slug}`}
                  className="focus-ring mt-7 inline-flex min-h-11 items-center text-sm font-semibold text-link-blue hover:underline"
                >
                  Читать материал
                </Link>
              </div>
            </article>

            {remaining.length ? (
              <div className="grid gap-x-8 gap-y-12 pt-12 md:grid-cols-2 lg:grid-cols-3 lg:pt-16">
                {remaining.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
