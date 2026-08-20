#!/usr/bin/env node
/**
 * Forward-only multi-city catalog migration.
 *
 * Products remain global. Store-specific price, stock and fulfillment live in
 * product_offers. Legacy product sale fields remain available for dual-read
 * rollback until the city offer rollout is stable.
 */

const rehearse = process.argv.includes("--rehearse");
const sql = String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS store_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(160) NOT NULL UNIQUE,
  status varchar(32) NOT NULL DEFAULT 'draft',
  name varchar(255) NOT NULL,
  city varchar(160) NOT NULL,
  region varchar(200),
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  phone varchar(120),
  telegram varchar(255),
  email varchar(255),
  business_hours varchar(255),
  map_url text,
  legal_name text,
  hero_file uuid,
  pickup_enabled boolean NOT NULL DEFAULT true,
  local_delivery_enabled boolean NOT NULL DEFAULT false,
  intercity_delivery_enabled boolean NOT NULL DEFAULT true,
  seo_title varchar(255),
  meta_description text,
  hero_title text,
  hero_body text,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_location_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location uuid NOT NULL,
  image uuid,
  status varchar(32) NOT NULL DEFAULT 'draft',
  alt text,
  caption text,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL,
  location uuid NOT NULL,
  local_sku varchar(160) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  price integer NOT NULL DEFAULT 0,
  price_text varchar(160),
  stock_quantity integer NOT NULL DEFAULT 0,
  stock_status varchar(32) NOT NULL DEFAULT 'hidden',
  sale_mode varchar(32) NOT NULL DEFAULT 'reservation',
  pickup_enabled boolean NOT NULL DEFAULT true,
  local_delivery_enabled boolean NOT NULL DEFAULT false,
  intercity_delivery_enabled boolean NOT NULL DEFAULT false,
  preparation_days integer,
  delivery_estimate varchar(160),
  yandex_pay_enabled boolean NOT NULL DEFAULT false,
  yandex_split_enabled boolean NOT NULL DEFAULT false,
  source_system varchar(64) NOT NULL DEFAULT 'manual',
  source_id varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product, location)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='store_locations_status_check') THEN
    ALTER TABLE store_locations ADD CONSTRAINT store_locations_status_check
      CHECK (status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='store_location_images_location_fk') THEN
    ALTER TABLE store_location_images ADD CONSTRAINT store_location_images_location_fk
      FOREIGN KEY (location) REFERENCES store_locations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='store_location_images_file_fk') THEN
    ALTER TABLE store_location_images ADD CONSTRAINT store_location_images_file_fk
      FOREIGN KEY (image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='store_locations_hero_file_fk') THEN
    ALTER TABLE store_locations ADD CONSTRAINT store_locations_hero_file_fk
      FOREIGN KEY (hero_file) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_offers_product_fk') THEN
    ALTER TABLE product_offers ADD CONSTRAINT product_offers_product_fk
      FOREIGN KEY (product) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_offers_location_fk') THEN
    ALTER TABLE product_offers ADD CONSTRAINT product_offers_location_fk
      FOREIGN KEY (location) REFERENCES store_locations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_offers_nonnegative_check') THEN
    ALTER TABLE product_offers ADD CONSTRAINT product_offers_nonnegative_check
      CHECK (price >= 0 AND stock_quantity >= 0 AND (preparation_days IS NULL OR preparation_days >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_offers_status_check') THEN
    ALTER TABLE product_offers ADD CONSTRAINT product_offers_status_check
      CHECK (status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_offers_stock_status_check') THEN
    ALTER TABLE product_offers ADD CONSTRAINT product_offers_stock_status_check
      CHECK (stock_status IN ('available','reserved','sold','hidden'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_offers_sale_mode_check') THEN
    ALTER TABLE product_offers ADD CONSTRAINT product_offers_sale_mode_check
      CHECK (sale_mode IN ('reservation','inquiry','online'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_offers_public_idx
  ON product_offers(location,status,stock_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS product_offers_product_idx ON product_offers(product,status);

INSERT INTO store_locations (
  slug,status,name,city,pickup_enabled,local_delivery_enabled,
  intercity_delivery_enabled,hero_title,hero_body,sort
)
VALUES (
  'belgorod','published','I СВОИ Белгород','Белгород',true,false,true,
  'Техника и аксессуары I СВОИ в Белгороде.',
  'Смотрите локальное наличие, бронируйте товары и выбирайте доставку из других магазинов сети.',
  10
)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, city=EXCLUDED.city,
  pickup_enabled=EXCLUDED.pickup_enabled,
  intercity_delivery_enabled=EXCLUDED.intercity_delivery_enabled,
  hero_title=COALESCE(store_locations.hero_title,EXCLUDED.hero_title),
  hero_body=COALESCE(store_locations.hero_body,EXCLUDED.hero_body);

INSERT INTO product_offers (
  product,location,local_sku,status,price,price_text,stock_quantity,stock_status,
  sale_mode,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,
  delivery_estimate,yandex_pay_enabled,yandex_split_enabled,source_system
)
SELECT p.id,l.id,p.sku,p.status,p.price,p.price_text,p.stock_quantity,p.stock_status,
       p.sale_mode,true,false,true,'Срок подтвердим перед заказом',false,false,'catalog_v3_migration'
FROM products p
JOIN store_locations l ON l.slug='belgorod'
ON CONFLICT (product,location) DO NOTHING;

INSERT INTO directus_collections (
  collection,icon,note,display_template,archive_field,archive_value,
  unarchive_value,accountability,sort,color,"group",hidden
)
VALUES
  ('store_locations','storefront','Города и действующие магазины сети. Не публикуйте непроверенные адреса и контакты.','{{city}} · {{name}}','status','archived','draft','all',18,'#0f766e','isvoi_site_content',false),
  ('store_location_images','photo_library','Реальные фотографии конкретного магазина.','{{location.city}} · {{caption}}','status','archived','draft','all',19,'#0891b2','isvoi_site_content',true),
  ('product_offers','store','Цена, остаток и получение конкретного товара в конкретной точке.','{{product.title}} · {{location.city}} · {{stock_status}}','status','archived','draft','all',24,'#2563eb','isvoi_catalog',false)
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon,note=EXCLUDED.note,display_template=EXCLUDED.display_template,
  archive_field=EXCLUDED.archive_field,archive_value=EXCLUDED.archive_value,
  unarchive_value=EXCLUDED.unarchive_value,accountability=EXCLUDED.accountability,
  sort=EXCLUDED.sort,color=EXCLUDED.color,"group"=EXCLUDED."group",hidden=EXCLUDED.hidden;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_multicity_field(
  p_collection varchar,p_field varchar,p_interface varchar,p_display varchar,
  p_options json,p_width varchar,p_sort integer,p_note text,
  p_special varchar DEFAULT NULL,p_group varchar DEFAULT NULL,
  p_required boolean DEFAULT false,p_readonly boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface,display=p_display,options=p_options,
      width=p_width,sort=p_sort,note=p_note,special=p_special,"group"=p_group,
      required=p_required,readonly=p_readonly
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,"group",required,readonly)
    VALUES(p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,p_group,p_required,p_readonly);
  END IF;
END $$;

SELECT pg_temp.isvoi_multicity_field('store_locations','slug','input',NULL,NULL,'half',1,'Латинский slug города в публичном URL.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}','half',2,'Опубликованная точка доступна на сайте.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','name','input',NULL,NULL,'half',3,'Публичное название магазина.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','city','input',NULL,NULL,'half',4,'Город без адреса.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','region','input',NULL,NULL,'half',5,'Регион.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','address','input-multiline',NULL,NULL,'full',6,'Подтверждённый фактический адрес.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','latitude','input',NULL,'{"min":-90,"max":90,"step":0.000001}','half',6,'Широта точки.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','longitude','input',NULL,'{"min":-180,"max":180,"step":0.000001}','half',6,'Долгота точки.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','business_hours','input',NULL,NULL,'half',7,'Проверенные часы работы.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','map_url','input',NULL,NULL,'half',8,'HTTPS-ссылка на карту.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','phone','input',NULL,NULL,'half',9,'Публичный телефон.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','telegram','input',NULL,NULL,'half',10,'Публичный Telegram.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','email','input',NULL,NULL,'half',11,'Публичный email.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','legal_name','input',NULL,NULL,'half',12,'Юридический продавец точки.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','hero_file','file-image','image',NULL,'half',13,'Реальная фотография магазина.','m2o',NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','pickup_enabled','boolean','boolean',NULL,'half',14,'Доступен самовывоз.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','local_delivery_enabled','boolean','boolean',NULL,'half',15,'Доступна локальная доставка.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','intercity_delivery_enabled','boolean','boolean',NULL,'half',16,'Можно получать товары из других городов.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','hero_title','input',NULL,NULL,'full',17,'Локальный H1.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','hero_body','input-multiline',NULL,NULL,'full',18,'Локальное описание.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','seo_title','input',NULL,NULL,'full',19,'SEO title.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','meta_description','input-multiline',NULL,NULL,'full',20,'Meta description.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','images','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["sort","status","image","alt","caption"]}','full',21,'Реальные фотографии магазина.','o2m',NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','offers','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["product","price","stock_quantity","stock_status","sale_mode"]}','full',22,'Товары и остатки этой точки.','o2m',NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_locations','sort','input',NULL,'{"min":0,"step":1}','half',23,'Порядок города на сайте.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','created_at','datetime','datetime',NULL,'half',24,'Создано автоматически.','date-created',NULL,false,true);
SELECT pg_temp.isvoi_multicity_field('store_locations','updated_at','datetime','datetime',NULL,'half',25,'Обновлено автоматически.','date-updated',NULL,false,true);

SELECT pg_temp.isvoi_multicity_field('product_offers','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','half',1,'Глобальный товар.','m2o',NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','location','select-dropdown-m2o','related-values','{"template":"{{city}} · {{name}}"}','half',2,'Точка, которая исполняет предложение.','m2o',NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','local_sku','input',NULL,NULL,'half',3,'SKU в этой точке.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}','half',4,'Публичная видимость предложения.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','price','input',NULL,'{"min":0,"step":1}','half',5,'Цена в точке.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','price_text','input',NULL,NULL,'half',6,'Форматированная цена.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('product_offers','stock_quantity','input',NULL,'{"min":0,"step":1}','half',7,'Остаток в точке.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','stock_status','select-dropdown','labels','{"choices":[{"text":"В наличии","value":"available"},{"text":"Бронь","value":"reserved"},{"text":"Нет","value":"sold"},{"text":"Скрыто","value":"hidden"}]}','half',8,'Статус остатка.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','sale_mode','select-dropdown','labels','{"choices":[{"text":"Резерв","value":"reservation"},{"text":"Заявка","value":"inquiry"},{"text":"Онлайн","value":"online"}]}','half',9,'Сценарий продажи.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','pickup_enabled','boolean','boolean',NULL,'half',10,'Самовывоз.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','local_delivery_enabled','boolean','boolean',NULL,'half',11,'Локальная доставка.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','intercity_delivery_enabled','boolean','boolean',NULL,'half',12,'Межгород.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','preparation_days','input',NULL,'{"min":0,"step":1}','half',13,'Дней на подготовку.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('product_offers','delivery_estimate','input',NULL,NULL,'half',14,'Публичный срок доставки.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('product_offers','yandex_pay_enabled','boolean','boolean',NULL,'half',15,'Доступность Яндекс Пэй после подключения checkout.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','yandex_split_enabled','boolean','boolean',NULL,'half',16,'Доступность Сплит после ответа платёжной системы.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','source_system','input',NULL,NULL,'half',17,'Источник остатка.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','source_id','input',NULL,NULL,'half',18,'Идентификатор во внешнем источнике.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('product_offers','created_at','datetime','datetime',NULL,'half',19,'Создано автоматически.','date-created',NULL,false,true);
SELECT pg_temp.isvoi_multicity_field('product_offers','updated_at','datetime','datetime',NULL,'half',20,'Последняя синхронизация или ручное изменение.','date-updated',NULL,false,true);
SELECT pg_temp.isvoi_multicity_field('products','offers','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["location","price","stock_quantity","stock_status","sale_mode"]}','full',97,'Предложения магазинов. После стабилизации они заменят глобальные цену и остаток.','o2m','group_sale',false);

SELECT pg_temp.isvoi_multicity_field('store_location_images','location','select-dropdown-m2o','related-values','{"template":"{{city}}"}','half',1,'Магазин.','m2o',NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_location_images','image','file-image','image',NULL,'half',2,'Реальная фотография.','m2o',NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_location_images','alt','input-multiline',NULL,NULL,'half',3,'Описание изображения.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_location_images','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}','half',4,'Публикуется только проверенная фотография.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_location_images','caption','input-multiline',NULL,NULL,'half',5,'Подпись к фотографии.',NULL,NULL,false);
SELECT pg_temp.isvoi_multicity_field('store_location_images','sort','input',NULL,'{"min":0,"step":1}','half',6,'Порядок в галерее.',NULL,NULL,true);
SELECT pg_temp.isvoi_multicity_field('store_location_images','created_at','datetime','datetime',NULL,'half',7,'Создано автоматически.','date-created',NULL,false,true);
SELECT pg_temp.isvoi_multicity_field('store_location_images','updated_at','datetime','datetime',NULL,'half',8,'Обновлено автоматически.','date-updated',NULL,false,true);

UPDATE directus_collections collection
SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('store_locations','Магазины и города'),
  ('store_location_images','Фотографии магазинов'),
  ('product_offers','Предложения магазинов')
) labels(collection,label)
WHERE collection.collection=labels.collection;

UPDATE directus_fields field
SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('store_locations','slug','Slug города'),('store_locations','status','Статус'),
  ('store_locations','name','Название'),('store_locations','city','Город'),
  ('store_locations','region','Регион'),('store_locations','address','Адрес'),
  ('store_locations','latitude','Широта'),('store_locations','longitude','Долгота'),
  ('store_locations','business_hours','Часы работы'),('store_locations','map_url','Ссылка на карту'),
  ('store_locations','phone','Телефон'),('store_locations','telegram','Telegram'),
  ('store_locations','email','Email'),('store_locations','legal_name','Юридический продавец'),
  ('store_locations','hero_file','Главная фотография'),('store_locations','pickup_enabled','Самовывоз'),
  ('store_locations','local_delivery_enabled','Локальная доставка'),
  ('store_locations','intercity_delivery_enabled','Межгородская доставка'),
  ('store_locations','hero_title','Заголовок города'),('store_locations','hero_body','Описание города'),
  ('store_locations','seo_title','SEO-заголовок'),('store_locations','meta_description','Meta description'),
  ('store_locations','images','Фотографии'),('store_locations','offers','Предложения'),
  ('store_locations','sort','Порядок'),('store_locations','created_at','Создано'),
  ('store_locations','updated_at','Обновлено'),
  ('store_location_images','location','Магазин'),('store_location_images','image','Фотография'),
  ('store_location_images','alt','Alt-текст'),('store_location_images','status','Статус'),
  ('store_location_images','caption','Подпись'),('store_location_images','sort','Порядок'),
  ('store_location_images','created_at','Создано'),('store_location_images','updated_at','Обновлено'),
  ('product_offers','product','Товар'),('product_offers','location','Магазин'),
  ('product_offers','local_sku','Локальный SKU'),('product_offers','status','Статус'),
  ('product_offers','price','Цена'),('product_offers','price_text','Цена текстом'),
  ('product_offers','stock_quantity','Остаток'),('product_offers','stock_status','Статус остатка'),
  ('product_offers','sale_mode','Сценарий продажи'),('product_offers','pickup_enabled','Самовывоз'),
  ('product_offers','local_delivery_enabled','Локальная доставка'),
  ('product_offers','intercity_delivery_enabled','Межгородская доставка'),
  ('product_offers','preparation_days','Дней на подготовку'),
  ('product_offers','delivery_estimate','Срок доставки'),
  ('product_offers','yandex_pay_enabled','Яндекс Пэй'),
  ('product_offers','yandex_split_enabled','Яндекс Сплит'),
  ('product_offers','source_system','Источник остатка'),
  ('product_offers','source_id','ID в источнике'),
  ('product_offers','created_at','Создано'),('product_offers','updated_at','Обновлено'),
  ('products','offers','Предложения магазинов')
) labels(collection,field,label)
WHERE field.collection=labels.collection AND field.field=labels.field;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_multicity_relation(
  p_many varchar,p_field varchar,p_one varchar,p_one_field varchar,p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many AND many_field=p_field) THEN
    UPDATE directus_relations SET one_collection=p_one,one_field=p_one_field,one_deselect_action=p_action
    WHERE many_collection=p_many AND many_field=p_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES(p_many,p_field,p_one,p_one_field,p_action);
  END IF;
END $$;

SELECT pg_temp.isvoi_multicity_relation('store_locations','hero_file','directus_files',NULL,'nullify');
SELECT pg_temp.isvoi_multicity_relation('store_location_images','location','store_locations','images','delete');
SELECT pg_temp.isvoi_multicity_relation('store_location_images','image','directus_files',NULL,'nullify');
SELECT pg_temp.isvoi_multicity_relation('product_offers','product','products','offers','delete');
SELECT pg_temp.isvoi_multicity_relation('product_offers','location','store_locations','offers','restrict');

CREATE OR REPLACE FUNCTION pg_temp.isvoi_multicity_permission(
  p_policy text,p_collection varchar,p_action varchar,p_fields text,p_permissions json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions SET fields=p_fields,permissions=p_permissions
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,permissions)
    VALUES(v_policy,p_collection,p_action,p_fields,p_permissions);
  END IF;
END $$;

SELECT pg_temp.isvoi_multicity_permission('ISVOI Public Read','store_locations','read',
  'id,slug,status,name,city,region,address,latitude,longitude,phone,telegram,email,business_hours,map_url,hero_file,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,seo_title,meta_description,hero_title,hero_body,sort,images,offers',
  '{"status":{"_eq":"published"}}'::json);
SELECT pg_temp.isvoi_multicity_permission('ISVOI Public Read','store_location_images','read',
  'id,location,image,status,alt,caption,sort',
  '{"_and":[{"status":{"_eq":"published"}},{"location":{"status":{"_eq":"published"}}}]}'::json);
SELECT pg_temp.isvoi_multicity_permission('ISVOI Public Read','product_offers','read',
  'id,product,location,local_sku,status,price,price_text,stock_quantity,stock_status,sale_mode,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,preparation_days,delivery_estimate,yandex_pay_enabled,yandex_split_enabled,updated_at',
  '{"_and":[{"status":{"_eq":"published"}},{"product":{"status":{"_eq":"published"}}},{"location":{"status":{"_eq":"published"}}}]}'::json);

DO $$
DECLARE role_name text; collection_name text; fields text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    FOREACH collection_name IN ARRAY ARRAY['store_locations','store_location_images','product_offers'] LOOP
      fields := CASE collection_name
        WHEN 'store_locations' THEN 'id,slug,status,name,city,region,address,latitude,longitude,phone,telegram,email,business_hours,map_url,legal_name,hero_file,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,seo_title,meta_description,hero_title,hero_body,sort,created_at,updated_at,images,offers'
        WHEN 'store_location_images' THEN 'id,location,image,status,alt,caption,sort,created_at,updated_at'
        ELSE 'id,product,location,local_sku,status,price,price_text,stock_quantity,stock_status,sale_mode,pickup_enabled,local_delivery_enabled,intercity_delivery_enabled,preparation_days,delivery_estimate,yandex_pay_enabled,yandex_split_enabled,source_system,source_id,created_at,updated_at' END;
      PERFORM pg_temp.isvoi_multicity_permission(role_name,collection_name,'read',fields,NULL);
      PERFORM pg_temp.isvoi_multicity_permission(role_name,collection_name,'create',fields,NULL);
      PERFORM pg_temp.isvoi_multicity_permission(role_name,collection_name,'update',fields,NULL);
      IF role_name='ISVOI Advanced Editor' THEN
        PERFORM pg_temp.isvoi_multicity_permission(role_name,collection_name,'delete','id',NULL);
      END IF;
    END LOOP;
  END LOOP;
END $$;

UPDATE directus_permissions permission
SET fields = CASE
  WHEN permission.fields IS NULL OR permission.fields='' OR permission.fields='*' THEN permission.fields
  WHEN position('offers' in permission.fields)=0 THEN permission.fields || ',offers'
  ELSE permission.fields END
FROM directus_policies policy
WHERE permission.policy=policy.id AND permission.collection='products' AND permission.action='read'
  AND policy.name IN ('ISVOI Public Read','ISVOI Editor','ISVOI Advanced Editor');

CREATE OR REPLACE FUNCTION pg_temp.isvoi_multicity_preset(
  p_role varchar,p_bookmark varchar,p_icon varchar,p_color varchar,p_filter json,p_fields json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_role uuid; v_query json;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name=p_role LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  v_query := json_build_object('tabular',json_build_object(
    'sort',json_build_array('-updated_at'), 'fields',p_fields, 'page',1
  ));
  IF EXISTS (
    SELECT 1 FROM directus_presets
    WHERE role=v_role AND collection='product_offers' AND bookmark=p_bookmark AND "user" IS NULL
  ) THEN
    UPDATE directus_presets SET icon=p_icon,color=p_color,filter=p_filter,
      layout='tabular',layout_query=v_query
    WHERE role=v_role AND collection='product_offers' AND bookmark=p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets(bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
    VALUES(p_bookmark,v_role,NULL,'product_offers','tabular',v_query,p_filter,p_icon,p_color);
  END IF;
END $$;

DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_multicity_preset(role_name,'Белгород','location_city','#2563eb',
      '{"location":{"slug":{"_eq":"belgorod"}}}'::json,
      '["location","product","price","stock_quantity","stock_status","delivery_estimate","updated_at"]'::json);
    PERFORM pg_temp.isvoi_multicity_preset(role_name,'В наличии локально','storefront','#059669',
      '{"_and":[{"stock_status":{"_eq":"available"}},{"stock_quantity":{"_gt":0}},{"pickup_enabled":{"_eq":true}}]}'::json,
      '["location","product","price","stock_quantity","sale_mode","updated_at"]'::json);
    PERFORM pg_temp.isvoi_multicity_preset(role_name,'Доступно с доставкой','local_shipping','#0891b2',
      '{"intercity_delivery_enabled":{"_eq":true}}'::json,
      '["location","product","price","stock_quantity","delivery_estimate","updated_at"]'::json);
    PERFORM pg_temp.isvoi_multicity_preset(role_name,'Без цены','money_off','#dc2626',
      '{"price":{"_lte":0}}'::json,
      '["location","product","status","price","stock_status","updated_at"]'::json);
    PERFORM pg_temp.isvoi_multicity_preset(role_name,'Остаток устарел','history','#d97706',
      '{"updated_at":{"_lt":"$NOW(-7 days)"}}'::json,
      '["location","product","stock_quantity","stock_status","source_system","updated_at"]'::json);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION isvoi_validate_product_offer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='published' AND (
    NEW.price <= 0 OR NULLIF(NEW.local_sku,'') IS NULL OR
    NEW.stock_status='hidden' OR
    NOT (NEW.pickup_enabled OR NEW.local_delivery_enabled OR NEW.intercity_delivery_enabled)
  ) THEN
    RAISE EXCEPTION 'Предложение не готово: нужны SKU, цена, видимый остаток и способ получения';
  END IF;
  IF NEW.yandex_split_enabled AND NOT NEW.yandex_pay_enabled THEN
    RAISE EXCEPTION 'Сплит нельзя включить без Яндекс Пэй';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS product_offers_publication_guard ON product_offers;
CREATE TRIGGER product_offers_publication_guard
BEFORE INSERT OR UPDATE ON product_offers FOR EACH ROW EXECUTE FUNCTION isvoi_validate_product_offer();

UPDATE site_settings
SET city='Белгород',
    footer_brand_text=replace(COALESCE(footer_brand_text,''),'Северодвинск','Белгород');

UPDATE navigation_items
SET label=replace(replace(replace(label,'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород'),
    label_short=CASE WHEN COALESCE(custom_url,url) IN ('/store','/belgorod') THEN NULL
      ELSE replace(replace(replace(COALESCE(label_short,label),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород') END,
    url=CASE WHEN COALESCE(custom_url,url)='/store' THEN '/belgorod' ELSE url END,
    custom_url=CASE WHEN COALESCE(custom_url,url) IN ('/store','/belgorod') THEN '/belgorod' ELSE custom_url END,
    link_type=CASE WHEN COALESCE(custom_url,url) IN ('/store','/belgorod') THEN 'custom' ELSE link_type END,
    page=CASE WHEN COALESCE(custom_url,url) IN ('/store','/belgorod') THEN NULL ELSE page END
WHERE label LIKE '%Северодвин%' OR COALESCE(custom_url,url) IN ('/store','/belgorod');

UPDATE site_pages
SET title=replace(replace(replace(title,'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород'),
    meta_description=replace(replace(replace(COALESCE(meta_description,''),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород')
WHERE title LIKE '%Северодвин%' OR meta_description LIKE '%Северодвин%';

UPDATE page_sections
SET eyebrow=replace(replace(replace(COALESCE(eyebrow,''),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород'),
    headline=replace(replace(replace(COALESCE(headline,''),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород'),
    subheadline=replace(replace(replace(COALESCE(subheadline,''),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород'),
    body=replace(replace(replace(COALESCE(body,''),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород'),
    primary_cta_url=CASE WHEN primary_cta_url='/store' THEN '/belgorod' ELSE primary_cta_url END,
    secondary_cta_url=CASE WHEN secondary_cta_url='/store' THEN '/belgorod' ELSE secondary_cta_url END,
    content=replace(replace(replace(COALESCE(content::text,'{}'),'Северодвинске','Белгороде'),'Северодвинска','Белгорода'),'Северодвинск','Белгород')::json;

COMMIT;

SELECT 'multicity.locations' AS check_name,count(*)::text AS value FROM store_locations
UNION ALL SELECT 'multicity.offers',count(*)::text FROM product_offers
UNION ALL SELECT 'multicity.belgorod_offers',count(*)::text FROM product_offers o JOIN store_locations l ON l.id=o.location WHERE l.slug='belgorod'
UNION ALL SELECT 'multicity.collections',count(*)::text FROM directus_collections WHERE collection IN ('store_locations','store_location_images','product_offers');
`;

process.stdout.write(rehearse ? `${sql.slice(0, sql.indexOf("\nCOMMIT;"))}\nROLLBACK;\n` : sql);
