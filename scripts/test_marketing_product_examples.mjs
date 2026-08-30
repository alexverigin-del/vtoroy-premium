import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  marketingDeviceCandidates,
  marketingExampleDevice,
  marketingProductFacts,
} from "../apps/web/lib/marketing-products.ts";
import {
  clubPrimaryCtaForRuntime,
  tradePrimaryCtaForRuntime,
} from "../apps/web/lib/marketing-cta.ts";

function product(overrides = {}) {
  return {
    id: "device-1",
    productType: "device",
    condition: "used",
    stockQuantity: 1,
    stockStatus: "available",
    stockStatusLabel: "В наличии",
    sort: 10,
    warrantyText: "Гарантия 90 дней",
    trustFacts: ["Passport", "Аккумулятор 91%"],
    ...overrides,
  };
}

assert.equal(marketingExampleDevice([]), null);

const candidates = [
  product({ id: "sold", stockQuantity: 0, stockStatus: "sold", sort: 1 }),
  product({ id: "hidden", stockStatus: "hidden", sort: 2 }),
  product({ id: "accessory", productType: "accessory", sort: 3 }),
  product({ id: "reserved", stockStatus: "reserved", sort: 1 }),
  product({ id: "available-later", sort: 20 }),
  product({ id: "available-first", sort: 5 }),
];

assert.deepEqual(
  marketingDeviceCandidates(candidates).map(({ id }) => id),
  ["available-first", "available-later", "reserved"],
);
assert.equal(marketingExampleDevice(candidates)?.id, "available-first");
assert.deepEqual(marketingProductFacts(product()), [
  "Passport",
  "Аккумулятор 91%",
  "Гарантия 90 дней",
  "В наличии",
]);

assert.equal(tradePrimaryCtaForRuntime("#trade-calculator", false), "#final");
assert.equal(tradePrimaryCtaForRuntime("#trade-calculator", true), "#trade-calculator");
assert.equal(tradePrimaryCtaForRuntime("/trade#trade-calculator", false), "#final");
assert.equal(clubPrimaryCtaForRuntime("/#final"), "#club-request");
assert.equal(clubPrimaryCtaForRuntime("/club#final"), "#club-request");
assert.equal(clubPrimaryCtaForRuntime("https://isvoi.ru/#final"), "https://isvoi.ru/#final");

const sourceFiles = await Promise.all(
  [
    "apps/web/app/[slug]/page.tsx",
    "apps/web/app/club/page.tsx",
    "apps/web/components/MarketingSectionRenderer.tsx",
    "apps/web/components/TradePageSection.tsx",
  ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")),
);
const marketingSources = sourceFiles.join("\n");
assert.match(marketingSources, /getAllPublishedV3ProductCards/u);
assert.doesNotMatch(marketingSources, /getPublishedDeviceCards|DeviceCardData/u);

console.log("Marketing Catalog V3 example selection: OK");
