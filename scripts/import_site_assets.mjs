#!/usr/bin/env node
/**
 * Upload non-product site images to Directus Files and wire homepage sections.
 *
 * Product/catalog photos are handled by import_device_media.mjs and
 * import_devices_from_excel.py. This script owns editorial/site imagery:
 * hero, store, diagnostics, and legacy static-page supporting images.
 *
 * Usage:
 *   DIRECTUS_URL=https://api.isvoi.ru DIRECTUS_TOKEN=... \
 *     node scripts/import_site_assets.mjs --dry-run
 *
 * Add --replace to patch page_sections.image/content even when already set.
 * Add --upload-only to only upload missing files and skip page_sections patches.
 * Add --only-title to sync one deterministic asset without touching the rest.
 */

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME_BY_EXT = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

const SECTION_ASSETS = [
  {
    file: "hero-apple-like-single-phone-clean.webp",
    title: "isvoi:site:home:hero",
    page: "home",
    section: "hero",
  },
  {
    file: "store-real-premium-hero.webp",
    title: "isvoi:site:home:store-preview",
    page: "home",
    section: "store_preview",
  },
  {
    file: "generated-diagnostics.webp",
    title: "isvoi:site:home:diagnostics",
    page: "home",
    section: "diagnostics_compare",
  },
];

const ROOT_SITE_ASSETS = [
  {
    file: "../favicon-gold.png",
    title: "isvoi:site:favicon-gold",
  },
];

const EXTRA_SITE_FILES = new Set([
  "favicon.svg",
  "generated-hero-vitrine.webp",
  "generated-hero-vitrine-v2.webp",
  "generated-premium-hero.webp",
  "generated-store.webp",
  "generated-store-premium.webp",
  "hero-single-iphone-clean.webp",
  "store-diagnostics-clean.webp",
]);

function parseArgs(argv) {
  const args = {
    assetsRoot: "apps/web/public/assets",
    folder: "ISVOI Site Assets",
    dryRun: false,
    replace: false,
    uploadOnly: false,
    onlyTitle: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--replace") args.replace = true;
    else if (arg === "--upload-only") args.uploadOnly = true;
    else if (arg === "--only-title") {
      args.onlyTitle = argv[++i];
      if (!args.onlyTitle) throw new Error("--only-title requires a Directus file title.");
    }
    else if (arg === "--assets-root") args.assetsRoot = argv[++i];
    else if (arg === "--folder") args.folder = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadConfig() {
  const url = (process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
  const token = process.env.DIRECTUS_TOKEN || "";
  if (!url || !token) {
    throw new Error("DIRECTUS_URL and DIRECTUS_TOKEN must be set.");
  }
  return { url, token };
}

function headers(cfg, contentType = "application/json") {
  const base = { Authorization: `Bearer ${cfg.token}` };
  return contentType ? { ...base, "Content-Type": contentType } : base;
}

async function requestJson(cfg, method, endpoint, body) {
  const res = await fetch(`${cfg.url}${endpoint}`, {
    method,
    headers: headers(cfg),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} failed: ${res.status} ${text}`);
  }
  return json.data;
}

async function findOne(cfg, endpoint) {
  const data = await requestJson(cfg, "GET", endpoint);
  return Array.isArray(data) ? data[0] : data;
}

async function filesByTitle(cfg) {
  const rows = await requestJson(cfg, "GET", "/files?fields=id,title,filename_download&limit=-1");
  const files = new Map();
  for (const row of rows ?? []) {
    if (row.title) files.set(row.title, row);
  }
  return files;
}

async function ensureFolder(cfg, name, dryRun) {
  try {
    const existing = await findOne(
      cfg,
      `/folders?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name&limit=1`,
    );
    if (existing?.id) return existing.id;
    if (dryRun) {
      console.log(`[dry-run] create folder ${name}`);
      return null;
    }
    const created = await requestJson(cfg, "POST", "/folders", { name });
    console.log(`[create] folder ${name}`);
    return created.id;
  } catch (error) {
    console.log(
      `[info] folder lookup skipped (${error.message}); Directus default folder will be used`,
    );
    return null;
  }
}

async function ensureFile(cfg, existingFiles, { filePath, title, folder, dryRun }) {
  const existing = existingFiles.get(title);
  if (existing?.id) {
    console.log(`[skip] file ${title} -> ${existing.id}`);
    return existing.id;
  }
  if (!existsSync(filePath)) {
    throw new Error(`Missing site asset: ${filePath}`);
  }
  if (dryRun) {
    console.log(`[dry-run] upload ${filePath} as ${title}`);
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  const bytes = await readFile(filePath);
  const form = new FormData();
  if (folder) form.append("folder", folder);
  form.append("title", title);
  form.append("description", "ISVOI site/editorial image");
  form.append(
    "file",
    new Blob([bytes], { type: MIME_BY_EXT.get(ext) || "application/octet-stream" }),
    path.basename(filePath),
  );

  const res = await fetch(`${cfg.url}/files`, {
    method: "POST",
    headers: headers(cfg, null),
    body: form,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`POST /files failed: ${res.status} ${text}`);
  }
  existingFiles.set(title, json.data);
  console.log(`[upload] file ${title} -> ${json.data.id}`);
  return json.data.id;
}

async function patchSectionImage(cfg, asset, fileId, { dryRun, replace }) {
  if (!asset.page || !asset.section || !fileId) return;
  const page = await findOne(
    cfg,
    `/items/site_pages?filter[slug][_eq]=${encodeURIComponent(asset.page)}&fields=id,slug&limit=1`,
  );
  if (!page?.id) throw new Error(`Site page not found: ${asset.page}`);

  const section = await findOne(
    cfg,
    `/items/page_sections?filter[page][_eq]=${encodeURIComponent(page.id)}&filter[section_key][_eq]=${encodeURIComponent(asset.section)}&fields=id,section_key,image,content&limit=1`,
  );
  if (!section?.id) throw new Error(`Page section not found: ${asset.page}/${asset.section}`);

  const payload = {};
  if (!section.image || replace) payload.image = fileId;

  if (Object.keys(payload).length === 0) {
    console.log(`[skip] page_sections ${asset.section} already has image`);
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] patch page_sections ${asset.section} -> ${fileId}`);
    return;
  }
  await requestJson(cfg, "PATCH", `/items/page_sections/${section.id}?fields=id`, payload);
  console.log(`[patch] page_sections ${asset.section}`);
}

function discoverAssets(assetsRoot) {
  const sectionFiles = new Set(SECTION_ASSETS.map((asset) => asset.file));
  const discovered = [];
  for (const filename of readdirSync(assetsRoot)) {
    const ext = path.extname(filename).toLowerCase();
    if (!MIME_BY_EXT.has(ext)) continue;
    if (filename.startsWith("catalog-") || filename.startsWith("device-")) continue;
    if (sectionFiles.has(filename)) continue;
    if (!EXTRA_SITE_FILES.has(filename)) continue;
    discovered.push({
      file: filename,
      title: `isvoi:site:${filename.replace(/\.[^.]+$/, "")}`,
    });
  }
  return [...SECTION_ASSETS, ...ROOT_SITE_ASSETS, ...discovered].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  const assetsRoot = path.resolve(args.assetsRoot);
  if (!existsSync(assetsRoot)) throw new Error(`Assets root not found: ${assetsRoot}`);

  const folderId = await ensureFolder(cfg, args.folder, args.dryRun);
  const existingFiles = await filesByTitle(cfg);
  const assets = discoverAssets(assetsRoot).filter(
    (asset) => !args.onlyTitle || asset.title === args.onlyTitle,
  );
  if (assets.length === 0) {
    throw new Error(`No site asset matched --only-title ${args.onlyTitle}.`);
  }
  console.log(`${args.dryRun ? "[dry-run] " : ""}Syncing ${assets.length} site asset(s)`);
  if (args.uploadOnly) console.log("[upload-only] page_sections patches are disabled");

  for (const asset of assets) {
    const fileId = await ensureFile(cfg, existingFiles, {
      filePath: path.join(assetsRoot, asset.file),
      title: asset.title,
      folder: folderId,
      dryRun: args.dryRun,
    });
    if (!args.uploadOnly) {
      await patchSectionImage(cfg, asset, fileId, args);
    }
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
