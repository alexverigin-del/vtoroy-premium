#!/usr/bin/env node

import assert from "node:assert/strict";
import { calculateTradeRange } from "../apps/web/lib/trade-calculation.ts";
import { tradeConditionRules, tradePricingConfigs } from "./trade_pricing_v1_data.mjs";

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
  const found = tradePricingConfigs.find(
    (item) => item.modelSlug === modelSlug && item.storage === storage,
  );
  assert.ok(found, `missing config ${modelSlug} ${storage}`);
  return found;
};

const calculate = (modelSlug, storage, answers) => {
  const item = config(modelSlug, storage);
  return calculateTradeRange(item.baseMin, item.baseMax, answers, pricingRules);
};

assert.equal(tradePricingConfigs.length, 19, "pilot must contain exactly 19 configurations");
assert.equal(tradeConditionRules.length, 21, "seven questions must contain three options each");
assert.equal(
  new Set(tradePricingConfigs.map((item) => `${item.modelSlug}:${item.storage}`)).size,
  19,
  "configurations must be unique",
);
for (const item of tradePricingConfigs) {
  assert.ok(item.baseMin > 0 && item.baseMax >= item.baseMin, "range must be ordered and positive");
  assert.ok(
    item.baseMax <= item.referenceMax,
    "draft maximum must not exceed the public benchmark",
  );
}

const checks = [
  {
    name: "13 Pro 128 · baseline",
    actual: calculate("iphone-13-pro", "128 ГБ", { has_damage: "no" }),
    expected: { min: 18_000, max: 20_000, manualEvaluation: false, safetyStop: false },
  },
  {
    name: "14 Pro 256 · visible damage",
    actual: calculate("iphone-14-pro", "256 ГБ", { has_damage: "yes" }),
    expected: { min: 19_500, max: 25_500, manualEvaluation: false, safetyStop: false },
  },
  {
    name: "14 Pro Max 512 · condition unknown",
    actual: calculate("iphone-14-pro-max", "512 ГБ", { has_damage: "unknown" }),
    expected: { min: 30_000, max: 36_000, manualEvaluation: false, safetyStop: false },
  },
  {
    name: "16 Pro 256 · baseline",
    actual: calculate("iphone-16-pro", "256 ГБ", { has_damage: "no" }),
    expected: { min: 42_500, max: 47_500, manualEvaluation: false, safetyStop: false },
  },
  {
    name: "16 Pro Max 1 TB · visible damage",
    actual: calculate("iphone-16-pro-max", "1 ТБ", { has_damage: "yes" }),
    expected: { min: 60_000, max: 70_500, manualEvaluation: false, safetyStop: false },
  },
  {
    name: "powered off · manual evaluation",
    actual: calculate("iphone-14-pro", "128 ГБ", { powers_on: "no" }),
    expected: { min: 23_000, max: 26_000, manualEvaluation: true, safetyStop: false },
  },
  {
    name: "display failure · manual evaluation",
    actual: calculate("iphone-14-pro-max", "256 ГБ", { display_works: "no" }),
    expected: { min: 30_500, max: 34_000, manualEvaluation: true, safetyStop: false },
  },
  {
    name: "repair history unknown · manual evaluation",
    actual: calculate("iphone-16-pro", "512 ГБ", { was_repaired: "unknown" }),
    expected: { min: 45_500, max: 51_000, manualEvaluation: true, safetyStop: false },
  },
  {
    name: "battery risk · safety stop",
    actual: calculate("iphone-16-pro-max", "512 ГБ", { battery_risk: "yes" }),
    expected: { min: 53_500, max: 59_500, manualEvaluation: false, safetyStop: true },
  },
  {
    name: "account still linked · non-price risk",
    actual: calculate("iphone-13-pro", "256 ГБ", { account_removed: "no" }),
    expected: { min: 19_500, max: 22_000, manualEvaluation: false, safetyStop: false },
    risk: "Перед передачей нужно выйти из аккаунта",
  },
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

process.stdout.write(`trade pricing v1 control calculations: ${checks.length} ok\n`);
