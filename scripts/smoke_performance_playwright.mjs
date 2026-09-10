#!/usr/bin/env node
/**
 * Sequential LCP experiment: five samples, cold/repeat visits and cookie states.
 *
 * Usage:
 *   npm run smoke:performance
 *   PERFORMANCE_SAMPLES=1 npm run smoke:performance # quick diagnostic, not acceptance
 *   PERFORMANCE_REQUIRE_GREEN=1 npm run smoke:performance # median <=2500ms gate
 *   SMOKE_BASE_URL=http://127.0.0.1:3113 PERFORMANCE_SMOKE_ROUTES=/,/catalog,/store npm run smoke:performance
 *   PERFORMANCE_SMOKE_ROUTES=/blog/chto-pokazyvaet-diagnostika-iphone PERFORMANCE_BLOG_ARTICLE_LCP_BUDGET_MS=2500 npm run smoke:performance
 */

import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";
import fs from "node:fs/promises";
import path from "node:path";

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

function lcpBudgetFor(route, viewport) {
  const blogArticleBudget = Number(process.env.PERFORMANCE_BLOG_ARTICLE_LCP_BUDGET_MS || 0);
  const isBlogArticle = /^\/blog\/[^/]+\/?$/.test(route);
  if (isBlogArticle && blogArticleBudget > 0) return blogArticleBudget;
  return viewport.lcpBudgetMs;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installLcpObserver(page) {
  await page.addInitScript(() => {
    window.__isvoiPerf = {
      imageErrors: [],
      lcp: null,
      cls: 0,
    };
    let sessionStart = 0;
    let lastShift = 0;
    let sessionValue = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        if (entry.startTime - lastShift > 1000 || entry.startTime - sessionStart > 5000) {
          sessionStart = entry.startTime;
          sessionValue = 0;
        }
        lastShift = entry.startTime;
        sessionValue += entry.value;
        window.__isvoiPerf.cls = Math.max(window.__isvoiPerf.cls, sessionValue);
      }
    }).observe({ type: "layout-shift", buffered: true });

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
          window.__isvoiPerf.imageErrors.push(
            target.currentSrc || target.src || target.alt || "unknown image",
          );
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
      .filter(
        (entry) => entry.initiatorType === "img" || /\/(_next\/image|assets\/)/.test(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
        startTime: Math.round(entry.startTime),
        responseEnd: Math.round(entry.responseEnd),
      }))
      .sort((a, b) => b.duration - a.duration);

    const images = Array.from(document.images).map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        src: image.currentSrc || image.src || image.alt || "",
        alt: image.alt || "",
        loading: image.loading || "",
        fetchPriority: image.fetchPriority || "auto",
        sizes: image.sizes,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        rect: {
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        inNearViewport:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top < window.innerHeight * 1.5 &&
          rect.bottom > -window.innerHeight * 0.25 &&
          rect.left < window.innerWidth * 1.5 &&
          rect.right > -window.innerWidth * 0.25,
      };
    });

    const pendingImages = images.filter(
      (image) => image.inNearViewport && (!image.complete || image.naturalWidth === 0),
    );
    const failedImages = images.filter((image) => image.complete && image.naturalWidth === 0);

    const lcp = window.__isvoiPerf?.lcp;
    const lcpResource = resources.find((entry) => entry.name === lcp?.url);
    return {
      ttfb: navigation ? Math.round(navigation.responseStart) : null,
      cls: window.__isvoiPerf?.cls ?? null,
      lcpRequestStart: lcpResource?.startTime ?? null,
      lcpRequestEnd: lcpResource?.responseEnd ?? null,
      renderDelay:
        lcpResource && lcp
          ? Math.max(0, Math.round(lcp.startTime - lcpResource.responseEnd))
          : null,
      lcp: window.__isvoiPerf?.lcp ?? null,
      imageErrors: window.__isvoiPerf?.imageErrors ?? [],
      pendingImages,
      failedImages,
      imageCount: images.length,
      imageMetadata: images,
      resourceImages: resources,
      domContentLoaded: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadEventEnd: navigation ? Math.round(navigation.loadEventEnd) : null,
    };
  });
}

function summary(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}

async function necessaryCookie(browser, baseUrl) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const button = page.getByRole("button", { name: "Только необходимые", exact: true });
    if (!(await button.count())) return [];
    await button.click();
    const cookies = (await context.cookies()).filter(
      (cookie) => cookie.name === "isvoi_integrations_consent_v1",
    );
    assert(cookies.length === 1, "Consent rejection did not create a cookie");
    const choice = JSON.parse(decodeURIComponent(cookies[0].value));
    assert(
      Object.values(choice.categories).every((value) => value === false),
      "Optional integrations must stay disabled",
    );
    return cookies;
  } finally {
    await context.close();
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  const samples = Number(process.env.PERFORMANCE_SAMPLES || 5);
  assert(
    Number.isInteger(samples) && samples > 0 && samples <= 20,
    "PERFORMANCE_SAMPLES must be 1..20",
  );
  const report = {
    baseUrl,
    capturedAt: new Date().toISOString(),
    samples,
    conditions:
      "Unthrottled Chromium; isolated cache per sample, same context for repeat; no visual smoke in parallel",
    results: [],
    failures: [],
  };
  const browser = await launchChromium({ headless: true });
  report.browser = browser.version();
  const output = path.resolve(process.env.PERFORMANCE_REPORT || "output/performance/report.json");
  try {
    const cookies = await necessaryCookie(browser, baseUrl);
    for (const route of routeList()) {
      for (const viewport of VIEWPORTS) {
        for (const consent of ["undecided", "necessary"]) {
          const rows = [];
          for (let sample = 1; sample <= samples; sample += 1) {
            const context = await browser.newContext({
              viewport: { width: viewport.width, height: viewport.height },
              isMobile: Boolean(viewport.isMobile),
            });
            try {
              if (consent === "necessary") await context.addCookies(cookies);
              const page = await context.newPage();
              await installLcpObserver(page);
              for (const visit of ["first", "repeat"]) {
                const response = await page.goto(joinUrl(baseUrl, route), {
                  waitUntil: "networkidle",
                  timeout: 60_000,
                });
                assert(response?.ok(), `HTTP failure: ${route}`);
                const metrics = await collectMetrics(page);
                const lcpMs = metrics.lcp ? Math.round(metrics.lcp.startTime) : null;
                rows.push({ sample, visit, lcpMs, ...metrics });
                if (
                  lcpMs == null ||
                  metrics.failedImages.length ||
                  metrics.imageErrors.length ||
                  metrics.pendingImages.length
                ) {
                  report.failures.push(
                    `${viewport.name} ${route} ${consent} ${sample}/${visit}: missing LCP or incomplete images`,
                  );
                }
                console.log(
                  `${viewport.name} ${route} ${consent} ${sample}/${visit} LCP=${lcpMs} TTFB=${metrics.ttfb} CLS=${metrics.cls}`,
                );
              }
            } finally {
              await context.close();
            }
          }
          const aggregates = Object.fromEntries(
            ["first", "repeat"].map((visit) => {
              const selected = rows.filter((row) => row.visit === visit);
              const stats = Object.fromEntries(
                ["lcpMs", "ttfb", "lcpRequestStart", "lcpRequestEnd", "renderDelay", "cls"].map(
                  (key) => [key, summary(selected.map((row) => row[key]))],
                ),
              );
              const median = stats.lcpMs?.median;
              stats.greenLcp = median != null && median <= 2500;
              if (process.env.PERFORMANCE_REQUIRE_GREEN === "1" && !stats.greenLcp)
                report.failures.push(
                  `${viewport.name} ${route} ${consent}/${visit}: median LCP ${median} is outside the <=2500ms target`,
                );
              if (median == null || median > lcpBudgetFor(route, viewport))
                report.failures.push(
                  `${viewport.name} ${route} ${consent}/${visit}: median LCP ${median} exceeds release budget`,
                );
              return [visit, stats];
            }),
          );
          report.results.push({
            route,
            viewport: viewport.name,
            consent,
            consentAvailable: cookies.length > 0,
            aggregates,
            rows,
          });
          console.log(JSON.stringify({ route, viewport: viewport.name, consent, aggregates }));
        }
      }
    }
  } finally {
    await browser.close();
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Report: ${output}`);
  }
  assert(report.failures.length === 0, report.failures.join("\n"));
  console.log("Release budgets passed. Review greenLcp separately: the target is median <=2500ms.");
}

main().catch((error) => {
  if (String(error.message || "").includes("Executable doesn't exist"))
    console.error(playwrightBrowserHint());
  console.error(`Performance smoke failed: ${error.message}`);
  process.exitCode = 1;
});
