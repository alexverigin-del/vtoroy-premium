import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { parseAvitoCashStockApprovals, prepareAvitoFeed } from "../apps/web/lib/avito-feed.ts";

const uuid = "00000000-0000-4000-8000-000000000001";
const id = "isvoi-" + uuid;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const approval = { productId: "samsung", inventoryId: uuid, sourceId: uuid, sku: "TEST",
  barcodeSha256: digest("000123"), serialSha256: digest("TESTSERIAL") };
const config = { version: 1, authority: "cash_snapshot_owner_confirmation", entries: { [id]: approval } };
const row = {
  channel: "avito", status: "active", external_id: id,
  category_mapping: { channel: "avito", product_category: "phones", external_category: "Телефоны",
    external_goods_type: "Мобильные телефоны", template_version: "reviewed", is_active: true,
    is_confirmed: true, default_attributes: { Address: "Тестовый адрес", AdType: "Товар приобретен на продажу" } },
  title_override: "Samsung Galaxy S23 Ultra 256 ГБ Cream",
  description_override: "Устройство с пробегом. Батарея: 85% по отчёту от 21.08.2026.",
  attributes: { Vendor: "Samsung", Model: "Galaxy S23 Ultra", MemorySize: "256 ГБ", RamSize: "12 ГБ",
    Color: "бежевый", Condition: "Б/у", Akb: 85, DeviceFlaws: "Включается",
    ScreenCondition: "Без дефектов", CaseCondition: "Без дефектов" },
  product: { id: "samsung", sku: "TEST", category: { id: "phones", slug: "smartphones" },
    status: "published", content_status: "ready", condition: "used", price: 47995,
    stock_status: "available", stock_quantity: 1, listing_file: uuid, images: [],
    inventory_item: [{ id: uuid, product: "samsung", source_id: uuid, source_sku: "TEST",
      barcode: "000123", serial_full: "TESTSERIAL", quantity: 1, for_sale: true,
      identity_status: "unmatched", eligibility_status: "eligible", authenticity_status: "verified",
      review_override: true, review_note: "Проверено" }] },
};
const run = (value = row, proofs = config) => prepareAvitoFeed([value], "https://api.isvoi.ru",
  { allowedIds: [id], cashStockApprovals: parseAvitoCashStockApprovals(JSON.stringify(proofs)) || {} });

test("cash approval admits exact serialized stock without changing receipt identity or leaking proof", () => {
  const before = structuredClone(row);
  const report = run();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(row, before);
  assert.match(report.xml, /<RamSize>12 ГБ<\/RamSize>/u);
  assert.doesNotMatch(report.xml, /TESTSERIAL|000123|barcodeSha256|serialSha256/u);
  assert.equal(row.product.inventory_item[0].identity_status, "unmatched");
});
test("unmatched still fails without explicit cash approval", () => {
  assert.equal(prepareAvitoFeed([row], "https://api.isvoi.ru", { allowedIds: [id] }).xml, "");
});
test("serialized not_applicable requires exact cash proof and preserves the warning status", () => {
  const changed = structuredClone(row);
  changed.product.inventory_item[0].identity_status = "not_applicable";
  assert.deepEqual(run(changed).errors, []);
  assert.equal(prepareAvitoFeed([changed], "https://api.isvoi.ru", { allowedIds: [id] }).xml, "");
  changed.product.inventory_item[0].barcode = "OTHER";
  assert.equal(run(changed).xml, "");
});
test("cash identifier, review, authenticity, stock and explicit conflict drift fail closed", () => {
  for (const patch of [
    { serial_full: "OTHER" }, { barcode: "123" }, { source_id: "other" }, { id: "other" },
    { source_sku: "other" }, { for_sale: false }, { identity_status: "conflict" },
    { review_override: false }, { review_note: "" }, { quantity: 2 }, { authenticity_status: "pending" },
  ]) {
    const changed = structuredClone(row);
    Object.assign(changed.product.inventory_item[0], patch);
    assert.equal(run(changed).xml, "", JSON.stringify(patch));
  }
});
test("sold cash-approved product stays excluded", () => {
  const changed = structuredClone(row);
  changed.product.stock_status = "sold";
  changed.product.stock_quantity = 0;
  assert.deepEqual(run(changed).exportedIds, []);
});
test("invalid server-only cash approval config is rejected", () => {
  for (const value of ["invalid", "[]", "{}", JSON.stringify({ ...config, version: 2 }),
    JSON.stringify({ ...config, entries: [] }), JSON.stringify({ ...config, entries: { [id]: { ...approval, serialSha256: "bad" } } }),
    JSON.stringify({ ...config, entries: { other: approval } })]) {
    assert.equal(parseAvitoCashStockApprovals(value), null);
  }
  assert.deepEqual(parseAvitoCashStockApprovals(""), {});
});
