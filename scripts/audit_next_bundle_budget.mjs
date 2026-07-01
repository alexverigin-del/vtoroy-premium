import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const nextRoot = path.join(root, "apps", "web", ".next");
const staticRoot = path.join(nextRoot, "static");

const budgets = {
  sharedKb: readBudget("BUNDLE_SHARED_JS_KB", 380),
  routeKb: readBudget("BUNDLE_ROUTE_JS_KB", 460),
  totalKb: readBudget("BUNDLE_TOTAL_JS_KB", 900),
};

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

function assetSizeKb(file) {
  const absolute = path.join(nextRoot, file);
  if (!fs.existsSync(absolute)) return 0;
  return fs.statSync(absolute).size / 1024;
}

function sumAssetsKb(files) {
  return jsAssets(files).reduce((total, file) => total + assetSizeKb(file), 0);
}

function formatKb(value) {
  return `${value.toFixed(1)} kB`;
}

function routeEntriesFromManifest(name, manifest) {
  return Object.entries(manifest.pages ?? {})
    .filter(([, files]) => Array.isArray(files))
    .map(([route, files]) => ({
      route: `${name}:${route}`,
      files: jsAssets(files),
      kb: sumAssetsKb(files),
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
const sharedKb = sumAssetsKb(sharedFiles);

const routeEntries = [
  ...routeEntriesFromManifest("pages", buildManifest),
  ...routeEntriesFromManifest("app", appBuildManifest),
].sort((a, b) => b.kb - a.kb);

const largestRoute = routeEntries[0] ?? { route: "n/a", kb: 0, files: [] };
const allClientJs = [
  ...new Set(
    walk(staticRoot)
      .filter((file) => file.endsWith(".js"))
      .map((file) => path.relative(nextRoot, file).replaceAll(path.sep, "/")),
  ),
];
const totalKb = sumAssetsKb(allClientJs);

const failures = [];
if (sharedKb > budgets.sharedKb) {
  failures.push(`shared app JS ${formatKb(sharedKb)} exceeds ${formatKb(budgets.sharedKb)}`);
}
if (largestRoute.kb > budgets.routeKb) {
  failures.push(
    `largest route JS ${largestRoute.route} is ${formatKb(largestRoute.kb)}, exceeds ${formatKb(
      budgets.routeKb,
    )}`,
  );
}
if (totalKb > budgets.totalKb) {
  failures.push(`total emitted client JS ${formatKb(totalKb)} exceeds ${formatKb(budgets.totalKb)}`);
}

const topRoutes = routeEntries
  .filter((entry) => !entry.route.includes("/api/") && !entry.route.endsWith("/route"))
  .slice(0, 6);

console.log("Next bundle budget:");
console.log(`- shared app JS: ${formatKb(sharedKb)} / ${formatKb(budgets.sharedKb)}`);
console.log(
  `- largest route JS: ${largestRoute.route} ${formatKb(largestRoute.kb)} / ${formatKb(
    budgets.routeKb,
  )}`,
);
console.log(`- total emitted client JS: ${formatKb(totalKb)} / ${formatKb(budgets.totalKb)}`);

if (topRoutes.length) {
  console.log("- top page routes:");
  for (const entry of topRoutes) {
    console.log(`  - ${entry.route}: ${formatKb(entry.kb)}`);
  }
}

if (failures.length) {
  console.error("Bundle budget failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Raise the matching BUNDLE_*_JS_KB env var only after reviewing why client JS grew.",
  );
  process.exit(1);
}

console.log("Bundle budget passed.");
