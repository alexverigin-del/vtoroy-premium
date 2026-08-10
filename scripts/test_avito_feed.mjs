#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildAvitoFeed } from "../apps/web/lib/avito-feed.ts";

const ready = {
  external_id: "isvoi-source-1",
  category_code: "Мобильные телефоны",
  attributes: { Condition: "Used", GoodsType: "Smartphones", unsafe_key: { secret: true } },
  product: {
    status: "published",
    content_status: "ready",
    stock_status: "available",
    stock_quantity: 1,
    condition: "used",
    title: "Phone <Verified>",
    price: 24990,
    short_description: "Проверен & готов к продаже",
    images: [{ status: "published", image: { id: "image-1" } }],
  },
};

const blocked = {
  ...ready,
  external_id: "isvoi-blocked",
  product: { ...ready.product, content_status: "needs_photo" },
};

const sold = {
  ...ready,
  external_id: "isvoi-sold",
  product: { ...ready.product, stock_quantity: 0, stock_status: "sold" },
};

const feed = buildAvitoFeed([ready, blocked, sold], "https://api.isvoi.ru");
assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
assert.match(feed, /<Id>isvoi-source-1<\/Id>/);
assert.match(feed, /Phone &lt;Verified&gt;/);
assert.match(feed, /Проверен &amp; готов к продаже/);
assert.match(feed, /<Condition>Used<\/Condition>/);
assert.match(feed, /https:\/\/api\.isvoi\.ru\/assets\/image-1/);
assert.doesNotMatch(feed, /isvoi-blocked|isvoi-sold|unsafe_key|secret/);
assert.equal((feed.match(/<Ad>/g) || []).length, 1);

process.stdout.write("Avito feed tests passed.\n");
