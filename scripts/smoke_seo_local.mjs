// HTTP integration against the compiled Next app and an isolated loopback CMS.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, access, rm, mkdir, cp, symlink } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), "isvoi-seo-smoke-"));
const directory = path.join(temporary, "indexnow");
// Production ISR writes to the build directory. Never populate the real build
// with fixture pages: run a disposable copy, excluding its data/build cache.
const fixtureApp = path.join(temporary, "app");
await mkdir(fixtureApp);
const buildSource = path.join(root, "apps/web/.next");
await cp(buildSource, path.join(fixtureApp, ".next"), {
  recursive: true,
  filter: (source) => !path.relative(buildSource, source).split(path.sep).includes("cache"),
});
await cp(path.join(root, "apps/web/next.config.mjs"), path.join(fixtureApp, "next.config.mjs"));
await cp(path.join(root, "apps/web/package.json"), path.join(fixtureApp, "package.json"));
await symlink(path.join(root, "node_modules"), path.join(fixtureApp, "node_modules"), "junction");
const location = {
  id: "belgorod",
  slug: "belgorod",
  status: "published",
  name: "I СВОИ Белгород",
  city: "Белгород",
  latitude: null,
  longitude: null,
};
const cms = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  let data = [];
  if (url.pathname === "/items/store_locations") data = [location];
  if (url.pathname === "/items/site_settings")
    data = [{ id: 1, brand_name: "I СВОИ", city: "Белгород" }];
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ data }));
});
await new Promise((resolve) => cms.listen(0, "127.0.0.1", resolve));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const cmsUrl = `http://127.0.0.1:${cms.address().port}`;
const logPath = path.join(temporary, "next.log");
const log = fs.openSync(logPath, "w");
const app = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  {
    cwd: fixtureApp,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      NODE_ENV: "production",
      DIRECTUS_URL: cmsUrl,
      NEXT_PUBLIC_DIRECTUS_URL: cmsUrl,
      DIRECTUS_TOKEN: "fixture",
      CATALOG_SOURCE: "v3",
      ALLOW_CATALOG_FALLBACK: "false",
      INDEXNOW_ENABLED: "1",
      INDEXNOW_KEY: "fixture-key-12345",
      INDEXNOW_STATE_DIR: directory,
      SITE_REVALIDATION_SECRET: "fixture-revalidation-secret",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    },
  },
);
let passed = false;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null) throw new Error("Next exited before readiness");
    try {
      const response = await fetch(`${base}/indexnow-key.txt`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 200) {
        assert.equal(await response.text(), "fixture-key-12345");
        break;
      }
    } catch {}
    if (attempt === 59) throw new Error("Next readiness timeout");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal((await fetch(`${base}/indexnow-key.txt`, { method: "POST" })).status, 405);
  const keyHead = await fetch(`${base}/indexnow-key.txt`, { method: "HEAD" });
  assert.equal(keyHead.status, 200);
  assert.equal(keyHead.headers.get("cache-control"), "no-store");
  assert.equal(await keyHead.text(), "");
  // Node fetch may discard a custom Host header. Use raw HTTP for host routing.
  const clubKey = await new Promise((resolve, reject) => {
    const request = httpRequest(
      `${base}/indexnow-key.txt`,
      { headers: { Host: "club.isvoi.ru" } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.notEqual(clubKey, "fixture-key-12345", "main-host key must not be served on Club");
  const unauthorized = await fetch(`${base}/api/revalidate/site-content`, { method: "POST" });
  assert.equal(unauthorized.status, 401);
  await assert.rejects(access(path.join(directory, "dirty.json")));
  const revalidate = async () => {
    const response = await fetch(`${base}/api/revalidate/site-content`, {
      method: "POST",
      headers: { "x-isvoi-revalidate-secret": "fixture-revalidation-secret" },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).indexing, "queued");
  };
  await revalidate();
  const firstToken = JSON.parse(await readFile(path.join(directory, "dirty.json"), "utf8")).token;
  for (const route of ["/stores", "/belgorod/delivery"]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(
      html.includes(`rel="canonical" href="https://isvoi.ru${route}"`),
      `self canonical: ${route}`,
    );
    assert.match(html, /<title>(?:Магазины|Получение и доставка)/);
  }
  let html = await (await fetch(`${base}/belgorod`)).text();
  assert.doesNotMatch(html, /"geo":/);
  location.latitude = 50.5;
  location.longitude = 36.5;
  await revalidate();
  html = await (await fetch(`${base}/belgorod`)).text();
  assert.match(html, /"latitude":50\.5,"longitude":36\.5/);
  assert.notEqual(
    JSON.parse(await readFile(path.join(directory, "dirty.json"), "utf8")).token,
    firstToken,
  );
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemap, /<loc>https:\/\/isvoi.ru\/stores<\/loc>/);
  assert.doesNotMatch(sitemap, /<lastmod>/, "fixture has no known modification dates");
  passed = true;
  console.log(
    "Local compiled Next SEO smoke passed: canonical, metadata, coordinates, Sitemap, key route, auth and durable dirty signal. No IndexNow submissions.",
  );
} finally {
  if (app.exitCode === null) {
    const exited = once(app, "exit");
    app.kill();
    await exited;
  }
  cms.closeAllConnections();
  await new Promise((resolve) => cms.close(resolve));
  fs.closeSync(log);
  if (!passed) console.error(await readFile(logPath, "utf8"));
  if (!temporary.startsWith(path.join(os.tmpdir(), "isvoi-seo-smoke-")))
    throw new Error("unsafe_temp_path");
  await rm(temporary, { recursive: true, force: true });
}
