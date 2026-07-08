#!/usr/bin/env node
/**
 * Trigger the protected catalog import route for a Directus import batch.
 *
 * Usage:
 *   node scripts/run_catalog_import_route.mjs --batch-id <uuid>
 *   node scripts/run_catalog_import_route.mjs --batch-id <uuid> --apply
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    values[key.trim()] = parts.join("=").trim();
  }
  return values;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

const batchId = arg("--batch-id");
const apply = process.argv.includes("--apply");
const env = {
  ...readEnvFile(path.join(process.cwd(), "apps", "web", ".env.local")),
  ...process.env,
};
const secret = env.CATALOG_IMPORT_WEBHOOK_SECRET || "";
const siteUrl = (env.CATALOG_IMPORT_SITE_URL || "https://isvoi.ru").replace(/\/+$/, "");

if (!batchId) {
  console.error("--batch-id is required");
  process.exit(2);
}
if (!secret) {
  console.error("CATALOG_IMPORT_WEBHOOK_SECRET is required");
  process.exit(2);
}

const url = new URL(`${siteUrl}/api/admin/catalog-import/run`);
url.searchParams.set("batch_id", batchId);
if (apply) url.searchParams.set("apply", "true");

const response = await fetch(url, {
  method: "POST",
  headers: { "x-isvoi-import-secret": secret },
});
const text = await response.text();
console.log(`status=${response.status}`);
console.log(text.length > 4000 ? `${text.slice(0, 4000)}\n...<truncated>` : text);
if (!response.ok) process.exit(1);
