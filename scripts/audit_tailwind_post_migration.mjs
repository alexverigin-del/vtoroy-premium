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
const sharedTailwindConfig = path.join(root, "tailwind.shared.cjs");
const tailwindConfigs = [
  path.join(webRoot, "tailwind.config.ts"),
  path.join(root, "tailwind.config.eslint.cjs"),
];

const riskyPatterns = [
  { label: "template className", pattern: /className=\{`/ },
  { label: "array className join", pattern: /className=\{\s*\[/ },
  { label: "Tailwind dynamic color class", pattern: /\b(?:bg|text|border)-\$\{/ },
];

const applyAllowed = new Set(["body", ".btn-pill", ".card", ".focus-ring"]);
const arbitraryUtilityPattern =
  /\b(?:[a-z][a-z0-9:-]*-\[[^\]\s"']+\]|[a-z][a-z0-9:-]*\/\[[^\]\s"']+\])/g;
const arbitraryUtilityAllowed = [
  /^aspect-\[4\/3\]$/,
  /^(h|min-h|w)-\[var\(--logo-(height|width),\d+px\)\]$/,
  /^left-\[-9999px\]$/,
  /^leading-\[(1\.03|1\.05)\]$/,
  /^max-w-\[(88|280|390|420|520|620|640|660|700|720|760|780|880|900|980|1040|1120|1180|1440)px\]$/,
  /^min-h-\[(44|65|230|250|260|300|320|360|390|410|520|560|620)px\]$/,
  /^w-\[390px\]$/,
  /^text-\[(9px|11px|17px)\]$/,
  /^tracking-\[(0\.08em|0\.1em|0\.12em|0\.18em)\]$/,
  /^grid-cols-\[(0\.95fr_1\.05fr|1\.05fr_0\.95fr|1\.1fr_1fr_1fr|1\.3fr_repeat\(3,minmax\(0,1fr\)\)|1fr_auto_1fr|minmax\(0,1fr\)_410px)\]$/,
  /^(bg|border|text)-white\/\[(0\.06|0\.12|0\.18|0\.78)\]$/,
  /^bg-\[#0077ed\]$/,
];

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

function utilityBase(token) {
  return token.split(":").at(-1) ?? token;
}

function arbitraryUtilityAllowedByPolicy(token) {
  const base = utilityBase(token);
  return arbitraryUtilityAllowed.some((pattern) => pattern.test(base));
}

const errors = [];
const warnings = [];

for (const file of forbiddenFiles) {
  if (fs.existsSync(file)) {
    errors.push(`${rel(file)} should not exist after Tailwind-first migration.`);
  }
}

if (!fs.existsSync(sharedTailwindConfig)) {
  errors.push("tailwind.shared.cjs is required as the single shared Tailwind token source.");
}

for (const file of tailwindConfigs) {
  const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (!source.includes("tailwind.shared.cjs")) {
    errors.push(
      `${rel(file)} must import tailwind.shared.cjs instead of duplicating design tokens.`,
    );
  }
  if (
    source.match(/\bcolors:\s*\{/) ||
    source.match(/\bborderRadius:\s*\{/) ||
    source.match(/\bboxShadow:\s*\{/)
  ) {
    errors.push(
      `${rel(file)} appears to define Tailwind tokens directly; move shared tokens to tailwind.shared.cjs.`,
    );
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

  for (const match of source.matchAll(arbitraryUtilityPattern)) {
    const token = match[0];
    if (!arbitraryUtilityAllowedByPolicy(token)) {
      errors.push(
        `${rel(file)}:${lineNumber(source, match.index)} uses unreviewed arbitrary Tailwind utility '${token}'. Move repeated values to tokens or add an explicit audit allowlist entry.`,
      );
    }
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
