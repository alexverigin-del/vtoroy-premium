#!/usr/bin/env node
// Content-only, insert-only repair. Preview rolls back; --commit emits COMMIT.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
assert(args.every((arg) => arg === "--commit"), "Only --commit is supported");
const manifest = JSON.parse(
  readFileSync(
    new URL("../directus/content-inserts/2026-09-05-iphone-15-pro-max.json", import.meta.url),
    "utf8",
  ),
);
const fields = [
  ["display", "Экран", "Экран"],
  ["performance", "Производительность", "Чип"],
  ["cameras", "Камеры", "Камеры"],
  ["connectivity", "Подключение и питание", "Разъём и зарядка"],
  ["connectivity", "Подключение и питание", "Интерфейсы"],
  ["body", "Корпус", "Защита модели"],
  ["body", "Корпус", "Размеры и вес"],
];
assert.equal(manifest.values.length, fields.length);
assert.equal(new URL(manifest.source).hostname, "support.apple.com");

const quote = (value) =>
  typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const model = manifest.model;
const specs = fields.map((field, index) => [
  model.id,
  ...field,
  manifest.values[index],
  manifest.source,
  manifest.checkedAt,
  (index + 1) * 10,
]);
const specValues = specs.map((row) => `(${row.map(quote).join(",")})`).join(",\n");

process.stdout.write(`BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE device_models, device_model_specifications IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM device_models WHERE slug=${quote(model.slug)} AND
    (id,brand,name,family,year,is_active,sort) IS DISTINCT FROM
    (${quote(model.id)}::uuid,${quote(model.brand)}::uuid,${quote(model.name)},${quote(model.family)},${model.year},true,${model.sort})) THEN
    RAISE EXCEPTION 'Existing iPhone 15 Pro Max model differs; refusing to overwrite';
  END IF;
END $$;
INSERT INTO device_models(id,slug,brand,name,family,year,is_active,sort)
VALUES (${quote(model.id)}::uuid,${quote(model.slug)},${quote(model.brand)}::uuid,${quote(model.name)},${quote(model.family)},${model.year},true,${model.sort})
ON CONFLICT(slug) DO NOTHING;
CREATE TEMP TABLE expected_specs (
  device_model uuid, group_key text, group_label text, label text,
  value text, source_url text, source_checked_at date, sort integer
) ON COMMIT DROP;
INSERT INTO expected_specs VALUES ${specValues};
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM expected_specs e JOIN device_model_specifications s
    ON s.device_model=e.device_model AND s.label=e.label
    WHERE (s.value,s.group_key,s.group_label,s.source_url,s.source_checked_at,s.sort,s.is_active)
      IS DISTINCT FROM (e.value,e.group_key,e.group_label,e.source_url,e.source_checked_at,e.sort,true)) THEN
    RAISE EXCEPTION 'Existing iPhone 15 Pro Max specifications differ; refusing to overwrite';
  END IF;
END $$;
INSERT INTO device_model_specifications
  (device_model,group_key,group_label,label,value,source_url,source_checked_at,sort,is_active)
SELECT device_model,group_key,group_label,label,value,source_url,source_checked_at,sort,true
FROM expected_specs ON CONFLICT(device_model,label) DO NOTHING;
DO $$
BEGIN
  IF (SELECT count(*) FROM expected_specs e JOIN device_model_specifications s
    ON s.device_model=e.device_model AND s.label=e.label AND s.is_active AND s.value=e.value) <> 7 THEN
    RAISE EXCEPTION 'Incomplete iPhone 15 Pro Max specification insert';
  END IF;
END $$;
SELECT 'iphone_15_pro_max_model',count(*) FROM device_models WHERE slug=${quote(model.slug)};
SELECT 'iphone_15_pro_max_specs',count(*) FROM device_model_specifications
WHERE device_model=${quote(model.id)}::uuid AND is_active;
${args.includes("--commit") ? "COMMIT" : "ROLLBACK"};
`);
