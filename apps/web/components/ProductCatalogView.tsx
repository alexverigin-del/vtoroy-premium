import Link from "next/link";
import type {
  ProductCatalogFacets,
  ProductCatalogFilters,
  ProductCatalogResult,
  ProductType,
} from "@vtoroy/shared";

import { ProductCard } from "./ProductCard";
import { primaryPillCtaClass, secondaryPillCtaClass } from "./ui-classes";

type CatalogCopy = {
  eyebrow: string;
  headline: string;
  body: string;
};

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
  facets,
  filters,
  type,
}: {
  facets: ProductCatalogFacets;
  filters: ProductCatalogFilters;
  type?: ProductType;
}) {
  const categories = facets.categories.filter(
    (category) => !type || category.catalogSection === type,
  );

  return (
    <form
      action={sectionHref(type)}
      className="mt-6 grid gap-3 rounded-card border border-hairline bg-frost p-4 md:grid-cols-2 xl:grid-cols-4"
      data-component="CatalogFilters"
    >
      <label className="xl:col-span-2">
        <span className="text-xs font-medium text-muted">Поиск</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Модель, бренд или аксессуар"
          className="focus-ring mt-1 min-h-11 w-full rounded-card border border-hairline bg-white px-3 text-sm"
        />
      </label>

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

      <div className="flex items-end gap-2 xl:col-span-2 xl:justify-end">
        <Link href={sectionHref(type)} className={secondaryPillCtaClass}>
          Сбросить
        </Link>
        <button type="submit" className={primaryPillCtaClass}>
          Показать
        </button>
      </div>
    </form>
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
  return (
    <section className="bg-white py-14 md:py-20" data-component="ProductCatalogView">
      <div className="mx-auto max-w-shell px-5">
        <div className="max-w-copy-wide">
          <p className="text-xs font-medium uppercase tracking-eyebrow text-muted">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-carbon md:text-6xl">
            {copy.headline}
          </h1>
          <p className="mt-5 max-w-prose text-copy leading-relaxed text-graphite">{copy.body}</p>
        </div>

        <CatalogTypeTabs activeType={type} />
        <CatalogFilters facets={facets} filters={filters} type={type} />

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Найдено: <span className="font-medium tabular-nums text-carbon">{result.total}</span>
          </p>
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
              <Link href="/#final" className={primaryPillCtaClass}>
                Получить варианты
              </Link>
            </div>
          </div>
        )}

        <Pagination basePath={basePath} filters={filters} result={result} />
      </div>
    </section>
  );
}
