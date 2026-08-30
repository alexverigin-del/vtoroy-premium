#!/usr/bin/env node

import { tradeConditionRules, tradePricingConfigsV2 } from "./trade_pricing_v2_data.mjs";

export const TRADE_PRICING_VERSION_V3 = "trade-pricing-v3-draft";
export const TRADE_PRICING_REFERENCE_DATE_V3 = "2026-08-30";
export const TRADE_PRICING_CHANGE_REASON_V3 =
  "Catalog-complete draft v3. Adds iPhone 15 Pro and Samsung Galaxy S22/S23/S24 Ultra configurations used by every currently published used-device card. Existing high-risk ceilings are reduced to preserve the approved 15% contribution-margin floor under the ISVOI cost policy. Market evidence combines the current ISVOI listing, Opt-Express and conservative public used-device offers. Draft only; the calculator remains disabled until a separate publication decision.";

const overrides = new Map([
  ["iphone-14-pro:512 ГБ", { baseMin: 27_000, baseMax: 30_000, confidence: "medium" }],
  ["iphone-16-pro-max:256 ГБ", { baseMin: 44_500, baseMax: 49_500, confidence: "high" }],
  ["iphone-16-pro-max:512 ГБ", { baseMin: 47_000, baseMax: 52_500, confidence: "medium" }],
]);

const inheritedConfigs = tradePricingConfigsV2.map((item) => ({
  ...item,
  ...(overrides.get(`${item.modelSlug}:${item.storage}`) ?? {}),
}));

const catalogExpansionConfigs = [
  {
    modelSlug: "iphone-15-pro",
    storage: "256 ГБ",
    baseMin: 31_000,
    baseMax: 34_500,
    marketAnchor: 50_200,
    confidence: "medium",
    sort: 250,
  },
  {
    modelSlug: "iphone-15-pro",
    storage: "512 ГБ",
    baseMin: 35_000,
    baseMax: 39_000,
    marketAnchor: 53_200,
    confidence: "medium",
    sort: 260,
  },
  {
    modelSlug: "samsung-galaxy-s22-ultra",
    storage: "256 ГБ",
    baseMin: 20_500,
    baseMax: 23_000,
    marketAnchor: 37_989,
    confidence: "low",
    sort: 510,
  },
  {
    modelSlug: "samsung-galaxy-s23-ultra",
    storage: "256 ГБ",
    baseMin: 26_500,
    baseMax: 29_500,
    marketAnchor: 39_999,
    confidence: "low",
    sort: 610,
  },
  {
    modelSlug: "samsung-galaxy-s24-ultra",
    storage: "256 ГБ",
    baseMin: 30_500,
    baseMax: 34_000,
    marketAnchor: 45_500,
    confidence: "low",
    sort: 710,
  },
];

export const tradePricingConfigsV3 = [...inheritedConfigs, ...catalogExpansionConfigs].sort(
  (left, right) => left.sort - right.sort,
);

export { tradeConditionRules };
