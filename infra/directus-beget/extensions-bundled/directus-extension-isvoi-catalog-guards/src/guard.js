export const CATEGORY_TYPE_MISMATCH_CODE = "CATEGORY_TYPE_MISMATCH";
export const CATEGORY_TYPE_MISMATCH_MESSAGE = "Категория не соответствует типу товара";

export function relationId(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && value.id != null) return String(value.id);
  return null;
}

export function effectiveProductRows(payload, currentRows = []) {
  const payloadRows = Array.isArray(payload) ? payload : [payload ?? {}];
  if (currentRows.length === 0) return payloadRows;

  return currentRows.map((current, index) => ({
    ...current,
    ...(payloadRows[index] ?? payloadRows[0] ?? {}),
  }));
}

export function findCategoryTypeMismatch(rows, categories) {
  const categoriesById = new Map(
    categories.map((category) => [String(category.id), category.catalog_section]),
  );

  for (const row of rows) {
    const categoryId = relationId(row.category);
    if (!categoryId || !row.product_type) continue;
    const catalogSection = categoriesById.get(categoryId);
    if (catalogSection && catalogSection !== row.product_type) {
      return {
        categoryId,
        catalogSection,
        productType: row.product_type,
      };
    }
  }

  return null;
}
