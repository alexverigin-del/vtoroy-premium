#!/usr/bin/env node

import process from "node:process";

const batch = process.argv[2];
const apply = process.argv.includes("--apply");
if (!batch || !/^[a-z0-9-]+$/.test(batch)) {
  throw new Error(
    "Usage: node scripts/purge_catalog_photo_refresh_files.mjs <photo-refresh-batch> [--apply]",
  );
}

const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
if (!directusUrl || !token) {
  throw new Error("DIRECTUS_URL and INVENTORY_IMPORT_DIRECTUS_TOKEN are required");
}

async function request(method, pathname) {
  const response = await fetch(`${directusUrl}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${pathname}: ${response.status} ${text.slice(0, 800)}`);
  }
  return json.data;
}

const first = async (endpoint, query) =>
  (await request("GET", `/${endpoint}?${query}&limit=1`))?.[0];
const reviewFolder = await first(
  "folders",
  `filter[name][_eq]=${encodeURIComponent("ISVOI File Review")}&fields=id`,
);
if (!reviewFolder) throw new Error("ISVOI File Review folder is missing");

const files = await request(
  "GET",
  `/files?filter[folder][_eq]=${encodeURIComponent(reviewFolder.id)}&filter[description][_contains]=${encodeURIComponent(batch)}&fields=id,title,description&limit=-1`,
);
if (files.length === 0) throw new Error(`No superseded files found for ${batch}`);

for (const file of files) {
  if (!String(file.title || "").startsWith("isvoi:release-v8:")) {
    throw new Error(`Refusing unexpected file ${file.id}: ${file.title}`);
  }
  const productReference = await first(
    "items/products",
    `filter[listing_file][_eq]=${encodeURIComponent(file.id)}&fields=id`,
  );
  const imageReference = await first(
    "items/product_images",
    `filter[image][_eq]=${encodeURIComponent(file.id)}&fields=id`,
  );
  if (productReference || imageReference) {
    throw new Error(`Refusing referenced file ${file.id}`);
  }
}

if (apply) {
  for (const file of files) await request("DELETE", `/files/${encodeURIComponent(file.id)}`);
}

process.stdout.write(
  `${apply ? "Deleted" : "Checked"} ${files.length} unreferenced superseded files for ${batch}.\n`,
);
