#!/usr/bin/env node
/**
 * Lightweight production smoke test for the public storefront.
 *
 * Usage:
 *   npm run smoke:prod
 *   SMOKE_BASE_URL=https://isvoi.ru SMOKE_DEVICE_PATH=/product/apple-iphone-14-pro-256-deep-purple-1f97112b npm run smoke:prod
 */

import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const DEFAULT_BASE_URL = "https://isvoi.ru";
const DEFAULT_DEVICE_PATH = "/product/apple-iphone-14-pro-256-deep-purple-1f97112b";
const DEFAULT_BLOG_ARTICLE_PATH = "/blog/chto-pokazyvaet-diagnostika-iphone";
const MARKETING_ROUTES = [
  "/store",
  "/trade",
  "/passport",
  "/club",
  "/blog",
  "/blog/category/buying-guide",
  "/catalog/tech",
  "/catalog/accessories",
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

function parseSmokeRoutes(value) {
  return String(value || "")
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean)
    .map((route) => (route.startsWith("/") ? route : `/${route}`));
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
  const visibleText = await page.locator("body").innerText();
  assert(!visibleText.includes("{city}"), `${url}: unresolved {city} token is visible`);
  assert(!/Северодвинск/iu.test(visibleText), `${url}: retired city name is visible`);
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
      robots: meta("robots"),
      headings,
      jsonLdScripts: scripts,
    };
  });

  assert(report.title.trim().length > 0, `${label}: expected document title`);
  assert(report.description.trim().length > 0, `${label}: expected meta description`);
  const expectedCanonicalOrigin = normalizeBaseUrl(
    process.env.SMOKE_CANONICAL_ORIGIN || new URL(page.url()).origin,
  );
  assert(
    report.canonical.startsWith(expectedCanonicalOrigin),
    `${label}: expected canonical URL to start with ${expectedCanonicalOrigin}, got ${report.canonical}`,
  );
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
  const origin = new URL(page.url()).origin;
  if (origin === "https://club.isvoi.ru") {
    const logoHref = await page
      .locator('[data-component="SiteHeader"] a')
      .first()
      .getAttribute("href");
    assert(
      logoHref === "https://isvoi.ru/",
      `club home: expected header logo to link to https://isvoi.ru/, got ${logoHref}`,
    );
    const expectedIndexable = process.env.SMOKE_CLUB_EXPECT_INDEXABLE === "true";
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    assert(
      expectedIndexable
        ? robots?.includes("index") && !robots?.includes("noindex")
        : robots?.includes("noindex"),
      `club home: unexpected robots meta ${robots}`,
    );
    const html = await page.content();
    assert(html.includes("Своя, пока нужна."), "club home: expected approved Club hero");
    assert(!html.includes("/#final"), "club home: legacy /#final CTA is still present");
    assert(
      (await page.locator('a[href="#club-request"]').count()) > 0,
      "club home: expected #club-request CTA",
    );
    assert(
      (await page.locator('a[href="#devices"]').count()) > 0,
      "club home: expected #devices CTA",
    );
    const clubOffers = page.locator("[data-club-offer-id]");
    assert((await clubOffers.count()) > 0, "club home: expected at least one available Club offer");
    assert(
      (await clubOffers.first().locator('a[href^="https://isvoi.ru/product/"]').count()) > 0,
      "club home: expected Club offer link to the main catalog",
    );
    assert(
      (await clubOffers.first().locator('a[href*="club_offer="][href$="#club-request"]').count()) >
        0,
      "club home: expected offer selection CTA",
    );
    const deviceRequest = page.locator("input[name='club_device_request']");
    assert(
      (await deviceRequest.count()) > 0 &&
        (await deviceRequest.first().getAttribute("required")) !== null,
      "club home: expected required device selection input",
    );
    const consent = page.locator("input[type='checkbox'][required]");
    assert((await consent.count()) > 0, "club home: expected explicit required consent");

    const robotsResponse = await page.request.get(`${origin}/robots.txt`);
    const robotsText = await robotsResponse.text();
    assert(
      expectedIndexable ? robotsText.includes("Allow: /") : robotsText.includes("Disallow: /"),
      `club home: unexpected robots.txt ${robotsText}`,
    );
    const sitemapResponse = await page.request.get(`${origin}/sitemap.xml`);
    const sitemapText = await sitemapResponse.text();
    assert(
      expectedIndexable
        ? sitemapText.includes("<loc>https://club.isvoi.ru/</loc>")
        : !sitemapText.includes("<loc>"),
      "club home: sitemap visibility does not match Club launch mode",
    );
  }

  const leadForm = page.locator("form:has(input[name='contact'])");
  const leadForms = await leadForm.count();
  if (leadForms > 0) {
    await leadForm.first().waitFor({ state: "visible", timeout: 10_000 });
    await assertLeadHoneypot(leadForm.first(), "home");
  }

  return { route: "/", leadForms, jsonLdTypes: seo.jsonLdTypes.length };
}

async function smokeCatalog(page, baseUrl, requireDirectusAssets, route = "/catalog") {
  const url = joinUrl(baseUrl, route);
  await gotoOk(page, url);
  const visibleText = await page.locator("body").innerText();
  assert(!/б\/у/iu.test(visibleText), `${route}: legacy public condition terminology is visible`);
  assert(
    !visibleText.includes("24 товара на странице"),
    `${route}: static page-size label is presented as a product count`,
  );
  const seo = await assertSeoAndStructuredData(page, route, [
    "Organization",
    "WebSite",
    "BreadcrumbList",
    "ItemList",
  ]);
  const conditionOptions = await page.locator('select[name="condition"] option').allTextContents();
  if (conditionOptions.length > 0) {
    assert(
      conditionOptions.includes("С пробегом") &&
        !conditionOptions.some((item) => /б\/у/iu.test(item)),
      `${route}: condition filter does not follow public terminology`,
    );
  }

  const catalog = page.locator('[data-component="ProductCatalogView"]');
  const expectedSource = process.env.SMOKE_EXPECT_CATALOG_SOURCE;
  if (expectedSource) {
    assert(
      (await catalog.getAttribute("data-catalog-source")) === expectedSource,
      `${route}: expected catalog source ${expectedSource}`,
    );
  }
  const foundMatch = visibleText.match(/Найдено:\s*(\d+)/u);
  const visibleCardCount = await catalog.locator('[data-component="ProductCard"]').count();
  const expectEmpty = process.env.SMOKE_EXPECT_EMPTY_CATALOG === "1";
  if (expectEmpty) {
    assert(visibleCardCount === 0, `${route}: expected no published catalog cards`);
    assert(
      (await catalog.locator('[data-component="CatalogEmptyState"]').count()) === 1,
      `${route}: expected the catalog empty state`,
    );
  } else {
    if (requireDirectusAssets) {
      await waitForDirectusImages(page, 1);
    } else {
      await waitForLoadedImages(page, 1);
    }
    await assertImages(page, route, 1, requireDirectusAssets);
  }
  if (foundMatch) {
    const total = Number(foundMatch[1]);
    assert(
      visibleCardCount === Math.min(total, 24),
      `${route}: found count ${total} does not match ${visibleCardCount} visible cards`,
    );
  }
  const city = await catalog.getAttribute("data-city");
  const citySlug = await catalog.getAttribute("data-city-slug");
  if (city) {
    assert(
      !visibleText.includes(`Сейчас в ${city}`),
      `${route}: city token is used with an unsafe grammatical preposition`,
    );
    const stockOptions = await page
      .locator('select[name="stock"]')
      .first()
      .locator("option")
      .allTextContents();
    assert(
      stockOptions.includes(`${city} · В наличии`),
      `${route}: local availability option is missing for ${city}`,
    );
    assert(
      stockOptions.includes("Доставка из другого города"),
      `${route}: delivery availability option is missing`,
    );
    assert(
      !citySlug ||
        !(await page.locator('[data-component="ProductCard"]').allTextContents()).some((item) =>
          item.toLowerCase().includes(`${citySlug.toLowerCase()} ·`),
        ),
      `${route}: a technical city slug is visible in a product card`,
    );
  }

  const cardCount = await page.locator("a[href^='/product/'], a[href*='/product/']").count();
  if (requireDirectusAssets) {
    const emptyStateCount = await page.locator('[data-component="CatalogEmptyState"]').count();
    assert(
      cardCount > 0 || emptyStateCount > 0,
      `${route}: expected product links or an explicit empty state`,
    );
  }
  return {
    route,
    city: city || undefined,
    directusImages: await countLoadedDirectusImages(page),
    deviceLinks: cardCount,
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function smokeStore(page, baseUrl, requireDirectusAssets) {
  const url = joinUrl(baseUrl, "/store");
  await gotoOk(page, url);
  assert(
    new URL(page.url()).pathname === "/belgorod",
    `store: expected permanent redirect to /belgorod, got ${page.url()}`,
  );
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
  const storePhoto = page.locator('[data-component="CityStorePhoto"] img');
  assert((await storePhoto.count()) === 1, "store: expected one managed city store photo");

  return {
    route: "/store",
    directusImages: await countLoadedDirectusImages(page),
    cityStorePhotos: await storePhoto.count(),
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

  const gallery = page.locator('[data-component="DeviceGallery"]');
  const zoomTrigger = gallery.getByRole("button", { name: /^Увеличить фото:/ });
  assert((await zoomTrigger.count()) === 1, "device: expected one image zoom trigger");
  await zoomTrigger.click();
  const imageViewer = page.locator('[data-component="ProductImageViewer"]');
  await imageViewer.waitFor({ state: "visible", timeout: 10_000 });
  const zoomImage = imageViewer.locator("img");
  await zoomImage.evaluate((image) => image.decode());
  const zoomImageSrc = (await zoomImage.getAttribute("src")) || "";
  if (requireDirectusAssets) {
    assert(
      zoomImageSrc.includes("width=2400") && zoomImageSrc.includes("height=1800"),
      `device: expected a 2400x1800 Directus zoom source, got ${zoomImageSrc}`,
    );
  }
  await imageViewer.getByRole("button", { name: "Увеличить" }).click();
  assert(
    (await imageViewer.getByRole("button", { name: "Сбросить масштаб" }).innerText()) === "1.25×",
    "device: viewer zoom control did not update",
  );
  await page.keyboard.press("Escape");
  await imageViewer.waitFor({ state: "detached" });

  const passportBlocks = await page.locator("text=I СВОИ Passport").count();
  assert(passportBlocks > 0, "device: expected I СВОИ Passport block");
  const storyBlocks = await page.locator('[data-component="DeviceStoryCard"]').count();
  assert(storyBlocks === 1, `device: expected one story block, got ${storyBlocks}`);
  const offerPanel = page.locator('[data-component="ProductOfferPanel"]');
  assert((await offerPanel.count()) === 1, "device: expected a product offer panel");
  const offerLinks = await offerPanel.locator('a[href$="/delivery"]').count();
  if (process.env.SMOKE_REQUIRE_PRODUCT_OFFERS === "1") {
    assert(offerLinks > 0, "device: expected a store-specific product offer");
  }

  const leadForm = page.locator("form:has(input[name='contact']):has(textarea[name='message'])");
  await leadForm.first().waitFor({ state: "visible", timeout: 10_000 });
  const submitButtons = await leadForm.locator("button[type='submit']").count();
  assert(submitButtons > 0, "device: expected lead form submit button");
  await assertLeadHoneypot(leadForm.first(), "device");

  return {
    route: devicePath,
    directusImages: await countLoadedDirectusImages(page),
    passportBlocks,
    storyBlocks,
    offerLinks,
    leadForms: await leadForm.count(),
    imageViewer: true,
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function smokeLegacyDeviceRedirect(baseUrl, productPath) {
  const slug = productPath.split("/").filter(Boolean).at(-1);
  const response = await fetch(joinUrl(baseUrl, `/device/${slug}`), { redirect: "manual" });
  assert(response.status === 301, `legacy device redirect: expected 301, got ${response.status}`);
  const location = response.headers.get("location") || "";
  assert(
    location.endsWith(`/product/${slug}`),
    `legacy device redirect: expected /product/${slug}, got ${location}`,
  );
  return { route: `/device/${slug}`, status: response.status };
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
  const structuredImageCount = await bodyFigures.count();
  assert(structuredImageCount >= 2, "blog article: expected two structured image blocks");
  const imageAlts = await bodyFigures
    .locator("img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("alt") || ""));
  assert(imageAlts.every(Boolean), "blog article: every structured image block needs alt text");
  for (let index = 0; index < structuredImageCount; index += 1) {
    const figure = bodyFigures.nth(index);
    const image = figure.locator("img").first();
    await figure.scrollIntoViewIfNeeded();
    const loaded = await image.evaluate(async (element) => {
      if (element.complete) return element.naturalWidth > 0 && element.naturalHeight > 0;
      await Promise.race([
        new Promise((resolve) => element.addEventListener("load", resolve, { once: true })),
        new Promise((resolve) => element.addEventListener("error", resolve, { once: true })),
        new Promise((resolve) => window.setTimeout(resolve, 10_000)),
      ]);
      return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
    });
    assert(loaded, `blog article: structured image ${index + 1} failed to load`);
  }

  const relatedDevice = page.locator('a[href*="utm_content=related-device"]').first();
  const relatedDeviceCount = await relatedDevice.count();
  if (process.env.SMOKE_REQUIRE_BLOG_RELATED_DEVICE === "1") {
    assert(relatedDeviceCount === 1, "blog article: expected an attributed related-device link");
  }
  if (relatedDeviceCount === 1) {
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
  }

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
    structuredImages: structuredImageCount,
    jsonLdTypes: seo.jsonLdTypes.length,
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  const routes = parseSmokeRoutes(process.env.SMOKE_ROUTES);
  const devicePath = process.env.SMOKE_DEVICE_PATH || DEFAULT_DEVICE_PATH;
  const blogArticlePath = process.env.SMOKE_BLOG_ARTICLE_PATH || DEFAULT_BLOG_ARTICLE_PATH;
  const requireDirectusAssets = shouldRequireDirectusAssets(baseUrl);
  const expectEmptyCatalog = process.env.SMOKE_EXPECT_EMPTY_CATALOG === "1";
  const browser = await launchChromium({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  try {
    const results = [];
    if (routes.length > 0) {
      for (const route of routes) {
        if (route === "/") {
          results.push(await smokeHome(page, baseUrl));
        } else if (route === "/catalog" || route.includes("/catalog")) {
          results.push(await smokeCatalog(page, baseUrl, requireDirectusAssets, route));
        } else if (route === "/store") {
          results.push(await smokeStore(page, baseUrl, requireDirectusAssets));
        } else if (route.startsWith("/product/")) {
          results.push(await smokeDevice(page, baseUrl, route, requireDirectusAssets));
        } else if (route.startsWith("/blog/") && !route.startsWith("/blog/category/")) {
          results.push(await smokeBlogArticle(page, baseUrl, route, requireDirectusAssets));
        } else {
          results.push(await smokeMarketing(page, baseUrl, route));
        }
      }
    } else {
      results.push(await smokeHome(page, baseUrl));
      results.push(await smokeCatalog(page, baseUrl, requireDirectusAssets));
      results.push(await smokeStore(page, baseUrl, requireDirectusAssets));
      for (const route of MARKETING_ROUTES.filter((route) => route !== "/store")) {
        results.push(await smokeMarketing(page, baseUrl, route));
      }
      results.push(await smokeBlogArticle(page, baseUrl, blogArticlePath, requireDirectusAssets));
      if (!expectEmptyCatalog) {
        results.push(await smokeDevice(page, baseUrl, devicePath, requireDirectusAssets));
        results.push(await smokeLegacyDeviceRedirect(baseUrl, devicePath));
      }
    }

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
