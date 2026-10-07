#!/usr/bin/env node
// Original asset bytes are immutable; review sheets are browser screenshots only.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { launchChromium } from "./playwright_browser.mjs";

const [snapshotArg, outputArg] = process.argv.slice(2);
if (!snapshotArg || !outputArg) {
  throw new Error("Usage: review_catalog_product_photos.mjs <media-before.json> <output-dir>");
}
const output = path.resolve(outputArg);
const root = path.resolve("../../outputs");
const localRoot = path.resolve("outputs");
if (![root, localRoot].some((r) => output.startsWith(r + path.sep))) {
  throw new Error("Review output must be inside project outputs");
}
const input = JSON.parse(await fs.readFile(snapshotArg, "utf8"));
const records = Array.isArray(input) ? input.filter(Boolean) : [input];
if (records.length !== 1 || !Array.isArray(records[0]?.products)) {
  throw new Error("Exactly one valid media snapshot is required");
}
const snapshot = records[0];
const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
await fs.mkdir(path.join(output, "originals"), { recursive: true });
await fs.mkdir(path.join(output, "sheets"), { recursive: true });
const report = { captured_at: snapshot.captured_at, assets: [], structural_issues: [] };
const jobs = [];
for (const product of snapshot.products) {
  if (!/^т\d+$/iu.test(product.sku)) throw new Error("Invalid device SKU");
  const seenSorts = new Set();
  const seenFiles = new Set();
  if (!product.images.some((i) => i.file_id === product.listing_file)) {
    report.structural_issues.push({ sku: product.sku, code: "listing_not_in_gallery" });
  }
  for (const image of product.images) {
    if (seenSorts.has(image.sort))
      report.structural_issues.push({ sku: product.sku, code: "duplicate_sort" });
    if (seenFiles.has(image.file_id))
      report.structural_issues.push({ sku: product.sku, code: "duplicate_file" });
    if (!image.label || !image.alt)
      report.structural_issues.push({ sku: product.sku, code: "missing_label_or_alt" });
    seenSorts.add(image.sort);
    seenFiles.add(image.file_id);
    jobs.push({ product, image });
  }
}
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const { product, image } = jobs[cursor++];
    const directory = path.join(output, "originals", product.sku.replace(/^т/iu, "t"));
    await fs.mkdir(directory, { recursive: true });
    const filename = `${image.sort}-${image.file_id}.webp`;
    const target = path.join(directory, filename);
    let bytes;
    try {
      bytes = await fs.readFile(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const response = await fetch(`https://api.isvoi.ru/assets/${image.file_id}`, {
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`${product.sku} ${image.sort}: asset HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(target, bytes, { flag: "wx" });
    }
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== "webp" ||
      metadata.width !== image.width ||
      metadata.height !== image.height
    ) {
      throw new Error(`${product.sku} ${image.sort}: image metadata mismatch`);
    }
    report.assets.push({
      sku: product.sku,
      product_id: product.id,
      ...image,
      path: path.relative(output, target).replaceAll(path.sep, "/"),
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
report.assets.sort((a, b) => Number(a.sku.slice(1)) - Number(b.sku.slice(1)) || a.sort - b.sort);
const byHash = new Map();
for (const image of report.assets) {
  const previous = byHash.get(image.sha256);
  if (previous && previous.sku !== image.sku) {
    report.structural_issues.push({
      code: "cross_device_identical_asset",
      skus: [previous.sku, image.sku],
    });
  }
  byHash.set(image.sha256, image);
}
const products = [...snapshot.products].sort(
  (a, b) => Number(a.sku.slice(1)) - Number(b.sku.slice(1)),
);
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>ISVOI Photo Review</title>
<style>body{font-family:Arial,sans-serif;background:#fff;color:#202124;margin:20px}section{width:1120px;padding:16px;margin:0 0 28px;border-bottom:1px solid #ccd1d8}h2{font-size:21px;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%;aspect-ratio:4/3;object-fit:contain;background:#f4f5f7;display:block}figcaption{font-size:16px;line-height:1.35;padding:6px 0;min-height:46px}small{color:#60666d}</style>
${products
  .map(
    (p) =>
      `<section id="${p.sku.replace(/^т/iu, "t")}"><h2>${escape(p.sku)} · ${escape(p.title)} <small>${escape(p.status)} / ${escape(p.stock_status)}</small></h2><div class="grid">${report.assets
        .filter((i) => i.sku === p.sku)
        .map(
          (i) =>
            `<figure><img loading="lazy" src="${escape(i.path)}"><figcaption>${i.sort}: ${escape(i.label)}<br><small>${escape(i.role)}${i.file_id === p.listing_file ? " · listing_file" : ""}</small></figcaption></figure>`,
        )
        .join("")}</div></section>`,
  )
  .join("")}</html>`;
const reviewPath = path.join(output, "review.html");
await fs.writeFile(reviewPath, html);
await fs.writeFile(
  path.join(output, "downloaded-assets.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const browser = await launchChromium();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1040 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(reviewPath).href);
  for (const product of products) {
    const id = product.sku.replace(/^т/iu, "t");
    const section = page.locator(`#${id}`);
    await section.scrollIntoViewIfNeeded();
    await section.evaluate(async (el) =>
      Promise.all([...el.querySelectorAll("img")].map((i) => i.decode())),
    );
    await section.screenshot({ path: path.join(output, "sheets", `${id}.png`) });
  }
} finally {
  await browser.close();
}
console.log(
  JSON.stringify({
    products: products.length,
    photos: report.assets.length,
    issues: report.structural_issues,
    review: reviewPath,
  }),
);
