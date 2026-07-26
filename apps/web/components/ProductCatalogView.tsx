import Link from "next/link";
import type {
  ProductCatalogFacets,
  ProductCatalogFilters,
  ProductCatalogResult,
  ProductType,
} from "@vtoroy/shared";
import type { ReactNode } from "react";

import { CatalogMobileFilterDrawer } from "./CatalogMobileFilterDrawer";
import { ProductCard } from "./ProductCard";
import { cn } from "../lib/cn";
import { brandZoneEyebrowClass, primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

type CatalogCopy = {
  eyebrow: string;
  headline: string;
  body: string;
};

type CatalogCategory = ProductCatalogFacets["categories"][number];
type FilterFieldName =
  "brand" | "category" | "compatible" | "condition" | "page" | "q" | "sort" | "stock";
type FilterChip = {
  href: string;
  key: string;
  value: ReactNode;
};

const CATEGORY_TILE_LIMIT = 8;

function queryString(
  filters: ProductCatalogFilters,
  overrides: Partial<ProductCatalogFilters>,
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.brand) params.set("brand", merged.brand);
  if (merged.category) params.set("category", merged.category);
  if (merged.condition) params.set("condition", merged.condition);
  if (merged.compatible) params.set("compatible", merged.compatible);
  if (merged.stock) params.set("stock", merged.stock);
  if (merged.sort && merged.sort !== "default") params.set("sort", merged.sort);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function sectionHref(type?: ProductType): string {
  if (type === "device") return "/catalog/tech";
  if (type === "accessory") return "/catalog/accessories";
  return "/catalog";
}

function optionLabel(type?: ProductType): string {
  if (type === "device") return "Техника";
  if (type === "accessory") return "Аксессуары";
  return "Всё";
}

function catalogCategories(
  facets: ProductCatalogFacets,
  type?: ProductType,
  products: ProductCatalogResult["products"] = [],
): CatalogCategory[] {
  const bySlug = new Map<string, CatalogCategory>();
  for (const category of facets.categories) {
    if (!type || category.catalogSection === type) bySlug.set(category.slug, category);
  }
  for (const product of products) {
    if (!type || product.category.catalogSection === type) {
      bySlug.set(product.category.slug, product.category);
    }
  }
  return [...bySlug.values()];
}

function categoryTiles(categories: CatalogCategory[], activeSlug?: string): CatalogCategory[] {
  const featured = categories.slice(0, CATEGORY_TILE_LIMIT);
  const active = activeSlug
    ? categories.find((category) => category.slug === activeSlug && !featured.includes(category))
    : undefined;
  return active ? [...featured, active] : featured;
}

function categoryName(categories: CatalogCategory[], slug?: string): string {
  return categories.find((category) => category.slug === slug)?.name || "";
}

function brandName(facets: ProductCatalogFacets, slug?: string): string {
  return facets.brands.find((brand) => brand.slug === slug)?.name || "";
}

function compatibleName(facets: ProductCatalogFacets, slug?: string): string {
  const model = facets.models.find((item) => item.slug === slug);
  return model ? `${model.brand.name} ${model.name}` : "";
}

function hiddenFilterFields(
  filters: ProductCatalogFilters,
  type?: ProductType,
  omitted: FilterFieldName[] = [],
): { name: FilterFieldName; value: string }[] {
  const omit = new Set(omitted);
  const entries: { name: FilterFieldName; value?: string | number }[] = [
    { name: "q", value: filters.q },
    { name: "category", value: filters.category },
    { name: "brand", value: filters.brand },
    { name: "condition", value: type !== "accessory" ? filters.condition : undefined },
    { name: "compatible", value: type === "accessory" ? filters.compatible : undefined },
    { name: "stock", value: filters.stock },
    { name: "sort", value: filters.sort && filters.sort !== "default" ? filters.sort : undefined },
  ];

  return entries.flatMap((entry) => {
    if (omit.has(entry.name) || !entry.value) return [];
    return [{ name: entry.name, value: String(entry.value) }];
  });
}

function HiddenFilterFields({
  filters,
  omit = [],
  type,
}: {
  filters: ProductCatalogFilters;
  omit?: FilterFieldName[];
  type?: ProductType;
}) {
  return (
    <>
      {hiddenFilterFields(filters, type, omit).map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
    </>
  );
}

function activeFilterChips({
  categories,
  facets,
  filters,
  type,
}: {
  categories: CatalogCategory[];
  facets: ProductCatalogFacets;
  filters: ProductCatalogFilters;
  type?: ProductType;
}): FilterChip[] {
  const chips: FilterChip[] = [];
  const basePath = sectionHref(type);
  const push = (key: FilterFieldName, value: ReactNode) => {
    if (!value) return;
    chips.push({
      href: `${basePath}${queryString(filters, { [key]: undefined, page: undefined })}`,
      key,
      value,
    });
  };

  push("q", filters.q || null);
  push("category", categoryName(categories, filters.category) || null);
  push("brand", brandName(facets, filters.brand) || null);
  if (type !== "accessory" && filters.condition) {
    push("condition", <ConditionFilterValue value={filters.condition} />);
  }
  if (type === "accessory") {
    push("compatible", compatibleName(facets, filters.compatible) || null);
  }
  if (filters.stock) push("stock", <StockFilterValue value={filters.stock} />);
  if (filters.sort && filters.sort !== "default") {
    push("sort", <SortFilterValue value={filters.sort} />);
  }
  return chips;
}

function ConditionFilterValue({ value }: { value?: string }) {
  if (value === "new") return <>Новое</>;
  if (value === "used") return <>Б/у</>;
  return null;
}

function StockFilterValue({ value }: { value?: string }) {
  if (value === "available") return <>В наличии</>;
  if (value === "reserved") return <>Бронь</>;
  if (value === "sold") return <>Нет в наличии</>;
  return null;
}

function SortFilterValue({ value }: { value?: string }) {
  if (value === "updated-desc") return <>Сначала обновлённые</>;
  if (value === "price-asc") return <>Цена: ниже</>;
  if (value === "price-desc") return <>Цена: выше</>;
  return null;
}

function FilterChipLabel({ name }: { name: string }) {
  if (name === "q") return <>Поиск</>;
  if (name === "category") return <>Категория</>;
  if (name === "brand") return <>Бренд</>;
  if (name === "condition") return <>Состояние</>;
  if (name === "compatible") return <>Совместимость</>;
  if (name === "stock") return <>Наличие</>;
  if (name === "sort") return <>Сортировка</>;
  return null;
}

function CatalogCategoryRail({
  categories,
  filters,
  type,
}: {
  categories: CatalogCategory[];
  filters: ProductCatalogFilters;
  type?: ProductType;
}) {
  const basePath = sectionHref(type);
  const tiles = categoryTiles(categories, filters.category);
  if (tiles.length === 0) return null;

  return (
    <nav
      className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="category"
    >
      <Link
        href={`${basePath}${queryString(filters, { category: undefined, page: undefined })}`}
        aria-current={!filters.category ? "page" : undefined}
        className={
          !filters.category
            ? "inline-flex min-h-11 items-center justify-between gap-2 rounded-pill border border-action-blue bg-action-blue px-4 py-3 text-sm font-semibold text-white"
            : "inline-flex min-h-11 items-center justify-between gap-2 rounded-pill border border-hairline bg-frost px-4 py-3 text-sm font-semibold text-carbon transition hover:border-action-blue hover:bg-white"
        }
      >
        <span>Все категории</span>
        <span aria-hidden="true">→</span>
      </Link>
      {tiles.map((category) => {
        const isActive = filters.category === category.slug;
        return (
          <Link
            key={category.id}
            href={`${basePath}${queryString(filters, {
              category: category.slug,
              page: undefined,
            })}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "inline-flex min-h-11 items-center justify-between gap-2 rounded-pill border border-action-blue bg-action-blue px-4 py-3 text-sm font-semibold text-white"
                : "inline-flex min-h-11 items-center justify-between gap-2 rounded-pill border border-hairline bg-frost px-4 py-3 text-sm font-semibold text-carbon transition hover:border-action-blue hover:bg-white"
            }
          >
            <span>{category.name}</span>
            <span aria-hidden="true">→</span>
          </Link>
        );
      })}
    </nav>
  );
}

function CatalogAdvancedFilterFields({
  facets,
  filters,
  type,
}: {
  facets: ProductCatalogFacets;
  filters: ProductCatalogFilters;
  type?: ProductType;
}) {
  return (
    <>
      <label>
        <span className="text-xs font-medium text-muted">Бренд</span>
        <select
          name="brand"
          defaultValue={filters.brand || ""}
          className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
        >
          <option value="">Все бренды</option>
          {facets.brands.map((brand) => (
            <option key={brand.id} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>

      {type !== "accessory" ? (
        <label>
          <span className="text-xs font-medium text-muted">Состояние</span>
          <select
            name="condition"
            defaultValue={filters.condition || ""}
            className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
          >
            <option value="">Новое и б/у</option>
            <option value="new">Новое</option>
            <option value="used">Б/у</option>
          </select>
        </label>
      ) : null}

      {type === "accessory" ? (
        <label>
          <span className="text-xs font-medium text-muted">Совместимость</span>
          <select
            name="compatible"
            defaultValue={filters.compatible || ""}
            className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
          >
            <option value="">Любая модель</option>
            {facets.models.map((model) => (
              <option key={model.id} value={model.slug}>
                {model.brand.name} {model.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        <span className="text-xs font-medium text-muted">Наличие</span>
        <select
          name="stock"
          defaultValue={filters.stock || ""}
          className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
        >
          <option value="">Все статусы</option>
          <option value="available">В наличии</option>
          <option value="reserved">Бронь</option>
          <option value="sold">Нет в наличии</option>
        </select>
      </label>
    </>
  );
}

function ActiveFilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-pill border border-hairline bg-white px-3 text-xs font-medium text-carbon transition hover:border-action-blue"
        >
          <span className="text-muted">
            <FilterChipLabel name={chip.key} />:
          </span>
          <span>{chip.value}</span>
          <span className="text-muted" aria-hidden="true">
            ×
          </span>
        </Link>
      ))}
    </div>
  );
}

function CatalogTypeTabs({ activeType }: { activeType?: ProductType }) {
  return (
    <nav className="mt-8 flex gap-2 overflow-x-auto pb-1" aria-label="Раздел каталога">
      {([undefined, "device", "accessory"] as const).map((type) => (
        <Link
          key={type || "all"}
          href={sectionHref(type)}
          aria-current={activeType === type ? "page" : undefined}
          className={
            activeType === type
              ? "min-h-11 shrink-0 rounded-pill border border-action-blue bg-action-blue px-5 py-3 text-sm font-medium text-white"
              : "min-h-11 shrink-0 rounded-pill border border-hairline bg-white px-5 py-3 text-sm font-medium text-graphite transition hover:border-action-blue hover:text-carbon"
          }
        >
          {optionLabel(type)}
        </Link>
      ))}
    </nav>
  );
}

function CatalogFilters({
  categories,
  facets,
  filters,
  type,
}: {
  categories: CatalogCategory[];
  facets: ProductCatalogFacets;
  filters: ProductCatalogFilters;
  type?: ProductType;
}) {
  const advancedFilterCount = [
    filters.brand,
    type !== "accessory" ? filters.condition : undefined,
    type === "accessory" ? filters.compatible : undefined,
    filters.stock,
  ].filter(Boolean).length;
  const hasAdvancedFilters = advancedFilterCount > 0;

  return (
    <>
      <CatalogCategoryRail categories={categories} filters={filters} type={type} />

      <div
        className="mt-5 rounded-card border border-hairline bg-frost p-4 md:hidden"
        data-component="CatalogFilters"
      >
        <form action={sectionHref(type)}>
          <HiddenFilterFields filters={filters} omit={["q"]} type={type} />
          <label>
            <span className="text-xs font-medium text-muted">Поиск</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Модель, бренд или аксессуар"
              className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
            />
          </label>
          <button type="submit" className={cn(primaryPillCtaClass, "mt-3 w-full")}>
            Показать
          </button>
        </form>
        <div className="mt-3 border-t border-hairline pt-3">
          <CatalogMobileFilterDrawer
            activeCount={advancedFilterCount}
            title={<span>Расширенные фильтры</span>}
            triggerClassName={cn(secondaryPillCtaClass, "w-full")}
          >
            <form action={sectionHref(type)} className="grid gap-3">
              <HiddenFilterFields
                filters={filters}
                omit={["brand", "category", "compatible", "condition", "sort", "stock"]}
                type={type}
              />
              <label>
                <span className="text-xs font-medium text-muted">Категория</span>
                <select
                  name="category"
                  defaultValue={filters.category || ""}
                  className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
                >
                  <option value="">Все категории</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs font-medium text-muted">Сортировка</span>
                <select
                  name="sort"
                  defaultValue={filters.sort || "default"}
                  className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
                >
                  <option value="default">По рекомендации</option>
                  <option value="updated-desc">Сначала обновлённые</option>
                  <option value="price-asc">Цена: ниже</option>
                  <option value="price-desc">Цена: выше</option>
                </select>
              </label>
              <CatalogAdvancedFilterFields facets={facets} filters={filters} type={type} />
              <div className="grid grid-cols-2 gap-2">
                <Link href={sectionHref(type)} className={secondaryPillCtaClass}>
                  Сбросить
                </Link>
                <button type="submit" className={primaryPillCtaClass}>
                  Показать
                </button>
              </div>
            </form>
          </CatalogMobileFilterDrawer>
        </div>
      </div>

      <form
        action={sectionHref(type)}
        className="mt-5 hidden rounded-card border border-hairline bg-frost p-4 md:block"
        data-component="CatalogFilters"
      >
        <div className="grid gap-3 lg:grid-cols-12">
          <label className="lg:col-span-4">
            <span className="text-xs font-medium text-muted">Поиск</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Модель, бренд или аксессуар"
              className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
            />
          </label>

          <label className="lg:col-span-3">
            <span className="text-xs font-medium text-muted">Категория</span>
            <select
              name="category"
              defaultValue={filters.category || ""}
              className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
            >
              <option value="">Все категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="lg:col-span-3">
            <span className="text-xs font-medium text-muted">Сортировка</span>
            <select
              name="sort"
              defaultValue={filters.sort || "default"}
              className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
            >
              <option value="default">По рекомендации</option>
              <option value="updated-desc">Сначала обновлённые</option>
              <option value="price-asc">Цена: ниже</option>
              <option value="price-desc">Цена: выше</option>
            </select>
          </label>

          <div className="flex flex-col justify-end lg:col-span-2">
            <button type="submit" className={primaryPillCtaClass}>
              Показать
            </button>
          </div>
        </div>

        <details className="group mt-3" open={hasAdvancedFilters}>
          <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between rounded-card border border-hairline bg-white px-4 text-sm font-medium text-carbon marker:hidden">
            <span>
              Расширенные фильтры
              {advancedFilterCount > 0 ? (
                <span className="ml-2 rounded-pill bg-frost px-2 py-0.5 text-xs text-muted">
                  {advancedFilterCount}
                </span>
              ) : null}
            </span>
            <span className="text-muted transition group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </summary>

          <div className="mt-3 grid gap-3 border-t border-hairline pt-3 md:grid-cols-2 xl:grid-cols-4">
            <CatalogAdvancedFilterFields facets={facets} filters={filters} type={type} />
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
              <Link href={sectionHref(type)} className={secondaryPillCtaClass}>
                Сбросить
              </Link>
              <button type="submit" className={primaryPillCtaClass}>
                Показать
              </button>
            </div>
          </div>
        </details>
      </form>
    </>
  );
}

function Pagination({
  basePath,
  filters,
  result,
}: {
  basePath: string;
  filters: ProductCatalogFilters;
  result: ProductCatalogResult;
}) {
  if (result.pageCount <= 1) return null;
  return (
    <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Страницы каталога">
      {result.page > 1 ? (
        <Link
          href={`${basePath}${queryString(filters, { page: result.page - 1 })}`}
          className={secondaryPillCtaClass}
        >
          Назад
        </Link>
      ) : null}
      <span className="text-sm tabular-nums text-muted">
        {result.page} из {result.pageCount}
      </span>
      {result.page < result.pageCount ? (
        <Link
          href={`${basePath}${queryString(filters, { page: result.page + 1 })}`}
          className={secondaryPillCtaClass}
        >
          Дальше
        </Link>
      ) : null}
    </nav>
  );
}

export function ProductCatalogView({
  copy,
  facets,
  filters,
  result,
  type,
}: {
  copy: CatalogCopy;
  facets: ProductCatalogFacets;
  filters: ProductCatalogFilters;
  result: ProductCatalogResult;
  type?: ProductType;
}) {
  const basePath = sectionHref(type);
  const categories = catalogCategories(facets, type, result.products);
  const chips = activeFilterChips({ categories, facets, filters, type });
  const categorySuggestions = categoryTiles(
    categories.filter((category) => category.slug !== filters.category),
  ).slice(0, 3);
  return (
    <section className="bg-white py-14 md:py-20" data-component="ProductCatalogView">
      <div className="mx-auto max-w-shell px-5">
        <div className="max-w-copy-wide">
          <p className={brandZoneEyebrowClass}>{copy.eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-carbon md:text-6xl">
            {copy.headline}
          </h1>
          <p className="mt-5 max-w-prose text-copy leading-relaxed text-graphite">{copy.body}</p>
        </div>

        <CatalogTypeTabs activeType={type} />
        <CatalogFilters categories={categories} facets={facets} filters={filters} type={type} />

        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Найдено: <span className="font-medium tabular-nums text-carbon">{result.total}</span>
            </p>
            <ActiveFilterChips chips={chips} />
          </div>
          <p className="hidden text-sm text-muted sm:block">24 товара на странице</p>
        </div>

        {result.products.length > 0 ? (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.products.map((product, index) => (
              <li key={product.id}>
                <ProductCard product={product} imagePriority={index < 4} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-card border border-hairline bg-frost px-6 py-12 text-center">
            <h2 className="text-2xl font-semibold text-carbon">Подходящих товаров пока нет</h2>
            <p className="mx-auto mt-3 max-w-prose text-sm leading-relaxed text-muted">
              Измените фильтры или оставьте заявку — проверим поступления и предложим варианты.
            </p>
            <div className="mt-5">
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                <Link href={basePath} className={secondaryPillCtaClass}>
                  Сбросить
                </Link>
                <Link href="/#final" className={primaryPillCtaClass}>
                  Получить варианты
                </Link>
              </div>
              {categorySuggestions.length > 0 ? (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {categorySuggestions.map((category) => (
                    <Link
                      key={category.id}
                      href={`${basePath}${queryString(filters, {
                        category: category.slug,
                        page: undefined,
                        q: undefined,
                      })}`}
                      className="focus-ring inline-flex min-h-9 items-center rounded-pill border border-hairline bg-white px-3 text-xs font-medium text-carbon transition hover:border-action-blue"
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <Pagination basePath={basePath} filters={filters} result={result} />
      </div>
    </section>
  );
}
