import assert from "node:assert/strict";
import path from "node:path";

async function waitForRequest(isReady) {
  const deadline = Date.now() + 10000;
  while (!isReady()) {
    if (Date.now() > deadline) throw new Error("Expected local request was not started");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function mockTradeTurnstile(context) {
  await context.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.__tradeTurnstile = { rendered: 0, removed: 0, reset: 0 };
    const widgets = new Map();
    window.turnstile = {
      render(element, options) { const id = String(++window.__tradeTurnstile.rendered); widgets.set(id, options); element.dataset.testWidget = id; setTimeout(() => options.callback('LOCAL-TEST-TOKEN'), 10); return id; },
      reset(id) { window.__tradeTurnstile.reset++; setTimeout(() => widgets.get(id)?.callback('LOCAL-TEST-TOKEN'), 10); },
      remove(id) { window.__tradeTurnstile.removed++; widgets.delete(id); }
    };
  `,
    }),
  );
}

// Called only by the isolated loopback CMS runner. No real leads or quotes are created.
export async function tradeNavigationBrowserCases(browser, base, output) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  for (const [name, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await mockTradeTurnstile(context);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const quoteRequests = [],
      leadRequests = [];
    let quoteFailure,
      leadFailure,
      exchangeEmpty = false;
    let holdQuote,
      releaseQuote,
      holdLead,
      releaseLead,
      holdExchange,
      releaseExchange,
      exchangeFailure;
    const exchangeRequests = [];
    const offer = (id) => ({
      offerId: id,
      productId: `product-${id}`,
      title: `Тестовое устройство ${id}`,
      detailHref: "/catalog/test",
      imageAlt: "",
      price: 60000,
      priceText: "60 000 ₽",
      location: { id: "store-test", name: "Тестовый магазин", city: "Белгород", slug: "belgorod" },
      fulfillment: "pickup",
      topUpRange: { from: 20000, to: 25000 },
    });
    await page.route("**/api/trade/events", (r) => r.fulfill({ json: { ok: true } }));
    await page.route("**/api/trade/quote", async (r) => {
      const input = r.request().postDataJSON();
      quoteRequests.push(input);
      const failure = quoteFailure;
      quoteFailure = undefined;
      if (holdQuote) {
        holdQuote = false;
        await new Promise((resolve) => {
          releaseQuote = resolve;
        });
      }
      if (failure)
        return r.fulfill({ status: 400, json: { ok: false, error: failure } }).catch(() => {});
      await r
        .fulfill({
          json: {
            ok: true,
            quote: {
              id: `quote-${quoteRequests.length}`,
              status: "active",
              deviceModelId: input.deviceModelId,
              configurationId: input.configurationId,
              deviceLabel: "Тестовый смартфон",
              range: { min: 35000, max: 40000, currency: "RUB" },
              validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
              pricingVersion: "test-v3",
              positiveFactors: ["Исправное устройство"],
              riskFactors: [],
            },
          },
        })
        .catch(() => {});
    });
    await page.route("**/api/trade/exchange?**", async (r) => {
      const cursor = new URL(r.request().url()).searchParams.get("cursor");
      exchangeRequests.push(cursor);
      if (holdExchange) {
        holdExchange = false;
        await new Promise((resolve) => {
          releaseExchange = resolve;
        });
      }
      if (exchangeFailure) {
        exchangeFailure = false;
        return r
          .fulfill({ status: 503, json: { ok: false, error: "pricing_unavailable" } })
          .catch(() => {});
      }
      const all = exchangeEmpty
        ? []
        : [
            offer("one"),
            offer("two"),
            ...Array.from({ length: 15 }, (_, i) => offer(String(i + 3))),
          ];
      await r
        .fulfill({
          json: {
            ok: true,
            offers: cursor ? all.slice(12) : all.slice(0, 12),
            total: all.length,
            nextCursor: !cursor && all.length > 12 ? "page-two" : null,
          },
        })
        .catch(() => {});
    });
    await page.route("**/lead-intake", async (r) => {
      leadRequests.push(r.request().postDataJSON());
      const failure = leadFailure;
      leadFailure = undefined;
      if (holdLead) {
        holdLead = false;
        await new Promise((resolve) => {
          releaseLead = resolve;
        });
      }
      await r.fulfill(
        failure
          ? { status: 409, json: { ok: false, error: failure } }
          : { json: { ok: true, reference_code: "TR-TEST-NAV" } },
      );
    });
    await page.goto(base + "/trade", { waitUntil: "networkidle" });
    const wizard = page.locator("#trade-calculator");
    const heading = (text) => wizard.getByRole("heading", { name: text, exact: true }).waitFor();
    const button = (text) => wizard.getByRole("button", { name: text, exact: true });
    const stored = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("isvoi.trade.v1")));
    const reset = async () => {
      await button("Начать заново").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Начать заново", exact: true })
        .click();
      await heading("Какой смартфон вы хотите оценить?");
      await page.waitForFunction(
        () => JSON.parse(sessionStorage.getItem("isvoi.trade.v1"))?.deviceModelId === "",
      );
    };
    const chooseDevice = async () => {
      await wizard.getByLabel("Модель", { exact: true }).selectOption("iphone-16-pro");
      const value = await wizard
        .getByLabel("Память", { exact: true })
        .locator("option")
        .last()
        .getAttribute("value");
      await wizard.getByLabel("Память", { exact: true }).selectOption(value);
      await button("Продолжить").click();
      await heading("В каком состоянии устройство?");
    };
    const answerAll = async () => {
      for (const field of await wizard.locator("fieldset:has(> legend)").all())
        await field.locator("label").first().click();
    };
    const showQuote = async () => {
      await answerAll();
      await button("Показать оценку").click();
      await heading("Ваша предварительная оценка");
    };
    const sale = async () => {
      await button("Выбрать способ сделки").click();
      await wizard.getByRole("button", { name: /^Продать/ }).click();
      await heading("Запишитесь на диагностику");
    };
    const fillContact = async () => {
      await wizard.locator('input[type="tel"]').fill("+79990000000");
      await wizard.getByRole("checkbox").check();
    };

    assert.equal(await wizard.getByRole("navigation").count(), 0, "clean start hides reset/back");
    await page.evaluate(() => sessionStorage.setItem("unrelated-test", "preserve"));
    await chooseDevice();
    await answerAll();
    await button("← Назад").click();
    await heading("Какой смартфон вы хотите оценить?");
    assert.equal(await wizard.getByLabel("Модель", { exact: true }).inputValue(), "iphone-16-pro");
    await button("Продолжить").click();
    await heading("В каком состоянии устройство?");
    assert.equal(await wizard.getByRole("radio", { checked: true }).count(), 7);
    await showQuote();
    assert.equal(quoteRequests.length, 1);
    await button("Изменить ответы").click();
    await heading("В каком состоянии устройство?");
    await button("Показать оценку").click();
    await heading("Ваша предварительная оценка");
    assert.equal(quoteRequests.length, 1, "unchanged inputs reuse active quote");
    await button("Изменить ответы").click();
    await heading("В каком состоянии устройство?");
    await wizard.locator("fieldset:has(> legend)").first().locator("label").nth(1).click();
    await page.waitForFunction(() => !JSON.parse(sessionStorage.getItem("isvoi.trade.v1"))?.quote);
    await page.goForward();
    await heading("В каком состоянии устройство?");
    await button("Показать оценку").click();
    await heading("Ваша предварительная оценка");
    assert.equal(quoteRequests.length, 2);
    assert.equal(quoteRequests[1].previousQuoteId, "quote-1");
    await wizard.screenshot({ path: path.join(output, `navigation-${name}-quote.png`) });

    await sale();
    await fillContact();
    await wizard.getByLabel("Желаемый день").fill("2026-12-01");
    await button("← Назад").click();
    await heading("Как поступить с устройством?");
    await wizard.getByRole("button", { name: /^Продать/ }).click();
    await heading("Запишитесь на диагностику");
    assert.equal(await wizard.locator('input[type="tel"]').inputValue(), "+79990000000");
    assert.equal(await wizard.getByLabel("Желаемый день").inputValue(), "2026-12-01");
    assert(!(await page.evaluate(() => JSON.stringify(sessionStorage))).includes("79990000000"));
    await button("Начать заново").click();
    const dialog = page.getByRole("dialog");
    assert(
      await dialog
        .getByRole("button", { name: "Продолжить текущую оценку" })
        .evaluate((e) => e === document.activeElement),
    );
    await page.keyboard.press("Shift+Tab");
    assert(
      await dialog.evaluate((e) => e.contains(document.activeElement)),
      "dialog traps keyboard focus",
    );
    await page.screenshot({ path: path.join(output, `navigation-${name}-reset.png`) });
    await page.keyboard.press("Escape");
    assert(await button("Начать заново").evaluate((e) => e === document.activeElement));
    assert.equal(await wizard.locator('input[type="tel"]').inputValue(), "+79990000000");
    const oldRun = (await stored()).runId;
    await reset();
    assert.notEqual((await stored()).runId, oldRun);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("unrelated-test")), "preserve");
    await page.goBack();
    await heading("Какой смартфон вы хотите оценить?");
    await page.goForward();
    await heading("Какой смартфон вы хотите оценить?");
    assert.equal(await wizard.getByLabel("Модель", { exact: true }).inputValue(), "");
    assert.equal((await stored()).quote, undefined);

    await chooseDevice();
    await answerAll();
    holdQuote = true;
    await button("Показать оценку").click();
    await waitForRequest(() => releaseQuote);
    await reset();
    releaseQuote();
    releaseQuote = undefined;
    await page.waitForTimeout(100);
    await heading("Какой смартфон вы хотите оценить?");
    assert.equal((await stored()).quote, undefined, "late response cannot restore reset state");
    await chooseDevice();
    await showQuote();
    await button("Изменить устройство").click();
    await heading("Какой смартфон вы хотите оценить?");
    await wizard.getByLabel("Модель", { exact: true }).selectOption("samsung-galaxy-s24-ultra");
    assert.equal(await wizard.getByLabel("Память", { exact: true }).inputValue(), "");
    assert.deepEqual((await stored()).answers, {});
    assert.equal((await stored()).quote, undefined);
    await reset();
    await chooseDevice();
    await showQuote();
    await button("Выбрать способ сделки").click();
    await wizard.getByRole("button", { name: /^Обменять/ }).click();
    await heading("Выберите устройство для обмена");
    await wizard.getByRole("button", { name: /Тестовое устройство two/ }).click();
    await wizard.getByText("Показано 12 из 17", { exact: true }).waitFor();
    assert.equal(await wizard.locator("button[data-offer-id]").count(), 12);
    exchangeFailure = true;
    await button("Обновить список").click();
    await wizard.getByRole("alert").waitFor();
    await button("Повторить загрузку каталога").click();
    await wizard.getByRole("alert").waitFor({ state: "detached" });
    assert.equal(exchangeRequests.at(-1), null, "refresh retry must reload first page, not append");
    assert.equal(await wizard.locator("button[data-offer-id]").count(), 12);
    exchangeFailure = true;
    await button("Показать ещё").click();
    await wizard.getByRole("alert").waitFor();
    assert.equal(
      await wizard.locator("button[data-offer-id]").count(),
      12,
      "retry keeps loaded cards",
    );
    assert.equal(
      await wizard.locator('button[data-offer-id="two"]').getAttribute("aria-pressed"),
      "true",
    );
    holdExchange = true;
    await button("Повторить загрузку каталога").click();
    await waitForRequest(() => releaseExchange);
    assert(await button("Загружаем…").isDisabled());
    const requestCount = exchangeRequests.length;
    await button("Загружаем…").evaluate((el) => el.click());
    assert.equal(exchangeRequests.length, requestCount, "duplicate click blocked");
    releaseExchange();
    releaseExchange = undefined;
    await wizard.getByText("Показано 17 из 17", { exact: true }).waitFor();
    assert.equal(await wizard.locator("button[data-offer-id]").count(), 17);
    assert.equal(await button("Показать ещё").count(), 0);
    assert.equal(
      await wizard.locator('button[data-offer-id="two"]').getAttribute("aria-pressed"),
      "true",
    );
    assert(
      await wizard
        .locator('button[data-offer-id="13"]')
        .evaluate((el) => el === document.activeElement),
      "focus enters appended page",
    );
    await wizard.locator('button[data-offer-id="17"]').click();
    await page.screenshot({ path: path.join(output, `exchange-${name}-all-17.png`) });
    await button("Продолжить с этим устройством").click();
    await heading("Запишитесь на диагностику");
    await fillContact();
    await button("← Назад").click();
    await heading("Выберите устройство для обмена");
    assert.match(
      await wizard.getByRole("button", { name: /Тестовое устройство 17/ }).innerText(),
      /Выбрано/i,
    );
    await button("Продолжить с этим устройством").click();
    await heading("Запишитесь на диагностику");
    leadFailure = "product_unavailable";
    await button("Отправить заявку").click();
    assert.equal(leadRequests.at(-1).target_offer_id, "17", "lead retains second-page selection");
    await heading("Выберите устройство для обмена");
    await button("Продолжить с этим устройством").click();
    await heading("Запишитесь на диагностику");
    assert.equal(await wizard.locator('input[type="tel"]').inputValue(), "+79990000000");
    await button("Изменить сценарий").click();
    await heading("Как поступить с устройством?");
    exchangeEmpty = true;
    await wizard.getByRole("button", { name: /^Обменять/ }).click();
    await heading("Сейчас нет подходящих устройств");
    await button("Сообщить о поступлении").click();
    await heading("Оставьте контакт");
    await button("← Назад").click();
    await heading("Сейчас нет подходящих устройств");
    await button("Выбрать продажу").click();
    await heading("Запишитесь на диагностику");
    await fillContact();
    leadFailure = "quote_expired";
    await button("Отправить заявку").click();
    await heading("Оценка устарела");
    const beforeRefresh = quoteRequests.length;
    await button("Обновить оценку").click();
    await heading("Ваша предварительная оценка");
    assert.equal(quoteRequests.length, beforeRefresh + 1);
    await sale();
    await fillContact();
    leadFailure = "lead_storage_unavailable";
    await button("Отправить заявку").click();
    await wizard.getByRole("alert").waitFor();
    const retryKey = leadRequests.at(-1).idempotency_key;
    holdLead = true;
    await button("Отправить заявку").click();
    await waitForRequest(() => releaseLead);
    assert(await button("Начать заново").isDisabled());
    assert(await button("← Назад").isDisabled());
    await page.goBack();
    await heading("Запишитесь на диагностику");
    releaseLead();
    releaseLead = undefined;
    await heading("Заявка отправлена");
    assert.equal(leadRequests.at(-1).idempotency_key, retryKey);
    await page.goBack();
    await heading("Заявка отправлена");
    await button("Оценить другое устройство").click();
    await heading("Какой смартфон вы хотите оценить?");
    await button("Не нашли свою модель?").click();
    await heading("Оценим устройство вручную");
    assert.equal(await wizard.locator('input[type="tel"]').inputValue(), "");
    assert(!(await wizard.getByRole("checkbox").isChecked()));
    await wizard.getByLabel("Опишите устройство").fill("Только локальная тестовая модель");
    await fillContact();
    await button("Отправить на оценку").click();
    await heading("Заявка отправлена");
    assert.notEqual(leadRequests.at(-1).idempotency_key, retryKey);
    assert(leadRequests.every((r) => r.turnstile_token === "LOCAL-TEST-TOKEN"));
    const captcha = await page.evaluate(() => window.__tradeTurnstile);
    assert(
      captcha.rendered > 4 && captcha.removed > 2 && captcha.reset > 1,
      "anti-spam remount/reset survives branches",
    );
    await page.reload({ waitUntil: "networkidle" });
    await heading("Какой смартфон вы хотите оценить?");
    await chooseDevice();
    await answerAll();
    quoteFailure = "safety_stop";
    await button("Показать оценку").click();
    await heading("Не заряжайте и не пересылайте устройство");
    await button("← Назад").click();
    await heading("В каком состоянии устройство?");
    quoteFailure = "manual_evaluation_required";
    await button("Показать оценку").click();
    await heading("Оценим устройство вручную");
    await button("← Назад").click();
    await heading("В каком состоянии устройство?");
    await showQuote();
    await page.reload({ waitUntil: "networkidle" });
    await heading("Ваша предварительная оценка");
    await sale();
    assert.equal(await wizard.locator('input[type="tel"]').inputValue(), "");
    assert(!(await wizard.getByRole("checkbox").isChecked()));
    await wizard.screenshot({ path: path.join(output, `navigation-${name}-contact.png`) });
    await reset();
    await chooseDevice();
    await showQuote();
    exchangeEmpty = false;
    await button("Выбрать способ сделки").click();
    await wizard.getByRole("button", { name: /^Обменять/ }).click();
    await heading("Выберите устройство для обмена");
    holdExchange = true;
    await button("Показать ещё").click();
    await waitForRequest(() => releaseExchange);
    await reset();
    releaseExchange();
    releaseExchange = undefined;
    await page.waitForTimeout(100);
    await heading("Какой смартфон вы хотите оценить?");
    assert.equal(
      await wizard.locator("button[data-offer-id]").count(),
      0,
      "late page cannot restore reset state",
    );
    await chooseDevice();
    if (name === "mobile") {
      await page.setViewportSize({ width: 320, height: 568 });
      await button("Начать заново").click();
      const bounds = await page.getByRole("dialog").boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= 320);
      for (const action of await page.getByRole("dialog").getByRole("button").all())
        assert((await action.boundingBox()).height >= 44);
      await page.screenshot({ path: path.join(output, "navigation-small-mobile-reset.png") });
      await page.keyboard.press("Escape");
    }
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "no horizontal overflow",
    );
    assert.deepEqual(errors, []);
    console.log(
      `${name}: navigation, edit/invalidation, restore, reset/dialog/focus, stale history, late quote/page, exchange 12+5/retry/selection/focus/empty/unavailable, expiry, pending submit, new lead, manual/safety OK`,
    );
    await context.close();
  }
}
