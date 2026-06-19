#!/usr/bin/env node
/**
 * Upload device photos into Directus Files and sync device_images rows.
 *
 * Safe defaults:
 * - skips existing device_images rows;
 * - does not overwrite devices.listing_file when it already exists;
 * - reuses files with the same deterministic title.
 *
 * Usage:
 *   DIRECTUS_URL=https://api.isvoi.ru DIRECTUS_TOKEN=... \
 *     node scripts/import_device_media.mjs --file data/devices.json --assets-root apps/web/public
 *
 * Add --replace to patch existing device_images rows and devices.listing_file.
 * Add --dry-run to validate the plan without writing to Directus.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROLE_BY_LABEL = new Map([
  ["общий вид", "main"],
  ["экран", "screen"],
  ["корпус", "body"],
  ["дефекты", "defect"],
  ["defect", "defect"],
  ["screen", "screen"],
  ["body", "body"],
  ["main", "main"],
]);

const MIME_BY_EXT = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

function parseArgs(argv) {
  const args = {
    file: "data/devices.json",
    assetsRoot: "apps/web/public",
    folder: "ISVOI Device Photos",
    dryRun: false,
    replace: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--replace") args.replace = true;
    else if (arg === "--file") args.file = argv[++i];
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

function titleFor(deviceId, role, index) {
  return `isvoi:${deviceId}:${role}:${index}`;
}

function roleForImage(image, index) {
  const label = String(image.label || "").trim().toLowerCase();
  return ROLE_BY_LABEL.get(label) || (index === 0 ? "main" : "other");
}

function localAssetPath(assetsRoot, value) {
  if (!value || /^https?:\/\//.test(value)) return "";
  const clean = String(value).replace(/^\/+/, "");
  return path.resolve(assetsRoot, clean);
}

async function ensureFolder(cfg, name, dryRun) {
  try {
    const encoded = encodeURIComponent(name);
    const existing = await findOne(cfg, `/folders?filter[name][_eq]=${encoded}&fields=id,name&limit=1`);
    if (existing?.id) return existing.id;
    if (dryRun) {
      console.log(`[dry-run] create folder ${name}`);
      return null;
    }
    const created = await requestJson(cfg, "POST", "/folders", { name });
    console.log(`[create] folder ${name}`);
    return created.id;
  } catch (error) {
    console.log(`[info] folder lookup skipped (${error.message}); Directus default folder will be used`);
    return null;
  }
}

async function ensureFile(cfg, { filePath, title, folder, description, dryRun }) {
  const existing = await findOne(
    cfg,
    `/files?filter[title][_eq]=${encodeURIComponent(title)}&fields=id,title,filename_download&limit=1`,
  );
  if (existing?.id) {
    console.log(`[skip] file ${title} -> ${existing.id}`);
    return existing.id;
  }

  if (!existsSync(filePath)) {
    throw new Error(`Missing local asset: ${filePath}`);
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
  form.append("description", description || "");
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
  console.log(`[upload] ${title} -> ${json.data.id}`);
  return json.data.id;
}

async function getDevice(cfg, id) {
  return findOne(
    cfg,
    `/items/devices/${encodeURIComponent(id)}?fields=id,listing_file,listing_image`,
  );
}

async function patchDeviceListing(cfg, id, fileId, { replace, dryRun }) {
  const device = await getDevice(cfg, id);
  if (!device) throw new Error(`Device not found in Directus: ${id}`);
  if (device.listing_file && !replace) {
    console.log(`[skip] devices/${id}.listing_file already set`);
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] patch devices/${id}.listing_file = ${fileId}`);
    return;
  }
  await requestJson(cfg, "PATCH", `/items/devices/${encodeURIComponent(id)}`, { listing_file: fileId });
  console.log(`[patch] devices/${id}.listing_file`);
}

async function upsertDeviceImage(cfg, payload, { replace, dryRun }) {
  const existing = await findOne(
    cfg,
    `/items/device_images?filter[device][_eq]=${encodeURIComponent(payload.device)}&filter[role][_eq]=${encodeURIComponent(payload.role)}&fields=id,image&limit=1`,
  );
  if (existing?.id && !replace) {
    console.log(`[skip] device_images ${payload.device}/${payload.role}`);
    return existing.id;
  }
  if (dryRun) {
    console.log(`[dry-run] ${existing?.id ? "patch" : "create"} device_images ${payload.device}/${payload.role}`);
    return existing?.id ?? null;
  }
  if (existing?.id) {
    await requestJson(cfg, "PATCH", `/items/device_images/${existing.id}`, payload);
    console.log(`[patch] device_images ${payload.device}/${payload.role}`);
    return existing.id;
  }
  const created = await requestJson(cfg, "POST", "/items/device_images", payload);
  console.log(`[create] device_images ${payload.device}/${payload.role}`);
  return created.id;
}

async function syncDeviceMedia(cfg, device, args, folderId) {
  const deviceId = device.id;
  if (!deviceId) throw new Error("Device without id in catalog JSON.");

  const listingPath = localAssetPath(args.assetsRoot, device.listingImage);
  if (listingPath) {
    const role = "card";
    const fileId = await ensureFile(cfg, {
      filePath: listingPath,
      title: titleFor(deviceId, role, 0),
      folder: folderId,
      description: `${device.title || deviceId} catalog card`,
      dryRun: args.dryRun,
    });
    await upsertDeviceImage(cfg, {
      status: "published",
      sort: 0,
      device: deviceId,
      role,
      image: fileId,
      label: "Card",
      alt: device.listingAlt || device.title || deviceId,
    }, args);
    await patchDeviceListing(cfg, deviceId, fileId, args);
  }

  const gallery = Array.isArray(device.gallery) ? device.gallery : [];
  for (let index = 0; index < gallery.length; index += 1) {
    const image = gallery[index];
    const filePath = localAssetPath(args.assetsRoot, image.src);
    if (!filePath) continue;
    const role = roleForImage(image, index);
    const fileId = await ensureFile(cfg, {
      filePath,
      title: titleFor(deviceId, role, index + 1),
      folder: folderId,
      description: `${device.title || deviceId} ${image.label || role}`,
      dryRun: args.dryRun,
    });
    await upsertDeviceImage(cfg, {
      status: "published",
      sort: index + 10,
      device: deviceId,
      role,
      image: fileId,
      label: image.label || role,
      alt: image.alt || device.listingAlt || device.title || deviceId,
    }, args);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  const catalogPath = path.resolve(args.file);
  const assetsRoot = path.resolve(args.assetsRoot);
  args.assetsRoot = assetsRoot;

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const devices = Array.isArray(catalog.devices) ? catalog.devices : [];
  if (devices.length === 0) throw new Error(`No devices found in ${catalogPath}`);

  const folderId = await ensureFolder(cfg, args.folder, args.dryRun);
  console.log(`${args.dryRun ? "[dry-run] " : ""}Syncing media for ${devices.length} device(s)`);
  for (const device of devices) {
    await syncDeviceMedia(cfg, device, args, folderId);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
