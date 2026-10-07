#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const manifestPath = path.resolve(process.argv[2] || "");
const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback");
const resumePrepared = process.argv.includes("--resume-prepared");
if (!process.argv[2] || (apply && rollback))
  throw new Error("Usage: apply_catalog_gallery_curation.mjs <manifest> [--apply|--rollback]");
const root = path.dirname(manifestPath);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const base = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = process.env.DIRECTUS_TOKEN;
if (!base || !token || !/^[a-z0-9-]+$/.test(manifest.batch))
  throw new Error("Missing secure config or invalid batch");
const statePath = path.join(root, "curation-state.json");
const fields = ["image", "sort", "label", "alt", "role", "status", "product"];
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
async function request(method, endpoint, body) {
  const response = await fetch(`${base}${endpoint}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(180000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${endpoint.split("?")[0]}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return (await response.json()).data;
}
async function assetBytes(id) {
  const response = await fetch(`${base}/assets/${encodeURIComponent(id)}`, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function save(state) {
  await fs.writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await fs.rename(`${statePath}.tmp`, statePath);
}
async function liveRows(device) {
  const product = await request(
    "GET",
    `/items/products/${encodeURIComponent(device.id)}?fields=id,sku,status,stock_status,listing_file,listing_alt`,
  );
  for (const key of ["id", "sku", "status", "stock_status", "listing_file", "listing_alt"]) {
    if (product[key] !== device[key])
      throw new Error(`${device.sku}: product changed since review (${key})`);
  }
  const rows = await request(
    "GET",
    `/items/product_images?filter[product][_eq]=${encodeURIComponent(device.id)}&fields=id,${fields.join(",")}&limit=-1`,
  );
  if (rows.length !== device.photos.length) throw new Error(`${device.sku}: gallery count changed`);
  return new Map(rows.map((r) => [r.id, r]));
}
function compare(actual, expected, id) {
  if (!actual || fields.some((k) => actual[k] !== expected[k]))
    throw new Error(`Gallery row conflicts with reviewed state: ${id}`);
}
async function preflight(expected) {
  for (const device of manifest.devices) {
    const rows = await liveRows(device);
    for (const photo of device.photos)
      compare(rows.get(photo.id), expected.get(photo.id), photo.id);
  }
}
async function validateReplacement(photo, bytes) {
  const info = await sharp(bytes).metadata();
  if (
    digest(bytes) !== photo.replacement.sha256 ||
    info.format !== "webp" ||
    info.width !== 2400 ||
    info.height !== 1800
  )
    throw new Error("Replacement integrity failed");
}
const all = manifest.devices.flatMap((d) => d.photos);
if (new Set(all.map((p) => p.id)).size !== all.length) throw new Error("Duplicate row IDs");
for (const device of manifest.devices) {
  if (
    device.photos[0].before.role !== "listing" ||
    device.photos[0].before.image !== device.listing_file ||
    device.photos[0].replacement
  )
    throw new Error("Listing image must remain unchanged");
  if (new Set(device.photos.map((p) => p.after.sort)).size !== device.photos.length)
    throw new Error("Duplicate target order");
  for (const p of device.photos)
    if (Object.keys(p.after).some((k) => !["sort", "label", "alt"].includes(k)))
      throw new Error("Unsupported mutation");
}
const before = new Map(all.map((p) => [p.id, p.before]));
async function updateRows(rows, target) {
  const source = target === "after" ? "before" : "after";
  const baseSort = Math.max(...all.flatMap((p) => [p.before.sort, p.after.sort])) + 1000;
  const staged = rows
    .filter((r) => r[source].sort !== r[target].sort)
    .map((r, index) => ({ id: r.id, sort: baseSort + index }));
  const final = rows.map((r) => ({
    id: r.id,
    image: r[target].image,
    sort: r[target].sort,
    label: r[target].label,
    alt: r[target].alt,
  }));
  // Vacate occupied sort slots and install final values in the SAME transaction.
  await request("PATCH", "/items/product_images", [...staged, ...final]);
}
if (rollback) {
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  if (state.manifest_sha256 !== digest(await fs.readFile(manifestPath)))
    throw new Error("Rollback manifest differs");
  await preflight(new Map(state.rows.map((r) => [r.id, r.after])));
  for (const file of state.archived_files)
    await request("PATCH", `/files/${file.id}`, {
      folder: file.folder,
      description: file.description,
    });
  await updateRows(state.rows, "before");
  await preflight(before);
  state.status = "rolled_back";
  await save(state);
  console.log(JSON.stringify({ rolled_back: true, rows: state.rows.length }));
  process.exit(0);
}
let previousState;
try {
  previousState = JSON.parse(await fs.readFile(statePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (
  previousState &&
  previousState.status !== "rolled_back" &&
  !(
    resumePrepared &&
    previousState.status === "prepared" &&
    previousState.manifest_sha256 === digest(await fs.readFile(manifestPath))
  )
)
  throw new Error("Existing release state: verify/rollback explicitly; do not overwrite");
await preflight(before);
const deviceFolder = (
  await request("GET", "/folders?filter[name][_eq]=ISVOI%20Device%20Photos&fields=id&limit=1")
)[0]?.id;
const reviewFolder = (
  await request("GET", "/folders?filter[name][_eq]=ISVOI%20File%20Review&fields=id&limit=1")
)[0]?.id;
if (!deviceFolder || !reviewFolder) throw new Error("Required retention folders missing");
const state = {
  batch: manifest.batch,
  manifest_sha256: digest(await fs.readFile(manifestPath)),
  status: "prepared",
  rows: [],
  archived_files: [],
};
for (const photo of all) {
  let fileId = photo.before.image;
  if (photo.replacement) {
    const filename = path.resolve(root, photo.replacement.path);
    if (!filename.startsWith(`${root}${path.sep}`))
      throw new Error("Replacement path escapes bundle");
    const bytes = await fs.readFile(filename);
    await validateReplacement(photo, bytes);
    if (digest(await assetBytes(photo.before.image)) !== photo.replacement.previous_sha256)
      throw new Error("Original bytes changed since visual review");
    const old = await request("GET", `/files/${photo.before.image}?fields=id,folder,description`);
    if (old.folder !== deviceFolder) throw new Error("Original is outside product-photo folder");
    state.archived_files.push(old);
    if (apply) {
      const title = `isvoi:${manifest.batch}:${path.basename(filename, ".webp")}:${photo.replacement.sha256.slice(0, 12)}`;
      const existing = (
        await request(
          "GET",
          `/files?filter[title][_eq]=${encodeURIComponent(title)}&fields=id,folder&limit=1`,
        )
      )[0];
      if (existing) {
        if (existing.folder !== deviceFolder)
          throw new Error("Reused replacement has unexpected folder");
        fileId = existing.id;
      } else {
        const form = new FormData();
        form.append("folder", deviceFolder);
        form.append("title", title);
        form.append(
          "description",
          "Non-generative background repair; protected device pixels unchanged.",
        );
        form.append(
          "file",
          new Blob([bytes], { type: "image/webp" }),
          `isvoi-${path.basename(filename)}`,
        );
        fileId = (await request("POST", "/files", form)).id;
      }
      await validateReplacement(photo, await assetBytes(fileId));
    }
  }
  state.rows.push({
    id: photo.id,
    before: photo.before,
    after: { ...photo.before, ...photo.after, image: fileId },
  });
}
await preflight(before);
if (!apply) {
  console.log(
    JSON.stringify({
      dry_run: true,
      devices: manifest.devices.length,
      rows: all.length,
      replacements: state.archived_files.length,
    }),
  );
  process.exit(0);
}
await save(state);
// Directus 11.17.4 updateBatch wraps these heterogeneous updates in one transaction.
const changed = state.rows.filter((r) => fields.some((k) => r.before[k] !== r.after[k]));
await updateRows(changed, "after");
state.status = "applied";
await save(state);
await preflight(new Map(state.rows.map((r) => [r.id, r.after])));
for (const file of state.archived_files) {
  const listing = (
    await request("GET", `/items/products?filter[listing_file][_eq]=${file.id}&fields=id&limit=1`)
  )[0];
  const gallery = (
    await request("GET", `/items/product_images?filter[image][_eq]=${file.id}&fields=id&limit=1`)
  )[0];
  if (listing || gallery)
    throw new Error("Old photo is still referenced; retained without archiving");
  await request("PATCH", `/files/${file.id}`, {
    folder: reviewFolder,
    description: `Replaced by ${manifest.batch}; retained for conflict-aware rollback.`,
  });
}
state.status = "verified";
await save(state);
console.log(
  JSON.stringify({
    applied: true,
    devices: manifest.devices.length,
    checked_rows: all.length,
    changed_rows: changed.length,
    replacements: state.archived_files.length,
  }),
);
