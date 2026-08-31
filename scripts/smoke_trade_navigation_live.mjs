// Public UI smoke: never creates real quotes, leads or funnel events.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchChromium } from "./playwright_browser.mjs";

const base = (process.env.SMOKE_BASE_URL || "https://isvoi.ru").replace(/\/+$/, "");
const output = path.resolve("output/playwright/trade-navigation-production");
await fs.mkdir(output, { recursive: true });
const browser = await launchChromium({ headless: true });
try {
  for (const [name, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    let unexpectedWrites = 0;
    await context.route("**/api/trade/events", (route) => route.fulfill({ json: { ok: true } }));
    for (const pattern of ["**/lead-intake", "**/api/trade/quote"]) {
      await context.route(pattern, (route) => {
        unexpectedWrites++;
        return route.abort();
      });
    }
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.request.get(`${base}/api/trade/config`);
    assert(response.ok(), "Public config unavailable");
    const config = await response.json();
    assert.equal(config.active, true);
    const device = config.devices[0];
    assert(device && config.questions.length, "Published devices/questions missing");
    await page.goto(`${base}/trade`, { waitUntil: "load" });
    const calculator = page.locator("#trade-calculator");
    await calculator.getByRole("heading", { name: "Какой смартфон вы хотите оценить?" }).waitFor();
    const originalRun = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("isvoi.trade.v1")).runId,
    );
    await calculator.getByLabel("Модель", { exact: true }).selectOption(device.deviceModelId);
    await calculator.getByLabel("Память", { exact: true }).selectOption(device.id);
    await calculator.getByRole("button", { name: "Продолжить", exact: true }).click();
    await calculator.getByRole("heading", { name: "В каком состоянии устройство?" }).waitFor();
    const radio = calculator.locator('input[type="radio"]').first();
    await radio.locator("..").click();
    await calculator.getByRole("button", { name: "← Назад", exact: true }).click();
    await calculator.getByLabel("Модель", { exact: true }).waitFor();
    assert.equal(
      await calculator.getByLabel("Модель", { exact: true }).inputValue(),
      device.deviceModelId,
    );
    assert.equal(await calculator.getByLabel("Память", { exact: true }).inputValue(), device.id);
    await calculator.getByRole("button", { name: "Продолжить", exact: true }).click();
    await radio.waitFor({ state: "attached" });
    assert(await radio.isChecked(), "Back must preserve the selected answer");
    await calculator.getByRole("button", { name: "Начать заново", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Начать оценку заново?" });
    await dialog.waitFor();
    assert(
      await dialog
        .getByRole("button", { name: "Продолжить текущую оценку" })
        .evaluate((element) => element === document.activeElement),
    );
    await page.screenshot({ path: path.join(output, `${name}-reset.png`) });
    await page.keyboard.press("Escape");
    assert(await radio.isChecked(), "Cancel must preserve the selected answer");
    await calculator.getByRole("button", { name: "Начать заново", exact: true }).click();
    await dialog.getByRole("button", { name: "Начать заново", exact: true }).click();
    await calculator.getByLabel("Модель", { exact: true }).waitFor();
    assert.equal(await calculator.getByLabel("Модель", { exact: true }).inputValue(), "");
    const resetRun = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("isvoi.trade.v1")).runId,
    );
    assert.notEqual(resetRun, originalRun);
    await page.goBack();
    await calculator.getByLabel("Модель", { exact: true }).waitFor();
    assert.equal(await calculator.getByLabel("Модель", { exact: true }).inputValue(), "");
    await calculator.getByRole("button", { name: "Не нашли свою модель?" }).click();
    await calculator.getByLabel("Опишите устройство").fill("Проверка навигации, без отправки");
    await page.reload({ waitUntil: "load" });
    await calculator.getByLabel("Опишите устройство").waitFor();
    assert.equal(await calculator.getByLabel("Опишите устройство").inputValue(), "");
    assert.equal(await calculator.locator('input[type="tel"]').inputValue(), "");
    assert(!(await calculator.getByRole("checkbox").isChecked()));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.equal(unexpectedWrites, 0, "Read-only UI smoke attempted a quote/lead write");
    await page.screenshot({ path: path.join(output, `${name}-manual.png`) });
    console.log(
      `${name}: live navigation/back/answers/reset/Escape/stale-history/restore passed; zero quote/lead writes`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
