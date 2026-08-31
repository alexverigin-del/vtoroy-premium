import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Reuses the authenticated QA context: quotes/leads are marked is_test by the server.
export async function tradeExchangeProductionCases(
  qaPage,
  base,
  config,
  answers,
  quote,
  leadTemplate,
) {
  const params = new URLSearchParams({
    quote_id: quote.id,
    store_location_id: config.defaultStoreId,
  });
  const all = [],
    cursors = new Set();
  let nextCursor, total;
  do {
    if (nextCursor) params.set("cursor", nextCursor);
    const response = await qaPage.request.get(`${base}/api/trade/exchange?${params}`);
    assert(response.ok(), `Exchange API failed: ${response.status()}`);
    const page = await response.json();
    assert.equal(page.ok, true);
    assert(Number.isInteger(page.total));
    assert(page.offers.length <= 12);
    total ??= page.total;
    assert.equal(page.total, total, "Catalog changed during QA; rerun against current stock");
    all.push(...page.offers);
    nextCursor = page.nextCursor;
    assert(nextCursor === null || typeof nextCursor === "string", "Missing pagination contract");
    if (nextCursor) {
      assert(!cursors.has(nextCursor), "Cursor loop");
      cursors.add(nextCursor);
    }
    assert(cursors.size < 100, "Unbounded exchange pagination");
  } while (nextCursor);
  assert.equal(all.length, total);
  assert.equal(new Set(all.map((o) => o.offerId)).size, total);
  if (process.env.TRADE_EXPECT_EXCHANGE_OFFERS)
    assert.equal(total, Number(process.env.TRADE_EXPECT_EXCHANGE_OFFERS));
  assert(total > 12, "This regression gate needs more than one page of eligible stock");
  const last = all.at(-1);
  const lead = {
    ...leadTemplate,
    scenario: "exchange",
    quote_id: quote.id,
    target_product_id: last.productId,
    target_offer_id: last.offerId,
    store_location_id: config.defaultStoreId,
    device: "QA exchange pagination smoke",
    idempotency_key: `trade-qa-exchange-page-v1-${last.offerId}`,
  };
  const firstLead = await qaPage.request.post(`${base}/lead-intake`, { data: lead });
  const saved = await firstLead.json();
  assert(
    firstLead.ok() && saved.ok && /^QA-\d{6}-\d{3}$/.test(saved.reference_code ?? ""),
    "QA second-page lead failed",
  );
  const replay = await qaPage.request.post(`${base}/lead-intake`, { data: lead });
  assert.equal((await replay.json()).reference_code, saved.reference_code);

  const output = path.resolve("output/playwright/trade-exchange-production");
  await fs.mkdir(output, { recursive: true });
  for (const [name, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ]) {
    const page = await qaPage.context().newPage();
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/trade/qa`, { waitUntil: "load" });
    const wizard = page.locator("#trade-calculator");
    const device = config.devices[0];
    await wizard.getByLabel("Модель", { exact: true }).selectOption(device.deviceModelId);
    await wizard.getByLabel("Память", { exact: true }).selectOption(device.id);
    await wizard.getByRole("button", { name: "Продолжить", exact: true }).click();
    for (const question of config.questions) {
      const label = question.options.find((o) => o.value === answers[question.key]).label;
      await wizard
        .getByRole("group", { name: question.label, exact: true })
        .locator("label")
        .filter({ hasText: label })
        .click();
    }
    await wizard.getByRole("button", { name: "Показать оценку", exact: true }).click();
    await wizard.getByRole("button", { name: "Выбрать способ сделки", exact: true }).click();
    await wizard.getByRole("button", { name: /^Обменять/ }).click();
    await wizard.getByText(`Показано 12 из ${total}`, { exact: true }).waitFor();
    const selected = await wizard
      .locator('[data-offer-id][aria-pressed="true"]')
      .getAttribute("data-offer-id");
    while (await wizard.getByRole("button", { name: "Показать ещё", exact: true }).count()) {
      const before = await wizard.locator("[data-offer-id]").count();
      await wizard.getByRole("button", { name: "Показать ещё", exact: true }).click();
      await page.waitForFunction(
        (n) => document.querySelectorAll("[data-offer-id]").length > n,
        before,
      );
    }
    await wizard.getByText(`Показано ${total} из ${total}`, { exact: true }).waitFor();
    assert.equal(await wizard.locator("[data-offer-id]").count(), total);
    assert.equal(
      await wizard.locator('[data-offer-id][aria-pressed="true"]').getAttribute("data-offer-id"),
      selected,
    );
    const lastButton = wizard.locator(`[data-offer-id="${last.offerId}"]`);
    await lastButton.click();
    await page.screenshot({ path: path.join(output, `${name}-all-offers.png`) });
    await wizard
      .getByRole("button", { name: "Продолжить с этим устройством", exact: true })
      .click();
    await wizard.getByRole("heading", { name: "Запишитесь на диагностику" }).waitFor();
    await wizard.getByRole("button", { name: "← Назад", exact: true }).click();
    await lastButton.waitFor();
    assert.equal(await lastButton.getAttribute("aria-pressed"), "true");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(`${name}: live QA exchange 12 -> ${total}, last-page selection/back passed`);
    await page.close();
  }
  console.log(
    `Exchange completeness: ${total} unique offers, ${cursors.size + 1} pages; second-page QA lead/replay ${saved.reference_code}`,
  );
}
