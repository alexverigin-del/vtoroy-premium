#!/usr/bin/env node
/**
 * Public copy smoke for production-facing HTML.
 *
 * Usage:
 *   npm run smoke:copy
 *   SMOKE_BASE_URL=https://isvoi.ru COPY_SMOKE_ROUTES=/,/catalog npm run smoke:copy
 */

const DEFAULT_BASE_URL = "https://isvoi.ru";
const DEFAULT_DEVICE_PATH = "/device/iphone-13-pro";
const DEFAULT_ROUTES = [
  "/",
  "/catalog",
  "/store",
  "/trade",
  "/passport",
  "/club",
  "/blog",
  "/blog/chto-pokazyvaet-diagnostika-iphone",
  "/blog/category/buying-guide",
];

const BANNED_PATTERNS = [
  { label: "prototype footer copy", pattern: /Прототип лендинга/iu },
  { label: "concept prototype copy", pattern: /концепт[-\s]?прототип/iu },
  { label: "English prototype copy", pattern: /\bprototype\b/iu },
  { label: "English concept prototype copy", pattern: /\bconcept\s+prototype\b/iu },
  { label: "Directus technical copy", pattern: /\bDirectus\b/u },
];

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function routeList() {
  const rawRoutes = process.env.COPY_SMOKE_ROUTES;
  const routes = rawRoutes
    ? rawRoutes
        .split(",")
        .map((route) => route.trim())
        .filter(Boolean)
    : [...DEFAULT_ROUTES, process.env.SMOKE_DEVICE_PATH || DEFAULT_DEVICE_PATH];

  return routes.map((route) => (route.startsWith("/") ? route : `/${route}`));
}

function joinUrl(baseUrl, route) {
  return `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`;
}

function textSnippet(html, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(html.length, index + 120);
  return html
    .slice(start, end)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function checkRoute(baseUrl, route) {
  const url = joinUrl(baseUrl, route);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${route}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const matches = BANNED_PATTERNS.flatMap(({ label, pattern }) => {
    const match = pattern.exec(html);
    return match ? [{ label, snippet: textSnippet(html, match.index) }] : [];
  });

  if (matches.length > 0) {
    const details = matches
      .map((match) => `${match.label}: "${match.snippet}"`)
      .join("; ");
    throw new Error(`${route}: banned public copy found: ${details}`);
  }

  console.log(`ok ${route}`);
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  for (const route of routeList()) {
    await checkRoute(baseUrl, route);
  }
  console.log(`Copy smoke passed for ${baseUrl}`);
}

main().catch((error) => {
  console.error(`Copy smoke failed: ${error.message}`);
  process.exit(1);
});
