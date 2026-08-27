#!/usr/bin/env node
/**
 * Upload inventory workbooks to Directus Files and create an idempotent
 * inventory_import_batches record. The actual validation/apply stays in the
 * existing inventory-import route and inventory_pipeline.py.
 */

import fs from "node:fs/promises";
import path from "node:path";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseArgs(argv) {
  const args = {
    inventory: "",
    receipts: "",
    batch: "",
    snapshotAt: "",
    sourceSystem: "store_inventory",
    note: "",
    folder: "ISVOI Inventory Imports",
    confirmMissingDeactivation: false,
    dryRun: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--inventory") args.inventory = argv[++index] || "";
    else if (arg === "--receipts") args.receipts = argv[++index] || "";
    else if (arg === "--batch") args.batch = argv[++index] || "";
    else if (arg === "--snapshot-at") args.snapshotAt = argv[++index] || "";
    else if (arg === "--source-system") args.sourceSystem = argv[++index] || "";
    else if (arg === "--note") args.note = argv[++index] || "";
    else if (arg === "--folder") args.folder = argv[++index] || "";
    else if (arg === "--confirm-missing-deactivation") args.confirmMissingDeactivation = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.inventory) throw new Error("--inventory is required");
  if (!args.batch) throw new Error("--batch is required");
  if (!args.snapshotAt || Number.isNaN(Date.parse(args.snapshotAt))) {
    throw new Error("--snapshot-at must be a valid ISO date/time");
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/i.test(args.batch)) {
    throw new Error("--batch must contain only letters, numbers, dots, underscores, or hyphens");
  }
  return args;
}

function config() {
  const url = String(process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
  const token = String(
    process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN ||
      process.env.CATALOG_IMPORT_DIRECTUS_TOKEN ||
      process.env.DIRECTUS_TOKEN ||
      "",
  );
  if (!url || !token) {
    throw new Error(
      "DIRECTUS_URL and INVENTORY_IMPORT_DIRECTUS_TOKEN or CATALOG_IMPORT_DIRECTUS_TOKEN are required",
    );
  }
  return { url, token };
}

async function assertWorkbook(filePath, required) {
  if (!filePath && !required) return null;
  if (!filePath) throw new Error("Workbook path is required");
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isFile()) throw new Error(`Workbook not found: ${resolved}`);
  if (path.extname(resolved).toLowerCase() !== ".xlsx") {
    throw new Error(`Workbook must be .xlsx: ${resolved}`);
  }
  return { path: resolved, size: stats.size, filename: path.basename(resolved) };
}

function authHeaders(cfg, json = true) {
  const headers = { Authorization: `Bearer ${cfg.token}` };
  return json ? { ...headers, "Content-Type": "application/json" } : headers;
}

async function requestJson(cfg, method, endpoint, body, json = true) {
  const response = await fetch(`${cfg.url}${endpoint}`, {
    method,
    headers: authHeaders(cfg, json),
    body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : {};
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${responseText}`);
  }
  return payload.data;
}

async function first(cfg, endpoint) {
  const data = await requestJson(cfg, "GET", endpoint);
  return Array.isArray(data) ? data[0] : data;
}

async function ensureFolder(cfg, name) {
  const existing = await first(
    cfg,
    `/folders?filter[name][_eq]=${encodeURIComponent(name)}&fields=id,name&limit=1`,
  );
  if (existing?.id) return existing.id;
  const created = await requestJson(cfg, "POST", "/folders", { name });
  return created.id;
}

async function ensureFile(cfg, workbook, { folder, title, description }) {
  if (!workbook) return null;
  const existing = await first(
    cfg,
    `/files?filter[title][_eq]=${encodeURIComponent(title)}&fields=id,title,filename_download&limit=1`,
  );
  if (existing?.id) return { id: existing.id, created: false };

  const bytes = await fs.readFile(workbook.path);
  const form = new FormData();
  form.append("folder", folder);
  form.append("title", title);
  form.append("description", description);
  form.append("file", new Blob([bytes], { type: XLSX_MIME }), workbook.filename);
  const uploaded = await requestJson(cfg, "POST", "/files?fields=id", form, false);
  return { id: uploaded.id, created: true };
}

async function main() {
  const args = parseArgs(process.argv);
  const inventory = await assertWorkbook(args.inventory, true);
  const receipts = await assertWorkbook(args.receipts, false);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dry_run",
          batch_name: args.batch,
          snapshot_at: new Date(args.snapshotAt).toISOString(),
          inventory: { filename: inventory.filename, size: inventory.size },
          receipts: receipts ? { filename: receipts.filename, size: receipts.size } : null,
          confirm_missing_deactivation: args.confirmMissingDeactivation,
        },
        null,
        2,
      ),
    );
    return;
  }

  const cfg = config();
  const existingBatch = await first(
    cfg,
    `/items/inventory_import_batches?filter[batch_name][_eq]=${encodeURIComponent(args.batch)}&fields=id,batch_name,status,inventory_workbook,receipts_workbook&limit=1`,
  );
  if (existingBatch?.id) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "existing",
          batch_id: existingBatch.id,
          batch_name: existingBatch.batch_name,
          status: existingBatch.status,
        },
        null,
        2,
      ),
    );
    return;
  }

  const folder = await ensureFolder(cfg, args.folder);
  const inventoryFile = await ensureFile(cfg, inventory, {
    folder,
    title: `isvoi:inventory:${args.batch}:inventory`,
    description: `ISVOI inventory snapshot ${args.batch}`,
  });
  const receiptsFile = await ensureFile(cfg, receipts, {
    folder,
    title: `isvoi:inventory:${args.batch}:receipts`,
    description: `ISVOI receipt history ${args.batch}`,
  });
  const batch = await requestJson(
    cfg,
    "POST",
    "/items/inventory_import_batches?fields=id,batch_name,status",
    {
      status: "draft",
      batch_name: args.batch,
      source_system: args.sourceSystem,
      snapshot_at: new Date(args.snapshotAt).toISOString(),
      inventory_workbook: inventoryFile.id,
      receipts_workbook: receiptsFile?.id || null,
      confirm_missing_deactivation: args.confirmMissingDeactivation,
      note: args.note || null,
    },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "created",
        batch_id: batch.id,
        batch_name: batch.batch_name,
        status: batch.status,
        files_created: Number(inventoryFile.created) + Number(receiptsFile?.created || false),
        confirm_missing_deactivation: args.confirmMissingDeactivation,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
