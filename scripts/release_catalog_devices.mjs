#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const manifestArg = process.argv[2];
const apply = process.argv.includes("--apply");
const prepareOnly = process.argv.includes("--prepare-only");
const publishMode =
  process.argv.find((arg) => arg.startsWith("--publish="))?.split("=")[1] ?? "draft";
if (!manifestArg)
  throw new Error(
    "Usage: node scripts/release_catalog_devices.mjs <manifest.json> [--apply] [--publish=draft|pilot|ready]",
  );

const manifestPath = path.resolve(manifestArg);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const baseDir = path.dirname(manifestPath);
const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
if (!directusUrl || !token)
  throw new Error("DIRECTUS_URL and INVENTORY_IMPORT_DIRECTUS_TOKEN are required");

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
  if (!response.ok)
    throw new Error(`${method} ${pathname}: ${response.status} ${text.slice(0, 600)}`);
  return json.data;
}

const endpointFor = (collection) =>
  collection === "directus_folders"
    ? "folders"
    : collection === "directus_files"
      ? "files"
      : `items/${collection}`;
const first = async (collection, query) =>
  (await request("GET", `/${endpointFor(collection)}?${query}&limit=1`))?.[0];
const resolvePath = (value) => path.resolve(baseDir, value);
const normalizeTitle = (value) => `isvoi:release-v8:${value}`;

async function folderId(name) {
  const folder = await first(
    "directus_folders",
    `filter[name][_eq]=${encodeURIComponent(name)}&fields=id`,
  );
  if (!folder) throw new Error(`Directus folder is missing: ${name}`);
  return folder.id;
}

async function upload(filePath, title, folder, type) {
  const existing = await first(
    "directus_files",
    `filter[title][_eq]=${encodeURIComponent(title)}&fields=id`,
  );
  if (existing) return existing.id;
  if (!apply) return `dry-run:${title}`;
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("folder", folder);
  form.append("title", title);
  form.append("file", new Blob([bytes], { type }), path.basename(filePath));
  const uploaded = await request("POST", "/files", form);
  return uploaded.id;
}

async function upsert(collection, filterQuery, payload) {
  const existing = await first(collection, `${filterQuery}&fields=id`);
  if (!apply) return existing?.id ?? `dry-run:${collection}`;
  if (existing) {
    await request("PATCH", `/items/${collection}/${encodeURIComponent(existing.id)}`, payload);
    return existing.id;
  }
  const created = await request("POST", `/items/${collection}`, payload);
  return created.id;
}

async function upsertProductPassport(productId, payload) {
  const product = await request(
    "GET",
    `/items/products/${encodeURIComponent(productId)}?fields=id,passport`,
  );
  const passportId =
    typeof product?.passport === "string"
      ? product.passport
      : product?.passport && typeof product.passport === "object"
        ? product.passport.id
        : "";
  if (!apply) return passportId || "dry-run:device_passports";
  if (passportId) {
    await request("PATCH", `/items/device_passports/${encodeURIComponent(passportId)}`, payload);
    return passportId;
  }
  const created = await request("POST", "/items/device_passports", payload);
  return created.id;
}

const devicePhotoFolder = prepareOnly ? "" : await folderId("ISVOI Device Photos");
const originalFolder = prepareOnly ? "" : await folderId("ISVOI Passport Originals");
const publicFolder = prepareOnly ? "" : await folderId("ISVOI Passport Public");
const store = prepareOnly
  ? null
  : await first("store_locations", "filter[slug][_eq]=belgorod&fields=id");
if (!prepareOnly && !store) throw new Error("Store location belgorod is missing");

for (const [index, device] of manifest.devices.entries()) {
  const inventory = await first(
    "inventory_items",
    `filter[source_sku][_eq]=${encodeURIComponent(device.sku)}&fields=id,product,quantity,retail_price,condition,source_title,serial_full`,
  );
  if (!inventory) throw new Error(`${device.sku}: inventory row is missing`);
  if (Number(inventory.quantity) !== 1)
    throw new Error(`${device.sku}: expected stock 1, got ${inventory.quantity}`);
  if (device.serialTail && !String(inventory.serial_full || "").endsWith(device.serialTail)) {
    throw new Error(`${device.sku}: serial tail does not match inventory`);
  }

  const inventoryPatch = device.publishReady
    ? {
        authenticity_status: "verified",
        eligibility_status: "eligible",
        review_override: true,
        review_note:
          "Операторская сверка 27.08.2026: склад, серийный хвост, фото и диагностика подтверждены.",
      }
    : {
        authenticity_status: "verified",
        eligibility_status: "blocked",
        review_override: false,
        review_note: device.publicNote,
      };
  if (apply) await request("PATCH", `/items/inventory_items/${inventory.id}`, inventoryPatch);

  if (prepareOnly) {
    process.stdout.write(
      `${apply ? "prepared" : "checked"} ${device.sku} for inventory pipeline\n`,
    );
    continue;
  }

  const linkedProduct =
    typeof inventory.product === "string"
      ? inventory.product
      : inventory.product && typeof inventory.product === "object"
        ? inventory.product.id
        : "";
  if (!linkedProduct) {
    throw new Error(
      `${device.sku}: product link is missing; run inventory_pipeline.py --apply after eligibility preparation`,
    );
  }
  const productId = device.productIdOverride || linkedProduct;
  const model = await first(
    "device_models",
    `filter[slug][_eq]=${encodeURIComponent(device.modelSlug)}&fields=id`,
  );
  if (!model) throw new Error(`${device.sku}: model ${device.modelSlug} is missing`);
  const currentProduct = await request(
    "GET",
    `/items/products/${encodeURIComponent(productId)}?fields=id,status`,
  );

  const photoIds = [];
  for (const [photoIndex, photo] of device.photos.entries()) {
    const photoPath = resolvePath(photo.path);
    const role = photoIndex === 0 ? "listing" : "gallery";
    const fileId = await upload(
      photoPath,
      normalizeTitle(`${device.sku.toLowerCase()}:${role}:${photoIndex + 1}`),
      devicePhotoFolder,
      "image/webp",
    );
    photoIds.push({
      fileId,
      role,
      label: photo.label,
      alt: photo.alt,
      sort: (photoIndex + 1) * 10,
    });
  }
  const publicCertificatePath = resolvePath(device.publicCertificate);
  const originalCertificatePath = resolvePath(device.originalCertificate);
  const publicFile = await upload(
    publicCertificatePath,
    normalizeTitle(`${device.sku.toLowerCase()}:passport-public`),
    publicFolder,
    "image/png",
  );
  const originalFile = await upload(
    originalCertificatePath,
    normalizeTitle(`${device.sku.toLowerCase()}:passport-original`),
    originalFolder,
    "image/jpeg",
  );

  const shouldPublish =
    device.publishReady && (publishMode === "ready" || (publishMode === "pilot" && device.pilot));
  const productPatch = {
    status: shouldPublish && currentProduct.status === "published" ? "published" : "draft",
    content_status: device.publishReady ? "ready" : "review",
    device_model: model.id,
    title: device.title,
    model: device.model,
    color: device.color,
    price: Number(inventory.retail_price),
    price_text: `${Number(inventory.retail_price).toLocaleString("ru-RU")} ₽`,
    stock_quantity: 1,
    stock_status: "available",
    warranty: "90 дней",
    warranty_text: "Гарантия 90 дней",
    completeness: "Устройство, коробка, кабель",
    short_description: device.shortDescription,
    headline: device.headline,
    listing_file: photoIds[0].fileId,
    listing_alt: photoIds[0].alt,
    sort: 20 + index,
    admin_note: device.publishReady
      ? "Release v8: склад, фото, Passport и диагностика подтверждены."
      : "Release v8: не публиковать до повторной физической диагностики батареи и наушников.",
  };
  if (apply)
    await request("PATCH", `/items/products/${encodeURIComponent(productId)}`, productPatch);

  await upsert("device_details", `filter[product][_eq]=${encodeURIComponent(productId)}`, {
    product: productId,
    storage: device.storage,
    serial: `•••••${device.serialTail}`,
    imei_primary_last4: device.imeiPrimaryLast4,
    imei_secondary_last4: device.imeiSecondaryLast4,
    year: device.year,
    battery: `${device.batteryPercent}%`,
    battery_text: `Аккумулятор ${device.batteryPercent}%`,
    battery_cycles: device.batteryCycles,
    diagnostic_date: device.testedAt,
    activation_lock: "Не обнаружена",
    mdm: "Не обнаружен",
    diagnostic_by: "NSYS Diagnostics / I СВОИ",
    grade: device.grade || "Повторная проверка",
  });

  const passportId = await upsertProductPassport(productId, {
    product: productId,
    repair: "Проверенные компоненты отмечены диагностикой как оригинальные.",
    water: "Следов воздействия жидкости по доступной диагностике не зафиксировано.",
    summary_rows: device.summaryRows,
    diagnostics_status: device.publishReady ? "Проверено" : "Требуется повторная диагностика",
    diagnostics_checklist: device.checklist,
    condition_grade_text: device.grade ? `Грейд ${device.grade}` : "Повторная проверка",
    condition_note: device.conditionNote,
    condition_notes: device.conditionFacts,
    story_title: "Состояние зафиксировано до покупки",
    story_body:
      "Проверили функции, блокировки, батарею и доступные признаки оригинальности компонентов.",
    story_facts: ["Данные удалены безопасно", "Find My iPhone не обнаружен", "MDM не обнаружен"],
    warranty_duration: "90 дней",
    warranty_covered: "Подтверждённые гарантийные случаи по условиям продавца.",
    warranty_not_covered:
      "Механические повреждения, попадание жидкости и нарушение условий эксплуатации.",
  });

  await upsert(
    "device_diagnostic_reports",
    `filter[product][_eq]=${encodeURIComponent(productId)}&filter[tested_at][_eq]=${device.testedAt}`,
    {
      product: productId,
      passport: passportId,
      provider: "NSYS Diagnostics",
      tested_at: device.testedAt,
      status: device.publishReady ? "current" : "superseded",
      original_file: originalFile,
      public_file: publicFile,
      public_note:
        device.publicNote ||
        "Публичная выписка обезличена: полные идентификаторы, QR и номера компонентов скрыты.",
      sort: 10,
    },
  );

  for (const photo of photoIds) {
    await upsert(
      "product_images",
      `filter[product][_eq]=${encodeURIComponent(productId)}&filter[sort][_eq]=${photo.sort}`,
      {
        product: productId,
        image: photo.fileId,
        status: shouldPublish ? "published" : "draft",
        role: photo.role,
        label: photo.label,
        alt: photo.alt,
        sort: photo.sort,
        import_batch: "product-release-v8-2026-08-27",
      },
    );
  }

  await upsert(
    "product_offers",
    `filter[product][_eq]=${encodeURIComponent(productId)}&filter[location][_eq]=${store.id}`,
    {
      product: productId,
      location: store.id,
      local_sku: device.sku,
      status: shouldPublish ? "published" : "draft",
      price: Number(inventory.retail_price),
      price_text: `${Number(inventory.retail_price).toLocaleString("ru-RU")} ₽`,
      stock_quantity: 1,
      stock_status: "available",
      sale_mode: "reservation",
      pickup_enabled: true,
      local_delivery_enabled: false,
      intercity_delivery_enabled: true,
      source_system: "store_inventory",
      source_id: inventory.id,
    },
  );

  const listing = await first(
    "product_channel_listings",
    `filter[product][_eq]=${encodeURIComponent(productId)}&filter[channel][_eq]=avito&fields=id`,
  );
  if (listing && apply)
    await request("PATCH", `/items/product_channel_listings/${listing.id}`, { status: "draft" });
  if (apply && shouldPublish && currentProduct.status !== "published") {
    await request("PATCH", `/items/products/${encodeURIComponent(productId)}`, {
      status: "published",
    });
  }
  process.stdout.write(
    `${apply ? "applied" : "checked"} ${device.sku} -> ${productId} (${shouldPublish ? "published" : "draft"})\n`,
  );
}
