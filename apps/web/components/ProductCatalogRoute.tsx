import type { ProductCatalogFilters, ProductType } from "@vtoroy/shared";
import type { StoreLocation } from "@vtoroy/shared";

import { getNavigationItems, getSitePage, getSiteSettings } from "@/lib/directus";
import {
  getCatalogSource,
  getProductCatalogFacets,
  getPublishedProducts,
} from "@/lib/product-catalog";
import { siteChrome } from "@/lib/site-content";
import {
  breadcrumbJsonLd,
  jsonLdScript,
  productCatalogItemListJsonLd,
} from "@/lib/structured-data";

import { ProductCatalogView } from "./ProductCatalogView";
import { SiteShell } from "./SiteShell";

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number(first(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function filtersFromSearchParams(
  searchParams: CatalogSearchParams,
  presets: Partial<ProductCatalogFilters>,
): ProductCatalogFilters {
  const condition = first(searchParams.condition);
  const stock = first(searchParams.stock);
  const sort = first(searchParams.sort);
  return {
    ...presets,
    q: first(searchParams.q) || undefined,
    brand: presets.brand || first(searchParams.brand) || undefined,
    category: presets.category || first(searchParams.category) || undefined,
    condition: condition === "new" || condition === "used" ? condition : presets.condition,
    compatible: first(searchParams.compatible) || undefined,
    stock:
      stock === "available" ||
      stock === "reserved" ||
      stock === "sold" ||
      (stock === "delivery" && presets.city)
        ? stock
        : presets.stock,
    sort:
      sort === "updated-desc" || sort === "price-asc" || sort === "price-desc" ? sort : "default",
    page: pageNumber(searchParams.page),
    pageSize: 24,
  };
}

function text(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function catalogCopy(type: ProductType | undefined, page: Awaited<ReturnType<typeof getSitePage>>) {
  const section =
    page?.sections.find(
      (item) =>
        item.isActive &&
        (item.sectionKey === "catalog_page_live" || item.variant === "catalog.grid"),
    ) ?? null;
  const emptyState = section?.content.emptyState;

  if (type === "device") {
    return {
      eyebrow: "I СВОИ · Техника",
      headline: "Новая техника и техника с пробегом.",
      body: "Сравнивайте бренды, состояние, точные характеристики и наличие. Для техники с пробегом показываем Passport и результаты диагностики.",
    };
  }

  if (type === "accessory") {
    return {
      eyebrow: "I СВОИ · Аксессуары",
      headline: "Новые аксессуары с точной совместимостью.",
      body: "Чехлы, зарядки, кабели и другие аксессуары можно выбрать отдельно или подобрать к конкретной модели устройства.",
    };
  }

  return {
    eyebrow: text(section?.eyebrow, "I СВОИ · Каталог"),
    headline: text(section?.headline, "Техника и аксессуары в наличии."),
    body: text(
      section?.body,
      "Новая техника и техника с пробегом разных брендов, а также новые аксессуары с понятной совместимостью и гарантией.",
    ),
    emptyTitle: emptyState?.headline,
    emptyBody: emptyState?.body,
    emptyCtaLabel: emptyState?.ctaLabel,
    emptyCtaUrl: emptyState?.ctaUrl,
  };
}

export async function ProductCatalogRoute({
  breadcrumbLabel = "Каталог",
  presets = {},
  searchParams,
  location,
}: {
  breadcrumbLabel?: string;
  presets?: Partial<ProductCatalogFilters>;
  searchParams: CatalogSearchParams;
  location?: StoreLocation;
}) {
  const filters = filtersFromSearchParams(searchParams, {
    ...presets,
    city: location?.slug ?? presets.city,
    cityName: location?.city ?? presets.cityName,
  });
  const [page, settings, navigation, result, facets] = await Promise.all([
    getSitePage("catalog"),
    getSiteSettings(),
    getNavigationItems(),
    getPublishedProducts(filters),
    getProductCatalogFacets(),
  ]);
  const chrome = siteChrome(settings, navigation);
  const baseCopy = catalogCopy(filters.type, page);
  const copy = location
    ? {
        eyebrow: text(location.catalogEyebrow, `I СВОИ · ${location.city}`),
        headline: text(location.catalogTitle, `${location.city} · Техника и аксессуары.`),
        body: text(
          location.catalogBody,
          "Сначала показываем товары в наличии в выбранном магазине, затем — доступные с доставкой из других городов.",
        ),
        emptyTitle: location.catalogEmptyTitle,
        emptyBody: location.catalogEmptyBody,
      }
    : baseCopy;
  const catalogPath = location ? `/${location.slug}/catalog` : "/catalog";

  return (
    <SiteShell settings={chrome.settings} navigation={chrome.navigation}>
      <main id="top" className="bg-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Главная", path: "/" },
                { name: "Каталог", path: catalogPath },
                ...(breadcrumbLabel === "Каталог"
                  ? []
                  : [
                      {
                        name: breadcrumbLabel,
                        path:
                          filters.type === "accessory"
                            ? `${catalogPath}/accessories`
                            : `${catalogPath}/tech`,
                      },
                    ]),
              ]),
            ),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(productCatalogItemListJsonLd(result.products, copy.headline)),
          }}
        />
        <ProductCatalogView
          catalogSource={getCatalogSource()}
          city={location?.city}
          copy={copy}
          facets={facets}
          filters={filters}
          result={result}
          type={filters.type}
        />
      </main>
    </SiteShell>
  );
}
