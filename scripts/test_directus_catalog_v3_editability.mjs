#!/usr/bin/env node

const baseUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = (process.env.DIRECTUS_TOKEN || "").trim();
const productId = process.env.CATALOG_V3_EDIT_TEST_PRODUCT_ID || "qa-galaxy-s24-case";
const usedProductId = process.env.CATALOG_V3_PASSPORT_TEST_PRODUCT_ID || "qa-used-samsung-s24";

if (!baseUrl || !token) {
  throw new Error("DIRECTUS_URL and DIRECTUS_TOKEN are required.");
}

async function rawRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.text();
  return { response, body };
}

async function request(path, options = {}) {
  const { response, body } = await rawRequest(path, options);
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body}`);
  }

  return body ? JSON.parse(body) : null;
}

const query = new URLSearchParams({
  "filter[id][_eq]": productId,
  fields:
    "id,status,content_status,product_type,category.id,category.catalog_section,short_description",
  limit: "1",
});
const result = await request(`/items/products?${query}`);
const product = result?.data?.[0];

if (!product) {
  throw new Error(`Draft QA product not found: ${productId}`);
}

if (product.status === "published") {
  throw new Error(`Refusing to edit published product: ${productId}`);
}

const originalCategoryId = product.category?.id;
if (!originalCategoryId || !product.product_type) {
  throw new Error(`QA product has no category or product_type: ${productId}`);
}

const categories = await request(
  "/items/product_categories?fields=id,catalog_section&filter[is_active][_eq]=true&limit=500",
);
const incompatibleCategory = categories?.data?.find(
  (category) => category.catalog_section !== product.product_type,
);
if (!incompatibleCategory) {
  throw new Error(`No incompatible category is available for product_type=${product.product_type}`);
}

const mismatchAttempt = await rawRequest(`/items/products/${product.id}`, {
  method: "PATCH",
  body: JSON.stringify({ category: incompatibleCategory.id }),
});
if (mismatchAttempt.response.ok) {
  await request(`/items/products/${product.id}`, {
    method: "PATCH",
    body: JSON.stringify({ category: originalCategoryId }),
  });
  throw new Error("Draft accepted a category from another catalog section.");
}
if ([401, 403, 404].includes(mismatchAttempt.response.status)) {
  throw new Error(
    `Draft category mismatch was rejected by access/routing instead of validation: ${mismatchAttempt.response.status}`,
  );
}
const validationMessageVisible = mismatchAttempt.body.includes(
  "Категория не соответствует типу товара",
);
if (!validationMessageVisible && mismatchAttempt.response.status !== 500) {
  throw new Error(`Unexpected draft validation response: ${mismatchAttempt.body}`);
}

const productAfterMismatch = await request(
  `/items/products/${product.id}?fields=id,category.id,category.catalog_section`,
);
if (productAfterMismatch?.data?.category?.id !== originalCategoryId) {
  throw new Error("Rejected category mismatch changed the QA draft.");
}

const originalDescription = product.short_description ?? null;
const marker = `catalog-v3-editability-${Date.now()}`;
const testDescription = originalDescription
  ? `${originalDescription}\n\n[${marker}]`
  : `[${marker}]`;
let changed = false;

try {
  await request(`/items/products/${product.id}`, {
    method: "PATCH",
    body: JSON.stringify({ short_description: testDescription }),
  });
  changed = true;

  const changedProduct = await request(
    `/items/products/${product.id}?fields=id,status,content_status,short_description`,
  );
  if (changedProduct?.data?.short_description !== testDescription) {
    throw new Error("Edited value was not returned by Directus.");
  }
} finally {
  if (changed) {
    await request(`/items/products/${product.id}`, {
      method: "PATCH",
      body: JSON.stringify({ short_description: originalDescription }),
    });
  }
}

const restoredProduct = await request(
  `/items/products/${product.id}?fields=id,status,content_status,short_description`,
);
if (restoredProduct?.data?.short_description !== originalDescription) {
  throw new Error("QA product was edited, but the original value was not restored.");
}

const publishAttempt = await rawRequest(`/items/products/${product.id}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "published" }),
});
if (publishAttempt.response.ok) {
  await request(`/items/products/${product.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: product.status }),
  });
  throw new Error("ISVOI Editor unexpectedly published a product.");
}
if (![401, 403].includes(publishAttempt.response.status)) {
  throw new Error(`Unexpected publication permission response: ${publishAttempt.body}`);
}

const passportQuery = new URLSearchParams({
  "filter[product][_eq]": usedProductId,
  fields:
    "id,product,summary_rows,diagnostics_status,diagnostics_checklist,condition_notes,story_facts",
  limit: "1",
});
const passportResult = await request(`/items/device_passports?${passportQuery}`);
const passport = passportResult?.data?.[0];
if (!passport) {
  throw new Error(`Draft QA Passport not found for product: ${usedProductId}`);
}

const originalSummaryRows = passport.summary_rows ?? null;
const originalChecklist = passport.diagnostics_checklist ?? null;
const originalConditionNotes = passport.condition_notes ?? null;
const originalStoryFacts = passport.story_facts ?? null;
const passportMarker = `catalog-v3-passport-${Date.now()}`;
const testSummaryRows = [
  ...(Array.isArray(originalSummaryRows) ? originalSummaryRows : []),
  { label: "QA-проверка", value: passportMarker, state: "ok" },
];
const testChecklist = [
  ...(Array.isArray(originalChecklist) ? originalChecklist : []),
  { text: passportMarker, state: "ok" },
];
const testConditionNotes = [
  ...(Array.isArray(originalConditionNotes) ? originalConditionNotes : []),
  passportMarker,
];
const testStoryFacts = [
  ...(Array.isArray(originalStoryFacts) ? originalStoryFacts : []),
  passportMarker,
];
let passportChanged = false;

try {
  await request(`/items/device_passports/${passport.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      summary_rows: testSummaryRows,
      diagnostics_checklist: testChecklist,
      condition_notes: testConditionNotes,
      story_facts: testStoryFacts,
    }),
  });
  passportChanged = true;

  const changedPassport = await request(
    `/items/device_passports/${passport.id}?fields=id,summary_rows,diagnostics_checklist,condition_notes,story_facts`,
  );
  if (
    !changedPassport?.data?.summary_rows?.some((row) => row.value === passportMarker) ||
    !changedPassport?.data?.diagnostics_checklist?.some((row) => row.text === passportMarker) ||
    !changedPassport?.data?.condition_notes?.includes(passportMarker) ||
    !changedPassport?.data?.story_facts?.includes(passportMarker)
  ) {
    throw new Error("Structured Passport rows were not returned after the edit.");
  }
} finally {
  if (passportChanged) {
    await request(`/items/device_passports/${passport.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        summary_rows: originalSummaryRows,
        diagnostics_checklist: originalChecklist,
        condition_notes: originalConditionNotes,
        story_facts: originalStoryFacts,
      }),
    });
  }
}

const restoredPassport = await request(
  `/items/device_passports/${passport.id}?fields=id,summary_rows,diagnostics_checklist,condition_notes,story_facts`,
);
if (
  JSON.stringify(restoredPassport?.data?.summary_rows ?? null) !==
    JSON.stringify(originalSummaryRows) ||
  JSON.stringify(restoredPassport?.data?.diagnostics_checklist ?? null) !==
    JSON.stringify(originalChecklist) ||
  JSON.stringify(restoredPassport?.data?.condition_notes ?? null) !==
    JSON.stringify(originalConditionNotes) ||
  JSON.stringify(restoredPassport?.data?.story_facts ?? null) !== JSON.stringify(originalStoryFacts)
) {
  throw new Error("QA Passport was edited, but its original rows were not restored.");
}

console.log(
  JSON.stringify({
    ok: true,
    product_id: productId,
    status: restoredProduct.data.status,
    content_status: restoredProduct.data.content_status,
    draft_category_type_guard: true,
    draft_category_type_guard_status: mismatchAttempt.response.status,
    validation_message_visible: validationMessageVisible,
    editor_publication_denied: true,
    editor_publication_status: publishAttempt.response.status,
    passport_product_id: usedProductId,
    passport_structured_rows_editable: true,
    passport_string_lists_editable: true,
    passport_restored: true,
    restored: true,
  }),
);
