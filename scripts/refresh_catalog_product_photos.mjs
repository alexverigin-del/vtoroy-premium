#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const manifestArg = process.argv[2];
const apply = process.argv.includes("--apply");
if (!manifestArg) {
  throw new Error(
    "Usage: node scripts/refresh_catalog_product_photos.mjs <photo-refresh.json> [--apply]",
  );
}

const manifestPath = path.resolve(manifestArg);
const baseDir = path.dirname(manifestPath);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
if (!directusUrl || !token) {
  throw new Error("DIRECTUS_URL and INVENTORY_IMPORT_DIRECTUS_TOKEN are required");
}
if (!/^[a-z0-9-]+$/.test(manifest.batch || "")) throw new Error("Invalid photo refresh batch");
if (!Array.isArray(manifest.devices) || manifest.devices.length === 0) {
  throw new Error("Photo refresh manifest must contain devices");
}

async function request(method, pathname, body) {
  const response = await fetch(`${directusUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
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
const relationId = (value) =>
  typeof value === "string" ? value : value && typeof value === "object" ? value.id : "";

async function folderId(name) {
  const folder = await first("folders", `filter[name][_eq]=${encodeURIComponent(name)}&fields=id`);
  if (!folder) throw new Error(`Directus folder is missing: ${name}`);
  return folder.id;
}

function resolveBundlePath(relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error(`Photo path escapes bundle: ${relativePath}`);
  }
  return resolved;
}

async function uploadPhoto(device, photo, folder) {
  const safeSku = device.sku.toLowerCase().replace(/^т/u, "t");
  const slot = String(photo.sort / 10).padStart(2, "0");
  const title = `isvoi:${manifest.batch}:${safeSku}:${slot}:${photo.sha256.slice(0, 12)}`;
  const existing = await first(
    "files",
    `filter[title][_eq]=${encodeURIComponent(title)}&fields=id,title,folder`,
  );
  if (existing) return existing.id;

  const filePath = resolveBundlePath(photo.path);
  const bytes = await fs.readFile(filePath);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const metadata = await sharp(bytes).metadata();
  if (digest !== photo.sha256) throw new Error(`${device.sku} slot ${slot}: SHA-256 mismatch`);
  if (metadata.format !== "webp" || metadata.width !== 2400 || metadata.height !== 1800) {
    throw new Error(`${device.sku} slot ${slot}: invalid image format or dimensions`);
  }
  if (!apply) return `dry-run:${title}`;

  const form = new FormData();
  form.append("folder", folder);
  form.append("title", title);
  form.append("description", `${device.title}. Обновлённое фото каталога, ${manifest.batch}.`);
  form.append("file", new Blob([bytes], { type: "image/webp" }), `isvoi-${safeSku}-${slot}.webp`);
  return (await request("POST", "/files", form)).id;
}

const devicePhotoFolder = await folderId("ISVOI Device Photos");
const reviewFolder = await folderId("ISVOI File Review");
const oldFileIds = new Set();
const newFileIds = new Set();
let refreshedRows = 0;

for (const device of manifest.devices) {
  const inventory = await first(
    "items/inventory_items",
    `filter[source_sku][_eq]=${encodeURIComponent(device.sku)}&fields=id,product`,
  );
  const productId = relationId(inventory?.product);
  if (!productId) throw new Error(`${device.sku}: linked Catalog V3 product is missing`);

  const product = await request(
    "GET",
    `/items/products/${encodeURIComponent(productId)}?fields=id,sku,title,status,content_status,listing_file,listing_alt`,
  );
  if (product.sku !== device.sku) {
    throw new Error(`${device.sku}: linked product SKU mismatch (${product.sku})`);
  }

  const rows = await request(
    "GET",
    `/items/product_images?filter[product][_eq]=${encodeURIComponent(productId)}&fields=id,image,status,role,label,alt,sort&sort=sort&limit=-1`,
  );
  if (rows.length !== device.photos.length) {
    throw new Error(
      `${device.sku}: expected ${device.photos.length} product_images rows, found ${rows.length}`,
    );
  }

  const rowsBySort = new Map(rows.map((row) => [Number(row.sort), row]));
  const uploaded = [];
  for (const photo of device.photos) {
    const row = rowsBySort.get(Number(photo.sort));
    if (!row) throw new Error(`${device.sku}: product_images sort ${photo.sort} is missing`);
    const fileId = await uploadPhoto(device, photo, devicePhotoFolder);
    uploaded.push({ photo, row, fileId });
    const oldImageId = relationId(row.image);
    if (oldImageId) oldFileIds.add(oldImageId);
    newFileIds.add(fileId);
  }

  const oldListingId = relationId(product.listing_file);
  if (oldListingId) oldFileIds.add(oldListingId);
  if (apply) {
    for (const { photo, row, fileId } of uploaded) {
      await request("PATCH", `/items/product_images/${encodeURIComponent(row.id)}`, {
        image: fileId,
        label: photo.label,
        alt: photo.alt,
      });
      refreshedRows += 1;
    }
    await request("PATCH", `/items/products/${encodeURIComponent(productId)}`, {
      listing_file: uploaded[0].fileId,
      listing_alt: uploaded[0].photo.alt,
    });
  }

  process.stdout.write(
    `${apply ? "refreshed" : "checked"} ${device.sku}: ${device.photos.length} photos, product ${product.status}/${product.content_status}\n`,
  );
}

if (apply) {
  for (const fileId of oldFileIds) {
    if (!fileId || newFileIds.has(fileId)) continue;
    const productReference = await first(
      "items/products",
      `filter[listing_file][_eq]=${encodeURIComponent(fileId)}&fields=id`,
    );
    const imageReference = await first(
      "items/product_images",
      `filter[image][_eq]=${encodeURIComponent(fileId)}&fields=id`,
    );
    if (productReference || imageReference) continue;
    await request("PATCH", `/files/${encodeURIComponent(fileId)}`, {
      folder: reviewFolder,
      description: `Заменено обновлённым фото каталога в ${manifest.batch}; сохранено для rollback.`,
    });
  }
}

process.stdout.write(
  `${apply ? "Applied" : "Dry-run passed"}: ${manifest.devices.length} devices, ${manifest.devices.reduce((sum, device) => sum + device.photos.length, 0)} photos${apply ? `, ${refreshedRows} relations refreshed` : ""}.\n`,
);
