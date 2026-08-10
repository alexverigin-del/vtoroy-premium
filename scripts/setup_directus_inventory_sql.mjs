#!/usr/bin/env node
/** Print the additive Directus migration for private inventory and channel data. */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS inventory_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  batch_name varchar(160) NOT NULL UNIQUE,
  source_system varchar(64) NOT NULL DEFAULT 'store_inventory',
  snapshot_at timestamptz NOT NULL,
  inventory_workbook uuid NOT NULL REFERENCES directus_files(id) ON DELETE RESTRICT,
  receipts_workbook uuid REFERENCES directus_files(id) ON DELETE RESTRICT,
  confirm_missing_deactivation boolean NOT NULL DEFAULT false,
  inventory_rows integer,
  inventory_units integer,
  receipt_rows integer,
  blocker_count integer,
  warning_count integer,
  last_run_mode varchar(32),
  last_run_status varchar(32),
  last_run_at timestamptz,
  last_run_log text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(64) NOT NULL,
  source_id varchar(160) NOT NULL,
  source_sku varchar(160) NOT NULL,
  source_article varchar(160),
  barcode varchar(160),
  source_title text NOT NULL,
  source_description text,
  source_group varchar(255),
  source_group_path text,
  condition varchar(32) NOT NULL DEFAULT 'new',
  item_kind varchar(32) NOT NULL DEFAULT 'pooled',
  serial_full varchar(255),
  imei_full varchar(255),
  quantity integer NOT NULL DEFAULT 0,
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  retail_price numeric(14,2) NOT NULL DEFAULT 0,
  for_sale boolean NOT NULL DEFAULT true,
  ownership varchar(64),
  identity_status varchar(32) NOT NULL DEFAULT 'not_applicable',
  authenticity_status varchar(32) NOT NULL DEFAULT 'pending',
  eligibility_status varchar(32) NOT NULL DEFAULT 'pending',
  block_reason text,
  review_override boolean NOT NULL DEFAULT false,
  review_note text,
  product varchar(255) REFERENCES products(id) ON DELETE SET NULL,
  last_seen_batch uuid REFERENCES inventory_import_batches(id) ON DELETE SET NULL,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_id)
);

CREATE TABLE IF NOT EXISTS inventory_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch uuid NOT NULL REFERENCES inventory_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  source_title text NOT NULL,
  source_category varchar(255),
  source_subcategory varchar(255),
  imei_full varchar(255),
  serial_full varchar(255),
  quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  target_markup numeric(10,6),
  target_margin numeric(10,6),
  target_price numeric(14,2),
  total_cost numeric(14,2),
  total_price numeric(14,2),
  inventory_item uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  product varchar(255) REFERENCES products(id) ON DELETE SET NULL,
  match_status varchar(32) NOT NULL DEFAULT 'unmatched',
  match_note text,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch, row_number)
);

CREATE TABLE IF NOT EXISTS inventory_import_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch uuid NOT NULL REFERENCES inventory_import_batches(id) ON DELETE CASCADE,
  severity varchar(16) NOT NULL,
  code varchar(80) NOT NULL,
  source_kind varchar(32) NOT NULL,
  row_number integer,
  source_id varchar(160),
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_cost_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel varchar(32) NOT NULL,
  name varchar(160) NOT NULL,
  category uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_confirmed boolean NOT NULL DEFAULT false,
  commission_rate numeric(10,6) NOT NULL DEFAULT 0,
  acquiring_rate numeric(10,6) NOT NULL DEFAULT 0,
  tax_rate numeric(10,6) NOT NULL DEFAULT 0,
  return_reserve_rate numeric(10,6) NOT NULL DEFAULT 0,
  promotion_per_unit numeric(14,2) NOT NULL DEFAULT 0,
  delivery_per_unit numeric(14,2) NOT NULL DEFAULT 0,
  other_variable_per_unit numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, name)
);

CREATE TABLE IF NOT EXISTS product_channel_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel varchar(32) NOT NULL DEFAULT 'avito',
  status varchar(32) NOT NULL DEFAULT 'draft',
  external_id varchar(180) NOT NULL,
  title_override varchar(255),
  description_override text,
  price_override numeric(14,2),
  category_code varchar(160),
  attributes jsonb,
  last_export_hash varchar(128),
  last_exported_at timestamptz,
  sync_status varchar(32),
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id),
  UNIQUE (product, channel)
);

CREATE INDEX IF NOT EXISTS inventory_items_product_idx ON inventory_items(product);
CREATE INDEX IF NOT EXISTS inventory_items_status_idx ON inventory_items(eligibility_status, identity_status, authenticity_status);
CREATE INDEX IF NOT EXISTS inventory_issues_batch_idx ON inventory_import_issues(batch, severity, resolved);
CREATE INDEX IF NOT EXISTS channel_listings_status_idx ON product_channel_listings(channel, status);

CREATE OR REPLACE FUNCTION isvoi_inventory_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['inventory_import_batches','inventory_items','channel_cost_profiles','product_channel_listings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_touch_updated_at', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION isvoi_inventory_touch_updated_at()', table_name || '_touch_updated_at', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW product_unit_economics AS
SELECT
  md5(listing.product || ':' || listing.channel) AS id,
  listing.product,
  listing.channel,
  COALESCE(listing.price_override, product.price::numeric) AS effective_price,
  item.purchase_price,
  COALESCE(listing.price_override, product.price::numeric) - item.purchase_price AS gross_profit,
  CASE WHEN COALESCE(listing.price_override, product.price::numeric) > 0
    THEN (COALESCE(listing.price_override, product.price::numeric) - item.purchase_price)
      / COALESCE(listing.price_override, product.price::numeric)
    ELSE NULL END AS gross_margin,
  COALESCE(listing.price_override, product.price::numeric) * (
    COALESCE(profile.commission_rate,0) + COALESCE(profile.acquiring_rate,0) +
    COALESCE(profile.tax_rate,0) + COALESCE(profile.return_reserve_rate,0)
  ) + COALESCE(profile.promotion_per_unit,0) + COALESCE(profile.delivery_per_unit,0) +
    COALESCE(profile.other_variable_per_unit,0) AS variable_cost,
  COALESCE(listing.price_override, product.price::numeric) - item.purchase_price - (
    COALESCE(listing.price_override, product.price::numeric) * (
      COALESCE(profile.commission_rate,0) + COALESCE(profile.acquiring_rate,0) +
      COALESCE(profile.tax_rate,0) + COALESCE(profile.return_reserve_rate,0)
    ) + COALESCE(profile.promotion_per_unit,0) + COALESCE(profile.delivery_per_unit,0) +
      COALESCE(profile.other_variable_per_unit,0)
  ) AS contribution,
  CASE WHEN COALESCE(listing.price_override, product.price::numeric) > 0 THEN (
    COALESCE(listing.price_override, product.price::numeric) - item.purchase_price - (
      COALESCE(listing.price_override, product.price::numeric) * (
        COALESCE(profile.commission_rate,0) + COALESCE(profile.acquiring_rate,0) +
        COALESCE(profile.tax_rate,0) + COALESCE(profile.return_reserve_rate,0)
      ) + COALESCE(profile.promotion_per_unit,0) + COALESCE(profile.delivery_per_unit,0) +
        COALESCE(profile.other_variable_per_unit,0)
    )
  ) / COALESCE(listing.price_override, product.price::numeric) ELSE NULL END AS contribution_margin,
  COALESCE(profile.is_confirmed,false) AS cost_profile_complete
FROM product_channel_listings listing
JOIN products product ON product.id = listing.product
JOIN inventory_items item ON item.product = product.id
LEFT JOIN LATERAL (
  SELECT cost.* FROM channel_cost_profiles cost
  WHERE cost.channel = listing.channel AND cost.is_active = true
    AND (cost.category = product.category OR cost.category IS NULL)
  ORDER BY (cost.category IS NOT NULL) DESC, cost.updated_at DESC
  LIMIT 1
) profile ON true;

INSERT INTO directus_collections (
  collection, icon, note, display_template, archive_field, archive_value,
  unarchive_value, accountability, sort, color
)
VALUES
  ('inventory_import_batches','upload_file','Приватные полные снимки товарного учёта и поступлений.','{{batch_name}} · {{status}} · {{blocker_count}} блокеров','status','archived','draft','all',60,'#1d4ed8'),
  ('inventory_items','warehouse','Приватный складской слой. Себестоимость и полные идентификаторы не публикуются.','{{source_title}} · {{source_sku}} · {{quantity}} шт.',NULL,NULL,NULL,'all',61,'#0f766e'),
  ('inventory_receipt_lines','receipt_long','Исторические строки поступлений и плановой маржи.','{{source_title}} · {{unit_cost}}',NULL,NULL,NULL,'all',62,'#7c3aed'),
  ('inventory_import_issues','report_problem','Блокеры и предупреждения сверки inventory snapshot.','{{severity}} · {{code}} · {{message}}','resolved','true','false','all',63,'#dc2626'),
  ('channel_cost_profiles','calculate','Подтверждённые переменные расходы каналов продаж.','{{channel}} · {{name}} · {{is_confirmed}}','is_active','false','true','all',64,'#475569'),
  ('product_channel_listings','campaign','Канальные объявления. Сейчас поддерживается безопасный Avito feed.','{{channel}} · {{external_id}} · {{status}}','status','archived','draft','all',65,'#2563eb'),
  ('product_unit_economics','monitoring','Read-only unit-экономика по товару и каналу.',NULL,NULL,NULL,NULL,'all',66,'#111827')
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon, note=EXCLUDED.note, display_template=EXCLUDED.display_template,
  archive_field=EXCLUDED.archive_field, archive_value=EXCLUDED.archive_value,
  unarchive_value=EXCLUDED.unarchive_value, accountability=EXCLUDED.accountability,
  sort=EXCLUDED.sort, color=EXCLUDED.color;

CREATE OR REPLACE FUNCTION isvoi_inventory_field(
  p_collection varchar, p_field varchar, p_interface varchar, p_display varchar,
  p_options json, p_width varchar, p_sort integer, p_note text,
  p_special varchar DEFAULT NULL, p_required boolean DEFAULT false,
  p_readonly boolean DEFAULT false, p_hidden boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface, display=p_display, options=p_options,
      width=p_width, sort=p_sort, note=p_note, special=p_special,
      required=p_required, readonly=p_readonly, hidden=p_hidden
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,required,readonly,hidden)
    VALUES(p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,p_required,p_readonly,p_hidden);
  END IF;
END $$;

SELECT isvoi_inventory_field('inventory_import_batches','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Проверяется","value":"running"},{"text":"Проверено","value":"checked"},{"text":"Применено","value":"applied"},{"text":"Применено с блокерами","value":"applied_with_blocks"},{"text":"Ошибка","value":"failed"},{"text":"Архив","value":"archived"}]}','half',1,'Автоматический статус batch.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_import_batches','batch_name','input',NULL,NULL,'half',2,'Уникальное имя snapshot.',NULL,true);
SELECT isvoi_inventory_field('inventory_import_batches','source_system','input',NULL,NULL,'half',3,'Стабильный идентификатор источника.',NULL,true);
SELECT isvoi_inventory_field('inventory_import_batches','snapshot_at','datetime','datetime',NULL,'half',4,'Дата и время полной выгрузки.',NULL,true);
SELECT isvoi_inventory_field('inventory_import_batches','inventory_workbook','file','file','{"folder":"ISVOI Inventory Imports"}','full',5,'Полная XLSX-выгрузка остатков.','m2o',true);
SELECT isvoi_inventory_field('inventory_import_batches','receipts_workbook','file','file','{"folder":"ISVOI Inventory Imports"}','full',6,'XLSX поступления для исторической себестоимости.','m2o');
SELECT isvoi_inventory_field('inventory_import_batches','confirm_missing_deactivation','boolean','boolean',NULL,'half',7,'Разрешить обнуление ранее связанных товаров, отсутствующих в полном snapshot.');
SELECT isvoi_inventory_field('inventory_import_batches','last_run_log','input-code',NULL,'{"language":"text"}','full',20,'Протокол проверки без секретов.',NULL,false,true);
SELECT isvoi_inventory_field('inventory_import_batches','note','input-multiline',NULL,NULL,'full',21,'Комментарий оператора.');

SELECT isvoi_inventory_field('inventory_items','source_title','input-multiline',NULL,NULL,'full',1,'Исходное название из товарного учёта.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','source_sku','input',NULL,NULL,'half',2,'Код из товарного учёта.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','source_id','input',NULL,NULL,'half',3,'Стабильный Uuid источника.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','serial_full','input',NULL,NULL,'half',4,'Полный serial. Приватное поле Inventory Manager.',NULL,false,true);
SELECT isvoi_inventory_field('inventory_items','quantity','input',NULL,'{"min":0,"step":1}','half',5,'Текущий остаток.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','purchase_price','input',NULL,'{"min":0,"step":0.01}','half',6,'Приватная закупочная цена.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','retail_price','input',NULL,'{"min":0,"step":0.01}','half',7,'Текущая розничная цена.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','identity_status','select-dropdown','labels','{"choices":[{"text":"Не требуется","value":"not_applicable"},{"text":"Совпадает","value":"matched"},{"text":"Не найдено","value":"unmatched"},{"text":"Конфликт","value":"conflict"}]}','half',8,'Результат сверки идентичности.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_items','authenticity_status','select-dropdown','labels','{"choices":[{"text":"На проверке","value":"pending"},{"text":"Подтверждено","value":"verified"},{"text":"Не требуется","value":"not_required"},{"text":"Заблокировано","value":"blocked"}]}','half',9,'Проверка происхождения и бренда.');
SELECT isvoi_inventory_field('inventory_items','eligibility_status','select-dropdown','labels','{"choices":[{"text":"На проверке","value":"pending"},{"text":"Можно в каталог","value":"eligible"},{"text":"Заблокировано","value":"blocked"}]}','half',10,'Только eligible синхронизируется в products.');
SELECT isvoi_inventory_field('inventory_items','review_override','boolean','boolean',NULL,'half',11,'Осознанное подтверждение Inventory Manager.');
SELECT isvoi_inventory_field('inventory_items','review_note','input-multiline',NULL,NULL,'full',12,'Основание ручного подтверждения.');
SELECT isvoi_inventory_field('inventory_items','block_reason','input-multiline',NULL,NULL,'full',13,'Причина блокировки.',NULL,false,true);
SELECT isvoi_inventory_field('inventory_items','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','full',14,'Связанный Catalog V3 product.','m2o',false,true);

SELECT isvoi_inventory_field('inventory_receipt_lines','batch','select-dropdown-m2o','related-values','{"template":"{{batch_name}}"}','half',1,'Партия поступления.','m2o',true,true);
SELECT isvoi_inventory_field('inventory_receipt_lines','inventory_item','select-dropdown-m2o','related-values','{"template":"{{source_title}}"}','half',2,'Сопоставленная складская позиция.','m2o',false,true);

SELECT isvoi_inventory_field('inventory_import_issues','severity','select-dropdown','labels','{"choices":[{"text":"Блокер","value":"blocker"},{"text":"Предупреждение","value":"warning"}]}','half',1,'Уровень проблемы.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_import_issues','batch','select-dropdown-m2o','related-values','{"template":"{{batch_name}}"}','half',2,'Партия проверки.','m2o',true,true);
SELECT isvoi_inventory_field('inventory_import_issues','code','input',NULL,NULL,'half',3,'Машинный код проверки.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_import_issues','message','input-multiline',NULL,NULL,'full',4,'Описание проблемы.',NULL,true,true);
SELECT isvoi_inventory_field('inventory_import_issues','resolved','boolean','boolean',NULL,'half',5,'Проблема разобрана.');
SELECT isvoi_inventory_field('inventory_import_issues','resolution_note','input-multiline',NULL,NULL,'full',6,'Что было исправлено.');

SELECT isvoi_inventory_field('channel_cost_profiles','category','select-dropdown-m2o','related-values','{"template":"{{name}}"}','half',1,'Необязательная категория для более точной ставки.','m2o');

SELECT isvoi_inventory_field('inventory_import_batches','items','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}','full',30,'Строки текущего snapshot.','o2m',false,true);
SELECT isvoi_inventory_field('inventory_import_batches','receipt_lines','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}','full',31,'Исторические строки поступления.','o2m',false,true);
SELECT isvoi_inventory_field('inventory_import_batches','issues','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}','full',32,'Блокеры и предупреждения проверки.','o2m',false,true);
SELECT isvoi_inventory_field('inventory_items','receipt_lines','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}','full',30,'Связанные строки поступлений.','o2m',false,true);
SELECT isvoi_inventory_field('products','inventory_item','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}','full',95,'Приватная складская связь доступна только Inventory Manager.','o2m',false,true,true);
SELECT isvoi_inventory_field('products','channel_listings','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}','full',96,'Приватные канальные объявления.','o2m',false,true,true);

SELECT isvoi_inventory_field('product_channel_listings','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{stock_status}}"}','full',1,'Товар Catalog V3.','m2o',true);
SELECT isvoi_inventory_field('product_channel_listings','channel','select-dropdown','labels','{"choices":[{"text":"Avito","value":"avito"}]}','half',2,'Канал.',NULL,true);
SELECT isvoi_inventory_field('product_channel_listings','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Готово","value":"ready"},{"text":"Активно","value":"active"},{"text":"Пауза","value":"paused"},{"text":"Блок","value":"blocked"},{"text":"Ошибка","value":"error"},{"text":"Архив","value":"archived"}]}','half',3,'В feed попадает только active.',NULL,true);
SELECT isvoi_inventory_field('product_channel_listings','external_id','input',NULL,NULL,'half',4,'Стабильный isvoi-<Uuid>.',NULL,true);
SELECT isvoi_inventory_field('product_channel_listings','price_override','input',NULL,'{"min":0,"step":1}','half',5,'Пусто означает цену сайта.');
SELECT isvoi_inventory_field('product_channel_listings','attributes','input-code',NULL,'{"language":"json"}','full',8,'Атрибуты официального Avito-шаблона.','cast-json');

DROP FUNCTION isvoi_inventory_field(varchar,varchar,varchar,varchar,json,varchar,integer,text,varchar,boolean,boolean,boolean);

CREATE OR REPLACE FUNCTION isvoi_inventory_relation(
  p_many varchar, p_field varchar, p_one varchar, p_one_field varchar, p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many AND many_field=p_field) THEN
    UPDATE directus_relations SET one_collection=p_one, one_field=p_one_field, one_deselect_action=p_action
    WHERE many_collection=p_many AND many_field=p_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES(p_many,p_field,p_one,p_one_field,p_action);
  END IF;
END $$;

SELECT isvoi_inventory_relation('inventory_import_batches','inventory_workbook','directus_files',NULL,'nullify');
SELECT isvoi_inventory_relation('inventory_import_batches','receipts_workbook','directus_files',NULL,'nullify');
SELECT isvoi_inventory_relation('inventory_items','product','products','inventory_item','nullify');
SELECT isvoi_inventory_relation('inventory_items','last_seen_batch','inventory_import_batches','items','nullify');
SELECT isvoi_inventory_relation('inventory_receipt_lines','batch','inventory_import_batches','receipt_lines','delete');
SELECT isvoi_inventory_relation('inventory_receipt_lines','inventory_item','inventory_items','receipt_lines','nullify');
SELECT isvoi_inventory_relation('inventory_receipt_lines','product','products',NULL,'nullify');
SELECT isvoi_inventory_relation('inventory_import_issues','batch','inventory_import_batches','issues','delete');
SELECT isvoi_inventory_relation('channel_cost_profiles','category','product_categories',NULL,'nullify');
SELECT isvoi_inventory_relation('product_channel_listings','product','products','channel_listings','delete');
SELECT isvoi_inventory_relation('product_unit_economics','product','products',NULL,'nullify');

DROP FUNCTION isvoi_inventory_relation(varchar,varchar,varchar,varchar,varchar);

DO $$
DECLARE v_role uuid; v_policy uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF v_role IS NULL THEN
    v_role := gen_random_uuid();
    INSERT INTO directus_roles(id,name,icon,description)
    VALUES(v_role,'ISVOI Inventory Manager','warehouse','Приватные остатки, закупка, маржинальность и канальные объявления без системного администрирования.');
  ELSE
    UPDATE directus_roles SET icon='warehouse', description='Приватные остатки, закупка, маржинальность и канальные объявления без системного администрирования.' WHERE id=v_role;
  END IF;

  SELECT id INTO v_policy FROM directus_policies WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF v_policy IS NULL THEN
    v_policy := gen_random_uuid();
    INSERT INTO directus_policies(id,name,icon,description,app_access,admin_access,enforce_tfa)
    VALUES(v_policy,'ISVOI Inventory Manager','warehouse','Приватный товарный учёт и unit-экономика.',true,false,true);
  ELSE
    UPDATE directus_policies SET icon='warehouse', description='Приватный товарный учёт и unit-экономика.', app_access=true, admin_access=false, enforce_tfa=true WHERE id=v_policy;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM directus_access WHERE role=v_role AND policy=v_policy) THEN
    INSERT INTO directus_access(id,role,policy,sort) VALUES(gen_random_uuid(),v_role,v_policy,1);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION isvoi_inventory_permission(
  p_policy_name text, p_collection varchar, p_action varchar, p_fields text, p_validation json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions SET fields=p_fields, permissions=NULL, validation=p_validation
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,validation)
    VALUES(v_policy,p_collection,p_action,p_fields,p_validation);
  END IF;
END $$;

DO $$ DECLARE p text; c text; f text;
BEGIN
  FOREACH p IN ARRAY ARRAY['ISVOI Inventory Manager','ISVOI Catalog Import'] LOOP
    FOREACH c IN ARRAY ARRAY[
      'inventory_import_batches','inventory_items','inventory_receipt_lines',
      'inventory_import_issues','channel_cost_profiles','product_channel_listings',
      'product_unit_economics'
    ] LOOP
      f := CASE c
        WHEN 'inventory_import_batches' THEN 'id,status,batch_name,source_system,snapshot_at,inventory_workbook,receipts_workbook,confirm_missing_deactivation,inventory_rows,inventory_units,receipt_rows,blocker_count,warning_count,last_run_mode,last_run_status,last_run_at,last_run_log,note,created_at,updated_at,items,receipt_lines,issues'
        WHEN 'inventory_items' THEN 'id,source_system,source_id,source_sku,source_article,barcode,source_title,source_description,source_group,source_group_path,condition,item_kind,serial_full,imei_full,quantity,purchase_price,retail_price,for_sale,ownership,identity_status,authenticity_status,eligibility_status,block_reason,review_override,review_note,product,last_seen_batch,source_created_at,source_updated_at,created_at,updated_at,receipt_lines'
        WHEN 'inventory_receipt_lines' THEN 'id,batch,row_number,source_title,source_category,source_subcategory,imei_full,serial_full,quantity,unit_cost,target_markup,target_margin,target_price,total_cost,total_price,inventory_item,product,match_status,match_note,source_note,created_at'
        WHEN 'inventory_import_issues' THEN 'id,batch,severity,code,source_kind,row_number,source_id,message,resolved,resolution_note,created_at'
        WHEN 'channel_cost_profiles' THEN 'id,channel,name,category,is_active,is_confirmed,commission_rate,acquiring_rate,tax_rate,return_reserve_rate,promotion_per_unit,delivery_per_unit,other_variable_per_unit,note,created_at,updated_at'
        WHEN 'product_channel_listings' THEN 'id,product,channel,status,external_id,title_override,description_override,price_override,category_code,attributes,last_export_hash,last_exported_at,sync_status,sync_error,created_at,updated_at'
        ELSE 'id,product,channel,effective_price,purchase_price,gross_profit,gross_margin,variable_cost,contribution,contribution_margin,cost_profile_complete' END;
      PERFORM isvoi_inventory_permission(p,c,'read',f,NULL);
      IF c <> 'product_unit_economics' THEN
        PERFORM isvoi_inventory_permission(p,c,'create',f,NULL);
        PERFORM isvoi_inventory_permission(p,c,'update',f,NULL);
      END IF;
    END LOOP;
  END LOOP;
END $$;

SELECT isvoi_inventory_permission('ISVOI Inventory Manager','directus_files','read','id,storage,filename_disk,filename_download,title,description,type,filesize,width,height,focal_point_x,focal_point_y,folder,uploaded_on,modified_on',NULL);
SELECT isvoi_inventory_permission('ISVOI Inventory Manager','directus_files','create','title,description,folder,file,tags,filename_download,filename_disk,storage,type,filesize,width,height,focal_point_x,focal_point_y,charset,duration,embed,location,tus_id,tus_data,metadata,uploaded_by,uploaded_on,created_on,modified_by,modified_on',NULL);
SELECT isvoi_inventory_permission('ISVOI Inventory Manager','directus_files','update','title,description,folder,tags,focal_point_x,focal_point_y',NULL);
SELECT isvoi_inventory_permission('ISVOI Inventory Manager','directus_folders','read','id,name,parent',NULL);

DO $$ DECLARE p text; c text; f text;
BEGIN
  FOREACH p IN ARRAY ARRAY['ISVOI Inventory Manager','ISVOI Catalog Import'] LOOP
    FOREACH c IN ARRAY ARRAY['products','device_details','accessory_details','product_brands','product_categories','device_models'] LOOP
      f := CASE c
        WHEN 'products' THEN 'id,sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,source_system,source_id,import_batch,imported_at,admin_note,created_at,updated_at,images,device_details,accessory_details,compatible_models,passport,trade_options_v3,inventory_item,channel_listings'
        WHEN 'device_details' THEN 'id,product,storage,serial,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade,created_at,updated_at'
        WHEN 'accessory_details' THEN 'id,product,compatibility_mode,material,connection_type,package_contents,specifications,created_at,updated_at'
        WHEN 'product_brands' THEN 'id,slug,name,logo_file,is_active,sort,created_at,updated_at,models,products'
        WHEN 'product_categories' THEN 'id,slug,name,catalog_section,parent,is_active,sort,created_at,updated_at,children,products'
        ELSE 'id,slug,brand,name,family,year,is_active,sort,created_at,updated_at,products,compatible_products' END;
      PERFORM isvoi_inventory_permission(p,c,'read',f,NULL);
      IF c IN ('products','device_details','accessory_details') THEN
        PERFORM isvoi_inventory_permission(p,c,'create',f,NULL);
        PERFORM isvoi_inventory_permission(p,c,'update',f,NULL);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DROP FUNCTION isvoi_inventory_permission(text,varchar,varchar,text,json);

DELETE FROM directus_permissions
WHERE collection IN ('inventory_import_batches','inventory_items','inventory_receipt_lines','inventory_import_issues','channel_cost_profiles','product_channel_listings','product_unit_economics')
  AND policy IN (
    SELECT id FROM directus_policies
    WHERE name IN ('ISVOI Public Read','ISVOI Editor','ISVOI Importer')
  );

INSERT INTO directus_folders(id,name,parent)
SELECT gen_random_uuid(),'ISVOI Inventory Imports',NULL
WHERE NOT EXISTS (SELECT 1 FROM directus_folders WHERE name='ISVOI Inventory Imports');

DO $$
DECLARE v_role uuid; v_self_policy uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Inventory Manager' LIMIT 1;
  SELECT id INTO v_self_policy FROM directus_policies WHERE name='ISVOI Studio Self Security' LIMIT 1;
  IF v_role IS NOT NULL AND v_self_policy IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM directus_access WHERE role=v_role AND policy=v_self_policy AND "user" IS NULL
  ) THEN
    INSERT INTO directus_access(id,role,policy,sort) VALUES(gen_random_uuid(),v_role,v_self_policy,2);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION isvoi_inventory_preset(
  p_collection varchar, p_bookmark varchar, p_icon varchar, p_color varchar,
  p_filter json, p_fields json, p_sort json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_role uuid; v_query json;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  v_query := json_build_object('tabular',json_build_object('sort',p_sort,'fields',p_fields,'page',1));
  IF EXISTS (
    SELECT 1 FROM directus_presets
    WHERE role=v_role AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL
  ) THEN
    UPDATE directus_presets SET icon=p_icon,color=p_color,filter=p_filter,layout='tabular',layout_query=v_query
    WHERE role=v_role AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets(bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
    VALUES(p_bookmark,v_role,NULL,p_collection,'tabular',v_query,p_filter,p_icon,p_color);
  END IF;
END $$;

SELECT isvoi_inventory_preset('inventory_import_batches','Новые snapshot','upload_file','#64748b','{"status":{"_eq":"draft"}}','["snapshot_at","batch_name","status","blocker_count","warning_count","last_run_status"]','["-snapshot_at"]');
SELECT isvoi_inventory_preset('inventory_import_batches','С блокерами','report_problem','#dc2626','{"blocker_count":{"_gt":0}}','["snapshot_at","batch_name","status","blocker_count","warning_count","last_run_at"]','["-snapshot_at"]');
SELECT isvoi_inventory_preset('inventory_import_batches','Применено','check_circle','#059669','{"status":{"_in":["applied","applied_with_blocks"]}}','["snapshot_at","batch_name","status","inventory_rows","inventory_units","blocker_count"]','["-last_run_at"]');
SELECT isvoi_inventory_preset('inventory_items','Конфликты','error','#dc2626','{"identity_status":{"_eq":"conflict"}}','["source_title","source_sku","quantity","identity_status","authenticity_status","block_reason"]','["source_title"]');
SELECT isvoi_inventory_preset('inventory_items','На проверке','fact_check','#d97706','{"eligibility_status":{"_eq":"pending"}}','["source_title","source_sku","quantity","retail_price","identity_status","authenticity_status"]','["source_title"]');
SELECT isvoi_inventory_preset('inventory_items','Можно в каталог','publish','#059669','{"eligibility_status":{"_eq":"eligible"}}','["source_title","source_sku","quantity","retail_price","product","review_note"]','["source_title"]');
SELECT isvoi_inventory_preset('product_channel_listings','Avito: черновики','edit_note','#64748b','{"_and":[{"channel":{"_eq":"avito"}},{"status":{"_eq":"draft"}}]}','["external_id","product","status","price_override","category_code","sync_status"]','["external_id"]');
SELECT isvoi_inventory_preset('product_channel_listings','Avito: активные','campaign','#2563eb','{"_and":[{"channel":{"_eq":"avito"}},{"status":{"_eq":"active"}}]}','["external_id","product","status","price_override","last_exported_at","sync_status"]','["external_id"]');

DROP FUNCTION isvoi_inventory_preset(varchar,varchar,varchar,varchar,json,json,json);

INSERT INTO product_categories(slug,name,catalog_section,sort)
VALUES
  ('routers','Роутеры','device',60),
  ('smart-electronics','Смарт-электроника','device',70),
  ('power-banks','Внешние аккумуляторы','accessory',150)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, catalog_section=EXCLUDED.catalog_section, is_active=true;

INSERT INTO channel_cost_profiles(channel,name,is_active,is_confirmed,note)
VALUES
  ('site','Сайт — заполнить расходы',true,false,'Ставки намеренно равны нулю до подтверждения Inventory Manager.'),
  ('avito','Avito — заполнить расходы',true,false,'Ставки намеренно равны нулю до подтверждения Inventory Manager.')
ON CONFLICT (channel,name) DO NOTHING;

COMMIT;

SELECT 'inventory.schema.tables' AS check_name, count(*)::text AS value
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN (
  'inventory_import_batches','inventory_items','inventory_receipt_lines',
  'inventory_import_issues','channel_cost_profiles','product_channel_listings'
)
UNION ALL
SELECT 'inventory.schema.unit_economics_view', count(*)::text
FROM information_schema.views WHERE table_schema='public' AND table_name='product_unit_economics'
UNION ALL
SELECT 'inventory.security.manager_policy', count(*)::text
FROM directus_policies WHERE name='ISVOI Inventory Manager'
UNION ALL
SELECT 'inventory.security.public_permissions', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Public Read'
  AND permission.collection LIKE 'inventory%';
`);
