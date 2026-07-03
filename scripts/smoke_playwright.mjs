#!/usr/bin/env node
/**
 * Lightweight production smoke test for the public storefront.
 *
 * Usage:
 *   npm run smoke:prod
 *   SMOKE_BASE_URL=https://isvoi.ru SMOKE_DEVICE_PATH=/device/iphone-13-pro npm run smoke:prod
 */

import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const DEFAULT_BASE_URL = "https://isvoi.ru";
const DEFAULT_DEVICE_PATH = "/device/iphone-13-pro";
const DIRECTUS_ASSET_RE = /(https:\/\/api\.isvoi\.ru\/assets\/|api\.isvoi\.ru%2fassets%2f)/i;
const DIRECTUS_ASSET_SOURCE = "api.isvoi.ru/assets/";

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function joinUrl(baseUrl, path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function gotoOk(page, url) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  assert(response, `No response for ${url}`);
  assert(response.ok(), `${url} returned HTTP ${response.status()}`);
  return response;
}

async function countLoadedDirectusImages(page) {
  return page.evaluate((directusSource) => {
    function includesDirectusAsset(value) {
      if (!value) return false;
      const source = String(value).toLowerCase();
      try {
        return (
          source.includes(directusSource) || decodeURIComponent(source).includes(directusSource)
        );
      } catch {
        return source.includes(directusSource);
      }
    }

    return Array.from(document.images).filter((img) => {
      const sources = [img.currentSrc, img.src, img.srcset];
      return (
        sources.some(includesDirectusAsset) &&
        img.complete &&
        img.naturalWidth > 0 &&
        img.naturalHeight > 0
      );
    }).length;
  }, DIRECTUS_ASSET_SOURCE);
}

async function waitForDirectusImages(page, minCount) {
  await page.waitForFunction(
    ({ directusSource, count }) => {
      function includesDirectusAsset(value) {
        if (!value) return false;
        const source = String(value).toLowerCase();
        try {
          return (
            source.includes(directusSource) || decodeURIComponent(source).includes(directusSource)
          );
        } catch {
          return source.includes(directusSource);
        }
      }

      const loaded = Array.from(document.images).filter((img) => {
        const sources = [img.currentSrc, img.src, img.srcset];
        return (
          sources.some(includesDirectusAsset) &&
          img.complete &&
          img.naturalWidth > 0 &&
          img.naturalHeight > 0
        );
      });
      return loaded.length >= count;
    },
    { directusSource: DIRECTUS_ASSET_SOURCE, count: minCount },
    { timeout: 10_000 },
  );
}

async function assertDirectusImages(page, label, minCount) {
  const html = await page.content();
  const refs = (html.toLowerCase().match(new RegExp(DIRECTUS_ASSET_RE.source, "gi")) || []).length;
  assert(
    refs >= minCount,
    `${label}: expected at least ${minCount} Directus asset refs, got ${refs}`,
  );

  const loaded = await countLoadedDirectusImages(page);
  assert(
    loaded >= minCount,
    `${label}: expected at least ${minCount} loaded Directus images, got ${loaded}`,
  );
}

async function smokeCatalog(page, baseUrl) {
  const url = joinUrl(baseUrl, "/catalog");
  await gotoOk(page, url);
  await waitForDirectusImages(page, 1);
  await assertDirectusImages(page, "catalog", 1);

  const cardCount = await page.locator("a[href^='/device/'], a[href*='/device/']").count();
  assert(cardCount > 0, "catalog: expected at least one device link");
  return {
    route: "/catalog",
    directusImages: await countLoadedDirectusImages(page),
    deviceLinks: cardCount,
  };
}

async function smokeStore(page, baseUrl) {
  const url = joinUrl(baseUrl, "/store");
  await gotoOk(page, url);
  await waitForDirectusImages(page, 1);
  await assertDirectusImages(page, "store", 1);

  return { route: "/store", directusImages: await countLoadedDirectusImages(page) };
}

async function smokeDevice(page, baseUrl, devicePath) {
  const url = joinUrl(baseUrl, devicePath);
  await gotoOk(page, url);
  await waitForDirectusImages(page, 1);
  await assertDirectusImages(page, "device", 1);

  const passportBlocks = await page.locator("text=ISVOI Passport").count();
  assert(passportBlocks > 0, "device: expected ISVOI Passport block");

  const leadForm = page.locator("form:has(input[name='contact']):has(textarea[name='message'])");
  await leadForm.first().waitFor({ state: "visible", timeout: 10_000 });
  const submitButtons = await leadForm.locator("button[type='submit']").count();
  assert(submitButtons > 0, "device: expected lead form submit button");

  return {
    route: devicePath,
    directusImages: await countLoadedDirectusImages(page),
    passportBlocks,
    leadForms: await leadForm.count(),
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  const devicePath = process.env.SMOKE_DEVICE_PATH || DEFAULT_DEVICE_PATH;
  const browser = await launchChromium({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  try {
    const results = [];
    results.push(await smokeCatalog(page, baseUrl));
    results.push(await smokeStore(page, baseUrl));
    results.push(await smokeDevice(page, baseUrl, devicePath));

    for (const result of results) {
      console.log(`ok ${result.route} ${JSON.stringify(result)}`);
    }
    console.log(`Smoke passed for ${baseUrl}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (String(error.message || "").includes("Executable doesn't exist")) {
    console.error(playwrightBrowserHint());
  }
  console.error(`Smoke failed: ${error.message}`);
  process.exit(1);
});
