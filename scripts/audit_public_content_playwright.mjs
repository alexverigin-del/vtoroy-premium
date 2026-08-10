#!/usr/bin/env node

import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const baseUrl = String(process.env.SMOKE_BASE_URL || "https://isvoi.ru").replace(/\/+$/, "");
const defaultRoutes = [
  "/",
  "/catalog",
  "/store",
  "/passport",
  "/trade",
  "/club",
  "/product/iphone-13-pro",
  "/product/iphone-14",
  "/product/macbook-air-m1",
  "/product/ipad-air",
  "/blog",
  "/blog/chto-pokazyvaet-diagnostika-iphone",
  "/blog/kak-proverit-batareyu-iphone",
  "/blog/kak-ponyat-kakie-detali-menyali-v-iphone",
];
const routes = process.env.SMOKE_ROUTES
  ? process.env.SMOKE_ROUTES.split(",")
      .map((route) => route.trim())
      .filter(Boolean)
  : defaultRoutes;

const globalBannedPatterns = [
  { label: "retired update-value term", pattern: /(?:ориентир|цена)\s+выхода/iu },
  { label: "legacy ISVOI spelling", pattern: /\bISVOI\b/u },
  { label: "damaged question-mark placeholder", pattern: /\?{5,}/u },
];

function pathFromHref(href) {
  if (!href) return "";
  const url = new URL(href, baseUrl);
  return `${url.pathname}${url.hash}`;
}

function routeIssues(route, data) {
  const issues = [];
  const visibleText = `${data.title} ${data.mainText} ${data.footerText}`;

  if (data.status !== 200) issues.push(`HTTP ${data.status}`);
  if (data.h1.length !== 1) issues.push(`expected one H1, found ${data.h1.length}`);
  if (route !== "/club" && data.headerText.includes("Club")) {
    issues.push("Club is present in the primary header");
  }
  if (
    route !== "/club" &&
    !data.headerActions.some(
      (action) => action.text === "Смотреть каталог" && pathFromHref(action.href) === "/catalog",
    )
  ) {
    issues.push('header CTA must be "Смотреть каталог" → /catalog');
  }

  for (const { label, pattern } of globalBannedPatterns) {
    if (pattern.test(visibleText)) issues.push(label);
  }

  if (route === "/catalog") {
    if (data.h1[0] !== "Техника и аксессуары в наличии.") {
      issues.push("catalog H1 does not state the universal Catalog V3 offer");
    }
    if (data.mainText.includes("Для Club")) issues.push("catalog exposes a Club filter");
    const productLinks = data.mainActions.filter((action) => /\/product\//.test(action.href));
    if (productLinks.length === 0) issues.push("catalog has no product links");
    if (
      productLinks.some(
        (action) =>
          !["Записаться на просмотр", "Забронировать", "Узнать о поступлении"].some((label) =>
            action.text.includes(label),
          ),
      )
    ) {
      issues.push("catalog card CTA does not match the product state");
    }
  }

  if (route === "/store" && /\bClub\b/u.test(data.mainText)) {
    issues.push("Store still promotes Club in the purchase journey");
  }

  if (route === "/trade") {
    if (data.forms.length !== 1)
      issues.push(`Trade must have one form, found ${data.forms.length}`);
    const scenarios = data.forms[0]?.options ?? [];
    for (const expected of ["Продать устройство", "Обменять с доплатой", "Передать на комиссию"]) {
      if (!scenarios.includes(expected)) issues.push(`Trade scenario is missing: ${expected}`);
    }
    if (data.mainActions.some((action) => pathFromHref(action.href) === "/#final")) {
      issues.push("Trade CTA leaves the Trade form for the homepage form");
    }
  }

  if (route === "/club") {
    if (
      data.h2.some((heading) => /Аккуратность улучшает|случайный рынок или Club/iu.test(heading))
    ) {
      issues.push("unverified Club rating/comparison section is visible");
    }
    if (
      data.mainActions.some((action) =>
        /Узнать условия Club|Войти в Club|Войдите в Club/iu.test(action.text),
      )
    ) {
      issues.push('Club CTA must say "Узнать условия пилота"');
    }
  }

  if (route.startsWith("/product/")) {
    const expectedCta = `Записаться на просмотр ${data.h1[0]?.split(" · ")[0] || ""}`.trim();
    if (!data.mainActions.some((action) => action.text === expectedCta)) {
      issues.push(`device CTA must be "${expectedCta}"`);
    }
    if (data.forms.length !== 1)
      issues.push(`device must have one lead form, found ${data.forms.length}`);
  }

  return issues;
}

let browser;
const failures = [];

try {
  browser = await launchChromium({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  for (const route of routes) {
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    const data = await page.evaluate(() => {
      const actions = (root) =>
        [...root.querySelectorAll("a, button")]
          .map((node) => ({
            text: (node.innerText || node.getAttribute("aria-label") || "")
              .trim()
              .replace(/\s+/g, " "),
            href: "href" in node ? node.href : "",
          }))
          .filter(({ text }) => text);

      const text = (selector) =>
        document.querySelector(selector)?.innerText.trim().replace(/\s+/g, " ") || "";

      return {
        title: document.title,
        h1: [...document.querySelectorAll("h1")].map((node) => node.innerText.trim()),
        h2: [...document.querySelectorAll("main h2")].map((node) => node.innerText.trim()),
        headerText: text("header"),
        mainText: text("main"),
        footerText: text("footer"),
        headerActions: actions(document.querySelector("header") || document),
        mainActions: actions(document.querySelector("main") || document),
        forms: [...document.querySelectorAll("main form")].map((form) => ({
          action: form.action,
          options: [...form.querySelectorAll('select[name="scenario"] option')].map((option) =>
            option.textContent.trim(),
          ),
          fields: [...form.elements].map((element) => element.name).filter(Boolean),
        })),
      };
    });
    const result = { route, status: response?.status() ?? 0, ...data };
    const issues = routeIssues(route, result);
    if (issues.length > 0) failures.push({ route, issues });
    console.log(
      `${issues.length === 0 ? "ok" : "fail"} ${route}${issues.length ? ` — ${issues.join("; ")}` : ""}`,
    );
  }
} catch (error) {
  console.error(error?.message || error);
  if (/Executable doesn't exist|browserType\.launch/i.test(String(error?.message || error))) {
    console.error(playwrightBrowserHint());
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
}

if (failures.length > 0) {
  console.error(`Public content consistency audit failed: ${failures.length} route(s).`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log(`Public content consistency audit passed for ${baseUrl}`);
}
