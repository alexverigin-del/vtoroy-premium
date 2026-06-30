import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const webRoot = path.join(root, "apps", "web");
const scanRoots = ["app", "components", "lib"].map((segment) => path.join(webRoot, segment));

const forbiddenFiles = [
  path.join(webRoot, "app", "site.css"),
  path.join(webRoot, "public", "interactions.js"),
  path.join(webRoot, "lib", "site-renderer.ts"),
];

const riskyPatterns = [
  { label: "template className", pattern: /className=\{`/ },
  { label: "array className join", pattern: /className=\{\s*\[/ },
  { label: "Tailwind dynamic color class", pattern: /\b(?:bg|text|border)-\$\{/ },
];

const applyAllowed = new Set(["body", ".btn-pill", ".card", ".focus-ring"]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (!/\.(tsx?|css)$/.test(entry.name)) return [];
    return [file];
  });
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function selectorBeforeApply(source, index) {
  const before = source.slice(0, index);
  const open = before.lastIndexOf("{");
  if (open === -1) return "";
  const selectorStart = before.lastIndexOf("}", open);
  return (
    before
      .slice(selectorStart + 1, open)
      .trim()
      .split(/\s+/)
      .at(-1) ?? ""
  );
}

const errors = [];
const warnings = [];

for (const file of forbiddenFiles) {
  if (fs.existsSync(file)) {
    errors.push(`${rel(file)} should not exist after Tailwind-first migration.`);
  }
}

for (const file of scanRoots.flatMap(walk)) {
  const source = fs.readFileSync(file, "utf8");
  for (const { label, pattern } of riskyPatterns) {
    const match = pattern.exec(source);
    if (match) {
      errors.push(
        `${rel(file)}:${lineNumber(source, match.index)} uses risky ${label}; prefer cn().`,
      );
    }
  }

  for (const match of source.matchAll(/className="([^"]{180,})"/g)) {
    warnings.push(
      `${rel(file)}:${lineNumber(source, match.index)} has a long className literal; consider component extraction.`,
    );
  }

  if (file.endsWith("globals.css")) {
    for (const match of source.matchAll(/@apply\b/g)) {
      const selector = selectorBeforeApply(source, match.index);
      if (!applyAllowed.has(selector)) {
        errors.push(
          `${rel(file)}:${lineNumber(source, match.index)} uses @apply in '${selector}', outside approved primitives.`,
        );
      }
    }
  }
}

if (warnings.length) {
  console.log("Tailwind post-migration warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length) {
  console.error("Tailwind post-migration audit failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Tailwind post-migration audit passed.");
