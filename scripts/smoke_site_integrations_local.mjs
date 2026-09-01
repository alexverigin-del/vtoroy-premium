// Isolated browser regression for consent-gated integrations. All CMS data and
// third-party requests stay in fixture memory or are intercepted by Playwright.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

import { launchChromium } from "./playwright_browser.mjs";

const root = process.cwd();
const output = path.join(root, "output/playwright/site-integrations");
fs.mkdirSync(output, { recursive: true });

const consentSettings = {
  id: 1,
  version: "browser-test-v1",
  retention_days: 180,
  banner_title: "Настройки приватности",
  banner_body: "Тестовый выбор необязательных сервисов.",
  accept_all_label: "Принять все",
  reject_optional_label: "Только необходимые",
  customize_label: "Настроить",
  settings_title: "Категории сервисов",
  settings_body: "Выберите категории для изолированного теста.",
  save_label: "Сохранить выбор",
  close_label: "Закрыть",
  footer_link_label: "Настройки cookies",
  privacy_link_label: "Подробнее о данных",
  necessary_label: "Необходимые",
  necessary_description: "Базовая работа.",
  analytics_label: "Аналитика",
  analytics_description: "Тестовая аналитика.",
  marketing_label: "Маркетинг",
  marketing_description: "Тестовый маркетинг.",
  support_label: "Поддержка и чаты",
  support_description: "Тестовый чат.",
};

const integrations = [
  {
    id: "browser-metrika",
    status: "published",
    name: "Browser Metrika",
    provider: "yandex_metrika",
    consent_category: "analytics",
    load_strategy: "after_interactive",
    provider_settings: {
      counterId: "123456",
      webvisor: false,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    },
    hostnames: ["127.0.0.1"],
    include_paths: ["/catalog", "/product"],
    exclude_paths: [],
    sort: 1,
  },
  {
    id: "browser-chat",
    status: "published",
    name: "Browser Chat",
    provider: "custom",
    consent_category: "support",
    load_strategy: "after_interactive",
    provider_settings: {},
    script_url: "https://chat.example/widget.js",
    bootstrap_code: "window.__isvoiChatBootstrapped = true;",
    cleanup_code: "delete window.__isvoiChatBootstrapped;",
    hostnames: ["127.0.0.1"],
    include_paths: ["/catalog"],
    exclude_paths: [],
    sort: 2,
  },
];

const catalogDevice = {
  id: "browser-device",
  status: "published",
  sort: 1,
  tags: [],
  category: "iphone",
  brand: "Apple",
  title: "Тестовый iPhone",
  model: "iPhone",
  specs: "128 ГБ",
  storage: "128 ГБ",
  color: "Графитовый",
  price: 50000,
  price_text: "50 000 ₽",
  grade: "A",
  battery: "90%",
  battery_text: "Аккумулятор 90%",
  warranty: "12 месяцев",
  warranty_text: "Гарантия 12 месяцев",
  exit_text: "Проверен",
  stock_status: "available",
  content_status: "ready",
  listing_alt: "Тестовый iPhone",
  cta_label: "Подробнее",
  has_detail_page: true,
  detail_href: "/product/browser-device",
  gallery: [],
  passport: {},
  trade: { options: [] },
};

const cms = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");
  let data = [];
  if (url.pathname === "/items/site_integrations") data = integrations;
  else if (url.pathname === "/items/integration_consent_settings") data = consentSettings;
  else if (url.pathname === "/items/site_settings")
    data = [{ id: 1, brand_name: "I СВОИ", privacy_url: "/privacy" }];
  else if (url.pathname === "/items/devices") data = [catalogDevice];
  res.end(JSON.stringify({ data }));
});
await new Promise((resolve) => cms.listen(0, "127.0.0.1", resolve));
const cmsUrl = `http://127.0.0.1:${cms.address().port}`;

const port = Number(process.env.SITE_INTEGRATIONS_TEST_PORT || 3421);
const base = `http://127.0.0.1:${port}`;
const portProbe = createServer();
await new Promise((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(port, "127.0.0.1", resolve);
});
await new Promise((resolve) => portProbe.close(resolve));

const log = fs.openSync(path.join(output, "next.log"), "w");
const app = spawn(
  process.execPath,
  [path.join(root, "scripts/trade_local_server.cjs"), String(port)],
  {
    cwd: path.join(root, "apps/web"),
    stdio: ["ignore", log, log],
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      NODE_OPTIONS: "--no-experimental-strip-types",
      DIRECTUS_URL: cmsUrl,
      NEXT_PUBLIC_DIRECTUS_URL: cmsUrl,
      DIRECTUS_TOKEN: "local-fixture",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      CATALOG_SOURCE: "legacy",
    },
  },
);

let browser;
try {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (app.exitCode !== null) throw new Error("Local Next server exited; inspect next.log");
    try {
      const response = await fetch(`${base}/catalog`, { signal: AbortSignal.timeout(15_000) });
      await response.arrayBuffer();
      if (response.ok) break;
    } catch {}
    if (attempt === 119) throw new Error("Local Next server did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  browser = await launchChromium({ headless: true });

  const createPage = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://mc.yandex.ru/metrika/tag.js", async (route) => {
      requests.push("metrika");
      await route.fulfill({
        contentType: "application/javascript",
        body: `(() => {
          const queued = window.ym && window.ym.a ? window.ym.a.slice() : [];
          window.__isvoiYmCalls = queued;
          window.ym = (...args) => window.__isvoiYmCalls.push(args);
        })();`,
      });
    });
    await page.route("https://chat.example/widget.js", async (route) => {
      requests.push("chat");
      await route.fulfill({
        contentType: "application/javascript",
        body: "window.__chatSourceLoaded=true;",
      });
    });
    return { context, page, requests, errors };
  };

  {
    const { context, page, requests, errors } = await createPage();
    await page.goto(`${base}/catalog`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: consentSettings.banner_title }).waitFor();
    assert.deepEqual(requests, [], "No integration request is allowed before consent");
    assert.equal(
      await page.locator("main").count(),
      1,
      "Consent banner must not replace main content",
    );

    await page.getByRole("button", { name: consentSettings.customize_label }).click();
    const dialog = page.getByRole("dialog", { name: consentSettings.settings_title });
    await dialog.waitFor();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      consentSettings.save_label,
      "Shift+Tab must wrap focus to the final dialog control",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
      consentSettings.close_label,
      "Tab must wrap focus back to the close control",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: consentSettings.customize_label }).click();
    await dialog.getByRole("checkbox", { name: /Аналитика/ }).check();
    await dialog.getByRole("button", { name: consentSettings.save_label }).click();

    await page.waitForFunction(() => Array.isArray(window.__isvoiYmCalls));
    assert.deepEqual(requests, ["metrika"], "Analytics consent must not load the chat");
    const calls = await page.evaluate(() => window.__isvoiYmCalls);
    assert.equal(calls.filter((call) => call[1] === "init").length, 1);
    assert.equal(calls.filter((call) => call[1] === "hit").length, 1);
    await page.locator('a[href^="/product/"]').first().click();
    await page.waitForURL(/\/product\//);
    await page.waitForFunction(
      () => window.__isvoiYmCalls?.filter((call) => call[1] === "hit").length === 2,
    );
    const routeCalls = await page.evaluate(() => window.__isvoiYmCalls);
    assert.equal(routeCalls.filter((call) => call[1] === "hit").length, 2);
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, requests, errors } = await createPage();
    await page.goto(`${base}/catalog`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: consentSettings.customize_label }).click();
    const dialog = page.getByRole("dialog", { name: consentSettings.settings_title });
    await dialog.getByText(consentSettings.support_label, { exact: true }).click();
    await dialog.getByRole("button", { name: consentSettings.save_label }).click();
    await page.waitForFunction(() => window.__isvoiChatBootstrapped === true);
    assert.deepEqual(requests, ["chat"]);

    const productLink = page.locator('a[href^="/product/"]').first();
    await productLink.click();
    await page.waitForURL(/\/product\//);
    await page.waitForFunction(() => window.__isvoiChatBootstrapped === undefined);

    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__isvoiChatBootstrapped === true);
    await page.getByRole("button", { name: consentSettings.footer_link_label }).click();
    const settingsDialog = page.getByRole("dialog", { name: consentSettings.settings_title });
    await settingsDialog.getByText(consentSettings.support_label, { exact: true }).click();
    await settingsDialog.getByRole("button", { name: consentSettings.save_label }).click();
    await page.waitForLoadState("domcontentloaded");
    assert.equal(await page.evaluate(() => window.__isvoiChatBootstrapped), undefined);
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, requests } = await createPage();
    await page.goto(`${base}/catalog`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: consentSettings.reject_optional_label }).click();
    await page.waitForTimeout(100);
    assert.deepEqual(requests, [], "Rejecting optional services must stay network-silent");
    await context.close();
  }

  console.log(
    "Site integrations browser smoke passed: consent, categories, SPA cleanup and revoke.",
  );
} catch (error) {
  const failedPage = browser?.contexts().at(-1)?.pages().at(-1);
  if (failedPage) {
    await failedPage
      .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (app.exitCode === null) {
    const exited = once(app, "exit");
    app.kill("SIGTERM");
    await exited;
  }
  cms.close();
  cms.closeAllConnections();
  fs.closeSync(log);
  console.log("Site integrations fixture cleanup complete.");
}
