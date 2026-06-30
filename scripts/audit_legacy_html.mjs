#!/usr/bin/env node
/**
 * Guard against reintroducing the old static HTML/CSS/JS site.
 *
 * The public site is served by Next.js now. Legacy `.html` URLs may appear only
 * in compatibility redirects or URL-normalization scripts, not as root page
 * files or content links. The Tailwind-first runtime also must not bring back
 * the deleted legacy stylesheet, interaction script, or HTML renderer module.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LEGACY_ENTRYPOINTS = [
  "index.html",
  "script.js",
  "styles.css",
  "catalog/index.html",
  "store/index.html",
  "passport/index.html",
  "trade/index.html",
  "club/index.html",
  "device/iphone-13-pro/index.html",
  "device/iphone-14/index.html",
  "device/macbook-air-m1/index.html",
  "device/ipad-air/index.html",
  "apps/web/app/site.css",
  "apps/web/public/interactions.js",
  "apps/web/lib/site-renderer.ts",
];

const ALLOWLIST = new Set([
  "apps/web/next.config.mjs",
  "apps/web/components/site-chrome-utils.ts",
  "apps/web/lib/site-content.ts",
  "scripts/audit_legacy_html.mjs",
  "scripts/audit_text_encoding.py",
  "scripts/normalize_directus_site_urls_sql.mjs",
]);

const TEXT_SUFFIXES = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".py",
  ".sql",
  ".yml",
  ".yaml",
]);

const SKIP_DIRS = new Set([".git", ".next", "backups", "node_modules", "uploads", "var"]);

const HTML_ROUTE_RE =
  /(?<![A-Za-z0-9_/-])(?:\/|\.\.\/)?(?:index|catalog\/index|store\/index|passport\/index|trade\/index|club\/index)\.html|device\/[^\s"')]+\/index\.html/g;
const LEGACY_RUNTIME_RE =
  /apps\/web\/app\/site\.css|apps\/web\/public\/interactions\.js|@\/lib\/site-renderer|apps\/web\/lib\/site-renderer\.ts|(?<![A-Za-z0-9_/-])(?:script|styles)\.(?:js|css)(?![A-Za-z0-9_/-])/g;

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function* iterTextFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* iterTextFiles(fullPath);
      }
      continue;
    }
    if (entry.isFile() && TEXT_SUFFIXES.has(path.extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

const issues = [];

for (const item of LEGACY_ENTRYPOINTS) {
  if (fs.existsSync(path.join(ROOT, item))) {
    issues.push(`legacy static/runtime file still exists: ${item}`);
  }
}

for (const filePath of iterTextFiles(ROOT)) {
  const relative = rel(filePath);
  if (ALLOWLIST.has(relative)) continue;

  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    continue;
  }

  for (const match of text.matchAll(HTML_ROUTE_RE)) {
    issues.push(`legacy .html route reference: ${relative}:${lineNumber(text, match.index)}: ${match[0]}`);
  }
  for (const match of text.matchAll(LEGACY_RUNTIME_RE)) {
    issues.push(`legacy runtime reference: ${relative}:${lineNumber(text, match.index)}: ${match[0]}`);
  }
}

if (issues.length) {
  console.log("Legacy HTML audit failed:");
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  process.exit(1);
}

console.log("No legacy static HTML/CSS/JS entrypoints or content links found.");
