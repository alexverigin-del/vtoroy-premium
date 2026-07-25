#!/usr/bin/env node

const baseUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = (process.env.DIRECTUS_TOKEN || "").trim();
const productId = process.env.CATALOG_V3_EDIT_TEST_PRODUCT_ID || "qa-galaxy-s24-case";

if (!baseUrl || !token) {
  throw new Error("DIRECTUS_URL and DIRECTUS_TOKEN are required.");
}

async function request(path, options = {}) {
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
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body}`);
  }

  return body ? JSON.parse(body) : null;
}

const query = new URLSearchParams({
  "filter[id][_eq]": productId,
  fields: "id,status,content_status,short_description",
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

console.log(
  JSON.stringify({
    ok: true,
    product_id: productId,
    status: restoredProduct.data.status,
    content_status: restoredProduct.data.content_status,
    restored: true,
  }),
);
