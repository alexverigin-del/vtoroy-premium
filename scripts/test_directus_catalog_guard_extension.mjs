import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CATEGORY_TYPE_MISMATCH_CODE,
  CATEGORY_TYPE_MISMATCH_MESSAGE,
  effectiveProductRows,
  findCategoryTypeMismatch,
  relationId,
} from "../infra/directus-beget/extensions-bundled/directus-extension-isvoi-catalog-guards/src/guard.js";

assert.equal(relationId("smartphones"), "smartphones");
assert.equal(relationId({ id: "smartphones" }), "smartphones");
assert.equal(relationId(null), null);

const current = [{ id: "qa", product_type: "accessory", category: "cases" }];
assert.deepEqual(effectiveProductRows({ category: "smartphones" }, current), [
  { id: "qa", product_type: "accessory", category: "smartphones" },
]);

const categories = [
  { id: "cases", catalog_section: "accessory" },
  { id: "smartphones", catalog_section: "device" },
];
assert.equal(findCategoryTypeMismatch(current, categories), null);
assert.deepEqual(
  findCategoryTypeMismatch(
    [{ id: "qa", product_type: "accessory", category: { id: "smartphones" } }],
    categories,
  ),
  { categoryId: "smartphones", catalogSection: "device", productType: "accessory" },
);

const extensionRoot = path.resolve(
  "infra/directus-beget/extensions-bundled/directus-extension-isvoi-catalog-guards",
);
const manifest = JSON.parse(await fs.readFile(path.join(extensionRoot, "package.json"), "utf8"));
const runtime = await fs.readFile(
  path.join(extensionRoot, manifest["directus:extension"].path),
  "utf8",
);
const guard = await fs.readFile(path.join(extensionRoot, "src/guard.js"), "utf8");
const compose = await fs.readFile(path.resolve("infra/directus-beget/docker-compose.yml"), "utf8");
assert.equal(manifest["directus:extension"].type, "hook");
assert.match(runtime, new RegExp(CATEGORY_TYPE_MISMATCH_CODE));
assert.match(runtime, /CATEGORY_TYPE_MISMATCH_MESSAGE/);
assert.match(guard, new RegExp(CATEGORY_TYPE_MISMATCH_MESSAGE));
assert.match(runtime, /400/);
assert.match(compose, /\.\/extensions-bundled:\/directus\/extensions:ro/);

console.log(
  JSON.stringify({
    ok: true,
    code: CATEGORY_TYPE_MISMATCH_CODE,
    message: CATEGORY_TYPE_MISMATCH_MESSAGE,
    status: 400,
    create_and_partial_update_supported: true,
    production_mount_read_only: true,
  }),
);
