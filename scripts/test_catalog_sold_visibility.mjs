#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  appendPublicCatalogAvailabilityFilter,
  matchesCityStockFilter,
} from "../apps/web/lib/catalog-availability.ts";

const params = new URLSearchParams();
appendPublicCatalogAvailabilityFilter(params);
assert.equal(params.get("filter[_or][0][stock_quantity][_gt]"), "0");
assert.equal(params.get("filter[_or][1][stock_status][_eq]"), "sold");
assert.equal(params.has("filter[stock_quantity][_gt]"), false);

const product = {
  stockStatus: "sold",
  availabilityScope: "unavailable",
};
assert.equal(matchesCityStockFilter(product, "sold"), true);
assert.equal(matchesCityStockFilter(product, "available"), false);

const unavailableElsewhere = {
  stockStatus: "available",
  availabilityScope: "unavailable",
};
assert.equal(matchesCityStockFilter(unavailableElsewhere, "sold"), false);

console.log("catalog sold visibility: ok");
