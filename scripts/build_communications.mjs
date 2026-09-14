import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
async function normalizeGenerated(file) {
  const source = await readFile(file, "utf8");
  await writeFile(file, source.replace(/^( +)\t/gm, "$1  ").replace(/[ \t]+$/gm, ""));
}
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(["node_modules/typescript/bin/tsc", "-p", "packages/communications/tsconfig.json"]);
const endpointBundle = resolve(
  root,
  "infra/directus-beget/extensions-bundled/directus-extension-isvoi-communications/dist/index.js",
);
await build({
  entryPoints: [resolve(root, "packages/communications/src/endpoint.ts")],
  outfile: endpointBundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  mainFields: ["module", "main"],
  packages: "bundle",
  legalComments: "none",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
await normalizeGenerated(endpointBundle);
const legacyBundle = resolve(
  root,
  "infra/directus-beget/extensions-bundled/directus-extension-isvoi-communications/dist/legacy.js",
);
await build({
  entryPoints: [resolve(root, "packages/communications/src/legacy.ts")],
  outfile: legacyBundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  legalComments: "none",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
await normalizeGenerated(legacyBundle);
run(
  [resolve(root, "node_modules/@directus/extensions-sdk/cli.js"), "build"],
  resolve(root, "infra/directus-beget/extensions-bundled/directus-extension-isvoi-inbox"),
);
