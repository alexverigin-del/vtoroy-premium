import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  optionalNumber,
  validCoordinates,
  sitemapLastModified,
  productSeoDescription,
  storesMetadata,
  deliveryMetadata,
} from "../apps/web/lib/seo-metadata.ts";
import {
  publicIndexNowUrl,
  sitemapIndexNowUrls,
  robotsAllowsIndexNow,
  indexNowPageFingerprint,
  indexNowPayload,
} from "../apps/web/lib/indexnow.ts";
import { indexNowConfig, writeIndexNowJson } from "../apps/web/lib/indexnow-queue.ts";
import { runIndexNowWorker } from "./lib/indexnow-worker.mjs";

for (const value of [null, undefined, "", "  ", false, true, {}, [], Infinity, "NaN"])
  assert.equal(optionalNumber(value), undefined);
assert.equal(optionalNumber("50.5"), 50.5);
assert.equal(optionalNumber(0), 0);
for (const pair of [
  [null, null],
  [0, 0],
  [91, 40],
  [50, 181],
  ["", ""],
  [NaN, 10],
])
  assert.equal(validCoordinates(...pair), false);
assert.equal(validCoordinates(50.5, 36.5), true);
assert.equal(validCoordinates(50, 0), true);
assert.equal(sitemapLastModified(), undefined);
assert.equal(sitemapLastModified("bad"), undefined);
assert.equal(sitemapLastModified("2999-01-01"), undefined);
assert.equal(sitemapLastModified("2026-01-01").toISOString(), "2026-01-01T00:00:00.000Z");
assert.equal(storesMetadata.alternates.canonical, "/stores");
assert.equal(
  deliveryMetadata({ city: "Белгород", slug: "belgorod" }).alternates.canonical,
  "/belgorod/delivery",
);
const product = {
  title: "Apple iPhone 15 Pro 256 ГБ White Titanium",
  shortDescription: "Проверен",
  warrantyText: "90 дней",
  deviceDetails: { grade: "A", batteryText: "Аккумулятор 97%", serial: "PRIVATE" },
};
const description = productSeoDescription(product);
assert.match(description, /256 ГБ White Titanium.*97%/);
assert.doesNotMatch(description, /PRIVATE/);
assert.notEqual(
  description,
  productSeoDescription({ ...product, title: product.title.replace("White", "Black") }),
);
assert.equal(indexNowConfig({}), null);
assert.throws(() => indexNowConfig({ INDEXNOW_ENABLED: "1", INDEXNOW_KEY: "bad" }));
assert.throws(() =>
  indexNowConfig({
    INDEXNOW_ENABLED: "1",
    INDEXNOW_KEY: "12345678",
    INDEXNOW_STATE_DIR: path.parse(process.cwd()).root,
  }),
);

const origin = "https://isvoi.ru";
const root = origin + "/";
for (const value of [
  "http://isvoi.ru/",
  "https://evil.com/",
  `${root}?utm_source=x`,
  `${root}#x`,
  `${root}api/test`,
  `${root}trade/qa`,
  `${root}club`,
  "https://club.isvoi.ru/",
  `${root}lead-intake`,
  `${root}%2fapi`,
])
  assert.equal(publicIndexNowUrl(value), null);
assert.equal(publicIndexNowUrl(origin), root);
assert.equal(publicIndexNowUrl(`${root}product/iphone/`), `${root}product/iphone`);
assert.throws(() => indexNowPayload("12345678", ["https://evil.com/"]));
assert.equal(indexNowPayload("12345678", [root]).keyLocation, `${root}indexnow-key.txt`);
const xml = (urls) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
assert.deepEqual(sitemapIndexNowUrls(xml([origin, root])), [root]);
assert.throws(() => sitemapIndexNowUrls(xml(["https://evil.com/"])));
assert.throws(() => sitemapIndexNowUrls("<html>error</html>"));
assert.throws(() => sitemapIndexNowUrls(xml([])));
assert.equal(robotsAllowsIndexNow("User-agent: *\nDisallow: /trade/qa", `${root}trade/qa`), false);
assert.equal(
  robotsAllowsIndexNow(
    "User-agent: *\nDisallow: /catalog\nAllow: /catalog/brand",
    `${root}catalog/brand/apple`,
  ),
  true,
);
assert.equal(
  robotsAllowsIndexNow("User-agent: *\nDisallow: /\nUser-agent: Yandex\nAllow: /", root),
  true,
);
assert.equal(
  robotsAllowsIndexNow("User-agent: *\nDisallow: /*/private$", `${root}test/private`),
  false,
);

function page(
  url,
  content = "Товар в наличии, подробные характеристики и условия покупки",
  extra = "",
) {
  return `<html><head><title>Проверка</title><meta name="description" content="Описание"><link rel="canonical" href="${url}">${extra}</head><body><main><h1>Товар</h1><p>${content}</p><img src="/photo.jpg" alt="Фото"></main><script>window.random = 1</script></body></html>`;
}
const fingerprint = indexNowPageFingerprint(page(root), root);
assert.equal(
  fingerprint,
  indexNowPageFingerprint(page(root).replace("random = 1", "random = 9000"), root),
);
assert.notEqual(
  fingerprint,
  indexNowPageFingerprint(
    page(root, "Цена и наличие поменялись. Новое подробное описание устройства."),
    root,
  ),
);
assert.notEqual(
  fingerprint,
  indexNowPageFingerprint(page(root).replace("photo.jpg", "new.jpg"), root),
);
assert.equal(
  indexNowPageFingerprint(
    page(root, undefined, '<meta name="robots" content="noindex, follow">'),
    root,
  ),
  null,
);
assert.equal(indexNowPageFingerprint(page(root), root, "noindex"), null);
assert.equal(indexNowPageFingerprint(page(root), `${root}stores`), null);
assert.throws(() => indexNowPageFingerprint("<html>error</html>", root));
assert.throws(() => indexNowPageFingerprint(page(root).replace("<h1>Товар</h1>", ""), root));

// Fully isolated worker integration. Every HTTP request is intercepted here;
// never contacts production, Yandex or Directus, and never creates leads.
const temp = await mkdtemp(path.join(os.tmpdir(), "isvoi-indexnow-test-"));
try {
  const config = { directory: path.join(temp, "indexnow"), key: "test-key-12345" };
  let clock = 2_000_000_000_000;
  const pages = new Map([
    [root, page(root)],
    [`${root}catalog`, page(`${root}catalog`)],
  ]);
  let healthOk = true,
    submissionStatus = 200,
    keyValid = true;
  const requests = [];
  const mockFetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET", body: options.body });
    if (url === "https://yandex.com/indexnow")
      return new Response("", {
        status: submissionStatus,
        headers: submissionStatus === 429 ? { "Retry-After": "3600" } : {},
      });
    if (url === "https://api.isvoi.ru/server/health")
      return Response.json({ status: healthOk ? "ok" : "error" }, { status: healthOk ? 200 : 503 });
    if (url === `${root}sitemap.xml`) return new Response(xml([...pages.keys()]));
    if (url === `${root}robots.txt`)
      return new Response("User-agent: *\nAllow: /\nDisallow: /trade/qa");
    if (url === `${root}indexnow-key.txt`) return new Response(keyValid ? config.key : "wrong");
    return new Response(pages.get(url) || "Missing", {
      status: pages.has(url) ? 200 : 404,
      headers: { "Content-Type": "text/html" },
    });
  };
  const run = (mode = "run") =>
    runIndexNowWorker(config, { mode, fetchImpl: mockFetch, now: () => clock });
  const signal = async () => {
    clock += 1000;
    await writeIndexNowJson(config.directory, "dirty", { token: String(clock) });
  };
  const submissions = () => requests.filter((r) => r.method === "POST");
  await assert.rejects(run(), /initialize_first/);
  assert.equal((await run("dry-run")).status, "initialization_required");
  keyValid = false;
  await assert.rejects(run("initialize"), /key_not_published/);
  keyValid = true;
  assert.equal((await run("initialize")).submitted, 0);
  assert.equal(submissions().length, 0, "initialization must not submit all old URLs");
  assert.equal((await run()).status, "idle");
  await signal();
  assert.equal((await run()).submitted, 0, "unchanged content must not be submitted");
  const newUrl = `${root}product/new-phone`;
  pages.set(newUrl, page(newUrl));
  await signal();
  const beforeDryRun = await readFile(path.join(config.directory, "state.json"), "utf8");
  assert.deepEqual((await run("dry-run")).changed, [newUrl]);
  assert.equal(await readFile(path.join(config.directory, "state.json"), "utf8"), beforeDryRun);
  assert.equal((await run()).submitted, 1);
  assert.deepEqual(JSON.parse(submissions().at(-1).body).urlList, [newUrl]);
  pages.set(
    newUrl,
    page(newUrl, "Цена изменилась, новое состояние и подробная информация о покупке."),
  );
  await signal();
  healthOk = false;
  const beforeFailureCount = submissions().length;
  await assert.rejects(run(), /cms_unhealthy/);
  assert.equal(submissions().length, beforeFailureCount);
  healthOk = true;
  clock += 60001;
  keyValid = false;
  await assert.rejects(run(), /key_not_published/);
  keyValid = true;
  clock += 120001;
  submissionStatus = 429;
  await assert.rejects(run(), /http_429/);
  await signal();
  assert.equal((await run()).status, "idle", "new events must respect Retry-After");
  clock += 3600001;
  submissionStatus = 202;
  assert.equal((await run()).acceptedStatus, 202);
  pages.delete(newUrl);
  await signal();
  assert.equal((await run()).submitted, 0, "one missing response must not trigger deletion");
  clock += 60001;
  assert.equal((await run()).submitted, 1);
  assert.deepEqual(JSON.parse(submissions().at(-1).body).urlList, [newUrl]);
  await signal();
  assert.equal((await run()).submitted, 0, "deletion must not be repeated");
  pages.set(newUrl, page(newUrl, undefined, '<meta name="robots" content="noindex">'));
  await signal();
  assert.equal((await run()).submitted, 0, "new noindex URL must never be submitted");
  await assert.rejects(run("initialize"), /already_initialized/);
  assert.equal(
    requests.some((r) => /token|secret/.test(r.url)),
    false,
  );
} finally {
  if (!temp.startsWith(path.join(os.tmpdir(), "isvoi-indexnow-test-")))
    throw new Error("unsafe_temp_path");
  await rm(temp, { recursive: true, force: true });
}

const sitemapSource = await readFile(
  new URL("../apps/web/app/sitemap.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(sitemapSource, /lastModified:\s*now|new Date\(/);
const revalidationSource = await readFile(
  new URL("../apps/web/lib/site-revalidation.ts", import.meta.url),
  "utf8",
);
assert.ok(
  revalidationSource.indexOf("if (!isAuthorized") <
    revalidationSource.indexOf("await markIndexNowDirty"),
);
console.log(
  "SEO and IndexNow: normalization, metadata, fingerprinting, isolation, queue, retries, deletion and dry-run passed.",
);
