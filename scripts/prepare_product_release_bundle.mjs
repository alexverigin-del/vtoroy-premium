#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const inputArg = process.argv[2];
const outputArg = process.argv[3];
if (!inputArg || !outputArg) {
  throw new Error(
    "Usage: node scripts/prepare_product_release_bundle.mjs <private-manifest.json> <output-directory>",
  );
}

const inputPath = path.resolve(inputArg);
const outputDir = path.resolve(outputArg);
const allowedRoot = path.resolve("outputs");
if (outputDir !== allowedRoot && !outputDir.startsWith(`${allowedRoot}${path.sep}`)) {
  throw new Error(`Output directory must stay inside ${allowedRoot}`);
}
const manifest = JSON.parse(await fs.readFile(inputPath, "utf8"));
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

for (const device of manifest.devices) {
  const safeSku = device.sku.toLowerCase();
  const photoDir = path.join(outputDir, "photos", safeSku);
  const originalDir = path.join(outputDir, "originals");
  const publicDir = path.join(outputDir, "public-certificates");
  await Promise.all([
    fs.mkdir(photoDir, { recursive: true }),
    fs.mkdir(originalDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
  ]);

  for (const [index, photo] of device.photos.entries()) {
    const filename = `${String(index + 1).padStart(2, "0")}.webp`;
    await fs.copyFile(path.resolve(photo.path), path.join(photoDir, filename));
    photo.path = `photos/${safeSku}/${filename}`;
  }

  const originalName = `${safeSku}.jpg`;
  const publicName = `${safeSku}.png`;
  await fs.copyFile(path.resolve(device.originalCertificate), path.join(originalDir, originalName));
  await fs.copyFile(path.resolve(device.publicCertificate), path.join(publicDir, publicName));
  device.originalCertificate = `originals/${originalName}`;
  device.publicCertificate = `public-certificates/${publicName}`;
}

delete manifest.publicCertificateOutput;
await fs.writeFile(
  path.join(outputDir, "release.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${outputDir}\n`);
