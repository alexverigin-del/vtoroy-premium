import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

test("gallery curation: dry-run, conflict guard, media-only apply and rollback", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "isvoi-gallery-test-"));
  const before = {
    image: "file-main",
    sort: 10,
    label: "Общий вид",
    alt: "Phone",
    role: "listing",
    status: "published",
    product: "test-phone",
  };
  const second = { ...before, image: "file-side", sort: 20, label: "Wrong", role: "gallery" };
  const third = { ...second, image: "file-bottom", sort: 30, label: "Bottom" };
  const product = {
    id: "test-phone",
    sku: "т99",
    status: "published",
    stock_status: "sold",
    listing_file: "file-main",
    listing_alt: "Phone",
  };
  const manifest = {
    batch: "test-reviewed-gallery",
    devices: [
      {
        ...product,
        photos: [
          { id: "row-1", before, after: { sort: 10, label: before.label, alt: before.alt } },
          {
            id: "row-2",
            before: second,
            after: { sort: 30, label: "Правая грань", alt: "Phone, правая грань" },
          },
          { id: "row-3", before: third, after: { sort: 20, label: "Bottom", alt: "Phone" } },
        ],
      },
    ],
  };
  const rows = new Map([
    ["row-1", { id: "row-1", ...before }],
    ["row-2", { id: "row-2", ...second }],
    ["row-3", { id: "row-3", ...third }],
  ]);
  const mutations = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let data;
    if (req.method === "GET" && url.pathname.startsWith("/items/products/")) data = product;
    else if (req.method === "GET" && url.pathname === "/items/product_images")
      data = [...rows.values()];
    else if (req.method === "GET" && url.pathname === "/folders") data = [{ id: "folder" }];
    else if (req.method === "PATCH" && url.pathname === "/items/product_images") {
      let body = "";
      for await (const chunk of req) body += chunk;
      data = JSON.parse(body);
      mutations.push(data);
      const transaction = new Map([...rows].map(([id, value]) => [id, { ...value }]));
      for (const update of data) {
        const next = { ...transaction.get(update.id), ...update };
        if (
          [...transaction.values()].some(
            (row) => row.id !== next.id && row.product === next.product && row.sort === next.sort,
          )
        ) {
          res.writeHead(400);
          res.end(JSON.stringify({ errors: [{ code: "RECORD_NOT_UNIQUE" }] }));
          return;
        }
        transaction.set(update.id, next);
      }
      for (const [id, value] of transaction) rows.set(id, value);
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const run = async (flags) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/apply_catalog_gallery_curation.mjs",
          path.join(folder, "gallery-curation.json"),
          ...flags,
        ],
        {
          env: {
            ...process.env,
            DIRECTUS_URL: `http://127.0.0.1:${server.address().port}`,
            DIRECTUS_TOKEN: "test-not-secret",
          },
        },
      );
      let output = "";
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      child.on("close", (code) => resolve({ code, output }));
    });
  try {
    await fs.writeFile(path.join(folder, "gallery-curation.json"), JSON.stringify(manifest));
    assert.equal((await run([])).code, 0);
    assert.equal(mutations.length, 0);
    rows.get("row-2").label = "Concurrent editorial edit";
    assert.notEqual((await run(["--apply"])).code, 0);
    assert.equal(mutations.length, 0);
    rows.get("row-2").label = "Wrong";
    assert.equal((await run(["--apply"])).code, 0);
    assert.equal(rows.get("row-2").label, "Правая грань");
    assert.equal(product.stock_status, "sold");
    assert.equal(rows.get("row-2").image, "file-side");
    assert.equal(mutations.length, 1);
    for (const change of mutations[0])
      assert.ok(
        Object.keys(change).every((k) => ["id", "image", "sort", "label", "alt"].includes(k)),
      );
    assert.notEqual((await run(["--apply"])).code, 0);
    assert.equal(mutations.length, 1);
    rows.get("row-2").alt = "Later edit";
    assert.notEqual((await run(["--rollback"])).code, 0);
    assert.equal(mutations.length, 1);
    rows.get("row-2").alt = "Phone, правая грань";
    assert.equal((await run(["--rollback"])).code, 0);
    assert.deepEqual(rows.get("row-2"), { id: "row-2", ...second });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
  }
});
