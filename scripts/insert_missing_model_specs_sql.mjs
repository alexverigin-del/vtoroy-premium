#!/usr/bin/env node
// Content-only, insert-only repair. Preview rolls back; --commit emits COMMIT.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
assert(args.every((arg) => arg === "--commit"), "Only --commit is supported");
const manifest = JSON.parse(readFileSync(new URL(
  "../directus/content-inserts/2026-09-04-device-model-specifications.json", import.meta.url,
), "utf8"));
const fields = [
  ["display", "Экран", "Экран"],
  ["performance", "Производительность", "Чип"],
  ["cameras", "Камеры", "Камеры"],
  ["connectivity", "Подключение и питание", "Разъём и зарядка"],
  ["connectivity", "Подключение и питание", "Интерфейсы"],
  ["body", "Корпус", "Защита модели"],
  ["body", "Корпус", "Размеры и вес"],
];
assert.equal(manifest.models.length, 4);
assert.equal(new Set(manifest.models.map((model) => model.id)).size, 4);
const rows = manifest.models.flatMap((model) => {
  assert.equal(model.values.length, fields.length);
  return model.values.map((value, index) => {
    assert(typeof value === "string" && value.trim().length > 0);
    const source = model.sourceOverrides?.[index] ?? model.source;
    assert(["support.apple.com", "www.samsung.com", "news.samsung.com"].includes(new URL(source).hostname));
    return [model.id, model.slug, ...fields[index], value, source, manifest.checkedAt, (index + 1) * 10];
  });
});
const quote = (value) => typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;
const values = rows.map((row) => `(${row.map(quote).join(",")})`).join(",\n");

process.stdout.write(`BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE device_model_specifications IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE expected_specs (
  device_model uuid, model_slug text, group_key text, group_label text,
  label text, value text, source_url text, source_checked_at date, sort integer
) ON COMMIT DROP;
INSERT INTO expected_specs VALUES ${values};
CREATE TEMP TABLE previous_specs ON COMMIT DROP AS
SELECT id, to_jsonb(s) AS snapshot FROM device_model_specifications s;
CREATE TEMP TABLE previous_products ON COMMIT DROP AS
SELECT id, to_jsonb(p) AS snapshot FROM products p;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM expected_specs e LEFT JOIN device_models m
    ON m.id=e.device_model AND m.slug=e.model_slug WHERE m.id IS NULL) THEN
    RAISE EXCEPTION 'Model identity changed; review required';
  END IF;
  IF EXISTS (SELECT 1 FROM expected_specs e JOIN device_model_specifications s
    ON s.device_model=e.device_model AND s.label=e.label
    WHERE (s.value,s.group_key,s.group_label,s.source_url,s.source_checked_at,s.sort,s.is_active)
      IS DISTINCT FROM (e.value,e.group_key,e.group_label,e.source_url,e.source_checked_at,e.sort,true)) THEN
    RAISE EXCEPTION 'Existing editor content differs; refusing to overwrite';
  END IF;
END $$;
INSERT INTO device_model_specifications
  (device_model,group_key,group_label,label,value,source_url,source_checked_at,sort,is_active)
SELECT device_model,group_key,group_label,label,value,source_url,source_checked_at,sort,true
FROM expected_specs ON CONFLICT(device_model,label) DO NOTHING;
DO $$
BEGIN
  IF (SELECT count(*) FROM expected_specs e JOIN device_model_specifications s
    ON s.device_model=e.device_model AND s.label=e.label AND s.is_active AND s.value=e.value) <> 28 THEN
    RAISE EXCEPTION 'Incomplete specification insert';
  END IF;
  IF EXISTS (SELECT 1 FROM previous_specs old LEFT JOIN device_model_specifications s USING(id)
    WHERE old.snapshot IS DISTINCT FROM to_jsonb(s)) THEN
    RAISE EXCEPTION 'Existing specifications changed';
  END IF;
  IF EXISTS (SELECT 1 FROM previous_products old FULL JOIN products p USING(id)
    WHERE old.snapshot IS DISTINCT FROM to_jsonb(p)) THEN
    RAISE EXCEPTION 'Products changed';
  END IF;
END $$;
SELECT 'inserted_specs', count(*)-(SELECT count(*) FROM previous_specs) FROM device_model_specifications;
SELECT 'published_devices_without_specs',count(*) FROM products p
WHERE p.status='published' AND p.product_type='device' AND NOT EXISTS (
  SELECT 1 FROM device_model_specifications s WHERE s.device_model=p.device_model AND s.is_active
);
${args.includes("--commit") ? "COMMIT" : "ROLLBACK"};
`);
