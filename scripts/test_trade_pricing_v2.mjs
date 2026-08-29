#!/usr/bin/env node

import assert from "node:assert/strict";
import { calculateTradeRange } from "../apps/web/lib/trade-calculation.ts";
import { tradePricingConfigs } from "./trade_pricing_v1_data.mjs";
import { tradeConditionRules, tradePricingConfigsV2 } from "./trade_pricing_v2_data.mjs";

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
  const found = tradePricingConfigsV2.find(
    (item) => item.modelSlug === modelSlug && item.storage === storage,
  );
  assert.ok(found, `missing config ${modelSlug} ${storage}`);
  return found;
};

const calculate = (modelSlug, storage, answers) => {
  const item = config(modelSlug, storage);
  return calculateTradeRange(item.baseMin, item.baseMax, answers, pricingRules);
};

assert.equal(tradePricingConfigsV2.length, 19, "pilot must contain exactly 19 configurations");
assert.equal(tradeConditionRules.length, 21, "seven questions must contain three options each");
assert.equal(
  new Set(tradePricingConfigsV2.map((item) => `${item.modelSlug}:${item.storage}`)).size,
  19,
  "configurations must be unique",
);

let changed = 0;
let lowConfidence = 0;
for (const item of tradePricingConfigsV2) {
  assert.ok(item.baseMin > 0 && item.baseMax >= item.baseMin, "range must be ordered and positive");
  assert.equal(item.baseMin % 500, 0, "minimum must be rounded to 500 rubles");
  assert.equal(item.baseMax % 500, 0, "maximum must be rounded to 500 rubles");
  assert.ok(item.baseMax <= item.marketAnchor * 0.75, "maximum must preserve 25% market headroom");
  const previous = tradePricingConfigs.find(
    (candidate) => candidate.modelSlug === item.modelSlug && candidate.storage === item.storage,
  );
  assert.ok(previous, "v1 comparison must exist");
  assert.ok(item.baseMax <= previous.baseMax, "v2 must not increase the previous draft maximum");
  if (item.baseMax !== previous.baseMax) changed += 1;
  if (item.confidence === "low") lowConfidence += 1;
}
assert.equal(changed, 13, "exactly 13 configurations must change from v1");
assert.equal(lowConfidence, 10, "ten configurations require more market evidence");

const checks = [
  { name: "13 Pro 128 · baseline", actual: calculate("iphone-13-pro", "128 ГБ", { has_damage: "no" }), expected: { min: 18_000, max: 20_000, manualEvaluation: false, safetyStop: false } },
  { name: "14 Pro 256 · visible damage", actual: calculate("iphone-14-pro", "256 ГБ", { has_damage: "yes" }), expected: { min: 16_500, max: 22_500, manualEvaluation: false, safetyStop: false } },
  { name: "14 Pro Max 512 · condition unknown", actual: calculate("iphone-14-pro-max", "512 ГБ", { has_damage: "unknown" }), expected: { min: 23_500, max: 29_000, manualEvaluation: false, safetyStop: false } },
  { name: "16 Pro 256 · baseline", actual: calculate("iphone-16-pro", "256 ГБ", { has_damage: "no" }), expected: { min: 40_500, max: 45_500, manualEvaluation: false, safetyStop: false } },
  { name: "16 Pro Max 1 TB · visible damage", actual: calculate("iphone-16-pro-max", "1 ТБ", { has_damage: "yes" }), expected: { min: 43_000, max: 52_000, manualEvaluation: false, safetyStop: false } },
  { name: "powered off · manual evaluation", actual: calculate("iphone-14-pro", "128 ГБ", { powers_on: "no" }), expected: { min: 22_500, max: 25_000, manualEvaluation: true, safetyStop: false } },
  { name: "display failure · manual evaluation", actual: calculate("iphone-14-pro-max", "256 ГБ", { display_works: "no" }), expected: { min: 25_500, max: 28_500, manualEvaluation: true, safetyStop: false } },
  { name: "repair history unknown · manual evaluation", actual: calculate("iphone-16-pro", "512 ГБ", { was_repaired: "unknown" }), expected: { min: 45_500, max: 51_000, manualEvaluation: true, safetyStop: false } },
  { name: "battery risk · safety stop", actual: calculate("iphone-16-pro-max", "512 ГБ", { battery_risk: "yes" }), expected: { min: 49_500, max: 55_000, manualEvaluation: false, safetyStop: true } },
  { name: "account still linked · non-price risk", actual: calculate("iphone-13-pro", "256 ГБ", { account_removed: "no" }), expected: { min: 19_500, max: 22_000, manualEvaluation: false, safetyStop: false }, risk: "Перед передачей нужно выйти из аккаунта" },
];

for (const check of checks) {
  assert.deepEqual(
    {
      min: check.actual.min,
      max: check.actual.max,
      manualEvaluation: check.actual.manualEvaluation,
      safetyStop: check.actual.safetyStop,
    },
    check.expected,
    check.name,
  );
  if (check.risk) assert.ok(check.actual.riskFactors.includes(check.risk), check.name);
}

process.stdout.write(`trade pricing v2 control calculations: ${checks.length} ok\n`);
