import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const productsRoot = path.join(
  repoRoot,
  "apps",
  "web",
  "public",
  "assets",
  "products",
);

const expectedWidth = 2400;
const expectedHeight = 1800;
const forbiddenPublicName = /(serial|barcode|price|label|цен|серийн|штрих)/i;

const entries = await fs.readdir(productsRoot, { withFileTypes: true });
const productDirs = entries.filter((entry) => entry.isDirectory());

let checkedImages = 0;
const errors = [];
const warnings = [];

for (const entry of productDirs) {
  const productDir = path.join(productsRoot, entry.name);
  const manifestPath = path.join(productDir, "manifest.json");
  let manifest;

  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`${entry.name}: manifest.json отсутствует или повреждён (${error.message})`);
    continue;
  }

  const records = [manifest.captures, manifest.items, manifest.files].find(Array.isArray) ?? [];
  if (records.length === 0) {
    warnings.push(`${entry.name}: в manifest.json нет списка исходных кадров`);
  }

  for (const record of records) {
    const isPublished = record.published ?? record.publish ?? true;
    if (!isPublished) {
      continue;
    }

    const preferred =
      record.preferredOutput ?? record.output ?? record.outputFilename ?? record.outputPath;
    if (!preferred || path.isAbsolute(preferred) || preferred.includes("..")) {
      errors.push(`${entry.name}: небезопасный output в manifest.json`);
      continue;
    }

    if (forbiddenPublicName.test(preferred) || forbiddenPublicName.test(record.role ?? "")) {
      errors.push(`${entry.name}/${preferred}: служебный ценник или идентификатор не должен быть публичным`);
    }
  }

  const publicFiles = (await fs.readdir(productDir)).filter((name) => name.endsWith(".webp"));
  if (!publicFiles.includes("listing.webp")) {
    errors.push(`${entry.name}: отсутствует listing.webp`);
  }

  for (const publicFile of publicFiles) {
    if (forbiddenPublicName.test(publicFile)) {
      errors.push(`${entry.name}/${publicFile}: служебный ценник или идентификатор не должен быть публичным`);
    }

    const imagePath = path.join(productDir, publicFile);
    try {
      const metadata = await sharp(imagePath).metadata();
      checkedImages += 1;

      if (metadata.format !== "webp") {
        errors.push(`${entry.name}/${publicFile}: формат ${metadata.format}, ожидался webp`);
      }
      if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
        errors.push(
          `${entry.name}/${publicFile}: ${metadata.width}x${metadata.height}, ожидалось ${expectedWidth}x${expectedHeight}`,
        );
      }
    } catch (error) {
      errors.push(`${entry.name}/${publicFile}: файл не читается (${error.message})`);
    }
  }
}

console.log(`Проверено папок: ${productDirs.length}`);
console.log(`Проверено публичных изображений: ${checkedImages}`);

for (const warning of warnings) {
  console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ОШИБКА: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Все наборы соответствуют базовому формату I СВОИ.");
}
