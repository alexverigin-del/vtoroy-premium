#!/usr/bin/env node

const baseUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = (process.env.DIRECTUS_TOKEN || "").trim();
const slug = process.env.CATALOG_V3_EDIT_TEST_SLUG || "qa-galaxy-s24-case";

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
  "filter[slug][_eq]": slug,
  fields: "id,slug,status,content_status,description",
  limit: "1",
});
const result = await request(`/items/products?${query}`);
const product = result?.data?.[0];

if (!product) {
  throw new Error(`Draft QA product not found: ${slug}`);
}

if (product.status === "published") {
  throw new Error(`Refusing to edit published product: ${slug}`);
}

const originalDescription = product.description ?? null;
const marker = `catalog-v3-editability-${Date.now()}`;
const testDescription = originalDescription
  ? `${originalDescription}\n\n[${marker}]`
  : `[${marker}]`;
let changed = false;

try {
  await request(`/items/products/${product.id}`, {
    method: "PATCH",
    body: JSON.stringify({ description: testDescription }),
  });
  changed = true;

  const changedProduct = await request(
    `/items/products/${product.id}?fields=id,slug,status,content_status,description`,
  );
  if (changedProduct?.data?.description !== testDescription) {
    throw new Error("Edited value was not returned by Directus.");
  }
} finally {
  if (changed) {
    await request(`/items/products/${product.id}`, {
      method: "PATCH",
      body: JSON.stringify({ description: originalDescription }),
    });
  }
}

const restoredProduct = await request(
  `/items/products/${product.id}?fields=id,slug,status,content_status,description`,
);
if (restoredProduct?.data?.description !== originalDescription) {
  throw new Error("QA product was edited, but the original value was not restored.");
}

console.log(
  JSON.stringify({
    ok: true,
    slug,
    status: restoredProduct.data.status,
    content_status: restoredProduct.data.content_status,
    restored: true,
  }),
);
