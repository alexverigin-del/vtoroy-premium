#!/usr/bin/env node

const baseUrl = String(process.env.SMOKE_BASE_URL || "https://isvoi.ru").replace(/\/+$/, "");
const routes = String(
  process.env.LINK_SMOKE_ROUTES ||
    "/,/catalog,/catalog/tech,/catalog/accessories,/store,/passport,/trade,/club,/product/apple-iphone-14-pro-256-deep-purple-1f97112b",
)
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

const hrefPattern = /\shref=(?:"([^"]+)"|'([^']+)')/giu;
const idPattern = /\sid=(?:"([^"]+)"|'([^']+)')/giu;

function internalTarget(href, sourceUrl) {
  if (!href || /^(?:https?:|mailto:|tel:|javascript:)/i.test(href)) return null;
  const url = new URL(href, sourceUrl);
  return url.origin === new URL(sourceUrl).origin ? url : null;
}

async function htmlFor(url, cache) {
  const requestedUrl = new URL(url, baseUrl).href;
  if (cache.has(requestedUrl)) return cache.get(requestedUrl);
  const response = await fetch(requestedUrl);
  if (!response.ok) throw new Error(`${requestedUrl}: HTTP ${response.status}`);
  const result = { html: await response.text(), url: response.url };
  cache.set(requestedUrl, result);
  cache.set(response.url, result);
  return result;
}

async function main() {
  const cache = new Map();
  const failures = new Set();

  for (const route of routes) {
    const source = await htmlFor(route, cache);
    const html = source.html;
    const hrefs = [...html.matchAll(hrefPattern)].map((match) => match[1] || match[2]);
    for (const href of hrefs) {
      const target = internalTarget(href, source.url);
      if (!target) continue;
      try {
        const targetDocument = await htmlFor(target, cache);
        if (target.hash) {
          const expectedId = decodeURIComponent(target.hash.slice(1));
          const ids = new Set(
            [...targetDocument.html.matchAll(idPattern)].map((match) => match[1] || match[2]),
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
