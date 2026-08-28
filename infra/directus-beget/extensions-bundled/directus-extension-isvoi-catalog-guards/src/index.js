import {
  CATEGORY_TYPE_MISMATCH_CODE,
  CATEGORY_TYPE_MISMATCH_MESSAGE,
  effectiveProductRows,
  findCategoryTypeMismatch,
  relationId,
} from "./guard.js";

class CategoryTypeMismatchError extends Error {
  name = "DirectusError";
  code = CATEGORY_TYPE_MISMATCH_CODE;
  status = 400;
  extensions;

  constructor() {
    super(CATEGORY_TYPE_MISMATCH_MESSAGE);
  }
}

async function validateCategoryType(payload, currentRows, database) {
  const rows = effectiveProductRows(payload, currentRows);
  const categoryIds = [...new Set(rows.map((row) => relationId(row.category)).filter(Boolean))];
  if (categoryIds.length === 0) return payload;

  const categories = await database("product_categories")
    .select("id", "catalog_section")
    .whereIn("id", categoryIds);
  if (findCategoryTypeMismatch(rows, categories)) {
    throw new CategoryTypeMismatchError();
  }

  return payload;
}

export default ({ filter }) => {
  filter("products.items.create", async (payload, _meta, { database }) =>
    validateCategoryType(payload, [], database),
  );

  filter("products.items.update", async (payload, meta, { database }) => {
    const keys = (Array.isArray(meta.keys) ? meta.keys : [meta.keys]).filter(Boolean);
    if (keys.length === 0) return payload;
    const currentRows = await database("products")
      .select("id", "product_type", "category")
      .whereIn("id", keys);
    return validateCategoryType(payload, currentRows, database);
  });
};
