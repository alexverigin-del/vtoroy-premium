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
    assert(
      config.pricingVersion === "trade-pricing-v2-draft",
      `expected trade-pricing-v2-draft, got ${config.pricingVersion}`,
    );
    assert(config.devices.length === 19, `expected 19 QA configs, got ${config.devices.length}`);
    assert(
      config.questions.length === 7,
      `expected 7 QA questions, got ${config.questions.length}`,
    );

    const baselineAnswers = Object.fromEntries(
      config.questions.map((question) => [
        question.key,
        question.key === "has_damage" ||
        question.key === "was_repaired" ||
        question.key === "battery_risk"
          ? "no"
          : "yes",
      ]),
    );
    const controls = [
      ["iphone-13-pro", "128 ГБ", {}, [18_000, 20_000]],
      ["iphone-14-pro", "256 ГБ", { has_damage: "yes" }, [16_500, 22_500]],
      ["iphone-14-pro-max", "512 ГБ", { has_damage: "unknown" }, [23_500, 29_000]],
      ["iphone-16-pro", "256 ГБ", {}, [40_500, 45_500]],
      ["iphone-16-pro-max", "1 ТБ", { has_damage: "yes" }, [43_000, 52_000]],
      ["iphone-14-pro", "128 ГБ", { powers_on: "no" }, "manual_evaluation_required"],
      ["iphone-14-pro-max", "256 ГБ", { display_works: "no" }, "manual_evaluation_required"],
      ["iphone-16-pro", "512 ГБ", { was_repaired: "unknown" }, "manual_evaluation_required"],
      ["iphone-16-pro-max", "512 ГБ", { battery_risk: "yes" }, "safety_stop"],
      ["iphone-13-pro", "256 ГБ", { account_removed: "no" }, [19_500, 22_000]],
    ];

    for (const [modelSlug, storage, answerOverrides, expected] of controls) {
      const selected = config.devices.find(
        (device) => device.modelSlug === modelSlug && device.storage === storage,
      );
      assert(selected, `QA config is missing ${modelSlug} ${storage}`);
      const quoteResponse = await qaPage.request.post(`${baseUrl}/api/trade/quote`, {
        data: {
          deviceModelId: selected.deviceModelId,
          configurationId: selected.id,
          answers: { ...baselineAnswers, ...answerOverrides },
        },
      });
      const payload = await quoteResponse.json();
      if (typeof expected === "string") {
        assert(
          quoteResponse.status() === 422 && payload.error === expected,
          `${modelSlug} ${storage}: expected ${expected}, got ${quoteResponse.status()} ${payload.error}`,
        );
        continue;
      }
      assert(
        quoteResponse.ok(),
        `${modelSlug} ${storage}: quote failed with ${quoteResponse.status()}`,
      );
      assert(
        payload.ok === true && payload.quote?.id,
        `${modelSlug} ${storage}: quote id is missing`,
      );
      assert(
        payload.quote.range.min === expected[0] && payload.quote.range.max === expected[1],
        `${modelSlug} ${storage}: expected ${expected.join("–")}, got ${payload.quote.range.min}–${payload.quote.range.max}`,
      );
      assert(
        payload.quote.pricingVersion === config.pricingVersion,
        `${modelSlug} ${storage}: pricing version mismatch`,
      );
    }

    const invalidPhoneResponse = await qaPage.request.post(`${baseUrl}/lead-intake`, {
      data: {
        kind: "trade",
        scenario: "manual_evaluation",
        contact_channel: "phone",
        contact: "not-a-phone",
        device: "QA phone validation smoke",
        idempotency_key: "trade-qa-invalid-phone-smoke-v1",
        source: "/trade/qa",
      },
    });
    const invalidPhonePayload = await invalidPhoneResponse.json();
    assert(
      invalidPhoneResponse.status() === 400 &&
        invalidPhonePayload.ok === false &&
        invalidPhonePayload.error === "validation_error",
      `invalid QA phone must be rejected, got ${invalidPhoneResponse.status()} ${invalidPhonePayload.error}`,
    );

    const validLeadData = {
      kind: "trade",
      scenario: "manual_evaluation",
      contact_channel: "phone",
      contact: "+7 900 000-00-00",
      device: "QA phone validation smoke",
      idempotency_key: "trade-qa-valid-phone-smoke-v1",
      source: "/trade/qa",
    };
    const validPhoneResponse = await qaPage.request.post(`${baseUrl}/lead-intake`, {
      data: validLeadData,
    });
    const validPhonePayload = await validPhoneResponse.json();
    assert(
      validPhoneResponse.ok() &&
        validPhonePayload.ok === true &&
        validPhonePayload.storage === "directus" &&
        /^QA-\d{6}-\d{3}$/.test(validPhonePayload.reference_code ?? ""),
      `valid QA phone lead failed with ${validPhoneResponse.status()}`,
    );

    const repeatedPhoneResponse = await qaPage.request.post(`${baseUrl}/lead-intake`, {
      data: validLeadData,
    });
    const repeatedPhonePayload = await repeatedPhoneResponse.json();
    assert(
      repeatedPhoneResponse.ok() &&
        repeatedPhonePayload.reference_code === validPhonePayload.reference_code,
      "QA phone lead idempotency check failed",
    );

    await qaPage.getByRole("button", { name: "Завершить QA" }).click();
    await qaPage.getByText("Внутренняя приёмка", { exact: true }).waitFor();
    console.log(
      `Trade QA smoke passed for ${baseUrl}: 19 configs, 7 questions, 10 control calculations, phone lead validation`,
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
