#!/usr/bin/env node

import assert from "node:assert/strict";
import { calculateTradeRange } from "../apps/web/lib/trade-calculation.ts";
import { TRADE_SUPPORTED_MODELS } from "../apps/web/lib/trade-supported-models.ts";
import { tradePricingConfigsV2 } from "./trade_pricing_v2_data.mjs";
import { tradeConditionRules, tradePricingConfigsV3 } from "./trade_pricing_v3_data.mjs";

const pricingRules = tradeConditionRules.map((item) => ({
  questionKey: item.questionKey,
  optionValue: item.optionValue,
  label: item.factorLabel ?? item.optionLabel,
  deltaMin: item.deltaMin,
  deltaMax: item.deltaMax,
  factorType: item.factorType,
  manualEvaluation: item.manualEvaluation,
  safetyStop: item.safetyStop,
}));
const config = (modelSlug, storage) => {
  const found = tradePricingConfigsV3.find(
    (item) => item.modelSlug === modelSlug && item.storage === storage,
  );
  assert.ok(found, `missing config ${modelSlug} ${storage}`);
  return found;
};
const calculate = (modelSlug, storage, answers) => {
  const item = config(modelSlug, storage);
  return calculateTradeRange(item.baseMin, item.baseMax, answers, pricingRules);
};

assert.equal(
  tradePricingConfigsV3.length,
  24,
  "catalog-complete draft must contain 24 configurations",
);
assert.equal(
  new Set(tradePricingConfigsV3.map((item) => `${item.modelSlug}:${item.storage}`)).size,
  24,
);
assert.equal(new Set(tradePricingConfigsV3.map((item) => item.modelSlug)).size, 9);
assert.deepEqual(
  new Set(tradePricingConfigsV3.map((item) => item.modelSlug)),
  TRADE_SUPPORTED_MODELS,
  "server model allowlist must cover the complete pricing draft",
);
for (const item of tradePricingConfigsV3) {
  assert.ok(item.baseMin > 0 && item.baseMax >= item.baseMin);
  assert.equal(item.baseMin % 500, 0);
  assert.equal(item.baseMax % 500, 0);
  assert.ok(
    item.baseMax <= item.marketAnchor * 0.75,
    `${item.modelSlug} ${item.storage} market headroom`,
  );
  const previous = tradePricingConfigsV2.find(
    (candidate) => candidate.modelSlug === item.modelSlug && candidate.storage === item.storage,
  );
  if (previous) assert.ok(item.baseMax <= previous.baseMax, "v3 must not increase a v2 ceiling");
}

assert.deepEqual(calculate("iphone-15-pro", "256 ГБ", { has_damage: "no" }), {
  min: 31_000,
  max: 34_500,
  positiveFactors: ["Нет существенных повреждений"],
  riskFactors: [],
  manualEvaluation: false,
  safetyStop: false,
});
assert.equal(calculate("samsung-galaxy-s22-ultra", "256 ГБ", {}).max, 23_000);
assert.equal(calculate("samsung-galaxy-s23-ultra", "256 ГБ", {}).max, 29_500);
assert.equal(calculate("samsung-galaxy-s24-ultra", "256 ГБ", {}).max, 34_000);
assert.equal(calculate("iphone-16-pro-max", "512 ГБ", {}).max, 52_500);
assert.equal(calculate("iphone-14-pro", "512 ГБ", {}).max, 30_000);

process.stdout.write("trade pricing v3 control calculations: ok\n");
