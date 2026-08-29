#!/usr/bin/env node

import process from "node:process";
import { launchChromium, playwrightBrowserHint } from "./playwright_browser.mjs";

const baseUrl = (process.env.SMOKE_BASE_URL || "https://isvoi.ru").replace(/\/+$/, "");
const secret = (process.env.TRADE_QA_SECRET || "").trim();
if (secret.length < 32) throw new Error("TRADE_QA_SECRET with at least 32 characters is required.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await launchChromium({ headless: true });
  try {
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const publicConfig = await publicPage.request.get(`${baseUrl}/api/trade/config`);
    assert(
      publicConfig.status() === 503,
      `public config must stay closed, got ${publicConfig.status()}`,
    );
    assert(
      (await publicConfig.json()).active === false,
      "public config unexpectedly became active",
    );
    await publicPage.goto(`${baseUrl}/trade`, { waitUntil: "load" });
    assert(
      (await publicPage.locator("#trade-calculator").count()) === 0,
      "public wizard is visible",
    );
    await publicContext.close();

    const qaContext = await browser.newContext();
    const qaPage = await qaContext.newPage();
    await qaPage.goto(`${baseUrl}/trade/qa`, { waitUntil: "load" });
    assert(
      (await qaPage.getByText("Внутренняя приёмка", { exact: true }).count()) === 1,
      "QA login is missing",
    );
    await qaPage.getByLabel("Код доступа").fill(secret);
    await qaPage.getByRole("button", { name: "Открыть QA" }).click({ noWaitAfter: true });
    await qaPage.locator("#trade-calculator").waitFor({ state: "visible" });

    const configResponse = await qaPage.request.get(`${baseUrl}/api/trade/config`);
    assert(configResponse.ok(), `QA config failed with ${configResponse.status()}`);
    const config = await configResponse.json();
    assert(config.active === true, "QA config is inactive");
    assert(config.devices.length === 19, `expected 19 QA configs, got ${config.devices.length}`);
    assert(
      config.questions.length === 7,
      `expected 7 QA questions, got ${config.questions.length}`,
    );

    const selected = config.devices[0];
    const answers = Object.fromEntries(
      config.questions.map((question) => [
        question.key,
        question.key === "has_damage" ||
        question.key === "was_repaired" ||
        question.key === "battery_risk"
          ? "no"
          : "yes",
      ]),
    );
    const quoteResponse = await qaPage.request.post(`${baseUrl}/api/trade/quote`, {
      data: {
        deviceModelId: selected.deviceModelId,
        configurationId: selected.id,
        answers,
      },
    });
    assert(quoteResponse.ok(), `QA quote failed with ${quoteResponse.status()}`);
    const quote = await quoteResponse.json();
    assert(quote.ok === true && quote.quote?.id, "QA quote id is missing");
    assert(quote.quote.pricingVersion === config.pricingVersion, "QA pricing version mismatch");

    await qaPage.getByRole("button", { name: "Завершить QA" }).click();
    await qaPage.getByText("Внутренняя приёмка", { exact: true }).waitFor();
    console.log(
      `Trade QA smoke passed for ${baseUrl}: 19 configs, 7 questions, test quote created`,
    );
    await qaContext.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (String(error.message || "").includes("Executable doesn't exist")) {
    console.error(playwrightBrowserHint());
  }
  console.error(`Trade QA smoke failed: ${error.message}`);
  process.exit(1);
});
