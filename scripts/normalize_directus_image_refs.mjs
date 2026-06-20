#!/usr/bin/env node
/**
 * Replace legacy repo asset paths stored in Directus content with Directus Files
 * asset URLs.
 *
 * Run after:
 *   node scripts/import_device_media.mjs --replace
 *   node scripts/import_site_assets.mjs --replace
 *
 * Usage:
 *   DIRECTUS_URL=https://api.isvoi.ru DIRECTUS_TOKEN=... \
 *   NEXT_PUBLIC_DIRECTUS_URL=https://api.isvoi.ru \
 *     node scripts/normalize_directus_image_refs.mjs --dry-run
 */

const DEVICE_ROLE_BY_LABEL = new Map([
  ["общий вид", "main"],
  ["экран", "screen"],
  ["корпус", "body"],
  ["дефекты", "defect"],
  ["defect", "defect"],
  ["screen", "screen"],
  ["body", "body"],
  ["main", "main"],
]);

const TRANSFORMS = {
  card: { width: 720, height: 540, quality: 82, fit: "cover", format: "auto", withoutEnlargement: true },
  gallery: { width: 1200, height: 900, quality: 86, fit: "cover", format: "auto", withoutEnlargement: true },
  passport: { width: 900, height: 675, quality: 84, fit: "cover", format: "auto", withoutEnlargement: true },
  section: { width: 1600, quality: 86, format: "auto", withoutEnlargement: true },
};

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadConfig() {
  const url = (process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
  const token = process.env.DIRECTUS_TOKEN || "";
  const publicUrl = (process.env.NEXT_PUBLIC_DIRECTUS_URL || url).replace(/\/+$/, "");
  if (!url || !token) throw new Error("DIRECTUS_URL and DIRECTUS_TOKEN must be set.");
  return { url, token, publicUrl };
}

function headers(cfg) {
  return {
    Authorization: `Bearer ${cfg.token}`,
    "Content-Type": "application/json",
  };
}

async function requestJson(cfg, method, endpoint, body) {
  const res = await fetch(`${cfg.url}${endpoint}`, {
    method,
    headers: headers(cfg),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${endpoint} failed: ${res.status} ${text}`);
  return json.data;
}

function assetUrl(cfg, fileId, variant) {
  const transform = TRANSFORMS[variant];
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(transform)) {
    params.set(key, String(value));
  }
  return `${cfg.publicUrl}/assets/${fileId}?${params.toString()}`;
}

function normalizePath(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (!clean || /^https?:\/\//i.test(clean)) return "";
  return clean.replace(/^\/+/, "");
}

function basename(value) {
  return normalizePath(value).split("/").pop() || "";
}

function isLocalAsset(value) {
  const clean = normalizePath(value);
  return clean.startsWith("assets/");
}

function roleForGalleryItem(item, index) {
  const label = String(item?.label || item?.role || "").trim().toLowerCase();
  return DEVICE_ROLE_BY_LABEL.get(label) || (index === 0 ? "main" : "other");
}

function json(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

async function getFiles(cfg) {
  const rows = await requestJson(cfg, "GET", "/files?fields=id,title,filename_download&limit=-1");
  const byTitle = new Map();
  const byFilename = new Map();
  for (const row of rows ?? []) {
    if (row.title) byTitle.set(row.title, row);
    if (row.filename_download) byFilename.set(row.filename_download, row);
  }
  return { byTitle, byFilename, rows: rows ?? [] };
}

function deviceFile(files, deviceId, role, index, legacyPath = "") {
  const byExactTitle = files.byTitle.get(`isvoi:${deviceId}:${role}:${index}`);
  if (byExactTitle?.id) return byExactTitle;

  const name = basename(legacyPath);
  if (name) {
    const byFilename = files.rows.find((row) =>
      row.filename_download === name && String(row.title || "").startsWith(`isvoi:${deviceId}:`),
    );
    if (byFilename?.id) return byFilename;
  }

  return null;
}

function siteFile(files, legacyPath) {
  const name = basename(legacyPath);
  if (!name) return null;
  return files.byFilename.get(name) ?? files.byTitle.get(`isvoi:site:${name.replace(/\.[^.]+$/, "")}`) ?? null;
}

function replaceLocalAssetStrings(value, files, cfg) {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = replaceLocalAssetStrings(item, files, cfg);
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const result = replaceLocalAssetStrings(item, files, cfg);
      next[key] = result.value;
      if (result.changed) changed = true;
    }
    return { value: next, changed };
  }
  if (typeof value === "string" && isLocalAsset(value)) {
    const file = siteFile(files, value);
    if (file?.id) return { value: assetUrl(cfg, file.id, "section"), changed: true };
  }
  return { value, changed: false };
}

async function normalizeDevices(cfg, files, dryRun) {
  const rows = await requestJson(
    cfg,
    "GET",
    "/items/devices?fields=id,listing_image,gallery,passport&limit=-1",
  );
  let patched = 0;

  for (const row of rows ?? []) {
    const id = String(row.id || "");
    if (!id) continue;
    const payload = {};

    if (isLocalAsset(row.listing_image)) {
      const file = deviceFile(files, id, "card", 0, row.listing_image);
      if (file?.id) payload.listing_image = assetUrl(cfg, file.id, "card");
    }

    const gallery = json(row.gallery, []);
    if (Array.isArray(gallery)) {
      let changed = false;
      const nextGallery = gallery.map((item, index) => {
        if (!item || typeof item !== "object" || !isLocalAsset(item.src)) return item;
        const role = roleForGalleryItem(item, index);
        const file = deviceFile(files, id, role, index + 1, item.src);
        if (!file?.id) return item;
        changed = true;
        return { ...item, src: assetUrl(cfg, file.id, "gallery") };
      });
      if (changed) payload.gallery = nextGallery;
    }

    const passport = json(row.passport, null);
    const defectPhoto = passport?.condition?.defectPhoto;
    if (passport && isLocalAsset(defectPhoto)) {
      const file = deviceFile(files, id, "defect", 4, defectPhoto)
        ?? files.rows.find((candidate) =>
          candidate.filename_download === basename(defectPhoto)
          && String(candidate.title || "").startsWith(`isvoi:${id}:`),
        );
      if (file?.id) {
        payload.passport = {
          ...passport,
          condition: {
            ...passport.condition,
            defectPhoto: assetUrl(cfg, file.id, "passport"),
          },
        };
      }
    }

    if (Object.keys(payload).length === 0) continue;
    patched += 1;
    if (dryRun) {
      console.log(`[dry-run] patch devices/${id}: ${Object.keys(payload).join(", ")}`);
    } else {
      await requestJson(cfg, "PATCH", `/items/devices/${encodeURIComponent(id)}`, payload);
      console.log(`[patch] devices/${id}: ${Object.keys(payload).join(", ")}`);
    }
  }

  return patched;
}

async function normalizePageSections(cfg, files, dryRun) {
  const rows = await requestJson(cfg, "GET", "/items/page_sections?fields=id,section_key,content&limit=-1");
  let patched = 0;

  for (const row of rows ?? []) {
    const content = json(row.content, {});
    const result = replaceLocalAssetStrings(content, files, cfg);
    if (!result.changed) continue;
    patched += 1;
    if (dryRun) {
      console.log(`[dry-run] patch page_sections/${row.section_key || row.id}: content`);
    } else {
      await requestJson(cfg, "PATCH", `/items/page_sections/${row.id}`, { content: result.value });
      console.log(`[patch] page_sections/${row.section_key || row.id}: content`);
    }
  }

  return patched;
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  const files = await getFiles(cfg);

  const deviceCount = await normalizeDevices(cfg, files, args.dryRun);
  const sectionCount = await normalizePageSections(cfg, files, args.dryRun);

  console.log(`${args.dryRun ? "[dry-run] " : ""}Normalized image refs: devices=${deviceCount}, page_sections=${sectionCount}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
