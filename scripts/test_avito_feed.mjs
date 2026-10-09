#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AVITO_FEED_MAX_IDS,
  buildAvitoFeed,
  parseAvitoPilotIds,
  prepareAvitoFeed,
} from "../apps/web/lib/avito-feed.ts";

const imageId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sourceId = "isvoi-00000000-0000-4000-8000-000000000001";
const ready = {
  channel: "avito",
  status: "active",
  external_id: sourceId,
  category_mapping: {
    channel: "avito",
    product_category: "category-phones",
    external_category: "Телефоны",
    external_goods_type: "Мобильные телефоны",
    default_attributes: { Address: "Тестовый адрес", AdType: "Товар приобретен на продажу" },
    template_version: "phone-template-129639-reviewed-fixture",
    is_active: true,
    is_confirmed: true,
  },
  attributes: {
    Condition: "Б/у",
    Vendor: "Apple",
    Model: "iPhone 14 Pro",
    MemorySize: "256 ГБ",
    Color: "фиолетовый",
    RamSize: "6 ГБ",
    Akb: 90,
    DeviceFlaws: "Включается",
    ScreenCondition: "Без дефектов",
    CaseCondition: "Мелкие царапины",
  },
  product: {
    id: "product-1",
    category: { id: "category-phones", slug: "smartphones" },
    status: "published",
    content_status: "ready",
    stock_status: "available",
    stock_quantity: 1,
    condition: "used",
    title: "iPhone 14 Pro 256 ГБ Deep Purple",
    price: 44990,
    short_description: "Проверен & готов. Комплект: коробка, кабель.",
    listing_file: imageId(1),
    images: [
      { status: "published", role: "gallery", sort: 2, image: { id: imageId(3) } },
      { status: "published", role: "card", sort: 0, image: { id: imageId(1) } },
      { status: "published", role: "gallery", sort: 1, image: { id: imageId(2) } },
      { status: "draft", sort: 0, image: { id: imageId(4) } },
    ],
    inventory_item: [
      {
        product: "product-1",
        quantity: 1,
        eligibility_status: "eligible",
        authenticity_status: "verified",
        identity_status: "matched",
        review_override: true,
        review_note: "Операторская проверка",
        serial_full: "TESTSERIAL123",
        imei_full: "123456789012345",
        purchase_price: 12345,
      },
    ],
  },
};
const options = { allowedIds: [sourceId] };
const run = (row = ready, extra = {}) =>
  prepareAvitoFeed([row], "https://api.isvoi.ru", { ...options, ...extra });
const changed = (patch) => ({ ...structuredClone(ready), ...patch });
const invalid = (row, code) => {
  const report = run(row);
  assert.equal(report.xml, "");
  assert.deepEqual(report.exportedIds, []);
  assert.ok(
    report.errors.some((entry) => entry.codes.includes(code)),
    JSON.stringify(report),
  );
  return report;
};

test("phone values, plain text escaping and explicit JPEG URLs", () => {
  const report = run();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.exportedIds, [sourceId]);
  assert.match(report.xml, /<Category>Телефоны<\/Category>/u);
  assert.match(report.xml, /<GoodsType>Мобильные телефоны<\/GoodsType>/u);
  assert.match(report.xml, /<Condition>Б\/у<\/Condition>/u);
  assert.match(report.xml, /Проверен &amp; готов/u);
  assert.match(report.xml, /format=jpg&amp;quality=90/u);
  assert.match(report.xml, /fit=inside/u);
  assert.doesNotMatch(report.xml, /TESTSERIAL123|123456789012345|purchase_price/u);
  assert.doesNotMatch(report.xml, /<(?:Set|BoxSealed|SimConfig|IMEI|AvitoId)>/u);
  assert.equal(buildAvitoFeed([ready], "https://api.isvoi.ru", options), report.xml);
});

test("owner-rejected iPhone 16 Pro Max beige cannot enter the feed", () => {
  invalid(changed({ attributes: { ...ready.attributes, Model: "iPhone 16 Pro Max", Color: "бежевый" } }), "rejected_model_color_combination");
  assert.deepEqual(run(changed({ attributes: { ...ready.attributes, Model: "iPhone 16 Pro Max", Color: "золотистый" } })).errors, []);
  assert.deepEqual(run(changed({ attributes: { ...ready.attributes, Color: "бежевый" } })).errors, []);
});

test("unverified kit and dependent box fields fail closed in defaults and listing attributes", () => {
  for (const attributes of [
    { BoxSealed: "Нет" },
    { BoxSealed: "Да" },
    { BoxSealed: null },
    { Set: "Коробка | Провод зарядки", BoxSealed: "Нет" },
  ]) {
    for (const inDefaults of [false, true]) {
      const row = changed(
        inDefaults
          ? {
              category_mapping: {
                ...ready.category_mapping,
                default_attributes: { ...ready.category_mapping.default_attributes, ...attributes },
              },
            }
          : { attributes: { ...ready.attributes, ...attributes } },
      );
      invalid(row, "unsupported_or_private_attribute");
    }
  }
});

test("minimal XML preserves approved kit copy without structured box fields", () => {
  const description_override = "Комплект: устройство, коробка, кабель. Коробка открытая.";
  const report = run(changed({ description_override }));
  assert.deepEqual(report.errors, []);
  assert.match(
    report.xml,
    /<Description>Комплект: устройство, коробка, кабель\. Коробка открытая\.<\/Description>/u,
  );
  assert.doesNotMatch(report.xml, /<(?:Set|BoxSealed)>/u);
});

test("unverified box field on one eligible listing prevents a partial pilot", () => {
  const row = changed({
    external_id: "second-id",
    product: {
      ...ready.product,
      id: "product-2",
      inventory_item: [{ ...ready.product.inventory_item[0], product: "product-2" }],
    },
    attributes: { ...ready.attributes, BoxSealed: "Нет" },
  });
  const report = prepareAvitoFeed([ready, row], "https://api.isvoi.ru", {
    allowedIds: [sourceId, "second-id"],
  });
  assert.equal(report.xml, "");
  assert.deepEqual(report.exportedIds, []);
  assert.deepEqual(report.errors, [{ row: 1, codes: ["unsupported_or_private_attribute"] }]);
});

test("cover first, sorted gallery, deduplicated, draft images excluded", () => {
  const urls = [...run().xml.matchAll(/<Image url="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(urls.length, 3);
  assert.ok(urls[0].includes(imageId(1)));
  assert.ok(urls[1].includes(imageId(2)));
  assert.ok(urls[2].includes(imageId(3)));
});

test("at most ten published images", () => {
  const row = changed({
    product: {
      ...ready.product,
      images: Array.from({ length: 15 }, (_, n) => ({
        status: "published",
        role: "gallery",
        sort: n,
        image: imageId(n + 2),
      })),
    },
  });
  assert.equal((run(row).xml.match(/<Image url=/gu) || []).length, 10);
});

test("only explicit 1-9 unique pilot IDs", () => {
  assert.equal(AVITO_FEED_MAX_IDS, 9);
  assert.deepEqual(parseAvitoPilotIds("a,b,c"), ["a", "b", "c"]);
  assert.deepEqual(parseAvitoPilotIds("a,b,c,d,e,f"), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(parseAvitoPilotIds("a,b,c,d,e,f,g,h,i").length, 9);
  for (const value of ["", "a,a", "a,b,c,d,e,f,g,h,i,j", "a,", "a b", "<Id>"]) {
    assert.deepEqual(parseAvitoPilotIds(value), []);
  }
  assert.equal(run(ready, { allowedIds: [] }).errors[0].codes[0], "invalid_pilot_allowlist");
  assert.equal(run(ready, { allowedIds: ["missing"] }).errors[0].codes[0], "missing_pilot_listing");
});

test("route fetch limit includes a duplicate detection row beyond the shared cap", () => {
  const source = readFileSync(new URL("../apps/web/app/integrations/avito/feed.xml/route.ts", import.meta.url), "utf8");
  assert.match(source, /limit:\s*String\(AVITO_FEED_MAX_IDS \+ 1\)/u);
});

const batchRows = (length = 6) => Array.from({ length }, (_, index) => {
  const row = structuredClone(ready);
  row.external_id = `isvoi-${imageId(index + 1)}`;
  row.product.id = `product-${index + 1}`;
  row.product.inventory_item[0].product = row.product.id;
  row.product.listing_file = imageId(index * 10 + 1);
  row.product.images = [];
  return row;
});
const sixRows = () => batchRows();
const feedFor = (rows, allowedIds = rows.map((row) => row.external_id)) =>
  prepareAvitoFeed(rows, "https://api.isvoi.ru", { allowedIds });

test("six explicit IDs preserve the first three ads including their photo order", () => {
  const rows = sixRows();
  const previous = feedFor(rows.slice(0, 3));
  const expanded = feedFor(rows);
  assert.deepEqual(expanded.errors, []);
  assert.deepEqual(expanded.exportedIds, rows.map((row) => row.external_id));
  const ads = (xml) => xml.match(/<Ad>.*?<\/Ad>/gsu);
  assert.deepEqual(ads(expanded.xml).slice(0, 3), ads(previous.xml));
});

test("a tenth allowlisted ID is rejected; an outside row is never a replacement", () => {
  const rows = batchRows(9);
  const outside = changed({ external_id: "tenth" });
  assert.equal(feedFor([...rows, outside]).xml, "");
  const report = feedFor([...rows, outside], rows.map((row) => row.external_id));
  assert.equal(report.exportedIds.length, 9);
  assert.equal(report.excluded[0].codes[0], "outside_pilot");
});

test("nine explicit IDs preserve all six previous ads and their photo order", () => {
  const rows = batchRows(9);
  const previous = feedFor(rows.slice(0, 6));
  const expanded = feedFor(rows);
  assert.deepEqual(expanded.errors, []);
  assert.deepEqual(expanded.exportedIds, rows.map((row) => row.external_id));
  const ads = (xml) => xml.match(/<Ad>.*?<\/Ad>/gsu);
  assert.deepEqual(ads(expanded.xml).slice(0, 6), ads(previous.xml));
});

test("nine-ID feed rejects a missing, duplicate or invalid ninth row", () => {
  const rows = batchRows(9);
  const ids = rows.map((row) => row.external_id);
  assert.equal(feedFor(rows.slice(0, 8), ids).xml, "");
  assert.equal(feedFor([...rows, structuredClone(rows[8])], ids).xml, "");
  rows[8].attributes.IMEI = "123456789012345";
  assert.equal(feedFor(rows, ids).xml, "");
});

test("sold and draft ninth rows are excluded without a replacement", () => {
  for (const kind of ["sold", "draft"]) {
    const rows = batchRows(9);
    if (kind === "draft") rows[8].status = "draft";
    else Object.assign(rows[8].product, { stock_status: "sold", stock_quantity: 0 });
    const report = feedFor(rows);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.exportedIds, rows.slice(0, 8).map((row) => row.external_id));
  }
});

test("six-ID feed fails closed for missing, duplicate or invalid sixth row", () => {
  const rows = sixRows();
  const ids = rows.map((row) => row.external_id);
  assert.equal(feedFor(rows.slice(0, 5), ids).xml, "");
  assert.equal(feedFor([...rows, structuredClone(rows[5])], ids).xml, "");
  rows[5].attributes.IMEI = "123456789012345";
  assert.equal(feedFor(rows, ids).xml, "");
});

test("sold and draft sixth rows remain excluded in the cumulative feed", () => {
  for (const kind of ["sold", "draft"]) {
    const rows = sixRows();
    if (kind === "draft") rows[5].status = "draft";
    else Object.assign(rows[5].product, { stock_status: "sold", stock_quantity: 0 });
    const report = feedFor(rows);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.exportedIds, rows.slice(0, 5).map((row) => row.external_id));
  }
});

test("outside-pilot rows cannot enter the feed", () => {
  const report = prepareAvitoFeed(
    [ready, changed({ external_id: "outside" })],
    "https://api.isvoi.ru",
    options,
  );
  assert.equal((report.xml.match(/<Ad>/gu) || []).length, 1);
  assert.equal(report.excluded[0].codes[0], "outside_pilot");
});

test("draft listing only in explicitly requested local preview", () => {
  const row = changed({ status: "draft" });
  assert.equal(run(row).exportedIds.length, 0);
  assert.equal(run(row, { preview: true }).exportedIds.length, 1);
});

for (const [name, patch] of [
  ["sold", { stock_status: "sold", stock_quantity: 0 }],
  ["reserved", { stock_status: "reserved" }],
  ["draft product", { status: "draft" }],
  ["not ready", { content_status: "needs_photo" }],
  ["zero stock", { stock_quantity: 0 }],
]) {
  test(`${name} excluded without a made-up replacement`, () => {
    const report = run(changed({ product: { ...ready.product, ...patch } }));
    assert.equal(report.exportedIds.length, 0);
    assert.match(report.xml, /<Ads[^>]*><\/Ads>$/u);
  });
}

test("duplicate XML ID or duplicate product withheld", () => {
  for (const row of [structuredClone(ready), changed({ external_id: "another-id" })]) {
    const report = prepareAvitoFeed([ready, row], "https://api.isvoi.ru", {
      allowedIds: [...new Set([sourceId, row.external_id])],
    });
    assert.equal(report.xml, "");
    assert.ok(report.errors.every((entry) => entry.codes.includes("duplicate_identity")));
  }
});

test("legacy immutable ID is preserved", () => {
  const row = changed({ external_id: "123456789" });
  assert.match(run(row, { allowedIds: [row.external_id] }).xml, /<Id>123456789<\/Id>/u);
});

test("no partial pilot on an invalid eligible row", () => {
  const row = changed({ external_id: "second-id", product: { ...ready.product, id: "product-2" } });
  const report = prepareAvitoFeed([ready, row], "https://api.isvoi.ru", {
    allowedIds: [sourceId, "second-id"],
  });
  assert.equal(report.xml, "");
  assert.deepEqual(report.exportedIds, []);
});

for (const status of ["pending", "blocked"]) {
  test(`inventory ${status} blocks export`, () => {
    const item = { ...ready.product.inventory_item[0], eligibility_status: status };
    invalid(
      changed({ product: { ...ready.product, inventory_item: [item] } }),
      "inventory_not_approved",
    );
  });
}

test("inventory identity conflict, multiple links, no review, stale stock block export", () => {
  for (const patch of [
    { identity_status: "conflict" },
    { identity_status: "unmatched" },
    { review_override: false },
    { review_note: "" },
    { quantity: 0 },
    { product: "other" },
  ]) {
    invalid(
      changed({
        product: {
          ...ready.product,
          inventory_item: [{ ...ready.product.inventory_item[0], ...patch }],
        },
      }),
      "inventory_not_approved",
    );
  }
  invalid(changed({ product: { ...ready.product, inventory_item: [] } }), "inventory_not_approved");
  invalid(
    changed({
      product: {
        ...ready.product,
        inventory_item: [ready.product.inventory_item[0], ready.product.inventory_item[0]],
      },
    }),
    "inventory_not_approved",
  );
});

test("mapping must be confirmed, same category, exact phone values", () => {
  for (const patch of [{ is_confirmed: false }, { template_version: "" }]) {
    invalid(
      changed({ category_mapping: { ...ready.category_mapping, ...patch } }),
      "unconfirmed_mapping",
    );
  }
  for (const patch of [
    { product_category: "other" },
    { external_category: "smartphones" },
    { external_goods_type: "Смартфоны" },
  ]) {
    invalid(
      changed({ category_mapping: { ...ready.category_mapping, ...patch } }),
      "unsupported_phone_category",
    );
  }
});

test("derived visible condition and mismatched condition are rejected", () => {
  for (const Condition of ["Used", "Отличное", "Новое", 1]) {
    invalid(changed({ attributes: { ...ready.attributes, Condition } }), "invalid_condition");
  }
  const attributes = { ...ready.attributes };
  delete attributes.Condition;
  assert.match(run(changed({ attributes })).xml, /<Condition>Б\/у<\/Condition>/u);
});

test("required fields and dictionary values", () => {
  for (const key of ["Address", "Vendor", "Model", "MemorySize", "Color", "RamSize"]) {
    invalid(changed({ attributes: { ...ready.attributes, [key]: "" } }), `missing_${key}`);
  }
  for (const [key, value, code] of [
    ["Color", "Deep Purple", "invalid_color"],
    ["DeviceFlaws", "OK", "invalid_device_flaws"],
    ["ScreenCondition", "Идеальный", "invalid_screen_condition"],
    ["CaseCondition", "Grade A", "invalid_case_condition"],
    ["MemorySize", "256", "invalid_memory_size"],
    ["RamSize", "6", "invalid_ram_size"],
  ]) {
    invalid(changed({ attributes: { ...ready.attributes, [key]: value } }), code);
  }
});

test("Apple battery must be an actual integer 0-100", () => {
  for (const Akb of [undefined, null, "", -1, 101, 90.5, "98%", NaN]) {
    invalid(changed({ attributes: { ...ready.attributes, Akb } }), "invalid_battery");
  }
  assert.equal(run(changed({ attributes: { ...ready.attributes, Akb: 0 } })).errors.length, 0);
});

test("zero/negative/fractional override does not fall back to site price", () => {
  for (const price_override of [0, -1, 123.45, "", NaN, Infinity]) {
    invalid(changed({ price_override }), "invalid_price");
  }
  assert.match(run(changed({ price_override: 45000 })).xml, /<Price>45000<\/Price>/u);
});

test("title and description limits, HTML and XML control characters", () => {
  invalid(changed({ title_override: "x".repeat(51) }), "invalid_title_length");
  invalid(changed({ description_override: "x".repeat(7501) }), "invalid_description_length");
  invalid(changed({ description_override: "<p>Описание</p>" }), "html_not_supported");
  invalid(changed({ description_override: "Описание\u0000" }), "invalid_xml_character");
  invalid(changed({ description_override: "Описание\uD800" }), "invalid_xml_character");
});

test("private and unknown attributes are rejected rather than echoed", () => {
  for (const key of [
    "IMEI",
    "serial_full",
    "purchase_price",
    "margin",
    "Secret",
    "Id",
    "Price",
    "AvitoId",
    "Set",
  ]) {
    const report = invalid(
      changed({ attributes: { ...ready.attributes, [key]: "sensitive-value" } }),
      "unsupported_or_private_attribute",
    );
    assert.doesNotMatch(JSON.stringify(report), /sensitive-value/u);
  }
  invalid(
    changed({ attributes: { ...ready.attributes, Model: ["iPhone 14 Pro"] } }),
    "invalid_attribute_type",
  );
});

test("private identifiers also cannot leak through descriptions, titles, ID or values", () => {
  for (const value of [
    "123456789012345",
    "TESTSERIAL123",
    "testserial123",
    "TEST SERIAL 123",
    "SERIAL: ANOTHERSERIAL99",
  ]) {
    const report = invalid(
      changed({ description_override: `Описание ${value}` }),
      "private_identifier",
    );
    assert.doesNotMatch(JSON.stringify(report), /TESTSERIAL123|123456789012345/u);
  }
});

test("non-HTTPS origins, credentials and query params fail closed", () => {
  for (const url of [
    "http://api.isvoi.ru",
    "https://u:p@api.isvoi.ru",
    "https://api.isvoi.ru?token=x",
    "invalid",
  ]) {
    const report = prepareAvitoFeed([ready], url, options);
    assert.equal(report.xml, "");
    assert.deepEqual(report.errors[0].codes, ["invalid_asset_origin"]);
  }
});

test("no images or arbitrary non-file paths block export", () => {
  invalid(
    changed({ product: { ...ready.product, images: [], listing_file: null } }),
    "missing_images",
  );
  invalid(
    changed({ product: { ...ready.product, images: [], listing_file: "../private" } }),
    "missing_images",
  );
});
