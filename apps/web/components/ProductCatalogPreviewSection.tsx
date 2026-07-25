import Link from "next/link";
import type { PageSection, ProductCardData } from "@vtoroy/shared";

import { normalizeSiteUrl } from "./site-chrome-utils";
import { ProductCard } from "./ProductCard";
import { RichText } from "./RichText";
import { homeSectionLabelClass, primaryCtaClass, secondaryCtaClass } from "./ui-classes";

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
  return (
    <section className="bg-white py-16 md:py-20" id="catalog">
      <div className="mx-auto max-w-page px-4 md:px-6">
        <div className="mx-auto max-w-copy text-center">
          {section.eyebrow ? <div className={homeSectionLabelClass}>{section.eyebrow}</div> : null}
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            {section.headline || "Техника и аксессуары в наличии"}
          </h2>
          {section.body ? (
            <RichText
              className="mt-4 text-copy leading-relaxed text-graphite"
              html={section.body}
              nodes={section.bodyRichText}
            />
          ) : null}
        </div>

        {products.length > 0 ? (
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, limit).map((product, index) => (
              <li key={product.id}>
                <ProductCard product={product} imagePriority={index < 4} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 rounded-card border border-hairline bg-frost p-8 text-center text-muted">
            Каталог обновляется. Оставьте заявку — проверим поступления и предложим варианты.
          </p>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={normalizeSiteUrl(section.primaryCtaUrl || "/catalog")}
            className={primaryCtaClass}
          >
            {section.primaryCtaLabel || "Смотреть каталог"}
          </Link>
          <Link href="/catalog/accessories" className={secondaryCtaClass}>
            Смотреть аксессуары
          </Link>
        </div>
      </div>
    </section>
  );
}
