// HTTP integration against the compiled Next app and an isolated loopback CMS.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, access, rm, mkdir, cp, symlink } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument, DomUtils } from "htmlparser2";
import { launchChromium } from "./playwright_browser.mjs";

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
await symlink(path.join(root, "apps/web/public"), path.join(fixtureApp, "public"), "junction");
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
  if (url.pathname === "/items/products") {
    const id = url.searchParams.get("filter[id][_eq]");
    data = ["fixture-available", "fixture-sold"]
      .filter((value) => !id || id === value)
      .map((id) => ({
        id,
        status: "published",
        content_status: "ready",
        sku: id,
        product_type: "device",
        condition: "used",
        title: `iPhone 15 Pro Max ${id}`,
        price: 79900,
        price_text: "79 900 ₽",
        listing_file: { id: "fixture-image" },
        stock_status: id.endsWith("sold") ? "sold" : "available",
        stock_quantity: id.endsWith("sold") ? 0 : 1,
        brand: { id: "apple", name: "Apple", slug: "apple" },
        category: { id: "phone", name: "Смартфоны", slug: "smartphones" },
        device_details: { storage: "512 ГБ", grade: "A", battery_text: "97%" },
      }));
  }
  if (url.pathname === "/items/product_images")
    data = [
      {
        id: "photo",
        role: "front",
        label: "Фото",
        alt: "Fixture phone",
        image: { id: "fixture-image" },
      },
    ];
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
      NEXT_PUBLIC_DIRECTUS_URL: "https://api.isvoi.ru",
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
  for (const id of ["fixture-available", "fixture-sold"]) {
    const response = await fetch(`${base}/product/${id}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    const dom = parseDocument(html);
    const headings = DomUtils.findAll((node) => /^h[1-6]$/.test(node.name), dom.children);
    assert.equal(headings[0].name, "h1");
    assert.equal(headings.filter((node) => node.name === "h1").length, 1);
    const forms = DomUtils.findAll((node) => node.attribs.id === "product-lead-form", dom.children);
    assert.equal(forms.length, 1);
    assert(html.indexOf('id="product-purchase-summary"') < html.indexOf('id="product-lead-form"'));
    const schemas = DomUtils.findAll(
      (node) => node.attribs.type === "application/ld+json",
      dom.children,
    ).map((node) => JSON.parse(DomUtils.textContent(node)));
    assert(schemas.some((schema) => schema["@type"] === "Product"));
    assert(schemas.some((schema) => schema["@type"] === "BreadcrumbList"));
    assert(
      html.includes(id.endsWith("sold") ? "Подобрать альтернативу" : "Записаться на просмотр"),
    );
  }
  if (process.env.SEO_UI === "1") {
    const browser = await launchChromium({ headless: true });
    const output = path.join(root, "output/playwright/impeccable");
    await mkdir(output, { recursive: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const image = await readFile(
        path.join(root, "apps/web/public/assets/critical-home-hero.webp"),
      );
      await page.route("**/_next/image?**", (route) =>
        route.fulfill({ body: image, contentType: "image/webp" }),
      );
      for (const width of [320, 390, 768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`${base}/product/fixture-available`, { waitUntil: "networkidle" });
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `Compiled product overflow at ${width}`,
        );
        assert.equal(await page.locator("#product-lead-form").count(), 1);
        assert.equal(
          await page
            .locator('#product-lead-form input[name="contact"]')
            .evaluate((element) => getComputedStyle(element, "::placeholder").color),
          "rgb(112, 112, 112)",
          "Contact placeholder uses the contrast-reviewed muted token",
        );
        const summary = await page.locator("#product-purchase-summary").boundingBox();
        const gallery = await page.locator('[data-component="DeviceGallery"]').boundingBox();
        const purchaseAside = page.locator('[data-component="ProductPurchaseAside"]');
        if (width < 1024) assert(summary.y < gallery.y, "Mobile offer must precede photos");
        else assert(summary.x > gallery.x, "Desktop offer stays right of gallery");
        assert.equal(
          await purchaseAside.evaluate((element) => getComputedStyle(element).position),
          width < 1024 ? "static" : "sticky",
          `Purchase aside positioning at ${width}`,
        );
        if (width >= 1024) {
          await page
            .locator('[data-component="ProductDossier"]')
            .evaluate((element) => (element.style.minHeight = "1600px"));
          const initialAside = await purchaseAside.boundingBox();
          const stickyViewportHeight = await page.evaluate(() => innerHeight - 120);
          const asideStyles = await purchaseAside.evaluate((element) => ({
            maxHeight: getComputedStyle(element).maxHeight,
            minHeight: getComputedStyle(element).minHeight,
            overflowY: getComputedStyle(element).overflowY,
          }));
          assert(
            initialAside.height <= stickyViewportHeight + 1,
            `Desktop purchase aside must fit the sticky viewport at ${width}: ${JSON.stringify({ initialAside, asideStyles })}`,
          );
          assert(
            summary.y + summary.height <= initialAside.y,
            `Desktop purchase summary and sticky card overlap at ${width}`,
          );
          await page.evaluate(() => {
            const aside = document.querySelector('[data-component="ProductPurchaseAside"]');
            const target = aside.getBoundingClientRect().top + scrollY + 320;
            scrollTo(0, Math.min(target, document.documentElement.scrollHeight - innerHeight - 1));
          });
          await page.waitForTimeout(100);
          const stickyAside = await purchaseAside.boundingBox();
          assert(
            stickyAside.y >= 95 && stickyAside.y <= 97,
            `Desktop purchase aside must stick below the header at ${width}: ${JSON.stringify({ initialAside, stickyAside, asideStyles })}`,
          );
          assert(stickyAside.y < initialAside.y, `Desktop purchase aside did not move at ${width}`);
          if (width === 1440) {
            await page.screenshot({
              path: path.join(output, "compiled-product-1440-sticky.png"),
            });
          }
          await page.evaluate(() => scrollTo(0, 0));
          await page
            .locator('[data-component="ProductDossier"]')
            .evaluate((element) => element.style.removeProperty("min-height"));
        }
        await page.screenshot({
          path: path.join(output, `compiled-product-${width}.png`),
          fullPage: true,
        });
        await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
        await page.waitForTimeout(150);
        if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
          console.log(
            await page.evaluate(() =>
              Array.from(document.querySelectorAll("body *"))
                .filter(
                  (element) =>
                    getComputedStyle(element).visibility !== "hidden" &&
                    element.getBoundingClientRect().right > innerWidth,
                )
                .map((element) => ({
                  tag: element.tagName,
                  cls: element.className,
                  text: element.textContent.slice(0, 70),
                  right: element.getBoundingClientRect().right,
                }))
                .slice(-25),
            ),
          );
          await page.screenshot({
            path: path.join(output, `compiled-product-${width}-overflow.png`),
            fullPage: true,
          });
        }
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `Compiled product text at 200% overflows at ${width}`,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/catalog`, { waitUntil: "networkidle" });
      const firstPrice = page
        .locator('[data-component="ProductCard"]')
        .first()
        .getByText("79 900 ₽", { exact: true });
      const price = await firstPrice.boundingBox();
      assert(price.y + price.height <= 844, "Compiled catalog first price must be above the fold");
      await page.screenshot({
        path: path.join(output, "compiled-catalog-390.png"),
        fullPage: true,
      });
      assert.equal(errors.length, 0, errors.join("\n"));
      console.log("Compiled product DOM/grid on six widths and catalog first viewport passed.");
    } finally {
      await browser.close();
    }
  }
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
