#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE device_details ADD COLUMN IF NOT EXISTS imei_primary_last4 varchar(4);
ALTER TABLE device_details ADD COLUMN IF NOT EXISTS imei_secondary_last4 varchar(4);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_details_imei_primary_last4_check') THEN
    ALTER TABLE device_details ADD CONSTRAINT device_details_imei_primary_last4_check
      CHECK (imei_primary_last4 IS NULL OR imei_primary_last4 ~ '^[0-9]{4}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_details_imei_secondary_last4_check') THEN
    ALTER TABLE device_details ADD CONSTRAINT device_details_imei_secondary_last4_check
      CHECK (imei_secondary_last4 IS NULL OR imei_secondary_last4 ~ '^[0-9]{4}$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS device_diagnostic_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL,
  passport uuid,
  provider varchar(160) NOT NULL,
  tested_at date NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'current',
  original_file uuid,
  public_file uuid,
  public_note text,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_model_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_model uuid NOT NULL,
  group_key varchar(80) NOT NULL,
  group_label varchar(160) NOT NULL,
  label varchar(160) NOT NULL,
  value text NOT NULL,
  source_url text NOT NULL,
  source_checked_at date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_model,label)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_diagnostic_reports_product_fk') THEN
    ALTER TABLE device_diagnostic_reports ADD CONSTRAINT device_diagnostic_reports_product_fk
      FOREIGN KEY(product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_diagnostic_reports_passport_fk') THEN
    ALTER TABLE device_diagnostic_reports ADD CONSTRAINT device_diagnostic_reports_passport_fk
      FOREIGN KEY(passport) REFERENCES device_passports(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_diagnostic_reports_original_file_fk') THEN
    ALTER TABLE device_diagnostic_reports ADD CONSTRAINT device_diagnostic_reports_original_file_fk
      FOREIGN KEY(original_file) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_diagnostic_reports_public_file_fk') THEN
    ALTER TABLE device_diagnostic_reports ADD CONSTRAINT device_diagnostic_reports_public_file_fk
      FOREIGN KEY(public_file) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_diagnostic_reports_status_check') THEN
    ALTER TABLE device_diagnostic_reports ADD CONSTRAINT device_diagnostic_reports_status_check
      CHECK(status IN ('current','superseded'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_model_specifications_model_fk') THEN
    ALTER TABLE device_model_specifications ADD CONSTRAINT device_model_specifications_model_fk
      FOREIGN KEY(device_model) REFERENCES device_models(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS device_diagnostic_reports_current_idx
  ON device_diagnostic_reports(product) WHERE status='current';
CREATE INDEX IF NOT EXISTS device_diagnostic_reports_product_idx
  ON device_diagnostic_reports(product,tested_at DESC);
CREATE INDEX IF NOT EXISTS device_model_specifications_model_idx
  ON device_model_specifications(device_model,is_active,sort);

INSERT INTO device_models(slug,brand,name,family,year,is_active,sort)
SELECT seed.slug,brand.id,seed.name,'iPhone',seed.year,true,seed.sort
FROM product_brands brand
CROSS JOIN (VALUES
  ('iphone-14-pro','iPhone 14 Pro',2022,140),
  ('iphone-14-pro-max','iPhone 14 Pro Max',2022,141),
  ('iphone-16-pro','iPhone 16 Pro',2024,160),
  ('iphone-16-pro-max','iPhone 16 Pro Max',2024,161)
) seed(slug,name,year,sort)
WHERE brand.slug='apple'
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,family=EXCLUDED.family,
  year=EXCLUDED.year,is_active=true,updated_at=now();

WITH specs(model_slug,group_key,group_label,label,value,source_url,sort) AS (VALUES
  ('iphone-14-pro','display','Экран','Экран','6,1 дюйма, OLED Super Retina XDR, 2556×1179, ProMotion до 120 Гц','https://support.apple.com/en-mide/111849',10),
  ('iphone-14-pro','performance','Производительность','Чип','A16 Bionic','https://support.apple.com/en-mide/111849',20),
  ('iphone-14-pro','cameras','Камеры','Камеры','48 Мп основная, 12 Мп сверхширокоугольная, 12 Мп телефото 3×','https://support.apple.com/en-mide/111849',30),
  ('iphone-14-pro','connectivity','Подключение и питание','Разъём и зарядка','Lightning; MagSafe до 15 Вт; Qi до 7,5 Вт','https://support.apple.com/en-mide/111849',40),
  ('iphone-14-pro','connectivity','Подключение и питание','Интерфейсы','5G, Wi‑Fi 6, Bluetooth 5.3, NFC, Ultra Wideband','https://support.apple.com/en-mide/111849',50),
  ('iphone-14-pro','body','Корпус','Защита модели','IP68: до 6 м на 30 минут по IEC 60529','https://support.apple.com/en-mide/111849',60),
  ('iphone-14-pro','body','Корпус','Размеры и вес','147,5×71,5×7,85 мм; 206 г','https://support.apple.com/en-mide/111849',70),
  ('iphone-14-pro-max','display','Экран','Экран','6,7 дюйма, OLED Super Retina XDR, 2796×1290, ProMotion до 120 Гц','https://support.apple.com/en-us/111846',10),
  ('iphone-14-pro-max','performance','Производительность','Чип','A16 Bionic','https://support.apple.com/en-us/111846',20),
  ('iphone-14-pro-max','cameras','Камеры','Камеры','48 Мп основная, 12 Мп сверхширокоугольная, 12 Мп телефото 3×','https://support.apple.com/en-us/111846',30),
  ('iphone-14-pro-max','connectivity','Подключение и питание','Разъём и зарядка','Lightning; MagSafe до 15 Вт; Qi до 7,5 Вт','https://support.apple.com/en-us/111846',40),
  ('iphone-14-pro-max','connectivity','Подключение и питание','Интерфейсы','5G, Wi‑Fi 6, Bluetooth 5.3, NFC, Ultra Wideband','https://support.apple.com/en-us/111846',50),
  ('iphone-14-pro-max','body','Корпус','Защита модели','IP68: до 6 м на 30 минут по IEC 60529','https://support.apple.com/en-us/111846',60),
  ('iphone-14-pro-max','body','Корпус','Размеры и вес','160,7×77,6×7,85 мм; 240 г','https://support.apple.com/en-us/111846',70),
  ('iphone-16-pro','display','Экран','Экран','6,3 дюйма, OLED Super Retina XDR, 2622×1206, ProMotion до 120 Гц','https://support.apple.com/en-us/121031',10),
  ('iphone-16-pro','performance','Производительность','Чип','A18 Pro','https://support.apple.com/en-us/121031',20),
  ('iphone-16-pro','cameras','Камеры','Камеры','48 Мп Fusion, 48 Мп сверхширокоугольная, 12 Мп телефото 5×','https://support.apple.com/en-us/121031',30),
  ('iphone-16-pro','connectivity','Подключение и питание','Разъём и зарядка','USB‑C (USB 3); MagSafe до 25 Вт; Qi2 до 15 Вт','https://support.apple.com/en-us/121031',40),
  ('iphone-16-pro','connectivity','Подключение и питание','Интерфейсы','5G, Wi‑Fi 7, Bluetooth 5.3, NFC, Ultra Wideband','https://support.apple.com/en-us/121031',50),
  ('iphone-16-pro','body','Корпус','Защита модели','IP68: до 6 м на 30 минут по IEC 60529','https://support.apple.com/en-us/121031',60),
  ('iphone-16-pro','body','Корпус','Размеры и вес','149,6×71,5×8,25 мм; 199 г','https://support.apple.com/en-us/121031',70),
  ('iphone-16-pro-max','display','Экран','Экран','6,9 дюйма, OLED Super Retina XDR, 2868×1320, ProMotion до 120 Гц','https://support.apple.com/en-us/121032',10),
  ('iphone-16-pro-max','performance','Производительность','Чип','A18 Pro','https://support.apple.com/en-us/121032',20),
  ('iphone-16-pro-max','cameras','Камеры','Камеры','48 Мп Fusion, 48 Мп сверхширокоугольная, 12 Мп телефото 5×','https://support.apple.com/en-us/121032',30),
  ('iphone-16-pro-max','connectivity','Подключение и питание','Разъём и зарядка','USB‑C (USB 3); MagSafe до 25 Вт; Qi2 до 15 Вт','https://support.apple.com/en-us/121032',40),
  ('iphone-16-pro-max','connectivity','Подключение и питание','Интерфейсы','5G, Wi‑Fi 7, Bluetooth 5.3, NFC, Ultra Wideband','https://support.apple.com/en-us/121032',50),
  ('iphone-16-pro-max','body','Корпус','Защита модели','IP68: до 6 м на 30 минут по IEC 60529','https://support.apple.com/en-us/121032',60),
  ('iphone-16-pro-max','body','Корпус','Размеры и вес','163×77,6×8,25 мм; 227 г','https://support.apple.com/en-us/121032',70)
)
INSERT INTO device_model_specifications(device_model,group_key,group_label,label,value,source_url,source_checked_at,is_active,sort)
SELECT model.id,specs.group_key,specs.group_label,specs.label,specs.value,specs.source_url,DATE '2026-08-27',true,specs.sort
FROM specs JOIN device_models model ON model.slug=specs.model_slug
ON CONFLICT(device_model,label) DO UPDATE SET
  group_key=EXCLUDED.group_key,group_label=EXCLUDED.group_label,value=EXCLUDED.value,
  source_url=EXCLUDED.source_url,source_checked_at=EXCLUDED.source_checked_at,
  is_active=true,sort=EXCLUDED.sort,updated_at=now();

CREATE OR REPLACE FUNCTION isvoi_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS device_diagnostic_reports_touch ON device_diagnostic_reports;
CREATE TRIGGER device_diagnostic_reports_touch BEFORE UPDATE ON device_diagnostic_reports
FOR EACH ROW EXECUTE FUNCTION isvoi_touch_updated_at();
DROP TRIGGER IF EXISTS device_model_specifications_touch ON device_model_specifications;
CREATE TRIGGER device_model_specifications_touch BEFORE UPDATE ON device_model_specifications
FOR EACH ROW EXECUTE FUNCTION isvoi_touch_updated_at();

INSERT INTO directus_folders(id,name,parent)
SELECT gen_random_uuid(),'ISVOI Passport Originals',NULL
WHERE NOT EXISTS (SELECT 1 FROM directus_folders WHERE name='ISVOI Passport Originals');
INSERT INTO directus_folders(id,name,parent)
SELECT gen_random_uuid(),'ISVOI Passport Public',NULL
WHERE NOT EXISTS (SELECT 1 FROM directus_folders WHERE name='ISVOI Passport Public');
INSERT INTO directus_folders(id,name,parent)
SELECT gen_random_uuid(),'ISVOI Passport Archive',NULL
WHERE NOT EXISTS (SELECT 1 FROM directus_folders WHERE name='ISVOI Passport Archive');

INSERT INTO directus_collections(
  collection,icon,note,display_template,archive_field,archive_value,
  unarchive_value,accountability,sort,color,"group"
)
VALUES
  ('device_diagnostic_reports','fact_check','Отчёты диагностики. Оригиналы закрыты; на сайт выдаётся только обезличенная публичная выписка.','{{product.title}} · {{tested_at}} · {{status}}','status','superseded','current','all',66,'#0f766e','isvoi_catalog'),
  ('device_model_specifications','list_alt','Официальные характеристики модели. Не описывают индивидуальное состояние устройства.','{{device_model.name}} · {{label}}',NULL,NULL,NULL,'all',67,'#2563eb','isvoi_catalog')
ON CONFLICT(collection) DO UPDATE SET
  icon=EXCLUDED.icon,note=EXCLUDED.note,display_template=EXCLUDED.display_template,
  archive_field=EXCLUDED.archive_field,archive_value=EXCLUDED.archive_value,
  unarchive_value=EXCLUDED.unarchive_value,accountability=EXCLUDED.accountability,
  sort=EXCLUDED.sort,color=EXCLUDED.color,"group"=EXCLUDED."group";

UPDATE directus_collections collection
SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('device_diagnostic_reports','Сертификаты диагностики'),
  ('device_model_specifications','Характеристики моделей')
) labels(collection,label)
WHERE collection.collection=labels.collection;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_field(
  p_collection varchar,p_field varchar,p_interface varchar,p_display varchar,
  p_options json,p_width varchar,p_sort integer,p_note text,p_special varchar DEFAULT NULL,
  p_group varchar DEFAULT NULL,p_required boolean DEFAULT false,
  p_readonly boolean DEFAULT false,p_hidden boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface,display=p_display,options=p_options,
      width=p_width,sort=p_sort,note=p_note,special=p_special,"group"=p_group,
      required=p_required,readonly=p_readonly,hidden=p_hidden
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,"group",required,readonly,hidden)
    VALUES(p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,p_group,p_required,p_readonly,p_hidden);
  END IF;
END $$;

SELECT pg_temp.isvoi_field('device_details','imei_primary_last4','input',NULL,'{"font":"monospace","trim":true}','half',14,'Только последние четыре цифры основного IMEI. Полный IMEI здесь не хранится.',NULL,NULL,false);
SELECT pg_temp.isvoi_field('device_details','imei_secondary_last4','input',NULL,'{"font":"monospace","trim":true}','half',15,'Только последние четыре цифры второго IMEI, если он подтверждён.',NULL,NULL,false);

SELECT pg_temp.isvoi_field('device_diagnostic_reports','group_main','group-detail',NULL,'{"headerIcon":"fact_check","start":"open"}','full',1,'Провайдер, дата и актуальность отчёта.','alias,no-data,group');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','group_files','group-detail',NULL,'{"headerIcon":"verified_user","start":"open"}','full',20,'Приватный оригинал и обезличенная публичная выписка.','alias,no-data,group');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','full',2,'Карточка конкретного товара.','m2o','group_main',true);
SELECT pg_temp.isvoi_field('device_diagnostic_reports','passport','select-dropdown-m2o','related-values','{"template":"{{product.title}}"}','full',3,'Связанный Passport.','m2o','group_main');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','provider','input',NULL,NULL,'half',4,'Провайдер диагностики.',NULL,'group_main',true);
SELECT pg_temp.isvoi_field('device_diagnostic_reports','tested_at','datetime','datetime','{"includeSeconds":false}','half',5,'Дата физической диагностики.',NULL,'group_main',true);
SELECT pg_temp.isvoi_field('device_diagnostic_reports','status','select-dropdown','labels','{"choices":[{"text":"Актуальный","value":"current"},{"text":"Заменён новым","value":"superseded"}]}','half',6,'У товара может быть только один актуальный отчёт.',NULL,'group_main',true);
SELECT pg_temp.isvoi_field('device_diagnostic_reports','sort','input',NULL,'{"min":1,"step":1}','half',7,'Порядок.',NULL,'group_main');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','original_file','file','file',NULL,'half',21,'Закрытый оригинал. Недоступен Public и редакторским ролям.','m2o','group_files');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','public_file','file-image','image',NULL,'half',22,'Обезличенная копия без полного IMEI, serial, QR и серийных номеров компонентов.','m2o','group_files');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','public_note','input-multiline',NULL,NULL,'full',23,'Публичное пояснение к выписке.',NULL,'group_files');
SELECT pg_temp.isvoi_field('device_diagnostic_reports','created_at','datetime','datetime',NULL,'half',90,'Создано.','date-created',NULL,false,true);
SELECT pg_temp.isvoi_field('device_diagnostic_reports','updated_at','datetime','datetime',NULL,'half',91,'Обновлено.','date-updated',NULL,false,true);

SELECT pg_temp.isvoi_field('device_model_specifications','device_model','select-dropdown-m2o','related-values','{"template":"{{brand.name}} {{name}}"}','full',1,'Модель устройства.','m2o',NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','group_key','select-dropdown','labels','{"choices":[{"text":"Экран","value":"display"},{"text":"Производительность","value":"performance"},{"text":"Камеры","value":"cameras"},{"text":"Подключение и питание","value":"connectivity"},{"text":"Корпус","value":"body"}]}','half',2,'Машинная группа.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','group_label','input',NULL,NULL,'half',3,'Название группы для интерфейса.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','label','input',NULL,NULL,'half',4,'Название характеристики.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','value','input-multiline',NULL,NULL,'half',5,'Проверенное значение.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','source_url','input',NULL,NULL,'full',6,'Официальная страница Apple.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','source_checked_at','datetime','datetime','{"includeSeconds":false}','half',7,'Дата сверки источника.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','is_active','boolean','boolean',NULL,'half',8,'Показывать на сайте.',NULL,NULL,true);
SELECT pg_temp.isvoi_field('device_model_specifications','sort','input',NULL,'{"min":1,"step":1}','half',9,'Порядок.',NULL,NULL,true);

SELECT pg_temp.isvoi_field('products','diagnostic_reports','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["tested_at","provider","status","public_file"]}','full',97,'История диагностических отчётов и публичных выписок.','o2m','group_details');
SELECT pg_temp.isvoi_field('device_models','specifications','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["sort","group_label","label","value","is_active"]}','full',10,'Официальные технические характеристики модели.','o2m');
SELECT pg_temp.isvoi_field('device_passports','diagnostic_reports','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["tested_at","provider","status","public_file"]}','full',50,'Отчёты, подтверждающие этот Passport.','o2m');

UPDATE directus_fields field
SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('device_details','imei_primary_last4','IMEI · последние 4 цифры'),
  ('device_details','imei_secondary_last4','IMEI 2 · последние 4 цифры'),
  ('device_diagnostic_reports','group_main','Отчёт'),
  ('device_diagnostic_reports','group_files','Файлы сертификата'),
  ('device_diagnostic_reports','product','Товар'),
  ('device_diagnostic_reports','passport','Passport'),
  ('device_diagnostic_reports','provider','Провайдер'),
  ('device_diagnostic_reports','tested_at','Дата диагностики'),
  ('device_diagnostic_reports','status','Статус'),
  ('device_diagnostic_reports','sort','Порядок'),
  ('device_diagnostic_reports','original_file','Закрытый оригинал'),
  ('device_diagnostic_reports','public_file','Публичная выписка'),
  ('device_diagnostic_reports','public_note','Публичное пояснение'),
  ('device_diagnostic_reports','created_at','Создано'),
  ('device_diagnostic_reports','updated_at','Обновлено'),
  ('device_model_specifications','device_model','Модель'),
  ('device_model_specifications','group_key','Код группы'),
  ('device_model_specifications','group_label','Группа'),
  ('device_model_specifications','label','Характеристика'),
  ('device_model_specifications','value','Значение'),
  ('device_model_specifications','source_url','Официальный источник'),
  ('device_model_specifications','source_checked_at','Дата сверки'),
  ('device_model_specifications','is_active','Показывать на сайте'),
  ('device_model_specifications','sort','Порядок'),
  ('products','diagnostic_reports','Сертификаты диагностики'),
  ('device_models','specifications','Технические характеристики'),
  ('device_passports','diagnostic_reports','Сертификаты диагностики')
) labels(collection,field,label)
WHERE field.collection=labels.collection AND field.field=labels.field;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_relation(
  p_many_collection varchar,p_many_field varchar,p_one_collection varchar,p_one_field varchar,p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM directus_relations WHERE many_collection=p_many_collection AND many_field=p_many_field) THEN
    UPDATE directus_relations SET one_collection=p_one_collection,one_field=p_one_field,one_deselect_action=p_action
    WHERE many_collection=p_many_collection AND many_field=p_many_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES(p_many_collection,p_many_field,p_one_collection,p_one_field,p_action);
  END IF;
END $$;

SELECT pg_temp.isvoi_relation('device_diagnostic_reports','product','products','diagnostic_reports','delete');
SELECT pg_temp.isvoi_relation('device_diagnostic_reports','passport','device_passports','diagnostic_reports','nullify');
SELECT pg_temp.isvoi_relation('device_diagnostic_reports','original_file','directus_files',NULL,'nullify');
SELECT pg_temp.isvoi_relation('device_diagnostic_reports','public_file','directus_files',NULL,'nullify');
SELECT pg_temp.isvoi_relation('device_model_specifications','device_model','device_models','specifications','delete');

CREATE OR REPLACE FUNCTION pg_temp.isvoi_permission(
  p_policy_name text,p_collection varchar,p_action varchar,p_fields text,
  p_permissions json DEFAULT NULL,p_validation json DEFAULT NULL,p_presets json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions SET fields=p_fields,permissions=p_permissions,validation=p_validation,presets=p_presets
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation,presets)
    VALUES(v_policy,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
  END IF;
END $$;

SELECT pg_temp.isvoi_permission('ISVOI Public Read','device_model_specifications','read','id,device_model,group_key,group_label,label,value,source_url,source_checked_at,is_active,sort','{"is_active":{"_eq":true}}'::json);
SELECT pg_temp.isvoi_permission('ISVOI Public Read','device_diagnostic_reports','read','id,product,passport,provider,tested_at,status,public_file,public_note,sort','{"_and":[{"status":{"_eq":"current"}},{"public_file":{"_nnull":true}},{"product":{"status":{"_eq":"published"}}},{"product":{"content_status":{"_eq":"ready"}}}]}'::json);

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['ISVOI Advanced Editor','ISVOI Inventory Manager'] LOOP
    PERFORM pg_temp.isvoi_permission(role_name,'device_model_specifications','read',
      'id,device_model,group_key,group_label,label,value,source_url,source_checked_at,is_active,sort,created_at,updated_at');
    PERFORM pg_temp.isvoi_permission(role_name,'device_model_specifications','create',
      'device_model,group_key,group_label,label,value,source_url,source_checked_at,is_active,sort');
    PERFORM pg_temp.isvoi_permission(role_name,'device_model_specifications','update',
      'device_model,group_key,group_label,label,value,source_url,source_checked_at,is_active,sort');
    PERFORM pg_temp.isvoi_permission(role_name,'device_model_specifications','delete','id');
  END LOOP;
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_diagnostic_reports','read',
    'id,product,passport,provider,tested_at,status,original_file,public_file,public_note,sort,created_at,updated_at');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_diagnostic_reports','create',
    'product,passport,provider,tested_at,status,original_file,public_file,public_note,sort');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_diagnostic_reports','update',
    'product,passport,provider,tested_at,status,original_file,public_file,public_note,sort');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_diagnostic_reports','delete','id');
  PERFORM pg_temp.isvoi_permission('ISVOI Advanced Editor','device_diagnostic_reports','read','id,product,passport,provider,tested_at,status,public_file,public_note,sort,created_at,updated_at');
  PERFORM pg_temp.isvoi_permission('ISVOI Advanced Editor','device_diagnostic_reports','create','product,passport,provider,tested_at,status,public_file,public_note,sort');
  PERFORM pg_temp.isvoi_permission('ISVOI Advanced Editor','device_diagnostic_reports','update','product,passport,provider,tested_at,status,public_file,public_note,sort');

  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','products','update',
    'status,content_status,sale_mode,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,admin_note');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','store_locations','read',
    'id,slug,status,name,city,address,sort');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','product_images','read','id,product,image,status,role,label,alt,sort,import_batch,created_at,updated_at');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','product_images','create','product,image,status,role,label,alt,sort,import_batch');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','product_images','update','image,status,role,label,alt,sort,import_batch');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_details','read','id,product,storage,serial,imei_primary_last4,imei_secondary_last4,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade,created_at,updated_at');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_details','create','product,storage,serial,imei_primary_last4,imei_secondary_last4,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_details','update','storage,serial,imei_primary_last4,imei_secondary_last4,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_passports','read','id,product,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,created_at,updated_at');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_passports','create','product,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','device_passports','update','repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','product_offers','read','id,product,location,local_sku,status,price,price_text,stock_quantity,stock_status,sale_mode,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,preparation_days,delivery_estimate,source_system,source_id,created_at,updated_at');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','product_offers','create','product,location,local_sku,status,price,price_text,stock_quantity,stock_status,sale_mode,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,preparation_days,delivery_estimate,source_system,source_id');
  PERFORM pg_temp.isvoi_permission('ISVOI Inventory Manager','product_offers','update','local_sku,status,price,price_text,stock_quantity,stock_status,sale_mode,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,preparation_days,delivery_estimate,source_system,source_id');
END $$;

INSERT INTO directus_presets(bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT 'Актуальная диагностика',role.id,NULL,'device_diagnostic_reports','tabular',
  '{"tabular":{"sort":["-tested_at"],"fields":["product","tested_at","provider","status","public_file"],"page":1}}'::json,
  '{"status":{"_eq":"current"}}'::json,'fact_check','#0f766e'
FROM directus_roles role
WHERE role.name IN ('Administrator','ISVOI Inventory Manager','ISVOI Advanced Editor')
  AND NOT EXISTS(
    SELECT 1 FROM directus_presets p WHERE p.role=role.id AND p."user" IS NULL
      AND p.collection='device_diagnostic_reports' AND p.bookmark='Актуальная диагностика'
  );

${
  rollback
    ? "ROLLBACK;\nSELECT 'product_passports_v8.rollback' AS check_name,'ok' AS value;"
    : `COMMIT;

SELECT 'product_passports_v8.tables_missing' AS check_name,count(*)::text AS value
FROM (VALUES ('device_diagnostic_reports'),('device_model_specifications')) expected(name)
WHERE to_regclass('public.'||expected.name) IS NULL
UNION ALL
SELECT 'product_passports_v8.folders_missing',count(*)::text
FROM (VALUES
  ('ISVOI Passport Originals'),
  ('ISVOI Passport Public'),
  ('ISVOI Passport Archive')
) expected(name)
WHERE NOT EXISTS(SELECT 1 FROM directus_folders f WHERE f.name=expected.name)
UNION ALL
SELECT 'product_passports_v8.public_original_exposure',count(*)::text
FROM directus_permissions p JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name IN ('$t:public_label','ISVOI Public Read','ISVOI Editor','ISVOI Advanced Editor')
  AND p.collection='device_diagnostic_reports'
  AND (p.fields='*' OR 'original_file'=ANY(string_to_array(p.fields,',')));
`
}
`);
