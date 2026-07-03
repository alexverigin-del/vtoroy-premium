#!/usr/bin/env node
/**
 * Visual smoke test for the public storefront.
 *
 * Usage:
 *   npm run smoke:visual
 *   SMOKE_BASE_URL=https://isvoi.ru VISUAL_SMOKE_ROUTES=/,/catalog npm run smoke:visual
 */

import fs from "node:fs/promises";
import path from "node:path";
import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const DEFAULT_BASE_URL = "https://isvoi.ru";
const DEFAULT_DEVICE_PATH = "/device/iphone-13-pro";
const DEFAULT_ROUTES = ["/", "/catalog", "/store", "/trade", "/passport", "/club"];
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function routeList() {
  const devicePath = process.env.SMOKE_DEVICE_PATH || DEFAULT_DEVICE_PATH;
  const rawRoutes = process.env.VISUAL_SMOKE_ROUTES;
  if (!rawRoutes) return [...DEFAULT_ROUTES, devicePath];
  return rawRoutes
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean)
    .map((route) => (route.startsWith("/") ? route : `/${route}`));
}

function joinUrl(baseUrl, route) {
  return `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeName(route, viewportName) {
  const routeName = route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[^a-z0-9-]+/gi, "-");
  return `${viewportName}-${routeName || "home"}.png`;
}

async function gotoOk(page, url) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  assert(response, `No response for ${url}`);
  assert(response.ok(), `${url} returned HTTP ${response.status()}`);
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    const loaded = Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }),
    );
    const timeout = new Promise((resolve) => window.setTimeout(resolve, 5_000));
    await Promise.race([loaded, timeout]);
  });
}

async function visualIssues(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const root = document.documentElement;
    const body = document.body;
    const issues = [];

    function selectorFor(element) {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const component = element.getAttribute("data-component");
      const name = component ? `[data-component="${component}"]` : "";
      const text = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70);
      return `${tag}${id}${name}${text ? ` "${text}"` : ""}`;
    }

    function visible(element) {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        element.getAttribute("aria-hidden") === "true"
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && rect.bottom >= 0 && rect.top <= viewportHeight;
    }

    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth || 0);
    if (scrollWidth > viewportWidth + 4) {
      issues.push(`document has horizontal overflow: scrollWidth=${scrollWidth}, viewport=${viewportWidth}`);
    }

    const selectors = [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "a",
      "button",
      "label",
      "input",
      "textarea",
      "select",
      "figcaption",
      "summary",
      "[role='button']",
      "[role='link']",
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(","))).filter(visible);

    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const clipsText =
        element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
      const hasOwnBox = element.clientWidth > 0 && element.clientHeight > 0;
      if (hasOwnBox && clipsText && style.overflow !== "visible") {
        issues.push(`${selectorFor(element)} clips content`);
      }
      if (
        !element.closest("[data-allow-horizontal-scroll='true']") &&
        (rect.left < -4 || rect.right > viewportWidth + 4)
      ) {
        issues.push(
          `${selectorFor(element)} overflows viewport horizontally: left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, viewport=${viewportWidth}`,
        );
      }
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const first = candidates[index];
      const firstRect = first.getBoundingClientRect();
      for (let otherIndex = index + 1; otherIndex < candidates.length; otherIndex += 1) {
        const second = candidates[otherIndex];
        if (first.contains(second) || second.contains(first)) continue;

        const secondRect = second.getBoundingClientRect();
        const left = Math.max(firstRect.left, secondRect.left);
        const right = Math.min(firstRect.right, secondRect.right);
        const top = Math.max(firstRect.top, secondRect.top);
        const bottom = Math.min(firstRect.bottom, secondRect.bottom);
        const overlapWidth = right - left;
        const overlapHeight = bottom - top;
        if (overlapWidth <= 6 || overlapHeight <= 6) continue;

        const overlapArea = overlapWidth * overlapHeight;
        const smallerArea = Math.min(firstRect.width * firstRect.height, secondRect.width * secondRect.height);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.18) {
          issues.push(`${selectorFor(first)} overlaps ${selectorFor(second)}`);
        }
      }
    }

    return issues.slice(0, 20);
  });
}

async function smokeRoute(page, baseUrl, route, viewport, outputDir) {
  const url = joinUrl(baseUrl, route);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await gotoOk(page, url);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}",
  });
  await waitForImages(page);

  const issues = await visualIssues(page);
  const screenshotPath = path.join(outputDir, safeName(route, viewport.name));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(issues.length === 0, `${viewport.name} ${route}: ${issues.join("; ")}`);
  return { route, viewport: viewport.name, screenshot: screenshotPath };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  const routes = routeList();
  const outputDir =
    process.env.VISUAL_SMOKE_OUTPUT_DIR ||
    path.join(process.cwd(), "output", "playwright", "visual-smoke");
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await launchChromium({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    const results = [];
    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        const result = await smokeRoute(page, baseUrl, route, viewport, outputDir);
        results.push(result);
        console.log(`ok ${result.viewport} ${result.route} ${result.screenshot}`);
      }
    }
    console.log(`Visual smoke passed for ${baseUrl}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (String(error.message || "").includes("Executable doesn't exist")) {
    console.error(playwrightBrowserHint());
  }
  console.error(`Visual smoke failed: ${error.message}`);
  process.exit(1);
});
