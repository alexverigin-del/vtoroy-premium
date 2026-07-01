import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const nextRoot = path.join(root, "apps", "web", ".next");
const staticRoot = path.join(nextRoot, "static");

const budgets = {
  shared: readBudgetSet("BUNDLE_SHARED_JS", { raw: 380, gzip: 115, brotli: 100 }),
  route: readBudgetSet("BUNDLE_ROUTE_JS", { raw: 460, gzip: 150, brotli: 130 }),
  total: readBudgetSet("BUNDLE_TOTAL_JS", { raw: 900, gzip: 290, brotli: 250 }),
  routes: {
    "app:/page": readBudgetSet("BUNDLE_ROUTE_HOME_JS", { raw: 430, gzip: 135, brotli: 115 }),
    "app:/catalog/page": readBudgetSet("BUNDLE_ROUTE_CATALOG_JS", {
      raw: 425,
      gzip: 132,
      brotli: 112,
    }),
    "app:/device/[slug]/page": readBudgetSet("BUNDLE_ROUTE_DEVICE_JS", {
      raw: 420,
      gzip: 130,
      brotli: 110,
    }),
  },
};

function readBudgetSet(prefix, fallback) {
  return {
    raw: readBudget(`${prefix}_KB`, fallback.raw),
    gzip: readBudget(`${prefix}_GZIP_KB`, fallback.gzip),
    brotli: readBudget(`${prefix}_BROTLI_KB`, fallback.brotli),
  };
}

function readBudget(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} must be a positive number, got '${raw}'.`);
    process.exit(1);
  }
  return value;
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return [file];
  });
}

function normalizeAsset(file) {
  return file.replaceAll("\\", "/").replace(/^\//, "");
}

function jsAssets(files) {
  return [
    ...new Set(
      files
        .filter((file) => typeof file === "string")
        .map(normalizeAsset)
        .filter((file) => file.endsWith(".js")),
    ),
  ];
}

function compressedSize(bytes, mode) {
  if (mode === "gzip") return zlib.gzipSync(bytes, { level: 9 }).length;
  if (mode === "brotli") {
    return zlib.brotliCompressSync(bytes, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
  }
  return bytes.length;
}

function assetSizeKb(file, mode = "raw") {
  const absolute = path.join(nextRoot, file);
  if (!fs.existsSync(absolute)) return 0;
  const bytes = fs.readFileSync(absolute);
  return compressedSize(bytes, mode) / 1024;
}

function sumAssetsKb(files, mode = "raw") {
  return jsAssets(files).reduce((total, file) => total + assetSizeKb(file, mode), 0);
}

function assetSizeSet(files) {
  const assets = jsAssets(files);
  return {
    raw: sumAssetsKb(assets, "raw"),
    gzip: sumAssetsKb(assets, "gzip"),
    brotli: sumAssetsKb(assets, "brotli"),
  };
}

function formatKb(value) {
  return `${value.toFixed(1)} kB`;
}

function formatSizeSet(size) {
  return `${formatKb(size.raw)} raw, ${formatKb(size.gzip)} gzip, ${formatKb(size.brotli)} brotli`;
}

function formatBudgetSet(budget) {
  return `${formatKb(budget.raw)} raw / ${formatKb(budget.gzip)} gzip / ${formatKb(
    budget.brotli,
  )} brotli`;
}

function checkBudget(label, size, budget, failures) {
  for (const mode of ["raw", "gzip", "brotli"]) {
    if (size[mode] > budget[mode]) {
      failures.push(`${label} ${mode} ${formatKb(size[mode])} exceeds ${formatKb(budget[mode])}`);
    }
  }
}

function routeEntriesFromManifest(name, manifest) {
  return Object.entries(manifest.pages ?? {})
    .filter(([, files]) => Array.isArray(files))
    .map(([route, files]) => ({
      route: `${name}:${route}`,
      files: jsAssets(files),
      size: assetSizeSet(files),
    }))
    .filter((entry) => entry.files.length > 0);
}

if (!fs.existsSync(nextRoot)) {
  console.error("Next build output is missing. Run npm run web:build before bundle:budget.");
  process.exit(1);
}

const buildManifest = readJson(path.join(nextRoot, "build-manifest.json"));
const appBuildManifest = readJson(path.join(nextRoot, "app-build-manifest.json"));

const sharedFiles = jsAssets([
  ...(buildManifest.rootMainFiles ?? []),
  ...(appBuildManifest.rootMainFiles ?? []),
]);
const sharedSize = assetSizeSet(sharedFiles);

const routeEntries = [
  ...routeEntriesFromManifest("pages", buildManifest),
  ...routeEntriesFromManifest("app", appBuildManifest),
].sort((a, b) => b.size.raw - a.size.raw);

const largestRoute = routeEntries[0] ?? {
  route: "n/a",
  size: { raw: 0, gzip: 0, brotli: 0 },
  files: [],
};
const allClientJs = [
  ...new Set(
    walk(staticRoot)
      .filter((file) => file.endsWith(".js"))
      .map((file) => path.relative(nextRoot, file).replaceAll(path.sep, "/")),
  ),
];
const totalSize = assetSizeSet(allClientJs);

const failures = [];
checkBudget("shared app JS", sharedSize, budgets.shared, failures);
checkBudget(`largest route JS ${largestRoute.route}`, largestRoute.size, budgets.route, failures);
checkBudget("total emitted client JS", totalSize, budgets.total, failures);

for (const [route, budget] of Object.entries(budgets.routes)) {
  const entry = routeEntries.find((candidate) => candidate.route === route);
  if (!entry) {
    failures.push(`route budget target ${route} was not found in Next app build manifest`);
    continue;
  }
  checkBudget(`route JS ${route}`, entry.size, budget, failures);
}

const topRoutes = routeEntries
  .filter((entry) => !entry.route.includes("/api/") && !entry.route.endsWith("/route"))
  .slice(0, 6);

console.log("Next bundle budget:");
console.log(`- shared app JS: ${formatSizeSet(sharedSize)} / ${formatBudgetSet(budgets.shared)}`);
console.log(
  `- largest route JS: ${largestRoute.route} ${formatSizeSet(largestRoute.size)} / ${formatBudgetSet(
    budgets.route,
  )}`,
);
console.log(
  `- total emitted client JS: ${formatSizeSet(totalSize)} / ${formatBudgetSet(budgets.total)}`,
);

console.log("- route budgets:");
for (const [route, budget] of Object.entries(budgets.routes)) {
  const entry = routeEntries.find((candidate) => candidate.route === route);
  const size = entry?.size ?? { raw: 0, gzip: 0, brotli: 0 };
  console.log(`  - ${route}: ${formatSizeSet(size)} / ${formatBudgetSet(budget)}`);
}

if (topRoutes.length) {
  console.log("- top page routes:");
  for (const entry of topRoutes) {
    console.log(`  - ${entry.route}: ${formatSizeSet(entry.size)}`);
  }
}

if (failures.length) {
  console.error("Bundle budget failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Raise the matching BUNDLE_*_JS_KB, BUNDLE_*_JS_GZIP_KB or BUNDLE_*_JS_BROTLI_KB env var only after reviewing why client JS grew.",
  );
  process.exit(1);
}

console.log("Bundle budget passed.");
