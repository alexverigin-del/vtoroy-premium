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
const DEFAULT_BLOG_ARTICLE_PATH = "/blog/chto-pokazyvaet-diagnostika-iphone";
const MARKETING_ROUTES = [
  "/store",
  "/trade",
  "/passport",
  "/club",
  "/blog",
  "/blog/category/buying-guide",
];
const DIRECTUS_ASSET_RE = /(https:\/\/api\.isvoi\.ru\/assets\/|api\.isvoi\.ru%2fassets%2f)/i;
const DIRECTUS_ASSET_SOURCE = "api.isvoi.ru/assets/";

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function joinUrl(baseUrl, path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

function shouldRequireDirectusAssets(baseUrl) {
  if (process.env.SMOKE_REQUIRE_DIRECTUS_ASSETS === "false") return false;
  return !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl);
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

async function waitForLoadedImages(page, minCount) {
  await page.waitForFunction(
    (count) =>
      Array.from(document.images).filter(
        (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
      ).length >= count,
    minCount,
    { timeout: 10_000 },
  );
}

async function assertImages(page, label, minCount, requireDirectusAssets) {
  if (!requireDirectusAssets) {
    const loaded = await page.evaluate(
      () =>
        Array.from(document.images).filter(
          (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
        ).length,
    );
    assert(
      loaded >= minCount,
      `${label}: expected at least ${minCount} loaded images, got ${loaded}`,
    );
    return;
  }

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

async function assertLeadHoneypot(form, label) {
  const honeypot = form.locator("input[name='website'][aria-hidden='true'][tabindex='-1']");
  const count = await honeypot.count();
  assert(count > 0, `${label}: expected hidden website honeypot field`);
}

function structuredTypes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(structuredTypes);
  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(structuredTypes) : [];
  const type = value["@type"];
  const ownTypes = Array.isArray(type) ? type : type ? [type] : [];
  return [...ownTypes, ...graph];
}

async function assertSeoAndStructuredData(page, label, expectedTypes) {
  const report = await page.evaluate(() => {
    const meta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
    const prop = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute("content") || "";
    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).map((heading) => ({
      tag: heading.tagName,
      text: heading.textContent?.trim().replace(/\s+/g, " ") || "",
    }));
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
      (script) => script.textContent || "",
    );

    return {
      title: document.title,
      description: meta("description"),
      canonical: document.querySelector('link[rel="canonical"]')?.href || "",
      ogTitle: prop("og:title"),
      ogDescription: prop("og:description"),
      ogImage: prop("og:image"),
      headings,
      jsonLdScripts: scripts,
    };
  });

  assert(report.title.trim().length > 0, `${label}: expected document title`);
  assert(report.description.trim().length > 0, `${label}: expected meta description`);
  assert(report.canonical.startsWith("https://isvoi.ru"), `${label}: expected canonical URL`);
  assert(report.ogTitle.trim().length > 0, `${label}: expected og:title`);
  assert(report.ogDescription.trim().length > 0, `${label}: expected og:description`);
  assert(report.ogImage.trim().length > 0, `${label}: expected og:image`);

  const h1Count = report.headings.filter((heading) => heading.tag === "H1").length;
  assert(h1Count === 1, `${label}: expected exactly one H1, got ${h1Count}`);
  const firstHeading = report.headings[0]?.tag;
  assert(firstHeading === "H1", `${label}: expected first heading to be H1, got ${firstHeading}`);

  const parsedJsonLd = report.jsonLdScripts.map((script, index) => {
    try {
      return JSON.parse(script);
    } catch (error) {
      throw new Error(`${label}: JSON-LD script ${index + 1} is invalid: ${error.message}`);
    }
  });
  const types = parsedJsonLd.flatMap(structuredTypes);
  for (const type of expectedTypes) {
    assert(
      types.includes(type),
      `${label}: expected JSON-LD type ${type}, got ${types.join(", ")}`,
    );
  }

  return { h1Count, jsonLdTypes: types };
}

async function smokeHome(page, baseUrl) {
  const url = joinUrl(baseUrl, "/");
  await gotoOk(page, url);
  const seo = await assertSeoAndStructuredData(page, "home", ["Organization", "WebSite"]);

  const leadForm = page.locator("form:has(input[name='contact'])");
  const leadForms = await leadForm.count();
  if (leadForms > 0) {
    await leadForm.first().waitFor({ state: "visible", timeout: 10_000 });
    await assertLeadHoneypot(leadForm.first(), "home");
  }

  return { route: "/", leadForms, jsonLdTypes: seo.jsonLdTypes.length };
}

async function smokeCatalog(page, baseUrl, requireDirectusAssets) {
  const url = joinUrl(baseUrl, "/catalog");
  await gotoOk(page, url);
  const seo = await assertSeoAndStructuredData(page, "catalog", [
    "Organization",
    "WebSite",
    "BreadcrumbList",
    "ItemList",
  ]);
  if (requireDirectusAssets) {
    await waitForDirectusImages(page, 1);
  } else {
    await waitForLoadedImages(page, 1);
  }
  await assertImages(page, "catalog", 1, requireDirectusAssets);

  const cardCount = await page.locator("a[href^='/device/'], a[href*='/device/']").count();
  if (requireDirectusAssets) {
    assert(cardCount > 0, "catalog: expected at least one device link");
  }
  return {
    route: "/catalog",
    directusImages: await countLoadedDirectusImages(page),
    deviceLinks: cardCount,
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function smokeStore(page, baseUrl, requireDirectusAssets) {
  const url = joinUrl(baseUrl, "/store");
  await gotoOk(page, url);
  const seo = await assertSeoAndStructuredData(page, "store", [
    "Organization",
    "WebSite",
    "BreadcrumbList",
  ]);
  if (requireDirectusAssets) {
    await waitForDirectusImages(page, 1);
  } else {
    await waitForLoadedImages(page, 1);
  }
  await assertImages(page, "store", 1, requireDirectusAssets);

  return {
    route: "/store",
    directusImages: await countLoadedDirectusImages(page),
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function smokeMarketing(page, baseUrl, route) {
  const url = joinUrl(baseUrl, route);
  await gotoOk(page, url);
  const seo = await assertSeoAndStructuredData(page, route, [
    "Organization",
    "WebSite",
    "BreadcrumbList",
  ]);
  if (route === "/blog" || route.startsWith("/blog/category/")) {
    const eyebrow = page.getByText("I СВОИ · Блог", { exact: true });
    assert((await eyebrow.count()) === 1, `${route}: expected the standard I СВОИ · Блог eyebrow`);
    const activeBlogLinks = page.locator('header a[aria-current="page"][href="/blog"]');
    assert((await activeBlogLinks.count()) > 0, `${route}: expected an active Blog header link`);
    const activeCategoryLink = route.startsWith("/blog/category/")
      ? page.locator(`nav[aria-label="Рубрики блога"] a[aria-current="page"][href="${route}"]`)
      : page.locator('nav[aria-label="Рубрики блога"] a[aria-current="page"][href="/blog"]');
    assert((await activeCategoryLink.count()) === 1, `${route}: expected one active category tab`);

    const articleLinks = await page.locator('main a[href^="/blog/"]').count();
    if (articleLinks > 1) {
      assert(
        seo.jsonLdTypes.includes("ItemList"),
        `${route}: expected ItemList JSON-LD for a multi-post listing`,
      );
    }
  }

  return { route, jsonLdTypes: seo.jsonLdTypes.length };
}

async function smokeDevice(page, baseUrl, devicePath, requireDirectusAssets) {
  const url = joinUrl(baseUrl, devicePath);
  await gotoOk(page, url);
  const seo = await assertSeoAndStructuredData(page, "device", [
    "Organization",
    "WebSite",
    "BreadcrumbList",
    "Product",
  ]);
  if (requireDirectusAssets) {
    await waitForDirectusImages(page, 1);
  } else {
    await waitForLoadedImages(page, 1);
  }
  await assertImages(page, "device", 1, requireDirectusAssets);

  const passportBlocks = await page.locator("text=I СВОИ Passport").count();
  assert(passportBlocks > 0, "device: expected I СВОИ Passport block");

  const leadForm = page.locator("form:has(input[name='contact']):has(textarea[name='message'])");
  await leadForm.first().waitFor({ state: "visible", timeout: 10_000 });
  const submitButtons = await leadForm.locator("button[type='submit']").count();
  assert(submitButtons > 0, "device: expected lead form submit button");
  await assertLeadHoneypot(leadForm.first(), "device");

  return {
    route: devicePath,
    directusImages: await countLoadedDirectusImages(page),
    passportBlocks,
    leadForms: await leadForm.count(),
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function smokeBlogArticle(page, baseUrl, articlePath, requireDirectusAssets) {
  const url = joinUrl(baseUrl, articlePath);
  await gotoOk(page, url);
  const seo = await assertSeoAndStructuredData(page, "blog article", [
    "Organization",
    "WebSite",
    "BlogPosting",
    "BreadcrumbList",
  ]);
  if (requireDirectusAssets) {
    await waitForDirectusImages(page, 1);
  } else {
    await waitForLoadedImages(page, 1);
  }
  await assertImages(page, "blog article", 1, requireDirectusAssets);
  const cover = page.locator("article > figure").first();
  assert((await cover.count()) === 1, "blog article: expected a cover figure");
  const coverBox = await cover.locator("img").boundingBox();
  assert(
    coverBox && coverBox.width >= 300 && coverBox.height >= 180,
    `blog article: expected a visible cover image, got ${JSON.stringify(coverBox)}`,
  );
  const blogNavigation = page.getByRole("navigation", { name: "Навигация по блогу" });
  assert(
    (await blogNavigation.count()) === 1,
    "blog article: expected one blog navigation landmark",
  );
  const blogBackLink = blogNavigation.getByRole("link", { name: "← Блог", exact: true });
  assert(
    (await blogBackLink.count()) === 1,
    "blog article: expected the standard ← Блог back link",
  );
  assert(
    (await blogBackLink.getAttribute("href")) === "/blog",
    "blog article: back link must target /blog",
  );
  const activeBlogLinks = page.locator('header a[aria-current="page"][href="/blog"]');
  assert((await activeBlogLinks.count()) > 0, "blog article: expected an active Blog header link");

  const bodyFigures = page.locator("article > div > figure");
  assert((await bodyFigures.count()) >= 2, "blog article: expected two structured image blocks");
  const imageAlts = await bodyFigures
    .locator("img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("alt") || ""));
  assert(imageAlts.every(Boolean), "blog article: every structured image block needs alt text");

  const relatedDevice = page.locator('a[href*="utm_content=related-device"]').first();
  assert(
    (await relatedDevice.count()) === 1,
    "blog article: expected an attributed related-device link",
  );
  const deviceHref = (await relatedDevice.getAttribute("href")) || "";
  for (const part of [
    "utm_source=blog",
    "utm_medium=editorial",
    "utm_campaign=chto-pokazyvaet-diagnostika-iphone",
    "utm_content=related-device",
  ]) {
    assert(deviceHref.includes(part), `blog article: related-device link is missing ${part}`);
  }
  assert(
    (await relatedDevice.locator("img").count()) === 1,
    "blog article: related device needs an image",
  );

  const articleCta = page.locator('a[href*="utm_content=article-end"]').first();
  assert((await articleCta.count()) === 1, "blog article: expected an attributed end CTA");
  const relatedArticles = page.getByRole("heading", { name: "Читайте также", exact: true });
  assert(
    (await relatedArticles.count()) === 1,
    "blog article: expected a related articles section",
  );

  const authorType = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const value = JSON.parse(script.textContent || "null");
        if (value?.["@type"] === "BlogPosting") return value.author?.["@type"] || "";
      } catch {}
    }
    return "";
  });
  assert(
    authorType === "Organization",
    `blog article: expected Organization author, got ${authorType}`,
  );

  return {
    route: articlePath,
    directusImages: await countLoadedDirectusImages(page),
    cover: { width: Math.round(coverBox.width), height: Math.round(coverBox.height) },
    structuredImages: await bodyFigures.count(),
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  const devicePath = process.env.SMOKE_DEVICE_PATH || DEFAULT_DEVICE_PATH;
  const blogArticlePath = process.env.SMOKE_BLOG_ARTICLE_PATH || DEFAULT_BLOG_ARTICLE_PATH;
  const requireDirectusAssets = shouldRequireDirectusAssets(baseUrl);
  const browser = await launchChromium({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  try {
    const results = [];
    results.push(await smokeHome(page, baseUrl));
    results.push(await smokeCatalog(page, baseUrl, requireDirectusAssets));
    results.push(await smokeStore(page, baseUrl, requireDirectusAssets));
    for (const route of MARKETING_ROUTES.filter((route) => route !== "/store")) {
      results.push(await smokeMarketing(page, baseUrl, route));
    }
    results.push(await smokeBlogArticle(page, baseUrl, blogArticlePath, requireDirectusAssets));
    results.push(await smokeDevice(page, baseUrl, devicePath, requireDirectusAssets));

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
