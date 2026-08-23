import Link from "next/link";
import type { ProductCardData } from "@vtoroy/shared";

import { ProductImage, productImageSrc } from "./ProductImage";

function conditionLabel(product: ProductCardData): string {
  if (product.productType === "accessory") return "Новый аксессуар";
  return product.condition === "new" ? "Новая техника" : "С пробегом · Проверено";
}

export function ProductCard({
  product,
  imagePriority = false,
}: {
  product: ProductCardData;
  imagePriority?: boolean;
}) {
  const src = productImageSrc(product.listingImage);

  return (
    <Link
      href={product.detailHref}
      className="card group flex h-full flex-col overflow-hidden outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-product focus-visible:shadow-focus active:translate-y-0"
      data-component="ProductCard"
    >
      <div className="relative flex aspect-product items-center justify-center bg-surface">
        {src ? (
          <ProductImage
            src={src}
            alt={product.listingAlt || product.title}
            fill
            priority={imagePriority}
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-300"
          />
        ) : (
          <span className="px-5 text-center text-sm text-muted">{product.title}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>{conditionLabel(product)}</span>
          <span>{product.stockStatusLabel}</span>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-eyebrow text-muted">
          {product.brand.name} · {product.category.name}
        </p>
        <h3 className="mt-2 text-lg font-semibold leading-tight text-carbon">{product.title}</h3>
        {product.color ? <p className="mt-1 text-sm text-muted">{product.color}</p> : null}

        {product.trustFacts.length > 0 ? (
          <ul className="mt-5 grid gap-2">
            {product.trustFacts.map((fact) => (
              <li
                key={fact}
                className="flex min-h-8 items-center rounded-card bg-surface px-3 text-xs font-medium text-graphite"
              >
                <span className="mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span className="truncate">{fact}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto pt-5">
          <p className="text-lg font-semibold tabular-nums text-carbon">{product.priceText}</p>
          <span className="mt-3 inline-flex text-sm font-medium text-accent group-hover:underline">
            {product.ctaLabel} →
          </span>
        </div>
      </div>
    </Link>
  );
}
