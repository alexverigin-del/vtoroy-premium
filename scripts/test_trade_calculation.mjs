#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  calculateTradeRange,
  isTradeQuoteExpired,
  tradeQuoteValidUntil,
} from "../apps/web/lib/trade-calculation.ts";

const rules = [
  {
    questionKey: "powers_on",
    optionValue: "yes",
    label: "Устройство включается",
    deltaMin: 1000,
    deltaMax: 2000,
    factorType: "positive",
    manualEvaluation: false,
    safetyStop: false,
  },
  {
    questionKey: "has_damage",
    optionValue: "yes",
    label: "Есть повреждения корпуса",
    deltaMin: -5000,
    deltaMax: -4000,
    factorType: "risk",
    manualEvaluation: false,
    safetyStop: false,
  },
  {
    questionKey: "battery_risk",
    optionValue: "yes",
    label: "Повреждение аккумулятора",
    deltaMin: 0,
    deltaMax: 0,
    factorType: "risk",
    manualEvaluation: false,
    safetyStop: true,
  },
  {
    questionKey: "account_removed",
    optionValue: "no",
    label: "Устройство не отвязано",
    deltaMin: 0,
    deltaMax: 0,
    factorType: "risk",
    manualEvaluation: true,
    safetyStop: false,
  },
];

const normal = calculateTradeRange(30_000, 35_000, { powers_on: "yes", has_damage: "yes" }, rules);
assert.deepEqual(
  { min: normal.min, max: normal.max },
  { min: 26_000, max: 33_000 },
  "applies independent min/max modifiers",
);
assert.deepEqual(normal.positiveFactors, ["Устройство включается"]);
assert.deepEqual(normal.riskFactors, ["Есть повреждения корпуса"]);

const clamped = calculateTradeRange(100, 200, { has_damage: "yes" }, rules);
assert.deepEqual({ min: clamped.min, max: clamped.max }, { min: 0, max: 0 });

const stopped = calculateTradeRange(
  30_000,
  35_000,
  { battery_risk: "yes", account_removed: "no" },
  rules,
);
assert.equal(stopped.safetyStop, true);
assert.equal(stopped.manualEvaluation, true);

const expiry = tradeQuoteValidUntil(new Date("2026-08-29T08:00:00.000Z"), 7);
assert.equal(expiry.toISOString(), "2026-09-05T20:59:59.999Z");
assert.equal(isTradeQuoteExpired(expiry.toISOString(), new Date("2026-09-05T20:59:00Z")), false);
assert.equal(isTradeQuoteExpired(expiry.toISOString(), new Date("2026-09-05T21:00:00Z")), true);

process.stdout.write("trade calculation tests: ok\n");
