#!/usr/bin/env node

const baseUrl = String(process.env.SMOKE_BASE_URL || "https://isvoi.ru").replace(/\/+$/, "");
const routes = String(
  process.env.LINK_SMOKE_ROUTES || "/,/catalog,/store,/passport,/trade,/club,/device/iphone-14",
)
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

const hrefPattern = /\shref=(?:"([^"]+)"|'([^']+)')/giu;
const idPattern = /\sid=(?:"([^"]+)"|'([^']+)')/giu;

function internalTarget(href, sourcePath) {
  if (!href || /^(?:https?:|mailto:|tel:|javascript:)/i.test(href)) return null;
  const url = new URL(href, `${baseUrl}${sourcePath}`);
  return url.origin === new URL(baseUrl).origin ? url : null;
}

async function htmlFor(path, cache) {
  if (cache.has(path)) return cache.get(path);
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const html = await response.text();
  cache.set(path, html);
  return html;
}

async function main() {
  const cache = new Map();
  const failures = new Set();

  for (const route of routes) {
    const html = await htmlFor(route, cache);
    const hrefs = [...html.matchAll(hrefPattern)].map((match) => match[1] || match[2]);
    for (const href of hrefs) {
      const target = internalTarget(href, route);
      if (!target) continue;
      try {
        const targetHtml = await htmlFor(target.pathname || "/", cache);
        if (target.hash) {
          const expectedId = decodeURIComponent(target.hash.slice(1));
          const ids = new Set(
            [...targetHtml.matchAll(idPattern)].map((match) => match[1] || match[2]),
          );
          if (!ids.has(expectedId)) {
            failures.add(`${route}: ${href} points to missing #${expectedId}`);
          }
        }
      } catch (error) {
        failures.add(`${route}: ${href} — ${error.message}`);
      }
    }
  }

  if (failures.size) {
    throw new Error(
      `internal link smoke found ${failures.size} issue(s):\n${[...failures].join("\n")}`,
    );
  }
  console.log(`Internal link smoke passed for ${baseUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
