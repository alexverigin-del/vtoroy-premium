import Link from "next/link";
import type { ProductCardData } from "@vtoroy/shared";

import { cn } from "../lib/cn";
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
  const sold = product.stockStatus.trim().toLowerCase() === "sold";

  return (
    <Link
      href={product.detailHref}
      className="card group flex h-full flex-col overflow-hidden outline-none transition-colors duration-200 hover:border-graphite focus-visible:shadow-focus motion-reduce:transition-none"
      data-component="ProductCard"
      data-stock-status={sold ? "sold" : product.stockStatus}
    >
      <div className={cn("flex h-full flex-col", sold && "grayscale")}>
        <div className="relative flex aspect-product items-center justify-center bg-surface">
          {src ? (
            <ProductImage
              src={src}
              alt={product.listingAlt || product.title}
              fill
              priority={imagePriority}
              sizes="(min-width: 1440px) 335px, (min-width: 1280px) calc((100vw - 100px) / 4), (min-width: 1024px) calc((100vw - 80px) / 3), (min-width: 640px) calc((100vw - 60px) / 2), calc(100vw - 40px)"
              className="object-cover transition duration-300"
            />
          ) : (
            <span className="px-5 text-center text-sm text-muted">{product.title}</span>
          )}
          {sold ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-pill bg-carbon/80 px-5 py-2 text-sm font-semibold text-white">
              {product.stockStatusLabel}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{conditionLabel(product)}</span>
            {!sold ? <span>{product.stockStatusLabel}</span> : null}
          </div>

          {!product.title.toLocaleLowerCase().includes(product.brand.name.toLocaleLowerCase()) ? (
            <p className="mt-3 text-xs font-medium text-muted">{product.brand.name}</p>
          ) : null}
          <h3 className="mt-2 break-words text-lg font-semibold leading-tight text-carbon">
            {product.title}
          </h3>
          {product.color &&
          !product.title.toLocaleLowerCase().includes(product.color.toLocaleLowerCase()) ? (
            <p className="mt-1 text-sm text-muted">{product.color}</p>
          ) : null}
          <p
            className={cn(
              "mt-3 text-lg font-semibold tabular-nums",
              sold ? "text-muted" : "text-carbon",
            )}
          >
            {product.priceText}
          </p>

          {product.trustFacts.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {product.trustFacts.map((fact) => (
                <li key={fact} className="flex items-center text-xs font-medium text-graphite">
                  <span className="mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-auto pt-2">
            <span
              className={cn(
                "mt-3 inline-flex text-sm font-medium group-hover:underline",
                sold ? "text-graphite" : "text-accent",
              )}
            >
              {product.ctaLabel} →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
