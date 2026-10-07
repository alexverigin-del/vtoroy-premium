#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "");
if (!process.argv[2])
  throw new Error("Usage: node scripts/prepare_catalog_gallery_curation.mjs <audit-dir>");
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, name), "utf8"));
const raw = await read("media-before.json");
const snapshot = Array.isArray(raw) ? raw.filter(Boolean)[0] : raw;
const decisions = await read("decisions.json");
const retouchDir = process.argv[3] || "retouched";
if (!/^[a-z0-9-]+$/.test(retouchDir)) throw new Error("Invalid retouch directory");
const replacements = await read(`${retouchDir}/retouch-results.json`);
const labels = {
  overview: "Общий вид",
  front: "Экран и рамка",
  "front-side": "Экран сбоку",
  "front-closeup": "Экран крупным планом",
  cameras: "Камеры",
  back: "Задняя панель",
  left: "Левая грань",
  right: "Правая грань",
  bottom: "Нижняя грань",
};
const rank = {
  overview: 0,
  front: 1,
  "front-side": 2,
  "front-closeup": 3,
  back: 4,
  cameras: 5,
  left: 6,
  right: 7,
  bottom: 8,
};
const devices = [];
for (const product of snapshot.products) {
  const original = [...product.images].sort((a, b) => a.sort - b.sort);
  const views = decisions.views[product.sku];
  if (!views || views.length !== original.length || views[0] !== "overview")
    throw new Error("Incomplete reviewed views");
  const rows = original
    .map((row, index) => ({ row, view: views[index] }))
    .sort((a, b) => rank[a.view] - rank[b.view]);
  const photos = [];
  for (const [index, { row, view }] of rows.entries()) {
    if (!(view in labels)) throw new Error("Unknown gallery view");
    const replacement = replacements.find((r) => r.sku === product.sku && r.sort === row.sort);
    if (
      replacement &&
      (replacement.original_file_id !== row.file_id ||
        replacement.outside_mask_changed_pixels !== 0)
    )
      throw new Error("Unsafe replacement");
    const label = labels[view];
    const alt =
      view === "overview" ? row.alt : `${product.title}, ${label.toLocaleLowerCase("ru")}`;
    photos.push({
      id: row.row_id,
      before: {
        image: row.file_id,
        sort: row.sort,
        label: row.label,
        alt: row.alt,
        role: row.role,
        status: row.status,
        product: product.id,
      },
      after: { sort: (index + 1) * 10, label, alt },
      ...(replacement
        ? {
            replacement: {
              path: `${retouchDir}/${path.basename(replacement.path)}`,
              sha256: replacement.sha256,
              previous_sha256: replacement.previous_sha256,
              bytes: replacement.bytes,
            },
          }
        : {}),
    });
  }
  devices.push({
    id: product.id,
    sku: product.sku,
    title: product.title,
    status: product.status,
    stock_status: product.stock_status,
    listing_file: product.listing_file,
    listing_alt: product.listing_alt,
    photos,
  });
}
if (replacements.length !== devices.flatMap((d) => d.photos).filter((p) => p.replacement).length)
  throw new Error("Orphan replacement");
const result = { batch: "photo-gallery-review-2026-10-07", devices };
await fs.writeFile(
  path.join(root, "gallery-curation.json"),
  JSON.stringify(result, null, 2) + "\n",
);
const rows = devices.flatMap((d) => d.photos);
console.log(
  JSON.stringify({
    devices: devices.length,
    photos: rows.length,
    replacements: replacements.length,
    changed_labels: rows.filter((p) => p.before.label !== p.after.label).length,
    changed_sorts: rows.filter((p) => p.before.sort !== p.after.sort).length,
  }),
);
