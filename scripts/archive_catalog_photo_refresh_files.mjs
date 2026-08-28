#!/usr/bin/env node

import process from "node:process";

const batch = process.argv[2];
const apply = process.argv.includes("--apply");
if (!batch || !/^[a-z0-9-]+$/.test(batch)) {
  throw new Error(
    "Usage: node scripts/archive_catalog_photo_refresh_files.mjs <photo-refresh-batch> [--apply]",
  );
}

const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
if (!directusUrl || !token) {
  throw new Error("DIRECTUS_URL and INVENTORY_IMPORT_DIRECTUS_TOKEN are required");
}

async function request(method, pathname, body) {
  const response = await fetch(`${directusUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
async function folderId(name) {
  const folder = await first("folders", `filter[name][_eq]=${encodeURIComponent(name)}&fields=id`);
  if (!folder) throw new Error(`${name} folder is missing`);
  return folder.id;
}

const reviewFolder = await folderId("ISVOI File Review");
const archiveFolder = await folderId("ISVOI Product Photo Archive");
const files = await request(
  "GET",
  `/files?filter[folder][_eq]=${encodeURIComponent(reviewFolder)}&filter[description][_contains]=${encodeURIComponent(batch)}&fields=id,title,description&limit=-1`,
);
if (files.length === 0) throw new Error(`No superseded files found for ${batch}`);

for (const file of files) {
  const title = String(file.title || "");
  const isKnownProductPhoto =
    title.startsWith("isvoi:release-v8:") || title.startsWith("isvoi:product-photo-refresh-");
  if (!isKnownProductPhoto) {
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
  for (const file of files) {
    await request("PATCH", `/files/${encodeURIComponent(file.id)}`, {
      folder: archiveFolder,
      description: `Архив предыдущих фото после ${batch}; активных товарных связей нет.`,
    });
  }
}

process.stdout.write(
  `${apply ? "Archived" : "Checked"} ${files.length} unreferenced superseded files for ${batch}.\n`,
);
