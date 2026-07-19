#!/usr/bin/env node
/**
 * Lightweight performance smoke for LCP and image loading.
 *
 * Usage:
 *   npm run smoke:performance
 *   SMOKE_BASE_URL=http://127.0.0.1:3113 PERFORMANCE_SMOKE_ROUTES=/,/catalog,/store npm run smoke:performance
 */

import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const DEFAULT_BASE_URL = "https://isvoi.ru";
const DEFAULT_ROUTES = [
  "/",
  "/catalog",
  "/store",
  "/blog",
  "/blog/chto-pokazyvaet-diagnostika-iphone",
];
const VIEWPORTS = [
  {
    name: "desktop",
    width: 1366,
    height: 900,
    lcpBudgetMs: Number(process.env.PERFORMANCE_DESKTOP_LCP_BUDGET_MS || 4500),
  },
  {
    name: "mobile",
    width: 390,
    height: 844,
    isMobile: true,
    lcpBudgetMs: Number(process.env.PERFORMANCE_MOBILE_LCP_BUDGET_MS || 6500),
  },
];

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function routeList() {
  const rawRoutes = process.env.PERFORMANCE_SMOKE_ROUTES;
  if (!rawRoutes) return DEFAULT_ROUTES;
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

async function installLcpObserver(page) {
  await page.addInitScript(() => {
    window.__isvoiPerf = {
      imageErrors: [],
      lcp: null,
    };

    function labelFor(element) {
      if (!element) return "";
      const tag = element.tagName?.toLowerCase() || "";
      const id = element.id ? `#${element.id}` : "";
      const component = element.getAttribute?.("data-component");
      const componentLabel = component ? `[data-component="${component}"]` : "";
      const alt = element.getAttribute?.("alt");
      const text = alt || element.textContent || "";
      return `${tag}${id}${componentLabel}${text ? ` ${text.replace(/\s+/g, " ").trim().slice(0, 80)}` : ""}`;
    }

    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const latest = entries[entries.length - 1];
        if (!latest) return;
        window.__isvoiPerf.lcp = {
          startTime: latest.startTime,
          renderTime: latest.renderTime,
          loadTime: latest.loadTime,
          size: latest.size,
          url: latest.url || latest.element?.currentSrc || latest.element?.src || "",
          element: labelFor(latest.element),
        };
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      window.__isvoiPerf.lcp = null;
    }

    window.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (target?.tagName === "IMG") {
          window.__isvoiPerf.imageErrors.push(target.currentSrc || target.src || target.alt || "unknown image");
        }
      },
      true,
    );
  });
}

async function collectMetrics(page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(1200);

  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.initiatorType === "img" || /\/(_next\/image|assets\/)/.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
        responseEnd: Math.round(entry.responseEnd),
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    const images = Array.from(document.images).map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        src: image.currentSrc || image.src || image.alt || "",
        alt: image.alt || "",
        loading: image.loading || "",
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        inNearViewport: rect.top < window.innerHeight * 1.5 && rect.bottom > -window.innerHeight * 0.25,
      };
    });

    const pendingImages = images.filter(
      (image) => image.inNearViewport && (!image.complete || image.naturalWidth === 0),
    );
    const failedImages = images.filter((image) => image.complete && image.naturalWidth === 0);

    return {
      lcp: window.__isvoiPerf?.lcp ?? null,
      imageErrors: window.__isvoiPerf?.imageErrors ?? [],
      pendingImages,
      failedImages,
      imageCount: images.length,
      resourceImages: resources,
      domContentLoaded: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadEventEnd: navigation ? Math.round(navigation.loadEventEnd) : null,
    };
  });
}

async function smokeRoute(browser, baseUrl, route, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.isMobile),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await installLcpObserver(page);

  try {
    const url = joinUrl(baseUrl, route);
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    assert(response, `No response for ${url}`);
    assert(response.ok(), `${url} returned HTTP ${response.status()}`);

    const metrics = await collectMetrics(page);
    const lcpMs = metrics.lcp ? Math.round(metrics.lcp.startTime) : null;
    const issues = [];
    if (lcpMs == null) issues.push("LCP entry was not recorded");
    if (lcpMs != null && lcpMs > viewport.lcpBudgetMs) {
      issues.push(`LCP ${lcpMs}ms exceeds ${viewport.lcpBudgetMs}ms budget`);
    }
    if (metrics.pendingImages.length > 0) {
      issues.push(`${metrics.pendingImages.length} near-viewport image(s) still pending`);
    }
    if (metrics.failedImages.length > 0 || metrics.imageErrors.length > 0) {
      issues.push(`${metrics.failedImages.length + metrics.imageErrors.length} image error(s)`);
    }

    assert(issues.length === 0, `${viewport.name} ${route}: ${issues.join("; ")}`);

    const lcpLabel = metrics.lcp?.element || metrics.lcp?.url || "unknown";
    const slowestImage = metrics.resourceImages[0];
    const slowestLabel = slowestImage ? ` slowestImage=${slowestImage.duration}ms` : "";
    console.log(
      `ok ${viewport.name} ${route} lcp=${lcpMs}ms budget=${viewport.lcpBudgetMs}ms images=${metrics.imageCount}${slowestLabel} lcpElement="${lcpLabel}"`,
    );
  } finally {
    await context.close();
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  const routes = routeList();
  const browser = await launchChromium({ headless: true });
  try {
    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        await smokeRoute(browser, baseUrl, route, viewport);
      }
    }
    console.log(`Performance smoke passed for ${baseUrl}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (String(error.message || "").includes("Executable doesn't exist")) {
    console.error(playwrightBrowserHint());
  }
  console.error(`Performance smoke failed: ${error.message}`);
  process.exit(1);
});
