import assert from "node:assert/strict";

import {
  buildYandexBusinessFeed,
  selectYandexBusinessOffers,
} from "../apps/web/lib/yandex-business-feed.ts";

const baseProduct = {
  product_type: "device",
  condition: "used",
  status: "published",
  content_status: "ready",
  stock_status: "available",
  stock_quantity: 1,
  category: { slug: "smartphones", name: "Смартфоны" },
  device_details: { grade: "A", battery_text: "Аккумулятор 89%" },
  offers: [
    {
      status: "published",
      price: 51999,
      stock_quantity: 1,
      stock_status: "available",
      updated_at: "2026-09-01T10:00:00Z",
      location: { slug: "belgorod", status: "published" },
    },
  ],
};

const offers = selectYandexBusinessOffers(
  [
    {
      ...baseProduct,
      id: "iphone-14-pro",
      title: "Apple iPhone 14 Pro 256 ГБ & тест",
      short_description: "Проверен до покупки",
      headline: "Проверенный iPhone с Passport",
      warranty_text: "90 дней",
      completeness: "Устройство, коробка, кабель",
      listing_file: { id: "apple-image" },
      brand: { slug: "apple", name: "Apple" },
    },
    {
      ...baseProduct,
      id: "galaxy-s24",
      title: "Samsung Galaxy S24",
      listing_file: "samsung-image",
      brand: { slug: "samsung", name: "Samsung" },
    },
    {
      ...baseProduct,
      id: "draft-product",
      status: "draft",
      title: "Черновик",
      listing_file: "draft-image",
      brand: { slug: "apple", name: "Apple" },
    },
    {
      ...baseProduct,
      id: "unsupported-category",
      title: "Apple Watch",
      category: { slug: "watches", name: "Часы и браслеты" },
      listing_file: "watch-image",
      brand: { slug: "apple", name: "Apple" },
    },
  ],
  { directusPublicUrl: "https://api.isvoi.ru/", siteUrl: "https://isvoi.ru/" },
);

assert.equal(offers.length, 2);
assert.equal(offers[0].categoryId, "101");
assert.equal(offers[0].categoryName, "iPhone с пробегом");
assert.equal(offers[1].categoryId, "102");
assert.equal(offers[1].categoryName, "Samsung Galaxy с пробегом");
assert.equal(offers[0].price, 51999);
assert.match(offers[0].picture, /^https:\/\/api\.isvoi\.ru\/assets\/apple-image\?/u);
assert.match(offers[0].url, /utm_source=yandex_business/u);

const feed = buildYandexBusinessFeed(offers);
assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert.equal((feed.match(/<offer id=/gu) ?? []).length, 2);
assert.equal((feed.match(/<category id=/gu) ?? []).length, 2);
assert.match(feed, /Apple iPhone 14 Pro 256 ГБ &amp; тест/u);
assert.doesNotMatch(feed, /draft-product|unsupported-category|serial|imei/iu);

console.log("Yandex Business feed tests: OK");
