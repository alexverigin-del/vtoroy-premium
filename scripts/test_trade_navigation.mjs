import assert from "node:assert/strict";
import {
  restoreTradeState,
  resolveTradeStep,
  tradeBackStep,
  tradeInputKey,
  tradeQuoteExpired,
} from "../apps/web/lib/trade-wizard-navigation.ts";

const config = {
  pricingVersion: "v-test",
  devices: [
    { id: "config-a", deviceModelId: "model-a" },
    { id: "config-b", deviceModelId: "model-b" },
  ],
  questions: [{ key: "powers_on", options: [{ value: "yes" }, { value: "no" }] }],
};
const answers = { powers_on: "yes" };
const quote = {
  id: "quote-a",
  status: "active",
  deviceModelId: "model-a",
  configurationId: "config-a",
  deviceLabel: "Test",
  pricingVersion: "v-test",
  range: { min: 100, max: 200, currency: "RUB" },
  validUntil: "2099-01-01T20:59:59Z",
  positiveFactors: [],
  riskFactors: [],
};
const saved = {
  runId: "run-a",
  step: "quote",
  deviceModelId: "model-a",
  configurationId: "config-a",
  answers,
  quote,
  quoteInputKey: tradeInputKey("model-a", "config-a", answers),
  scenario: "sale",
};
let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log(`OK ${label}`);
}
check("fingerprint ignores answer order", () =>
  assert.equal(
    tradeInputKey("a", "b", { powers_on: "yes", has_damage: "no" }),
    tradeInputKey("a", "b", { has_damage: "no", powers_on: "yes" }),
  ),
);
check("fingerprint changes for device, memory, answer", () => {
  for (const [model, configuration, input] of [
    ["other", "config-a", answers],
    ["model-a", "other", answers],
    ["model-a", "config-a", { powers_on: "no" }],
  ])
    assert.notEqual(saved.quoteInputKey, tradeInputKey(model, configuration, input));
});
check("valid snapshot restores quote", () =>
  assert.deepEqual(restoreTradeState(saved, config, "fresh"), saved),
);
check("corrupt storage is safe", () => {
  for (const data of [null, 7, [], {}, { answers: "bad", quote: "bad" }])
    assert.equal(restoreTradeState(data, config, "fresh").step, "device");
});
check("unknown step cannot produce a blank view", () =>
  assert.equal(restoreTradeState({ ...saved, step: "bogus" }, config, "fresh").step, "device"),
);
check("removed or mismatched config returns to device", () => {
  for (const configurationId of ["removed", "config-b"])
    assert.equal(restoreTradeState({ ...saved, configurationId }, config, "fresh").step, "device");
});
check("old quote never survives changed answers", () =>
  assert.equal(
    restoreTradeState({ ...saved, answers: { powers_on: "no" } }, config, "fresh").quote,
    undefined,
  ),
);
check("unknown answers are stripped", () =>
  assert.deepEqual(
    restoreTradeState(
      { ...saved, answers: { powers_on: "invalid", contact: "+70000000000" } },
      config,
      "fresh",
    ).answers,
    {},
  ),
);
check("legacy snapshot retains inputs, drops quote", () => {
  const state = restoreTradeState(
    { ...saved, runId: undefined, quoteInputKey: undefined },
    config,
    "fresh",
  );
  assert.equal(state.step, "condition");
  assert.equal(state.quote, undefined);
  assert.equal(state.runId, "fresh");
  assert.deepEqual(state.answers, answers);
});
check("new pricing invalidates restored quote", () =>
  assert.equal(
    restoreTradeState(saved, { ...config, pricingVersion: "v-new" }, "fresh").quote,
    undefined,
  ),
);
check("invalid range / factors / expiry are rejected", () => {
  for (const patch of [
    { range: { min: 200, max: 100, currency: "RUB" } },
    { range: { min: -1, max: 100, currency: "RUB" } },
    { positiveFactors: [null] },
    { validUntil: "invalid" },
  ])
    assert.equal(
      restoreTradeState({ ...saved, quote: { ...quote, ...patch } }, config, "fresh").quote,
      undefined,
    );
});
check("expired quote preserves inputs and opens refresh", () => {
  const state = restoreTradeState(
    { ...saved, quote: { ...quote, validUntil: "2000-01-01" } },
    config,
    "fresh",
  );
  assert.equal(state.step, "expired");
  assert.deepEqual(state.answers, answers);
});
check("expiry includes exact deadline / superseded", () => {
  assert(tradeQuoteExpired(quote, Date.parse(quote.validUntil)));
  assert(tradeQuoteExpired({ ...quote, status: "superseded" }));
  assert(!tradeQuoteExpired(quote, Date.parse(quote.validUntil) - 1));
});
check("contact exchange restore requires fresh stock", () =>
  assert.equal(
    restoreTradeState({ ...saved, step: "contact", scenario: "exchange" }, config, "fresh").step,
    "exchange",
  ),
);
check("back destinations for branches", () => {
  assert.equal(tradeBackStep("contact", "sale"), "scenario");
  assert.equal(tradeBackStep("contact", "exchange"), "exchange");
  assert.equal(tradeBackStep("contact", "stock_notification"), "exchange-empty");
  assert.equal(tradeBackStep("safety"), "condition");
  assert.equal(tradeBackStep("manual"), "device");
});
check("history cannot reopen quote with invalid inputs", () =>
  assert.equal(resolveTradeStep("quote", { ...saved, quote: undefined }, config), "condition"),
);
check("history cannot reopen a stale safety result", () => {
  assert.equal(resolveTradeStep("safety", { ...saved, quote: undefined }, config), "safety");
  assert.equal(
    resolveTradeStep("safety", { ...saved, quote: undefined, quoteInputKey: undefined }, config),
    "condition",
  );
});
check("submitted run cannot return to contact", () =>
  assert.equal(resolveTradeStep("contact", { ...saved, step: "submitted" }, config), "submitted"),
);
check("reload after submission starts a clean run", () =>
  assert.deepEqual(restoreTradeState({ ...saved, step: "submitted" }, config, "fresh"), {
    runId: "fresh",
    step: "device",
    deviceModelId: "",
    configurationId: "",
    answers: {},
  }),
);
check("no free text / consent / contact in restored snapshot", () => {
  const text = JSON.stringify(
    restoreTradeState(
      { ...saved, contact: "SECRET", manualDescription: "SECRET", consentAccepted: true },
      config,
      "fresh",
    ),
  );
  assert(!text.includes("SECRET"));
  assert(!text.includes("consentAccepted"));
});
console.log(`${checks} Trade-in navigation unit cases passed`);
