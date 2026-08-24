#!/usr/bin/env node
/**
 * Focused Studio UX migration for the inventory -> catalog -> Avito workflow.
 *
 * This intentionally does not recreate product presets owned by Studio UX v3.
 */

const rollback = process.argv.includes("--rollback");

console.log(`
\\set ON_ERROR_STOP on
${rollback ? "BEGIN;" : "BEGIN;"}

INSERT INTO directus_collections(
  collection,icon,note,hidden,singleton,sort,translations,collapse
) VALUES (
  'isvoi_channels','campaign',
  'Категории, объявления и unit-экономика внешних каналов продаж.',
  false,false,65,
  '[{"language":"ru-RU","translation":"Avito и экономика"}]'::json,'open'
)
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon,note=EXCLUDED.note,hidden=false,singleton=false,
  sort=EXCLUDED.sort,translations=EXCLUDED.translations,collapse='open';

UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Карточки сайта"}]'::json,
  note='Фото, описание, Passport, QA и публикация карточек публичного каталога.'
WHERE collection='isvoi_catalog';

UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Склад и сверка"}]'::json,
  note='Snapshot, остатки, поступления и проблемы активной партии.'
WHERE collection='isvoi_inventory';

UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Карточки товаров"}]'::json
WHERE collection='products';
UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Остатки из учётной системы"}]'::json
WHERE collection='inventory_items';
UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Проблемы сверки"}]'::json
WHERE collection='inventory_import_issues';
UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Объявления Avito"}]'::json
WHERE collection='product_channel_listings';
UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Категории Avito"}]'::json
WHERE collection='channel_category_mappings';
UPDATE directus_collections SET
  translations='[{"language":"ru-RU","translation":"Расходы Avito"}]'::json
WHERE collection='channel_cost_profiles';

UPDATE directus_collections SET "group"='isvoi_inventory',sort=10
WHERE collection='inventory_import_batches';
UPDATE directus_collections SET "group"='isvoi_inventory',sort=20
WHERE collection='inventory_import_issues';
UPDATE directus_collections SET "group"='isvoi_inventory',sort=30
WHERE collection='inventory_items';
UPDATE directus_collections SET "group"='isvoi_inventory',sort=40
WHERE collection='inventory_receipt_lines';

UPDATE directus_collections SET "group"='isvoi_channels',sort=10
WHERE collection='product_channel_listings';
UPDATE directus_collections SET "group"='isvoi_channels',sort=20
WHERE collection='channel_category_mappings';
UPDATE directus_collections SET "group"='isvoi_channels',sort=30
WHERE collection='channel_cost_profiles';
UPDATE directus_collections SET "group"='isvoi_channels',sort=40
WHERE collection='product_unit_economics';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_inventory_ux_preset(
  p_collection varchar,p_bookmark varchar,p_icon varchar,p_color varchar,
  p_filter json,p_fields json,p_sort json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE role_id uuid; query json;
BEGIN
  SELECT id INTO role_id FROM directus_roles WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF role_id IS NULL THEN RETURN; END IF;
  query := json_build_object('tabular',json_build_object(
    'sort',p_sort,'fields',p_fields,'page',1
  ));
  INSERT INTO directus_presets(
    bookmark,role,"user",collection,layout,layout_query,filter,icon,color
  ) VALUES (p_bookmark,role_id,NULL,p_collection,'tabular',query,p_filter,p_icon,p_color);
END $$;

DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id AND role.name='ISVOI Inventory Manager'
  AND preset."user" IS NULL
  AND (
    preset.collection IN ('inventory_items','inventory_import_issues','product_channel_listings')
  );

SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_import_issues','1 · Открытые блокеры','report_problem','#dc2626',
  '{"_and":[{"severity":{"_eq":"blocker"}},{"resolved":{"_eq":false}},{"batch":{"status":{"_neq":"archived"}}}]}'::json,
  '["inventory_item","severity","code","message","resolved","resolution_note"]'::json,'["-created_at"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_import_issues','2 · Открытые предупреждения','warning','#d97706',
  '{"_and":[{"severity":{"_eq":"warning"}},{"resolved":{"_eq":false}},{"batch":{"status":{"_neq":"archived"}}}]}'::json,
  '["inventory_item","severity","code","message","resolved","resolution_note"]'::json,'["-created_at"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_import_issues','3 · Проблемы активной партии','history','#2563eb',
  '{"_and":[{"resolved":{"_eq":false}},{"batch":{"status":{"_neq":"archived"}}}]}'::json,
  '["inventory_item","severity","code","message","resolved"]'::json,'["-created_at"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_import_issues','4 · Решённые проблемы','task_alt','#059669',
  '{"resolved":{"_eq":true}}'::json,
  '["inventory_item","batch","severity","code","message","resolution_note","resolved"]'::json,'["-created_at"]'::json
);

SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_items','1 · Проверить происхождение','policy','#dc2626',
  '{"authenticity_status":{"_in":["pending","review","blocked"]}}'::json,
  '["source_title","source_sku","quantity","authenticity_status","eligibility_status","block_reason"]'::json,'["source_title"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_items','2 · Исправить идентичность','fingerprint','#dc2626',
  '{"identity_status":{"_eq":"conflict"}}'::json,
  '["source_title","source_sku","quantity","identity_status","authenticity_status","block_reason"]'::json,'["source_title"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_items','3 · Готово к передаче','publish','#059669',
  '{"eligibility_status":{"_eq":"eligible"}}'::json,
  '["source_title","source_sku","quantity","retail_price","product","review_note"]'::json,'["source_title"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'inventory_items','4 · Передано в карточки сайта','check_circle','#2563eb',
  '{"_and":[{"eligibility_status":{"_eq":"eligible"}},{"product":{"_nnull":true}}]}'::json,
  '["source_title","source_sku","quantity","retail_price","product","review_note"]'::json,'["source_title"]'::json
);

SELECT pg_temp.isvoi_inventory_ux_preset(
  'product_channel_listings','1 · Avito: черновики','edit_note','#64748b',
  '{"_and":[{"channel":{"_eq":"avito"}},{"status":{"_eq":"draft"}}]}'::json,
  '["external_id","product","status","category_mapping","price_override","sync_status"]'::json,'["external_id"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'product_channel_listings','2 · Avito: готово к QA','fact_check','#2563eb',
  '{"_and":[{"channel":{"_eq":"avito"}},{"status":{"_eq":"ready"}}]}'::json,
  '["external_id","product","status","category_mapping","price_override","sync_status"]'::json,'["external_id"]'::json
);
SELECT pg_temp.isvoi_inventory_ux_preset(
  'product_channel_listings','3 · Avito: активные','campaign','#2563eb',
  '{"_and":[{"channel":{"_eq":"avito"}},{"status":{"_eq":"active"}}]}'::json,
  '["external_id","product","status","category_mapping","price_override","last_exported_at","sync_status"]'::json,'["external_id"]'::json
);

${rollback ? "ROLLBACK;" : "COMMIT;"}

SELECT 'studio_ux_v4.channels_group' AS check_name,count(*)::text AS value
FROM directus_collections WHERE collection='isvoi_channels'
UNION ALL
SELECT 'studio_ux_v4.inventory_presets',count(*)::text
FROM directus_presets preset JOIN directus_roles role ON role.id=preset.role
WHERE role.name='ISVOI Inventory Manager' AND preset."user" IS NULL
  AND preset.collection IN ('inventory_items','inventory_import_issues','product_channel_listings');
`);
