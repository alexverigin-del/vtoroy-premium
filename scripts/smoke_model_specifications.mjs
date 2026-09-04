#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchChromium } from "./playwright_browser.mjs";

const base = process.env.SMOKE_BASE_URL || "https://isvoi.ru";
const output = path.resolve("output/playwright/model-specifications");
const labels = ["Экран", "Чип", "Камеры", "Разъём и зарядка", "Интерфейсы", "Защита модели", "Размеры и вес"];
const samples = ["iphone-15-pro-black-titanium", "samsung-galaxy-s22-ultra", "samsung-galaxy-s23-ultra", "samsung-galaxy-s24-ultra"];
const browser = await launchChromium({ headless: true });
const results = [];
try {
  await fs.mkdir(output, { recursive: true });
  const page = await browser.newPage();
  const catalogResponse = await page.goto(`${base}/catalog`, { waitUntil: "load" });
  assert(catalogResponse?.ok(), "Catalog request failed");
  const routes = [...new Set(await page.locator('a[href^="/product/"]').evaluateAll(
    (links) => links.map((link) => new URL(link.href).pathname),
  ))];
  assert(routes.length > 0, "No catalog products found");
  const minimum = Number(process.env.SMOKE_EXPECT_MIN_PRODUCTS || 1);
  assert(routes.length >= minimum, `Expected at least ${minimum} products, found ${routes.length}`);
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 30000 });
      assert(response?.ok(), `${route}: HTTP ${response?.status()}`);
      const reject = page.getByRole("button", { name: /^(Только необходимые|Отклонить необязательные)$/ });
      if (await reject.isVisible()) await reject.click();
      const heading = page.getByRole("heading", { name: "Технические характеристики модели", exact: true });
      assert.equal(await heading.count(), 1, `${route}: missing/duplicate model heading`);
      const section = heading.locator("..");
      await section.scrollIntoViewIfNeeded();
      assert.deepEqual(await section.locator("dt").allTextContents(), labels, `${route}: specification labels`);
      const values = await section.locator("dd").allTextContents();
      assert(values.length === 7 && values.every((value) => value.trim()), `${route}: empty specification`);
      assert((await section.textContent()).includes("не является гарантией влагозащиты"), `${route}: missing disclaimer`);
      const overflow = await section.evaluate((element) => {
        const rootOverflow = document.documentElement.scrollWidth > innerWidth + 4;
        const cells = Array.from(element.querySelectorAll("dt,dd"));
        return rootOverflow || cells.some((cell) => cell.scrollWidth > cell.clientWidth + 2);
      });
      assert(!overflow, `${route}: overflow at ${viewport.width}px`);
      if (samples.some((sample) => route.includes(sample))) {
        await section.screenshot({ path: path.join(output, `${viewport.width}-${route.split("/").pop()}.png`) });
      }
      results.push({ route, width: viewport.width, specifications: values.length });
      console.log(`PASS ${viewport.width}px ${route}: ${values.length} specifications`);
    }
  }
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
} finally {
  await browser.close();
}
