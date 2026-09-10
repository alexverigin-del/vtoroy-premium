import assert from "node:assert/strict";
import { createServer } from "node:http";
import { criticalImageUrls, warmPublicImages } from "./warm_public_images.mjs";
import {
  validatePatch,
  assertLockMatches,
  applyPatchToRow,
} from "./lib/directus-content-patch.mjs";

const base = "https://example.com";
assert.deepEqual(
  criticalImageUrls(
    `<link rel="preload" as="image" imagesrcset="/_next/image?url=x&amp;w=640 640w, /_next/image?url=x&amp;w=1200 1200w"><img fetchpriority="high" srcset="/_next/image?url=x&amp;w=640 640w"><img loading="lazy" src="/_next/image?url=lazy"><img loading="eager" src="https://other.example/_next/image?url=x">`,
    base,
  ),
  [base + "/_next/image?url=x&w=640", base + "/_next/image?url=x&w=1200"],
);
const requests = [];
const server = createServer((request, response) => {
  requests.push({ method: request.method, url: request.url, headers: request.headers });
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<img fetchpriority="high" src="/_next/image?url=hero"><img loading="eager" src="/_next/image?url=hero"><img loading="lazy" src="/_next/image?url=card">',
    );
  } else if (request.url === "/_next/image?url=hero") {
    response.setHeader("Content-Type", "image/webp");
    response.end("fixture");
  } else {
    response.writeHead(503);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const local = `http://127.0.0.1:${server.address().port}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const report = await warmPublicImages(local, ["/", "/unavailable", "https://other.example/"]);
    assert.equal(report.discovered, 1);
    assert.equal(report.warmed, 1);
    assert.equal(report.failures.length, 2);
  }
  assert.equal(requests.filter((request) => request.url === "/_next/image?url=hero").length, 2);
  assert(
    requests.every(
      (request) =>
        request.method === "GET" && !request.headers.authorization && !request.headers.cookie,
    ),
  );
  assert(!requests.some((request) => request.url.includes("card")));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
// In-memory protection test only, not a candidate for editing site content.
{
  const patch = validatePatch({
    version: 1,
    id: "editor-protection-fixture",
    description: "Isolated editorial protection fixture",
    collection: "fixture_content",
    selector: { id: "fixture" },
    expected: { body: "original fixture" },
    changes: { body: "changed fixture" },
    revalidate: "site-content",
  });
  const rollback = validatePatch({ ...patch, expected: patch.changes, changes: patch.expected });
  const row = { ...patch.selector, ...patch.expected, untouched: "editor content" };
  const schema = Object.fromEntries(
    Object.keys(patch.changes).map((key) => [key, { dataType: "text" }]),
  );
  assertLockMatches(patch, row, "fixture");
  const { desired } = applyPatchToRow(row, patch, schema);
  assert.equal(desired.untouched, "editor content");
  assertLockMatches(rollback, desired, "fixture");
  assert.deepEqual(applyPatchToRow(desired, rollback, schema).desired, row);
  assert.throws(
    () =>
      assertLockMatches(
        patch,
        { ...row, [Object.keys(patch.changes)[0]]: "new editorial text" },
        "fixture",
      ),
    /Editorial value changed/,
  );
  assert.throws(() => validatePatch(patch, { requireLock: true }), /lock/i);
}
console.log(
  "Image warmup and in-memory editorial protection fixtures passed. No site content patches.",
);
