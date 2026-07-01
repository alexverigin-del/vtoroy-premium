#!/usr/bin/env node
/**
 * Lightweight image latency smoke for the Directus -> Next image path.
 *
 * Usage:
 *   npm run smoke:images
 *   SMOKE_BASE_URL=https://isvoi.ru IMAGE_SMOKE_LIMIT=5 npm run smoke:images
 */

import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "https://isvoi.ru";
const DEFAULT_DIRECTUS_URL = "https://api.isvoi.ru";
const DEFAULT_ROUTES = ["/catalog", "/store", "/device/iphone-13-pro"];
const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_ASSETS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_DIRECTUS_BUDGET_MS = 5_000;
const DEFAULT_NEXT_BUDGET_MS = 6_000;
const UUID_RE =
  /https:\/\/api\.isvoi\.ru\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi;
const UUID_IN_URL_RE =
  /https:\/\/api\.isvoi\.ru\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, "");
}

function readNumber(name, fallback, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got '${raw}'.`);
  }
  return value;
}

function routeList() {
  const raw = process.env.IMAGE_SMOKE_ROUTES;
  const routes = raw
    ? raw
        .split(",")
        .map((route) => route.trim())
        .filter(Boolean)
    : DEFAULT_ROUTES;
  return routes.map((route) => (route.startsWith("/") ? route : `/${route}`));
}

function joinUrl(baseUrl, route) {
  return `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function decodeHtml(value) {
  const html = value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");
  try {
    return decodeURIComponent(html);
  } catch {
    return html;
  }
}

function directusAssetIdsFromHtml(html) {
  const decoded = decodeHtml(html);
  return [...decoded.matchAll(UUID_RE)].map((match) => match[1]).filter(Boolean);
}

function nextImageUrlsFromHtml(html, baseUrl) {
  const normalized = html.replace(/&amp;/g, "&");
  const matches = normalized.match(/\/_next\/image\?[^"'\s<>]+/g) ?? [];
  return [...new Set(matches)].map((value) => new URL(value, baseUrl).href);
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.text();
}

async function timedFetch(url, timeoutMs) {
  const start = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const bytes = await response.arrayBuffer();
  const ms = performance.now() - start;
  const contentType = response.headers.get("content-type") || "";
  return {
    url,
    status: response.status,
    ok: response.ok,
    ms,
    bytes: bytes.byteLength,
    contentType,
  };
}

function directusTransformUrl(directusUrl, id) {
  const params = new URLSearchParams({
    width: "720",
    height: "540",
    fit: "cover",
    format: "auto",
    quality: "82",
    withoutEnlargement: "true",
  });
  return `${directusUrl}/assets/${id}?${params.toString()}`;
}

function assetIdFromUrl(url) {
  try {
    const decoded = decodeURIComponent(String(url));
    return decoded.match(UUID_IN_URL_RE)?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

function uniqueNextImageUrlsByAsset(urls, limit) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    const id = assetIdFromUrl(url);
    const key = id === "unknown" ? url : id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
    if (result.length >= limit) break;
  }
  return result;
}

function formatMs(value) {
  return `${Math.round(value)}ms`;
}

function formatKb(value) {
  return `${(value / 1024).toFixed(1)}kB`;
}

function assertImageResponse(result, label, budgetMs) {
  assert(result.ok, `${label}: ${result.url} returned HTTP ${result.status}`);
  assert(
    result.contentType.toLowerCase().startsWith("image/"),
    `${label}: expected image content-type, got '${result.contentType || "missing"}'`,
  );
  assert(result.bytes > 0, `${label}: expected non-empty image body`);
  assert(
    result.ms <= budgetMs,
    `${label}: ${formatMs(result.ms)} exceeds latency budget ${formatMs(budgetMs)}`,
  );
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL, DEFAULT_BASE_URL);
  const directusUrl = normalizeBaseUrl(process.env.DIRECTUS_ASSET_BASE_URL, DEFAULT_DIRECTUS_URL);
  const timeoutMs = readNumber("IMAGE_SMOKE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, {
    min: 1_000,
    max: 60_000,
  });
  const limit = readNumber("IMAGE_SMOKE_LIMIT", DEFAULT_LIMIT, { min: 1, max: 10 });
  const minAssets = readNumber("IMAGE_SMOKE_MIN_ASSETS", DEFAULT_MIN_ASSETS, {
    min: 1,
    max: limit,
  });
  const directusBudgetMs = readNumber(
    "IMAGE_SMOKE_DIRECTUS_BUDGET_MS",
    DEFAULT_DIRECTUS_BUDGET_MS,
    {
      min: 100,
      max: 60_000,
    },
  );
  const nextBudgetMs = readNumber("IMAGE_SMOKE_NEXT_BUDGET_MS", DEFAULT_NEXT_BUDGET_MS, {
    min: 100,
    max: 60_000,
  });

  const routeHtml = await Promise.all(
    routeList().map(async (route) => ({
      route,
      html: await fetchText(joinUrl(baseUrl, route), timeoutMs),
    })),
  );
  const assetIds = [
    ...new Set(routeHtml.flatMap(({ html }) => directusAssetIdsFromHtml(html))),
  ].slice(0, limit);
  const nextImageUrls = [
    ...new Set(routeHtml.flatMap(({ html }) => nextImageUrlsFromHtml(html, baseUrl))),
  ];
  const nextSampleUrls = uniqueNextImageUrlsByAsset(nextImageUrls, limit);

  assert(
    assetIds.length >= minAssets,
    `expected at least ${minAssets} Directus asset ids in public pages, got ${assetIds.length}`,
  );
  assert(
    nextSampleUrls.length >= minAssets,
    `expected at least ${minAssets} unique Next image optimizer asset URLs in public pages, got ${nextSampleUrls.length}`,
  );

  console.log(
    `Image latency smoke: ${assetIds.length} Directus assets and ${nextSampleUrls.length} unique Next image assets from ${baseUrl}`,
  );

  for (const id of assetIds) {
    const directusUrlWithTransform = directusTransformUrl(directusUrl, id);
    const directus = await timedFetch(directusUrlWithTransform, timeoutMs);
    assertImageResponse(directus, `directus ${id}`, directusBudgetMs);
    console.log(`ok directus ${id} ${formatMs(directus.ms)} ${formatKb(directus.bytes)}`);
  }

  for (const url of nextSampleUrls) {
    const id = assetIdFromUrl(url);
    const next = await timedFetch(url, timeoutMs);
    assertImageResponse(next, `next-image ${id}`, nextBudgetMs);
    console.log(`ok next-image ${id} ${formatMs(next.ms)} ${formatKb(next.bytes)}`);
  }

  console.log(`Image latency smoke passed for ${baseUrl}`);
}

main().catch((error) => {
  console.error(`Image latency smoke failed: ${error.message}`);
  process.exit(1);
});
