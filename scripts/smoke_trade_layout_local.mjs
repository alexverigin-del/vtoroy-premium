// Isolated local UI regression. All CMS data and API writes stay on loopback.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { launchChromium } from "./playwright_browser.mjs";
import { tradeConditionRules, tradePricingConfigsV3 } from "./trade_pricing_v3_data.mjs";
import { createTradeExchangeFixture, tradeExchangeApiCases } from "./trade_exchange_api_cases.mjs";
import {
  mockTradeTurnstile,
  tradeNavigationBrowserCases,
} from "./trade_navigation_browser_cases.mjs";

const root = process.cwd();
const output = path.join(root, "output/playwright/trade-layout");
fs.mkdirSync(output, { recursive: true });
const pages = JSON.parse(fs.readFileSync("apps/web/data/marketing-pages.json", "utf8"));
const snake = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const settings = {
  id: 1,
  status: "published",
  active_pricing_version: { id: "test-v3", version: "test-v3", status: "published" },
  economics_status: "approved",
  tax_treatment_confirmed: true,
  primary_document_status: "approved",
  kkt_workflow_status: "approved",
  economics_approved_by: { id: "test" },
  economics_approved_at: "2026-08-30",
  legal_status: "approved",
  legal_approved_by: { id: "test" },
  legal_approved_at: "2026-08-30",
  quote_disclaimer_short: "Предварительная оценка. Итог — после диагностики.",
  quote_disclaimer_full: "Тестовый текст. Итог — после диагностики.",
  consent_label: "Тестовое согласие",
  consent_text: "Только изолированный UI-тест",
  consent_version: "test-consent",
  consent_url: "/privacy#trade-in-consent",
  privacy_url: "/privacy",
  default_store: { id: "store-test", slug: "belgorod", name: "Тестовый магазин", city: "Белгород" },
};
let active = true;
const modelName = (slug) =>
  slug.replace("iphone", "iPhone").replace("samsung-galaxy", "Samsung Galaxy").replaceAll("-", " ");
const configs = tradePricingConfigsV3.map((item, index) => ({
  id: `config-${index}`,
  base_min: item.baseMin,
  base_max: item.baseMax,
  storage: item.storage,
  sort: item.sort,
  device_model: { id: item.modelSlug, slug: item.modelSlug, name: modelName(item.modelSlug) },
}));
const rules = tradeConditionRules.map((item, index) => ({
  id: `rule-${index}`,
  ...Object.fromEntries(Object.entries(item).map(([k, v]) => [snake(k), v])),
}));
const exchangeFixture = createTradeExchangeFixture();
const cms = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");
  if (exchangeFixture.handle(req, res, url)) return;
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end('{"error":"fixture_is_read_only"}');
    return;
  }
  let data = [];
  if (url.pathname === "/items/trade_settings/1")
    data = { ...settings, status: active ? "published" : "draft" };
  else if (url.pathname === "/items/trade_device_configs") data = configs;
  else if (url.pathname === "/items/trade_condition_rules") data = rules;
  else if (url.pathname === "/items/store_locations")
    data = [{ ...settings.default_store, status: "published", pickup_enabled: true }];
  else if (
    url.pathname === "/items/site_pages" &&
    url.searchParams.get("filter[slug][_eq]") === "trade"
  )
    data = [{ id: "trade-page", slug: "trade", status: "published", title: pages.trade.title }];
  else if (url.pathname === "/items/page_sections")
    data = pages.trade.sections
      .map((s) =>
        Object.fromEntries(
          Object.entries({ ...s, id: s.sectionKey }).map(([k, v]) => [snake(k), v]),
        ),
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  else if (url.pathname === "/items/products")
    data = [
      {
        id: "test-product",
        sku: "UI-TEST",
        product_type: "device",
        condition: "used",
        status: "published",
        content_status: "ready",
        stock_status: "available",
        stock_quantity: 1,
        title: "iPhone 16 Pro Max · тестовая карточка",
        model: "iPhone 16 Pro Max",
        price: 80300,
        price_text: "80 300 ₽",
        brand: { name: "Apple", slug: "apple" },
        device_details: { storage: "512 ГБ", grade: "A", battery_text: "97%" },
      },
    ];
  res.end(JSON.stringify({ data }));
});
await new Promise((r) => cms.listen(0, "127.0.0.1", r));
const cmsUrl = `http://127.0.0.1:${cms.address().port}`;
// Reserve a loopback port; never use production credentials or flags from the parent.
const port = Number(process.env.TRADE_LAYOUT_TEST_PORT || 3417);
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
      DIRECTUS_TRADE_TOKEN: "local-fixture",
      DIRECTUS_LEADS_TOKEN: "local-fixture",
      TURNSTILE_SECRET_KEY: "",
      TRADE_WIZARD_ENABLED: "1",
      TRADE_QA_ENABLED: "0",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "local-fixture-site-key",
      CATALOG_SOURCE: "v3",
    },
  },
);
let browser;
try {
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw Error("Local Next server exited; inspect next.log");
    try {
      const response = await fetch(base + "/trade", { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      if (response.ok && app.exitCode === null) break;
    } catch {}
    if (i === 119) throw Error("Local server did not become ready");
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await launchChromium({ headless: true });
  await tradeExchangeApiCases(base, exchangeFixture);
  await tradeNavigationBrowserCases(browser, base, output);
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await mockTradeTurnstile(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/trade/events", (r) => r.fulfill({ json: { ok: true } }));
    await page.route("**/lead-intake", (r) =>
      r.fulfill({ json: { ok: true, reference_code: "TEST-LOCAL" } }),
    );
    await page.goto(base + "/trade", { waitUntil: "networkidle" });
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("#trade-calculator").count(), 1);
    assert(await page.evaluate(() => window.scrollY < 10), "Opening must not auto-scroll");
    assert.equal(
      await page.getByRole("heading", { name: "Оцените свой смартфон онлайн", level: 2 }).count(),
      1,
    );
    assert.equal(await page.getByLabel("Категория", { exact: true }).count(), 0);
    assert.equal(await page.locator('optgroup[label="Samsung"] option').count(), 3);
    const headings = await page.locator("main h2").allTextContents();
    assert(
      headings.indexOf("Что будет после онлайн-оценки") <
        headings.indexOf("Как считается доплата при обмене"),
    );
    assert(!(await page.locator("main").innerText()).includes("42 000"));
    await page.screenshot({ path: path.join(output, `${name}-hero.png`) });
    await page.getByRole("link", { name: "Оценить смартфон", exact: true }).click();
    assert(
      await page.locator("#trade-calculator-heading").evaluate((e) => e === document.activeElement),
    );
    assert(
      (await page.locator("#trade-calculator").boundingBox()).y >= 60,
      "Anchor hidden behind header",
    );
    await page.screenshot({ path: path.join(output, `${name}-calculator.png`) });
    await page.getByLabel("Модель", { exact: true }).selectOption("samsung-galaxy-s24-ultra");
    const memory = await page
      .getByLabel("Память", { exact: true })
      .locator("option")
      .last()
      .getAttribute("value");
    await page.getByLabel("Память", { exact: true }).selectOption(memory);
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("heading", { name: "В каком состоянии устройство?" }).waitFor();
    assert(
      await page.locator("#trade-calculator h3").evaluate((e) => e === document.activeElement),
    );
    await page.getByRole("link", { name: "Получить оценку", exact: true }).click();
    assert.equal(
      await page.getByRole("heading", { name: "В каком состоянии устройство?" }).count(),
      1,
      "CTA must preserve step",
    );
    await page.goBack();
    await page.getByRole("heading", { name: "Какой смартфон вы хотите оценить?" }).waitFor();
    assert.equal(
      await page.getByLabel("Модель", { exact: true }).inputValue(),
      "samsung-galaxy-s24-ultra",
    );
    await page.goForward();
    await page.getByRole("heading", { name: "В каком состоянии устройство?" }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.getByRole("heading", { name: "В каком состоянии устройство?" }).count(),
      1,
      "Reload must restore step",
    );
    await page.getByRole("button", { name: "Изменить", exact: true }).click();
    assert.equal(
      await page.getByLabel("Модель", { exact: true }).inputValue(),
      "samsung-galaxy-s24-ultra",
    );
    await page.getByRole("link", { name: "Обсудить комиссию", exact: true }).click();
    assert.match(await page.locator('#final select[name="scenario"]').inputValue(), /комисси/iu);
    await page.getByRole("link", { name: "Оценить смартфон", exact: true }).click();
    await page.getByRole("button", { name: "Не нашли свою модель?" }).click();
    await page.getByRole("heading", { name: "Оценим устройство вручную" }).waitFor();
    const calculator = page.locator("#trade-calculator");
    await calculator.getByLabel("Опишите устройство").fill("Локальный UI-тест устройства");
    await calculator.locator('input[type="tel"]').fill("+79990000000");
    await calculator.getByRole("checkbox").check();
    await calculator.getByRole("button", { name: "Отправить на оценку", exact: true }).click();
    await calculator.getByRole("heading", { name: "Заявка отправлена" }).waitFor();
    assert.equal(await calculator.getByText("TEST-LOCAL", { exact: true }).count(), 1);
    assert((await calculator.locator("dl").innerText()).includes("Локальный UI-тест устройства"));
    const savedSession = await page.evaluate(() => JSON.stringify(sessionStorage));
    assert(!savedSession.includes("79990000000"), "Contact must not be persisted");
    assert(
      !savedSession.includes("Локальный UI-тест устройства"),
      "Free text must not be persisted",
    );
    await page.reload({ waitUntil: "networkidle" });
    await calculator.getByRole("heading", { name: "Какой смартфон вы хотите оценить?" }).waitFor();
    assert.equal(
      await page.getByText("Ваша техника уже чего-то стоит.", { exact: true }).count(),
      0,
    );
    await page.getByText("Сравнить время, переговоры и проверку", { exact: true }).click();
    assert.equal(await page.locator("main details").getAttribute("open"), "");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "Horizontal overflow",
    );
    assert.deepEqual(errors, [], "Browser errors / hydration mismatch");
    console.log(
      `${name}: heading/order, no auto-scroll, anchors, brands, restore, manual/commission, local submission, comparison OK`,
    );
    await context.close();
  }
  active = false;
  const page = await browser.newPage();
  await mockTradeTurnstile(page.context());
  await page.goto(base + "/trade", { waitUntil: "networkidle" });
  assert.equal(await page.locator("#trade-calculator").count(), 0);
  for (const name of ["Оценить смартфон", "Получить оценку"]) {
    assert.equal(
      await page.getByRole("link", { name, exact: true }).getAttribute("href"),
      "#final",
    );
  }
  assert.equal(await page.locator("#final form").count(), 1);
  console.log("Inactive settings: calculator absent, CTA fallback and legacy form OK");
} catch (error) {
  const failedPage = browser?.contexts().at(-1)?.pages().at(-1);
  if (failedPage)
    await failedPage
      .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
      .catch(() => {});
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
  console.log("Local fixture cleanup complete");
}
