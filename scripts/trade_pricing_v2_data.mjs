#!/usr/bin/env node

import { tradeConditionRules } from "./trade_pricing_v1_data.mjs";

export const TRADE_PRICING_VERSION_V2 = "trade-pricing-v2-draft";
export const TRADE_PRICING_REFERENCE_DATE_V2 = "2026-08-29";
export const TRADE_PRICING_CHANGE_REASON_V2 =
  "Conservative market benchmark v2 from re:Store, Opt-Express and current low-retail offers. Upper bound is capped by the public Trade-in benchmark and 75% of the conservative market anchor. Draft only; requires Trade Desk approval and ten control calculations before publication.";

export const tradePricingConfigsV2 = [
  { modelSlug: "iphone-13-pro", storage: "128 ГБ", baseMin: 18_000, baseMax: 20_000, marketAnchor: 26_990, confidence: "high", sort: 10 },
  { modelSlug: "iphone-13-pro", storage: "256 ГБ", baseMin: 19_500, baseMax: 22_000, marketAnchor: 29_690, confidence: "medium", sort: 20 },
  { modelSlug: "iphone-13-pro", storage: "512 ГБ", baseMin: 22_000, baseMax: 24_500, marketAnchor: 36_500, confidence: "low", sort: 30 },
  { modelSlug: "iphone-13-pro", storage: "1 ТБ", baseMin: 23_500, baseMax: 26_500, marketAnchor: 38_000, confidence: "low", sort: 40 },
  { modelSlug: "iphone-14-pro", storage: "128 ГБ", baseMin: 22_500, baseMax: 25_000, marketAnchor: 33_590, confidence: "medium", sort: 110 },
  { modelSlug: "iphone-14-pro", storage: "256 ГБ", baseMin: 23_500, baseMax: 26_500, marketAnchor: 35_590, confidence: "high", sort: 120 },
  { modelSlug: "iphone-14-pro", storage: "512 ГБ", baseMin: 29_500, baseMax: 33_000, marketAnchor: 44_700, confidence: "low", sort: 130 },
  { modelSlug: "iphone-14-pro", storage: "1 ТБ", baseMin: 31_000, baseMax: 34_500, marketAnchor: 46_200, confidence: "low", sort: 140 },
  { modelSlug: "iphone-14-pro-max", storage: "128 ГБ", baseMin: 23_000, baseMax: 26_000, marketAnchor: 34_990, confidence: "high", sort: 210 },
  { modelSlug: "iphone-14-pro-max", storage: "256 ГБ", baseMin: 25_500, baseMax: 28_500, marketAnchor: 38_390, confidence: "high", sort: 220 },
  { modelSlug: "iphone-14-pro-max", storage: "512 ГБ", baseMin: 27_500, baseMax: 31_000, marketAnchor: 41_390, confidence: "medium", sort: 230 },
  { modelSlug: "iphone-14-pro-max", storage: "1 ТБ", baseMin: 36_000, baseMax: 40_000, marketAnchor: 53_700, confidence: "low", sort: 240 },
  { modelSlug: "iphone-16-pro", storage: "128 ГБ", baseMin: 39_500, baseMax: 44_000, marketAnchor: 58_700, confidence: "low", sort: 310 },
  { modelSlug: "iphone-16-pro", storage: "256 ГБ", baseMin: 40_500, baseMax: 45_500, marketAnchor: 60_990, confidence: "medium", sort: 320 },
  { modelSlug: "iphone-16-pro", storage: "512 ГБ", baseMin: 45_500, baseMax: 51_000, marketAnchor: 71_800, confidence: "low", sort: 330 },
  { modelSlug: "iphone-16-pro", storage: "1 ТБ", baseMin: 51_500, baseMax: 57_500, marketAnchor: 77_100, confidence: "low", sort: 340 },
  { modelSlug: "iphone-16-pro-max", storage: "256 ГБ", baseMin: 45_000, baseMax: 50_000, marketAnchor: 66_990, confidence: "high", sort: 410 },
  { modelSlug: "iphone-16-pro-max", storage: "512 ГБ", baseMin: 49_500, baseMax: 55_000, marketAnchor: 73_400, confidence: "low", sort: 420 },
  { modelSlug: "iphone-16-pro-max", storage: "1 ТБ", baseMin: 50_000, baseMax: 56_000, marketAnchor: 74_990, confidence: "low", sort: 430 },
];

export { tradeConditionRules };
