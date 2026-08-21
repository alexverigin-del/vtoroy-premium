import Link from "next/link";
import type { PageSection, ProductCardData } from "@vtoroy/shared";

import { normalizeSiteUrl } from "./site-chrome-utils";
import { HomeSectionIntro } from "./HomeSectionIntro";
import { ProductCard } from "./ProductCard";
import { RichText } from "./RichText";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

export function ProductCatalogPreviewSection({
  section,
  products,
}: {
  section: PageSection;
  products: ProductCardData[];
}) {
  const limit =
    typeof section.content.limit === "number" && section.content.limit > 0
      ? section.content.limit
      : 8;
  const note = typeof section.content.note === "string" ? section.content.note : "";
  const emptyState =
    section.content.emptyState && typeof section.content.emptyState === "object"
      ? section.content.emptyState
      : null;
  const emptyStateBody =
    emptyState && typeof emptyState.body === "string" ? emptyState.body.trim() : "";
  return (
    <section className="bg-frost py-14 md:py-20" id="catalog">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <HomeSectionIntro section={section} align="center" />

        {products.length > 0 ? (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:mt-10 lg:grid-cols-4">
            {products.slice(0, limit).map((product, index) => (
              <li key={product.id} className={index > 1 ? "hidden sm:block" : undefined}>
                <ProductCard product={product} imagePriority={index < 4} />
              </li>
            ))}
          </ul>
        ) : emptyStateBody ? (
          <p className="mt-10 rounded-card border border-hairline bg-frost p-8 text-center text-muted">
            {emptyStateBody}
          </p>
        ) : null}

        {note ? (
          <RichText
            className="mt-8 max-w-copy text-copy leading-relaxed text-graphite"
            html={note}
            nodes={section.content.noteRichText}
          />
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {section.primaryCtaLabel ? (
            <Link
              href={normalizeSiteUrl(section.primaryCtaUrl || "/catalog")}
              className={primaryCtaClass}
            >
              {section.primaryCtaLabel}
            </Link>
          ) : null}
          {section.secondaryCtaLabel ? (
            <Link
              href={normalizeSiteUrl(section.secondaryCtaUrl || "/catalog/accessories")}
              className={secondaryCtaClass}
            >
              {section.secondaryCtaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
