#!/usr/bin/env node
/**
 * Audit that public-facing copy ownership stays explicit.
 *
 * The website should keep frequently edited user copy in Directus. This audit
 * snapshots the currently accepted Russian strings in the React/Next codebase
 * and fails when new strings appear without an intentional baseline update.
 *
 * Usage:
 *   npm run directus:audit-content-ownership
 *   node scripts/audit_content_ownership.mjs --update-baseline
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baselinePath = path.join(root, "scripts", "content_ownership_baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");
const cyrillicPattern = /[А-Яа-яЁё]/u;
const stringLiteralPattern = /(["'`])((?:\\.|(?!\1).)*[А-Яа-яЁё](?:\\.|(?!\1).)*)\1/g;
const jsxTextPattern = />\s*([^<>{}]*[А-Яа-яЁё][^<>{}]*)\s*</g;
const directAssetPattern = /(?:https?:\/\/api\.isvoi\.ru\/assets\/|\/assets\/|assets\/)/iu;
const legacyJsonImageKeyPattern = /^(?:image_src|imageSrc)$/u;

const copyScanRoots = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/data",
  "apps/web/lib",
  "packages/shared/src",
];

const jsonScanRoots = ["apps/web/data", "directus", "scripts"];
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const jsonExtensions = new Set([".json"]);
const ignoredDirs = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const ignoredJsonFiles = new Set([
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
]);

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function walk(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) return [];
      return walk(file, extensions);
    }
    if (!extensions.has(path.extname(entry.name))) return [];
    return [file];
  });
}

function normalizeText(value) {
  return String(value).replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
}

function idFor(file, kind, text) {
  return crypto
    .createHash("sha1")
    .update(`${rel(file)}\0${kind}\0${normalizeText(text)}`)
    .digest("hex")
    .slice(0, 16);
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function isCommentOnlyLine(source, index) {
  const start = source.lastIndexOf("\n", index) + 1;
  const end = source.indexOf("\n", index);
  const line = source.slice(start, end === -1 ? source.length : end).trim();
  return line.startsWith("//") || line.startsWith("*");
}

function isLikelyCodeFragment(value) {
  return /[;={}]|(?:^|\s)(?:const|let|return|import|export)\s/u.test(normalizeText(value));
}

function extractCodeCopyEntries(file) {
  const source = fs.readFileSync(file, "utf8");
  const entries = [];

  for (const match of source.matchAll(stringLiteralPattern)) {
    if (isCommentOnlyLine(source, match.index ?? 0)) continue;
    const text = normalizeText(match[2]);
    if (!text || !cyrillicPattern.test(text)) continue;
    entries.push({
      file: rel(file),
      kind: "string",
      line: lineNumber(source, match.index ?? 0),
      text,
      id: idFor(file, "string", text),
    });
  }

  for (const match of source.matchAll(jsxTextPattern)) {
    if (isCommentOnlyLine(source, match.index ?? 0)) continue;
    if (isLikelyCodeFragment(match[1])) continue;
    const text = normalizeText(match[1]);
    if (!text || !cyrillicPattern.test(text)) continue;
    entries.push({
      file: rel(file),
      kind: "jsx-text",
      line: lineNumber(source, match.index ?? 0),
      text,
      id: idFor(file, "jsx-text", text),
    });
  }

  return entries;
}

function uniqueEntries(entries) {
  const byId = new Map();
  for (const entry of entries) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.text.localeCompare(b.text);
  });
}

function jsonPath(parent, segment) {
  if (!parent) return String(segment);
  return `${parent}.${segment}`;
}

function jsonAssetIssues(file, value, currentPath = "") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      jsonAssetIssues(file, item, jsonPath(currentPath, index)),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const pathLabel = jsonPath(currentPath, key);
      const keyIssue = legacyJsonImageKeyPattern.test(key)
        ? [
            {
              file: rel(file),
              path: pathLabel,
              reason: "legacy image key in JSON; use Directus Files relation fields",
              value: key,
            },
          ]
        : [];
      return [...keyIssue, ...jsonAssetIssues(file, child, pathLabel)];
    });
  }
  if (typeof value === "string" && directAssetPattern.test(value)) {
    return [
      {
        file: rel(file),
        path: currentPath || "$",
        reason: "direct asset URL/path in JSON; use managed relation fields",
        value,
      },
    ];
  }
  return [];
}

function collectCopyEntries() {
  return uniqueEntries(
    copyScanRoots.flatMap((scanRoot) =>
      walk(path.join(root, scanRoot), codeExtensions).flatMap(extractCodeCopyEntries),
    ),
  );
}

function collectJsonIssues() {
  const files = jsonScanRoots
    .flatMap((scanRoot) => walk(path.join(root, scanRoot), jsonExtensions))
    .filter((file) => !ignoredJsonFiles.has(path.basename(file)));

  const issues = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      issues.push(...jsonAssetIssues(file, data));
    } catch (error) {
      issues.push({
        file: rel(file),
        path: "$",
        reason: `invalid JSON: ${error.message}`,
        value: "",
      });
    }
  }
  return issues;
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Missing ${rel(baselinePath)}. Run node scripts/audit_content_ownership.mjs --update-baseline first.`,
    );
  }
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function writeBaseline(entries) {
  const baseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    note: "Baseline of reviewed Russian strings that intentionally remain in code as system, accessibility or fallback copy. New user-facing copy should live in Directus.",
    scanRoots: copyScanRoots,
    entries,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Content ownership baseline updated: ${entries.length} entries`);
}

function printIssues(label, issues, formatIssue) {
  if (issues.length === 0) return;
  console.error(label);
  for (const issue of issues.slice(0, 40)) {
    console.error(`- ${formatIssue(issue)}`);
  }
  if (issues.length > 40) {
    console.error(`...and ${issues.length - 40} more`);
  }
}

const entries = collectCopyEntries();
const jsonIssues = collectJsonIssues();

if (updateBaseline) {
  writeBaseline(entries);
  if (jsonIssues.length > 0) {
    printIssues(
      "JSON asset ownership issues:",
      jsonIssues,
      (issue) => `${issue.file} ${issue.path}: ${issue.reason} (${issue.value})`,
    );
    process.exit(1);
  }
  process.exit(0);
}

const baseline = loadBaseline();
const allowedIds = new Set((baseline.entries ?? []).map((entry) => entry.id));
const newCopyEntries = entries.filter((entry) => !allowedIds.has(entry.id));

printIssues(
  "New Russian copy in code:",
  newCopyEntries,
  (entry) => `${entry.file}:${entry.line} [${entry.kind}] "${entry.text}"`,
);
printIssues(
  "JSON asset ownership issues:",
  jsonIssues,
  (issue) => `${issue.file} ${issue.path}: ${issue.reason} (${issue.value})`,
);

if (newCopyEntries.length > 0 || jsonIssues.length > 0) {
  console.error(
    "Content ownership audit failed. Move editable copy/media to Directus or update the reviewed baseline intentionally.",
  );
  process.exit(1);
}

console.log(
  `Content ownership audit passed: ${entries.length} reviewed code strings, ${jsonIssues.length} JSON asset issues.`,
);
