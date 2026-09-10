#!/usr/bin/env node

import assert from "node:assert/strict";
import { stockStatusLabel } from "../apps/web/lib/stock-status.ts";

assert.equal(stockStatusLabel("available", 1), "В наличии");
assert.equal(stockStatusLabel("reserved", 0), "Бронь");
assert.equal(stockStatusLabel("sold", 0), "Продано");
assert.equal(stockStatusLabel("available", 0), "Нет в наличии");
console.log("sold status contract: ok");
