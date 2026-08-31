import assert from "node:assert/strict";
import fs from "node:fs";
import { tradeExchangeOffer, tradeExchangePage } from "../apps/web/lib/trade-exchange.ts";

const range = { min: 35000, max: 40000, currency: "RUB" };
const store = {
  id: "belgorod",
  status: "published",
  pickupEnabled: true,
  intercityDeliveryEnabled: true,
};
const product = (index) => ({
  id: `product-${index}`,
  title: `Device ${index}`,
  offers: [
    {
      id: `offer-${String(index).padStart(3, "0")}`,
      status: "published",
      stockStatus: "available",
      stockQuantity: 1,
      price: 45000 + Math.floor(index / 3) * 1000,
      pickupEnabled: true,
      intercityDeliveryEnabled: true,
      location: { ...store },
    },
  ],
});
const rows = Array.from({ length: 17 }, (_, i) => product(i));
const offers = rows.map((p) => tradeExchangeOffer(p, store.id, range));
let checks = 0;
const test = (name, fn) => {
  fn();
  checks++;
  console.log(`OK ${name}`);
};
test("17 cards accessible as 12 + 5, without duplicates", () => {
  const first = tradeExchangePage([...offers].reverse(), "quote:store");
  const second = tradeExchangePage(offers, "quote:store", first.nextCursor);
  assert.equal(first.offers.length, 12);
  assert.equal(first.total, 17);
  assert.equal(second.offers.length, 5);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.offers, ...second.offers].map((o) => o.offerId)).size, 17);
});
test("equal prices use stable IDs across pages", () => {
  const tied = offers.map((o) => ({ ...o, price: 60000 }));
  const first = tradeExchangePage(tied, "q");
  const second = tradeExchangePage([...tied].reverse(), "q", first.nextCursor);
  assert.equal(new Set([...first.offers, ...second.offers].map((o) => o.offerId)).size, 17);
});
test("sale of an earlier card or cursor card does not skip the next offer", () => {
  const first = tradeExchangePage(offers, "q");
  const remaining = offers.filter(
    (o) => ![first.offers[0].offerId, first.offers.at(-1).offerId].includes(o.offerId),
  );
  assert.equal(tradeExchangePage(remaining, "q", first.nextCursor).offers.length, 5);
});
test("empty, exact-size and multi-page catalogs terminate", () => {
  assert.deepEqual(tradeExchangePage([], "q"), { offers: [], total: 0, nextCursor: null });
  assert.equal(tradeExchangePage(offers.slice(0, 12), "q").nextCursor, null);
  const many = Array.from({ length: 49 }, (_, i) =>
    tradeExchangeOffer(product(i), store.id, range),
  );
  let cursor,
    seen = [];
  do {
    const p = tradeExchangePage(many, "q", cursor);
    seen.push(...p.offers);
    cursor = p.nextCursor;
  } while (cursor);
  assert.equal(new Set(seen.map((o) => o.offerId)).size, 49);
});
test("malformed, oversized and wrong quote/store cursors rejected", () => {
  for (const cursor of [
    "bad!",
    "x".repeat(1025),
    Buffer.from("{}").toString("base64url"),
    tradeExchangePage(offers, "other").nextCursor,
  ])
    assert.throws(() => tradeExchangePage(offers, "q", cursor), RangeError);
});
test("selection beyond first page remains valid, exact offer required", () => {
  assert(tradeExchangeOffer(rows[16], store.id, range, offers[16].offerId));
  assert.equal(tradeExchangeOffer(rows[16], store.id, range, offers[0].offerId), undefined);
});
test("sold, reserved, draft offer, unpublished store and disabled pickup rejected", () => {
  for (const change of [
    { stockQuantity: 0 },
    { stockStatus: "reserved" },
    { status: "draft" },
    { location: { ...store, status: "draft" } },
    { pickupEnabled: false },
    { location: { ...store, pickupEnabled: false } },
  ]) {
    const p = product(1);
    Object.assign(p.offers[0], change);
    assert.equal(tradeExchangeOffer(p, store.id, range), undefined);
  }
});
test("both sides must allow intercity; local pickup ranks first", () => {
  const remote = product(1);
  remote.offers[0].location.id = "moscow";
  remote.offers[0].price = 1000;
  const remoteOffer = tradeExchangeOffer(remote, store.id, range);
  assert.equal(remoteOffer.fulfillment, "intercity_delivery");
  assert.equal(
    tradeExchangePage([remoteOffer, offers[0]], "q").offers[0].offerId,
    offers[0].offerId,
  );
  remote.offers[0].location.intercityDeliveryEnabled = false;
  assert.equal(tradeExchangeOffer(remote, store.id, range), undefined);
  remote.offers[0].location.intercityDeliveryEnabled = true;
  remote.offers[0].intercityDeliveryEnabled = false;
  assert.equal(tradeExchangeOffer(remote, store.id, range), undefined);
});
test("top-up clamps to zero", () =>
  assert.deepEqual(tradeExchangeOffer(rows[0], store.id, { min: 100000, max: 110000 }).topUpRange, {
    from: 0,
    to: 0,
  }));
test("submission path uses exact no-store product lookup, not a paginated list", () => {
  const server = fs
    .readFileSync("apps/web/lib/trade-server.ts", "utf8")
    .split("export async function validateTradeExchangeSelection")[1]
    .split("export async function recordTradeEvent")[0];
  assert(server.includes("getPublishedV3ProductForTrade(productId)"));
  assert(!server.includes("getTradeExchangeOffers("));
  const catalog = fs
    .readFileSync("apps/web/lib/product-catalog.ts", "utf8")
    .split("export async function getPublishedV3ProductForTrade")[1]
    .split("export const getProductCatalogFacets")[0];
  for (const expected of [
    '"filter[id][_eq]"',
    '"filter[status][_eq]"',
    '"filter[content_status][_eq]"',
    '"filter[stock_quantity][_gt]"',
    "noStore: true",
  ])
    assert(catalog.includes(expected));
});
console.log(`Trade exchange: ${checks} cases passed`);
