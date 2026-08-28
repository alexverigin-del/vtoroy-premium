#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const inputArg = process.argv[2];
const outputArg = process.argv[3];
if (!inputArg || !outputArg) {
  throw new Error(
    "Usage: node scripts/prepare_catalog_photo_refresh.mjs <release-manifest.json> <output-directory>",
  );
}

const inputPath = path.resolve(inputArg);
const outputDir = path.resolve(outputArg);
const allowedRoot = path.resolve("outputs");
if (outputDir !== allowedRoot && !outputDir.startsWith(`${allowedRoot}${path.sep}`)) {
  throw new Error(`Output directory must stay inside ${allowedRoot}`);
}

const source = JSON.parse(await fs.readFile(inputPath, "utf8"));
if (!Array.isArray(source.devices) || source.devices.length === 0) {
  throw new Error("Release manifest must contain devices");
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const bundle = {
  schemaVersion: 1,
  batch: `product-photo-refresh-${new Date().toISOString().slice(0, 10)}`,
  devices: [],
};

for (const device of source.devices) {
  if (!/^т\d+$/iu.test(device.sku || "")) throw new Error(`Invalid SKU: ${device.sku}`);
  if (!Array.isArray(device.photos) || device.photos.length < 2) {
    throw new Error(`${device.sku}: at least two photos are required`);
  }

  const safeSku = device.sku.toLowerCase().replace(/^т/u, "t");
  const photoDir = path.join(outputDir, "photos", safeSku);
  await fs.mkdir(photoDir, { recursive: true });
  const photos = [];

  for (const [index, photo] of device.photos.entries()) {
    const sourcePath = path.resolve(photo.path);
    const bytes = await fs.readFile(sourcePath);
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "webp" || metadata.width !== 2400 || metadata.height !== 1800) {
      throw new Error(
        `${device.sku} photo ${index + 1}: expected 2400x1800 WebP, got ${metadata.width}x${metadata.height} ${metadata.format}`,
      );
    }

    const filename = `${String(index + 1).padStart(2, "0")}.webp`;
    await fs.writeFile(path.join(photoDir, filename), bytes);
    photos.push({
      path: `photos/${safeSku}/${filename}`,
      label: String(photo.label || "").trim(),
      alt: String(photo.alt || "").trim(),
      sort: (index + 1) * 10,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
    });
  }

  if (photos.some((photo) => !photo.alt))
    throw new Error(`${device.sku}: every photo needs alt text`);
  bundle.devices.push({ sku: device.sku, title: device.title, photos });
}

await fs.writeFile(
  path.join(outputDir, "photo-refresh.json"),
  `${JSON.stringify(bundle, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `Prepared ${bundle.devices.length} devices and ${bundle.devices.reduce((sum, device) => sum + device.photos.length, 0)} photos in ${outputDir}\n`,
);
