#!/usr/bin/env node
/**
 * Forward-only, additive Directus migration for the universal product catalog.
 *
 * The legacy devices collections remain intact for rollback. Existing device
 * slugs become product ids, so /device/{slug} can permanently redirect to
 * /product/{slug} without losing Passport, images or Trade data.
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS product_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(160) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  logo_file uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(160) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  catalog_section varchar(32) NOT NULL,
  parent uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(200) NOT NULL UNIQUE,
  brand uuid NOT NULL,
  name varchar(200) NOT NULL,
  family varchar(160),
  year integer,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id varchar(255) PRIMARY KEY,
  sku varchar(160) NOT NULL UNIQUE,
  status varchar(32) NOT NULL DEFAULT 'draft',
  content_status varchar(32) NOT NULL DEFAULT 'needs_content',
  product_type varchar(32) NOT NULL,
  condition varchar(32) NOT NULL,
  sale_mode varchar(32) NOT NULL DEFAULT 'reservation',
  brand uuid NOT NULL,
  category uuid NOT NULL,
  device_model uuid,
  title varchar(255) NOT NULL,
  model varchar(255),
  color varchar(160),
  price integer NOT NULL DEFAULT 0,
  price_text varchar(160),
  stock_quantity integer NOT NULL DEFAULT 0,
  stock_status varchar(32) NOT NULL DEFAULT 'available',
  warranty varchar(255),
  warranty_text varchar(255),
  completeness text,
  short_description text,
  headline text,
  listing_file uuid,
  listing_alt text,
  sort integer NOT NULL DEFAULT 100,
  source_system varchar(64) NOT NULL DEFAULT 'manual',
  source_id varchar(160),
  import_batch varchar(160),
  imported_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS products_publication_guard ON products;

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL,
  image uuid,
  status varchar(32) NOT NULL DEFAULT 'draft',
  role varchar(32) NOT NULL DEFAULT 'other',
  label varchar(255),
  alt text,
  sort integer NOT NULL DEFAULT 100,
  source_path text,
  import_batch varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, sort)
);

CREATE TABLE IF NOT EXISTS device_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL UNIQUE,
  storage varchar(120),
  serial varchar(255),
  year integer,
  model_identifier varchar(160),
  region varchar(120),
  sim varchar(160),
  battery varchar(160),
  battery_text varchar(160),
  battery_cycles integer,
  diagnostic_date date,
  activation_lock varchar(160),
  mdm varchar(160),
  diagnostic_by varchar(200),
  grade varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accessory_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL UNIQUE,
  compatibility_mode varchar(32) NOT NULL DEFAULT 'universal',
  material varchar(160),
  connection_type varchar(160),
  package_contents text,
  specifications json,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_compatible_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product varchar(255) NOT NULL,
  device_models_id uuid NOT NULL,
  UNIQUE (product, device_models_id)
);

ALTER TABLE device_passports ADD COLUMN IF NOT EXISTS product varchar(255);
ALTER TABLE trade_options ADD COLUMN IF NOT EXISTS product varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product varchar(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_type varchar(32);
ALTER TABLE device_passports ALTER COLUMN device DROP NOT NULL;
ALTER TABLE trade_options ALTER COLUMN device DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_brands_logo_file_fkey') THEN
    ALTER TABLE product_brands ADD CONSTRAINT product_brands_logo_file_fkey FOREIGN KEY (logo_file) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_parent_fkey') THEN
    ALTER TABLE product_categories ADD CONSTRAINT product_categories_parent_fkey FOREIGN KEY (parent) REFERENCES product_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_models_brand_fkey') THEN
    ALTER TABLE device_models ADD CONSTRAINT device_models_brand_fkey FOREIGN KEY (brand) REFERENCES product_brands(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_brand_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_brand_fkey FOREIGN KEY (brand) REFERENCES product_brands(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_category_fkey FOREIGN KEY (category) REFERENCES product_categories(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_device_model_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_device_model_fkey FOREIGN KEY (device_model) REFERENCES device_models(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_listing_file_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_listing_file_fkey FOREIGN KEY (listing_file) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_product_fkey') THEN
    ALTER TABLE product_images ADD CONSTRAINT product_images_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_image_fkey') THEN
    ALTER TABLE product_images ADD CONSTRAINT product_images_image_fkey FOREIGN KEY (image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_details_product_fkey') THEN
    ALTER TABLE device_details ADD CONSTRAINT device_details_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accessory_details_product_fkey') THEN
    ALTER TABLE accessory_details ADD CONSTRAINT accessory_details_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_compatible_models_product_fkey') THEN
    ALTER TABLE product_compatible_models ADD CONSTRAINT product_compatible_models_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_compatible_models_model_fkey') THEN
    ALTER TABLE product_compatible_models ADD CONSTRAINT product_compatible_models_model_fkey FOREIGN KEY (device_models_id) REFERENCES device_models(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_passports_product_fkey') THEN
    ALTER TABLE device_passports ADD CONSTRAINT device_passports_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_options_product_fkey') THEN
    ALTER TABLE trade_options ADD CONSTRAINT trade_options_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_product_fkey') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_product_fkey FOREIGN KEY (product) REFERENCES products(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_product_type_check CHECK (product_type IN ('device','accessory'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_condition_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_condition_check CHECK (condition IN ('new','used'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_accessory_new_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_accessory_new_check CHECK (product_type <> 'accessory' OR condition = 'new');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sale_mode_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_sale_mode_check CHECK (sale_mode IN ('reservation','inquiry','online'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_nonnegative_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_nonnegative_check CHECK (price >= 0 AND stock_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_section_check') THEN
    ALTER TABLE product_categories ADD CONSTRAINT categories_section_check CHECK (catalog_section IN ('device','accessory'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accessory_compatibility_mode_check') THEN
    ALTER TABLE accessory_details ADD CONSTRAINT accessory_compatibility_mode_check CHECK (compatibility_mode IN ('universal','model_specific'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS products_catalog_idx ON products (status, product_type, stock_status, sort);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand, status, sort);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category, status, sort);
CREATE INDEX IF NOT EXISTS products_price_idx ON products (price);
CREATE INDEX IF NOT EXISTS products_source_idx ON products (source_system, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_source_unique_idx ON products (source_system, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images (product, status, sort);
CREATE INDEX IF NOT EXISTS compatible_models_product_idx ON product_compatible_models (product);
CREATE INDEX IF NOT EXISTS compatible_models_model_idx ON product_compatible_models (device_models_id);
DROP INDEX IF EXISTS device_passports_product_unique_idx;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='device_passports_product_key') THEN
    ALTER TABLE device_passports
      ADD CONSTRAINT device_passports_product_key UNIQUE (product);
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS trade_options_product_idx ON trade_options (product, sort);
CREATE INDEX IF NOT EXISTS leads_product_idx ON leads (product);

CREATE OR REPLACE FUNCTION isvoi_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_brands','product_categories','device_models','products','product_images','device_details','accessory_details']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION isvoi_touch_updated_at()', t, t);
  END LOOP;
END;
$$;

-- Reference data and lossless legacy copy.
INSERT INTO product_brands (slug, name, sort)
VALUES ('apple', 'Apple', 10), ('samsung', 'Samsung', 20), ('xiaomi', 'Xiaomi', 30), ('other', 'Другой бренд', 999)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true;

INSERT INTO product_categories (slug, name, catalog_section, sort)
VALUES
  ('smartphones', 'Смартфоны', 'device', 10),
  ('tablets', 'Планшеты', 'device', 20),
  ('laptops', 'Ноутбуки', 'device', 30),
  ('watches', 'Часы', 'device', 40),
  ('headphones', 'Наушники', 'device', 50),
  ('cases', 'Чехлы', 'accessory', 110),
  ('chargers', 'Зарядные устройства', 'accessory', 120),
  ('cables', 'Кабели', 'accessory', 130),
  ('protective-glass', 'Защитные стёкла', 'accessory', 140),
  ('other-accessories', 'Другие аксессуары', 'accessory', 190)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, catalog_section = EXCLUDED.catalog_section, is_active = true;

INSERT INTO device_models (slug, brand, name, family, year, sort)
SELECT DISTINCT
  regexp_replace(lower(COALESCE(NULLIF(d.brand,''),'Apple') || '-' || d.model), '[^a-zа-я0-9]+', '-', 'g'),
  pb.id,
  d.model,
  d.category,
  d.year,
  100
FROM devices d
JOIN product_brands pb ON pb.slug = CASE lower(COALESCE(NULLIF(d.brand,''),'Apple'))
  WHEN 'samsung' THEN 'samsung' WHEN 'xiaomi' THEN 'xiaomi' ELSE 'apple' END
WHERE NULLIF(d.model, '') IS NOT NULL
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, year = COALESCE(device_models.year, EXCLUDED.year);

INSERT INTO products (
  id, sku, status, content_status, product_type, condition, sale_mode,
  brand, category, device_model, title, model, color, price, price_text,
  stock_quantity, stock_status, warranty, warranty_text, completeness,
  short_description, headline, listing_file, listing_alt, sort,
  source_system, source_id, import_batch, imported_at, admin_note, created_at, updated_at
)
SELECT
  d.id,
  'LEGACY-' || upper(regexp_replace(d.id, '[^a-zA-Z0-9]+', '-', 'g')),
  d.status,
  COALESCE(NULLIF(d.content_status,''),'ready'),
  'device',
  'used',
  'reservation',
  pb.id,
  pc.id,
  dm.id,
  d.title,
  d.model,
  d.color,
  COALESCE(d.price,0),
  d.price_text,
  CASE WHEN d.stock_status IN ('sold','hidden') THEN 0 ELSE 1 END,
  COALESCE(NULLIF(d.stock_status,''),'available'),
  d.warranty,
  d.warranty_text,
  d.completeness,
  d.short_description,
  d.headline,
  d.listing_file,
  d.listing_alt,
  COALESCE(d.sort,100),
  COALESCE(NULLIF(d.source_system,''),'legacy_devices'),
  COALESCE(d.source_id,d.id),
  d.import_batch,
  d.imported_at,
  d.admin_note,
  d.created_at,
  d.updated_at
FROM devices d
JOIN product_brands pb ON pb.slug = CASE lower(COALESCE(NULLIF(d.brand,''),'Apple'))
  WHEN 'samsung' THEN 'samsung' WHEN 'xiaomi' THEN 'xiaomi' ELSE 'apple' END
JOIN product_categories pc ON pc.slug = CASE d.category
  WHEN 'iphone' THEN 'smartphones'
  WHEN 'ipad' THEN 'tablets'
  WHEN 'macbook' THEN 'laptops'
  WHEN 'watch' THEN 'watches'
  WHEN 'airpods' THEN 'headphones'
  ELSE 'smartphones' END
LEFT JOIN device_models dm ON dm.slug = regexp_replace(lower(COALESCE(NULLIF(d.brand,''),'Apple') || '-' || d.model), '[^a-zа-я0-9]+', '-', 'g')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  content_status = EXCLUDED.content_status,
  title = EXCLUDED.title,
  price = EXCLUDED.price,
  price_text = EXCLUDED.price_text,
  stock_quantity = EXCLUDED.stock_quantity,
  stock_status = EXCLUDED.stock_status,
  warranty = EXCLUDED.warranty,
  warranty_text = EXCLUDED.warranty_text,
  listing_file = EXCLUDED.listing_file,
  listing_alt = EXCLUDED.listing_alt,
  updated_at = EXCLUDED.updated_at;

INSERT INTO device_details (
  product, storage, serial, year, model_identifier, region, sim, battery,
  battery_text, battery_cycles, diagnostic_date, activation_lock, mdm,
  diagnostic_by, grade
)
SELECT d.id, d.storage, d.serial, d.year, d.model_identifier, d.region, d.sim,
  d.battery, d.battery_text, d.battery_cycles, d.diagnostic_date,
  d.activation_lock, d.mdm, d.diagnostic_by, d.grade
FROM devices d
ON CONFLICT (product) DO UPDATE SET
  storage = EXCLUDED.storage,
  year = EXCLUDED.year,
  model_identifier = EXCLUDED.model_identifier,
  region = EXCLUDED.region,
  sim = EXCLUDED.sim,
  battery = EXCLUDED.battery,
  battery_text = EXCLUDED.battery_text,
  battery_cycles = EXCLUDED.battery_cycles,
  diagnostic_date = EXCLUDED.diagnostic_date,
  activation_lock = EXCLUDED.activation_lock,
  mdm = EXCLUDED.mdm,
  diagnostic_by = EXCLUDED.diagnostic_by,
  grade = EXCLUDED.grade;

INSERT INTO product_images (
  product, image, status, role, label, alt, sort, source_path, import_batch, created_at, updated_at
)
SELECT device, image, status, role, label, alt, sort, source_path, import_batch, created_at, updated_at
FROM device_images
WHERE image IS NOT NULL
ON CONFLICT (product, sort) DO UPDATE SET
  image = EXCLUDED.image, status = EXCLUDED.status, role = EXCLUDED.role,
  label = EXCLUDED.label, alt = EXCLUDED.alt, updated_at = EXCLUDED.updated_at;

UPDATE device_passports SET product = device WHERE product IS NULL AND device IS NOT NULL;
UPDATE trade_options SET product = device WHERE product IS NULL AND device IS NOT NULL;
UPDATE leads SET product = device_id, product_type = 'device'
WHERE product IS NULL AND device_id IS NOT NULL;
UPDATE leads
SET product = COALESCE(product, 'iphone-13-pro'),
    product_type = COALESCE(product_type, 'device'),
    device_id = COALESCE(device_id, 'iphone-13-pro'),
    manager_note = COALESCE(
      NULLIF(manager_note, ''),
      'QA catalog_v3: тестовая заявка, контакт .invalid, не связываться.'
    )
WHERE contact LIKE 'qa+catalog-v3%@isvoi.invalid';

-- Draft QA rows: editable and auditable, never public until real photos and facts replace them.
INSERT INTO device_models (slug, brand, name, family, year, sort)
SELECT 'samsung-galaxy-s24', id, 'Galaxy S24', 'Galaxy S', 2024, 20
FROM product_brands WHERE slug = 'samsung'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (
  id, sku, status, content_status, product_type, condition, sale_mode, brand,
  category, device_model, title, model, color, price, price_text,
  stock_quantity, stock_status, warranty, warranty_text, completeness,
  short_description, headline, sort, source_system, source_id, admin_note
)
SELECT 'qa-new-samsung-s24', 'QA-DEVICE-NEW-001', 'draft', 'needs_photo', 'device', 'new', 'reservation',
  b.id, c.id, m.id, 'Samsung Galaxy S24 256 ГБ', 'Galaxy S24', 'Чёрный', 69990, '69 990 ₽',
  1, 'available', '12 месяцев', 'Гарантия 12 месяцев', 'Смартфон, кабель, документы',
  'Тестовая карточка новой техники. Не публиковать.', 'Новая техника без Passport', 910,
  'catalog_v3_qa', 'qa-new-samsung-s24', 'QA: заменить всеми реальными данными и фото перед публикацией.'
FROM product_brands b, product_categories c, device_models m
WHERE b.slug='samsung' AND c.slug='smartphones' AND m.slug='samsung-galaxy-s24'
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (
  id, sku, status, content_status, product_type, condition, sale_mode, brand,
  category, device_model, title, model, color, price, price_text,
  stock_quantity, stock_status, warranty, warranty_text, completeness,
  short_description, headline, sort, source_system, source_id, admin_note
)
SELECT 'qa-used-samsung-s24', 'QA-DEVICE-USED-001', 'draft', 'review', 'device', 'used', 'reservation',
  b.id, c.id, m.id, 'Samsung Galaxy S24 256 ГБ · б/у', 'Galaxy S24', 'Серый', 49990, '49 990 ₽',
  1, 'available', '90 дней', 'Письменная гарантия 90 дней', 'Смартфон и кабель',
  'Тестовая карточка б/у техники другого бренда. Не публиковать.', 'Проверенная б/у техника', 920,
  'catalog_v3_qa', 'qa-used-samsung-s24', 'QA: тест адаптированной диагностики без Apple-специфичных обещаний.'
FROM product_brands b, product_categories c, device_models m
WHERE b.slug='samsung' AND c.slug='smartphones' AND m.slug='samsung-galaxy-s24'
ON CONFLICT (id) DO NOTHING;

INSERT INTO device_details (product, storage, year, model_identifier, region, sim, diagnostic_date, activation_lock, mdm, diagnostic_by, grade)
VALUES
  ('qa-new-samsung-s24','256 ГБ',2024,'SM-S921','EAC','nano-SIM + eSIM',NULL,NULL,NULL,NULL,NULL),
  ('qa-used-samsung-s24','256 ГБ',2024,'SM-S921','EAC','nano-SIM + eSIM',CURRENT_DATE,'Не применимо','Не обнаружен','QA диагност','B')
ON CONFLICT (product) DO NOTHING;

INSERT INTO device_passports (
  product, diagnostics_status, diagnostics_checklist, condition_grade_text,
  condition_note, warranty_duration, warranty_covered, warranty_not_covered
)
VALUES (
  'qa-used-samsung-s24', 'QA — тестовая диагностика',
  '[{"text":"Экран и сенсор","state":"ok"},{"text":"Камеры и связь","state":"ok"}]'::json,
  'Грейд B', 'Тестовое состояние. Не публиковать.', '90 дней',
  'Условия должны быть заменены подтверждёнными.', 'Механические повреждения.'
)
ON CONFLICT (product) DO NOTHING;

INSERT INTO products (
  id, sku, status, content_status, product_type, condition, sale_mode, brand,
  category, title, model, color, price, price_text, stock_quantity, stock_status,
  warranty, warranty_text, completeness, short_description, headline, sort,
  source_system, source_id, admin_note
)
SELECT 'qa-universal-usb-c-cable', 'QA-ACCESSORY-UNI-001', 'draft', 'needs_photo', 'accessory', 'new', 'reservation',
  b.id, c.id, 'Кабель USB-C — USB-C 1 м', 'USB-C 100 Вт', 'Белый', 1490, '1 490 ₽', 10, 'available',
  '12 месяцев', 'Гарантия 12 месяцев', 'Кабель',
  'Тестовый универсальный аксессуар. Не публиковать.', 'Универсальный кабель', 930,
  'catalog_v3_qa', 'qa-universal-usb-c-cable', 'QA: заменить реальным SKU, фото и условиями.'
FROM product_brands b, product_categories c WHERE b.slug='other' AND c.slug='cables'
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (
  id, sku, status, content_status, product_type, condition, sale_mode, brand,
  category, title, model, color, price, price_text, stock_quantity, stock_status,
  warranty, warranty_text, completeness, short_description, headline, sort,
  source_system, source_id, admin_note
)
SELECT 'qa-galaxy-s24-case', 'QA-ACCESSORY-MODEL-001', 'draft', 'needs_photo', 'accessory', 'new', 'reservation',
  b.id, c.id, 'Чехол для Samsung Galaxy S24', 'Galaxy S24 Case', 'Прозрачный', 1990, '1 990 ₽', 8, 'available',
  '6 месяцев', 'Гарантия 6 месяцев', 'Чехол',
  'Тестовый модельный аксессуар. Не публиковать.', 'Точная совместимость с Galaxy S24', 940,
  'catalog_v3_qa', 'qa-galaxy-s24-case', 'QA: связь совместимости используется вместо свободного текста.'
FROM product_brands b, product_categories c WHERE b.slug='samsung' AND c.slug='cases'
ON CONFLICT (id) DO NOTHING;

INSERT INTO accessory_details (product, compatibility_mode, material, connection_type, package_contents, specifications)
VALUES
  ('qa-universal-usb-c-cable','universal','TPE','USB-C','Кабель','{"Длина":"1 м","Мощность":"до 100 Вт"}'::json),
  ('qa-galaxy-s24-case','model_specific','TPU',NULL,'Чехол','{"Форм-фактор":"накладка"}'::json)
ON CONFLICT (product) DO NOTHING;

INSERT INTO product_compatible_models (product, device_models_id)
SELECT 'qa-galaxy-s24-case', id FROM device_models WHERE slug='samsung-galaxy-s24'
ON CONFLICT (product, device_models_id) DO NOTHING;

-- Directus collection metadata.
INSERT INTO directus_collections (
  collection, icon, note, display_template, archive_field, archive_value,
  unarchive_value, accountability, sort, color
)
VALUES
  ('product_brands','sell','Управляемый справочник брендов. Бренд выбирается в товаре, не вводится свободным текстом.','{{name}}','is_active','false','true','all',20,'#111827'),
  ('product_categories','category','Иерархические категории техники и аксессуаров.','{{name}} · {{catalog_section}}','is_active','false','true','all',21,'#334155'),
  ('device_models','devices_other','Точные модели производителей для совместимости аксессуаров.','{{brand.name}} {{name}}','is_active','false','true','all',22,'#2563eb'),
  ('products','inventory_2','Единый каталог техники и аксессуаров. Публикация блокируется, пока обязательные данные не заполнены.','{{title}} · {{sku}} · {{stock_status}}','status','archived','draft','all',23,'#0f172a'),
  ('product_images','photo_library','Общая галерея товаров. Используйте файлы Directus и обязательный alt.','{{product.title}} · {{role}}','status','archived','draft','all',24,'#0891b2'),
  ('device_details','memory','Характеристики техники. Диагностика обязательна только для опубликованной б/у техники.','{{product.title}}',NULL,NULL,NULL,'all',25,'#7c3aed'),
  ('accessory_details','cable','Характеристики аксессуаров. Фильтруемые параметры хранятся отдельными полями, JSON — только для показа.','{{product.title}}',NULL,NULL,NULL,'all',26,'#ea580c'),
  ('product_compatible_models','link','Связи модельных аксессуаров с точными моделями.','{{product.title}} · {{device_models_id.name}}',NULL,NULL,NULL,'all',27,'#16a34a')
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon, note=EXCLUDED.note, display_template=EXCLUDED.display_template,
  archive_field=EXCLUDED.archive_field, archive_value=EXCLUDED.archive_value,
  unarchive_value=EXCLUDED.unarchive_value, accountability=EXCLUDED.accountability,
  sort=EXCLUDED.sort, color=EXCLUDED.color;

CREATE OR REPLACE FUNCTION isvoi_catalog_field(
  p_collection varchar, p_field varchar, p_interface varchar, p_display varchar,
  p_options json, p_width varchar, p_sort integer, p_note text,
  p_special varchar DEFAULT NULL, p_group varchar DEFAULT NULL,
  p_required boolean DEFAULT false, p_readonly boolean DEFAULT false,
  p_hidden boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface, display=p_display, options=p_options,
      width=p_width, sort=p_sort, note=p_note, special=p_special, "group"=p_group,
      required=p_required, readonly=p_readonly, hidden=p_hidden
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(collection,field,interface,display,options,width,sort,note,special,"group",required,readonly,hidden)
    VALUES(p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,p_group,p_required,p_readonly,p_hidden);
  END IF;
END;
$$;

SELECT isvoi_catalog_field('products','group_identity','group-detail',NULL,'{"headerIcon":"inventory_2","start":"open"}','full',1,'Тип, состояние, SKU, бренд, категория и модель.','alias,no-data,group');
SELECT isvoi_catalog_field('products','group_sale','group-detail',NULL,'{"headerIcon":"payments","start":"open"}','full',30,'Цена, остаток и режим продажи.','alias,no-data,group');
SELECT isvoi_catalog_field('products','group_content','group-detail',NULL,'{"headerIcon":"description","start":"open"}','full',50,'Публичные тексты и гарантия.','alias,no-data,group');
SELECT isvoi_catalog_field('products','group_media','group-detail',NULL,'{"headerIcon":"photo_library","start":"open"}','full',70,'Главное изображение и галерея.','alias,no-data,group');
SELECT isvoi_catalog_field('products','group_details','group-detail',NULL,'{"headerIcon":"tune","start":"open"}','full',90,'Характеристики по типу товара и совместимость.','alias,no-data,group');
SELECT isvoi_catalog_field('products','group_system','group-detail',NULL,'{"headerIcon":"settings","start":"closed"}','full',120,'Импорт и служебные поля.','alias,no-data,group');

SELECT isvoi_catalog_field('products','id','input',NULL,NULL,'half',2,'Публичный slug: используется в /product/{slug}.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','sku','input',NULL,NULL,'half',3,'Уникальный складской SKU.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}','half',4,'Публичная видимость. Published проходит серверную проверку.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','content_status','select-dropdown','labels','{"choices":[{"text":"Нужны данные","value":"needs_content"},{"text":"Нужно фото","value":"needs_photo"},{"text":"На проверке","value":"review"},{"text":"Готово","value":"ready"}]}','half',5,'Редакционная готовность.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','product_type','select-dropdown','labels','{"choices":[{"text":"Техника","value":"device"},{"text":"Аксессуар","value":"accessory"}]}','half',6,'Корневой тип товара.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','condition','select-dropdown','labels','{"choices":[{"text":"Новое","value":"new"},{"text":"Б/у","value":"used"}]}','half',7,'Аксессуар может быть только новым.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','brand','select-dropdown-m2o','related-values','{"template":"{{name}}"}','half',8,'Бренд из справочника.','m2o','group_identity',true);
SELECT isvoi_catalog_field('products','category','select-dropdown-m2o','related-values','{"template":"{{name}} · {{catalog_section}}"}','half',9,'Категория должна соответствовать типу товара.','m2o','group_identity',true);
SELECT isvoi_catalog_field('products','device_model','select-dropdown-m2o','related-values','{"template":"{{brand.name}} {{name}}"}','full',10,'Точная модель техники для рекомендаций совместимых аксессуаров.','m2o','group_identity');
SELECT isvoi_catalog_field('products','title','input',NULL,NULL,'full',11,'Название карточки.',NULL,'group_identity',true);
SELECT isvoi_catalog_field('products','model','input',NULL,NULL,'half',12,'Короткое название модели.',NULL,'group_identity');
SELECT isvoi_catalog_field('products','color','input',NULL,NULL,'half',13,'Цвет.',NULL,'group_identity');

SELECT isvoi_catalog_field('products','price','input',NULL,'{"min":0,"step":1}','half',31,'Цена в рублях числом.',NULL,'group_sale',true);
SELECT isvoi_catalog_field('products','price_text','input',NULL,NULL,'half',32,'Форматированная цена; если пусто, сайт форматирует price.',NULL,'group_sale');
SELECT isvoi_catalog_field('products','stock_quantity','input',NULL,'{"min":0,"step":1}','half',33,'Текущий остаток.',NULL,'group_sale',true);
SELECT isvoi_catalog_field('products','stock_status','select-dropdown','labels','{"choices":[{"text":"В наличии","value":"available"},{"text":"Бронь","value":"reserved"},{"text":"Нет в наличии","value":"sold"},{"text":"Скрыто","value":"hidden"}]}','half',34,'Операционный статус наличия.',NULL,'group_sale',true);
SELECT isvoi_catalog_field('products','sale_mode','select-dropdown','labels','{"choices":[{"text":"Резерв","value":"reservation"},{"text":"Заявка","value":"inquiry"},{"text":"Онлайн — зарезервировано","value":"online"}]}','half',35,'online подготовлен для будущего checkout, но пока не включает оплату.',NULL,'group_sale',true);
SELECT isvoi_catalog_field('products','sort','input',NULL,'{"min":1,"step":1}','half',36,'Порядок в каталоге.',NULL,'group_sale');

SELECT isvoi_catalog_field('products','short_description','input-multiline',NULL,NULL,'full',51,'Краткое проверяемое описание.',NULL,'group_content');
SELECT isvoi_catalog_field('products','headline','input',NULL,NULL,'full',52,'Заголовок карточки.',NULL,'group_content');
SELECT isvoi_catalog_field('products','warranty','input',NULL,NULL,'half',53,'Срок или короткое условие гарантии.',NULL,'group_content',true);
SELECT isvoi_catalog_field('products','warranty_text','input',NULL,NULL,'half',54,'Публичная формулировка гарантии.',NULL,'group_content');
SELECT isvoi_catalog_field('products','completeness','input-multiline',NULL,NULL,'full',55,'Комплектность.',NULL,'group_content');
SELECT isvoi_catalog_field('products','listing_file','file-image','image',NULL,'half',71,'Главное фото из Directus Files.','m2o','group_media',true);
SELECT isvoi_catalog_field('products','listing_alt','input-multiline',NULL,NULL,'half',72,'Alt-текст главного фото.',NULL,'group_media');
SELECT isvoi_catalog_field('products','images','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["sort","status","role","image","label","alt"]}','full',73,'Галерея товара.','o2m','group_media');
SELECT isvoi_catalog_field('products','device_details','list-o2m',NULL,'{"layout":"table","enableCreate":true}','full',91,'Одна строка характеристик техники.','o2m','group_details');
SELECT isvoi_catalog_field('products','accessory_details','list-o2m',NULL,'{"layout":"table","enableCreate":true}','full',92,'Одна строка характеристик аксессуара.','o2m','group_details');
SELECT isvoi_catalog_field('products','compatible_models','list-o2m',NULL,'{"layout":"table","enableCreate":true,"fields":["device_models_id"]}','full',93,'Точные совместимые модели для модельного аксессуара.','o2m','group_details');
SELECT isvoi_catalog_field('products','passport','list-o2m',NULL,'{"layout":"table","enableCreate":true}','full',94,'Passport только для проверенной б/у техники.','o2m','group_details');
SELECT isvoi_catalog_field('products','trade_options_v3','list-o2m',NULL,'{"layout":"table","enableCreate":true}','full',95,'Варианты Trade, связанные с универсальным товаром.','o2m','group_details');
SELECT isvoi_catalog_field('products','leads','list-o2m',NULL,'{"layout":"table","enableCreate":false}','full',96,'Заявки по товару.','o2m','group_system',false,true);

SELECT isvoi_catalog_field('product_brands','slug','input',NULL,NULL,'half',1,'Устойчивый slug бренда.',NULL,NULL,true);
SELECT isvoi_catalog_field('product_brands','name','input',NULL,NULL,'half',2,'Публичное название бренда.',NULL,NULL,true);
SELECT isvoi_catalog_field('product_categories','slug','input',NULL,NULL,'half',1,'Устойчивый slug категории.',NULL,NULL,true);
SELECT isvoi_catalog_field('product_categories','name','input',NULL,NULL,'half',2,'Публичное название категории.',NULL,NULL,true);
SELECT isvoi_catalog_field('product_categories','catalog_section','select-dropdown','labels','{"choices":[{"text":"Техника","value":"device"},{"text":"Аксессуары","value":"accessory"}]}','half',3,'Первый уровень каталога.',NULL,NULL,true);
SELECT isvoi_catalog_field('device_models','brand','select-dropdown-m2o','related-values','{"template":"{{name}}"}','half',1,'Бренд модели.','m2o',NULL,true);
SELECT isvoi_catalog_field('device_models','slug','input',NULL,NULL,'half',2,'Устойчивый slug модели.',NULL,NULL,true);
SELECT isvoi_catalog_field('device_models','name','input',NULL,NULL,'half',3,'Точное название модели.',NULL,NULL,true);
SELECT isvoi_catalog_field('product_images','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','full',1,'Товар галереи.','m2o',NULL,true);
SELECT isvoi_catalog_field('product_images','image','file-image','image',NULL,'half',2,'Файл изображения.','m2o',NULL,true);
SELECT isvoi_catalog_field('product_images','alt','input-multiline',NULL,NULL,'half',3,'Обязательный alt перед публикацией.');
SELECT isvoi_catalog_field('device_details','product','select-dropdown-m2o','related-values','{"template":"{{title}}"}','full',1,'Товар типа «Техника».','m2o',NULL,true);
SELECT isvoi_catalog_field('accessory_details','product','select-dropdown-m2o','related-values','{"template":"{{title}}"}','full',1,'Товар типа «Аксессуар».','m2o',NULL,true);
SELECT isvoi_catalog_field('accessory_details','compatibility_mode','select-dropdown','labels','{"choices":[{"text":"Универсальный","value":"universal"},{"text":"По модели","value":"model_specific"}]}','half',2,'Модельный аксессуар требует хотя бы одну связь.',NULL,NULL,true);
SELECT isvoi_catalog_field('accessory_details','specifications','input-code',NULL,'{"language":"json"}','full',6,'Только отображаемые характеристики; фильтруемые параметры выносите в поля.','cast-json');
SELECT isvoi_catalog_field('product_compatible_models','product','select-dropdown-m2o','related-values','{"template":"{{title}}"}','half',1,'Модельный аксессуар.','m2o',NULL,true);
SELECT isvoi_catalog_field('product_compatible_models','device_models_id','select-dropdown-m2o','related-values','{"template":"{{brand.name}} {{name}}"}','half',2,'Точная совместимая модель.','m2o',NULL,true);
SELECT isvoi_catalog_field('device_passports','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','full',3,'Новая корневая связь с универсальным товаром.','m2o','group_identity');
SELECT isvoi_catalog_field('trade_options','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','full',3,'Новая корневая связь с универсальным товаром.','m2o','group_main');
SELECT isvoi_catalog_field('leads','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}','half',28,'Товар из универсального каталога.','m2o','group_contact');
SELECT isvoi_catalog_field('leads','product_type','select-dropdown','labels','{"choices":[{"text":"Техника","value":"device"},{"text":"Аксессуар","value":"accessory"}]}','half',29,'Тип товара на момент заявки.',NULL,'group_contact');

DROP FUNCTION isvoi_catalog_field(varchar,varchar,varchar,varchar,json,varchar,integer,text,varchar,varchar,boolean,boolean,boolean);

CREATE OR REPLACE FUNCTION isvoi_catalog_relation(
  p_many_collection varchar, p_many_field varchar, p_one_collection varchar,
  p_one_field varchar, p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many_collection AND many_field=p_many_field) THEN
    UPDATE directus_relations SET one_collection=p_one_collection, one_field=p_one_field, one_deselect_action=p_action
    WHERE many_collection=p_many_collection AND many_field=p_many_field;
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES(p_many_collection,p_many_field,p_one_collection,p_one_field,p_action);
  END IF;
END;
$$;

SELECT isvoi_catalog_relation('product_brands','logo_file','directus_files',NULL,'nullify');
SELECT isvoi_catalog_relation('product_categories','parent','product_categories','children','nullify');
SELECT isvoi_catalog_relation('device_models','brand','product_brands','models','nullify');
SELECT isvoi_catalog_relation('products','brand','product_brands','products','nullify');
SELECT isvoi_catalog_relation('products','category','product_categories','products','nullify');
SELECT isvoi_catalog_relation('products','device_model','device_models','products','nullify');
SELECT isvoi_catalog_relation('products','listing_file','directus_files',NULL,'nullify');
SELECT isvoi_catalog_relation('product_images','product','products','images','delete');
SELECT isvoi_catalog_relation('product_images','image','directus_files',NULL,'nullify');
SELECT isvoi_catalog_relation('device_details','product','products','device_details','delete');
SELECT isvoi_catalog_relation('accessory_details','product','products','accessory_details','delete');
SELECT isvoi_catalog_relation('product_compatible_models','product','products','compatible_models','delete');
SELECT isvoi_catalog_relation('product_compatible_models','device_models_id','device_models','compatible_products','delete');
SELECT isvoi_catalog_relation('device_passports','product','products','passport','nullify');
SELECT isvoi_catalog_relation('trade_options','product','products','trade_options_v3','nullify');
SELECT isvoi_catalog_relation('leads','product','products','leads','nullify');

DROP FUNCTION isvoi_catalog_relation(varchar,varchar,varchar,varchar,varchar);

CREATE OR REPLACE FUNCTION isvoi_catalog_permission(
  p_policy text, p_collection varchar, p_action varchar, p_fields text,
  p_permissions json DEFAULT NULL, p_validation json DEFAULT NULL, p_presets json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions SET fields=p_fields, permissions=p_permissions, validation=p_validation, presets=p_presets
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation,presets)
    VALUES(v_policy,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
  END IF;
END;
$$;

SELECT isvoi_catalog_permission('ISVOI Public Read','products','read',
  'id,sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,updated_at,images,device_details,accessory_details,compatible_models,passport,trade_options_v3',
  '{"_and":[{"status":{"_eq":"published"}},{"content_status":{"_eq":"ready"}},{"stock_status":{"_neq":"hidden"}}]}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','product_brands','read','id,slug,name,logo_file,is_active,sort','{"is_active":{"_eq":true}}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','product_categories','read','id,slug,name,catalog_section,parent,is_active,sort','{"is_active":{"_eq":true}}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','device_models','read','id,slug,brand,name,family,year,is_active,sort','{"is_active":{"_eq":true}}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','product_images','read','id,product,image,status,role,label,alt,sort,updated_at','{"_and":[{"status":{"_eq":"published"}},{"product":{"status":{"_eq":"published"}}}]}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','device_details','read','id,product,storage,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade,updated_at','{"product":{"status":{"_eq":"published"}}}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','accessory_details','read','id,product,compatibility_mode,material,connection_type,package_contents,specifications,updated_at','{"product":{"status":{"_eq":"published"}}}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','product_compatible_models','read','id,product,device_models_id','{"product":{"status":{"_eq":"published"}}}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','device_passports','read',
  'id,product,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,updated_at',
  '{"_or":[{"product":{"_and":[{"status":{"_eq":"published"}},{"product_type":{"_eq":"device"}},{"condition":{"_eq":"used"}}]}},{"device":{"_and":[{"status":{"_eq":"published"}},{"stock_status":{"_neq":"hidden"}}]}}]}'::json);
SELECT isvoi_catalog_permission('ISVOI Public Read','trade_options','read',
  'id,product,device,value,label,sort,is_active,updated_at',
  '{"_and":[{"is_active":{"_eq":true}},{"_or":[{"product":{"status":{"_eq":"published"}}},{"device":{"status":{"_eq":"published"}}}]}]}'::json);

DO $$
DECLARE p text; c text; a text; f text;
BEGIN
  FOREACH p IN ARRAY ARRAY['ISVOI Editor','ISVOI Importer','ISVOI Catalog Import'] LOOP
    FOREACH c IN ARRAY ARRAY['products','product_brands','product_categories','device_models','product_images','device_details','accessory_details','product_compatible_models'] LOOP
      f := CASE c
        WHEN 'products' THEN 'id,sku,status,content_status,product_type,condition,sale_mode,brand,category,device_model,title,model,color,price,price_text,stock_quantity,stock_status,warranty,warranty_text,completeness,short_description,headline,listing_file,listing_alt,sort,source_system,source_id,import_batch,imported_at,admin_note,created_at,updated_at,images,device_details,accessory_details,compatible_models,passport,trade_options_v3'
        WHEN 'product_brands' THEN 'id,slug,name,logo_file,is_active,sort,created_at,updated_at,models,products'
        WHEN 'product_categories' THEN 'id,slug,name,catalog_section,parent,is_active,sort,created_at,updated_at,children,products'
        WHEN 'device_models' THEN 'id,slug,brand,name,family,year,is_active,sort,created_at,updated_at,products,compatible_products'
        WHEN 'product_images' THEN 'id,product,image,status,role,label,alt,sort,source_path,import_batch,created_at,updated_at'
        WHEN 'device_details' THEN 'id,product,storage,serial,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade,created_at,updated_at'
        WHEN 'accessory_details' THEN 'id,product,compatibility_mode,material,connection_type,package_contents,specifications,created_at,updated_at'
        ELSE 'id,product,device_models_id' END;
      PERFORM isvoi_catalog_permission(p,c,'read',f,NULL);
      PERFORM isvoi_catalog_permission(p,c,'create',f,NULL);
      PERFORM isvoi_catalog_permission(p,c,'update',f,NULL);
      IF p <> 'ISVOI Editor' THEN PERFORM isvoi_catalog_permission(p,c,'delete','id',NULL); END IF;
    END LOOP;
  END LOOP;
END;
$$;

SELECT isvoi_catalog_permission('ISVOI Editor','device_passports','read','id,product,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,created_at,updated_at',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','device_passports','create','product,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','device_passports','update','product,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','trade_options','read','id,product,device,value,label,sort,is_active,created_at,updated_at',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','trade_options','create','product,device,value,label,sort,is_active',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','trade_options','update','product,device,value,label,sort,is_active',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','leads','read','id,created_at,updated_at,status,priority,assigned_to,contact_channel,next_action_at,last_contacted_at,manager_note,kind,scenario,name,contact,product,product_type,device,device_id,message,source,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,user_agent',NULL);
SELECT isvoi_catalog_permission('ISVOI Editor','leads','update','status,priority,assigned_to,contact_channel,next_action_at,last_contacted_at,manager_note,kind,scenario,name,contact,product,product_type,device,device_id,message,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term',NULL);

SELECT isvoi_catalog_permission('ISVOI Lead Intake','leads','create',
  'kind,status,priority,contact_channel,name,contact,product,product_type,device,device_id,scenario,message,source,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,user_agent',
  NULL,
  '{"_and":[{"contact":{"_nnull":true}},{"source_path":{"_nnull":true}}]}'::json,
  '{"status":"new","priority":"normal"}'::json);

DROP FUNCTION isvoi_catalog_permission(text,varchar,varchar,text,json,json,json);

CREATE OR REPLACE FUNCTION isvoi_catalog_preset(
  p_bookmark varchar, p_filter json, p_fields json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_role uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Editor' LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_presets WHERE role=v_role AND collection='products' AND bookmark=p_bookmark AND "user" IS NULL) THEN
    UPDATE directus_presets SET filter=p_filter, layout='tabular',
      layout_query=json_build_object('tabular',json_build_object('sort',json_build_array('sort','title'),'fields',p_fields,'page',1))::json
    WHERE role=v_role AND collection='products' AND bookmark=p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets(bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
    VALUES(p_bookmark,v_role,NULL,'products','tabular',
      json_build_object('tabular',json_build_object('sort',json_build_array('sort','title'),'fields',p_fields,'page',1))::json,
      p_filter,'inventory_2','#0f172a');
  END IF;
END;
$$;

SELECT isvoi_catalog_preset('Техника','{"product_type":{"_eq":"device"}}','["title","sku","condition","brand","price","stock_quantity","status","content_status"]');
SELECT isvoi_catalog_preset('Аксессуары','{"product_type":{"_eq":"accessory"}}','["title","sku","brand","category","price","stock_quantity","status","content_status"]');
SELECT isvoi_catalog_preset('Новые','{"condition":{"_eq":"new"}}','["title","sku","product_type","brand","price","stock_quantity","status"]');
SELECT isvoi_catalog_preset('Б/у','{"condition":{"_eq":"used"}}','["title","sku","brand","device_model","price","status","content_status"]');
SELECT isvoi_catalog_preset('Требует совместимости','{"_and":[{"product_type":{"_eq":"accessory"}},{"accessory_details":{"compatibility_mode":{"_eq":"model_specific"}}}]}','["title","sku","brand","category","status","content_status"]');
SELECT isvoi_catalog_preset('Не готово к публикации','{"content_status":{"_neq":"ready"}}','["title","sku","product_type","content_status","status","admin_note"]');

DROP FUNCTION isvoi_catalog_preset(varchar,json,json);

-- Global content and navigation switch performed with the catalog release.
UPDATE site_settings
SET header_cta_label = 'Смотреть каталог',
    header_cta_url = '/catalog',
    footer_note = 'I СВОИ — новая и проверенная б/у техника разных брендов, а также новые аксессуары с понятной совместимостью и гарантией.',
    footer_brand_text = 'Техника и аксессуары, о которых всё известно до покупки. Хорошие вещи проходят через своих. Северодвинск.';

UPDATE navigation_items
SET label='Смотреть каталог', custom_url='/catalog', url='/catalog', section_anchor=NULL
WHERE location='header' AND item_role='cta';

INSERT INTO navigation_items (
  label, label_short, url, custom_url, link_type, location, parent, sort, is_active, item_role
)
SELECT source.label, source.label, source.url, source.url, 'custom', 'header', parent.id, source.sort, true, 'link'
FROM (
  VALUES ('Техника','/catalog/tech',1), ('Аксессуары','/catalog/accessories',2)
) AS source(label,url,sort)
CROSS JOIN LATERAL (
  SELECT id FROM navigation_items
  WHERE location='header' AND parent IS NULL AND coalesce(custom_url,url)='/catalog'
  ORDER BY sort LIMIT 1
) parent
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items existing
  WHERE existing.location='header' AND existing.parent=parent.id
    AND coalesce(existing.custom_url,existing.url)=source.url
);

UPDATE site_pages
SET title='I СВОИ — техника и аксессуары с понятной историей',
    meta_description='Новая и проверенная б/у техника разных брендов, новые аксессуары, точная совместимость, реальные фото и гарантия.'
WHERE slug='home';

UPDATE site_pages
SET title='Каталог техники и аксессуаров — I СВОИ',
    meta_description='Новая и проверенная б/у техника разных брендов и новые аксессуары с точной совместимостью и гарантией.'
WHERE slug='catalog';

UPDATE site_pages
SET title='Магазин техники и аксессуаров в Северодвинске — I СВОИ',
    meta_description='Техника разных брендов и новые аксессуары в Северодвинске: осмотр, характеристики, совместимость, документы и гарантия.'
WHERE slug='store';

UPDATE site_pages
SET title='Passport — как мы проверяем б/у технику',
    meta_description='Методика диагностики, грейды и Passport для проверенной б/у техники I СВОИ.'
WHERE slug='passport';

UPDATE page_sections ps
SET headline='Техника и аксессуары, о которых всё известно до покупки.',
    primary_cta_label='Смотреть каталог',
    primary_cta_url='/catalog',
    body='Новая и проверенная б/у техника разных брендов, а также новые аксессуары. Показываем реальные фото, характеристики, совместимость, комплектность и гарантию; для б/у техники — диагностику и Passport.'
FROM site_pages sp
WHERE ps.page=sp.id AND sp.slug='home' AND ps.section_key='hero';

UPDATE page_sections ps
SET headline='Техника и аксессуары в наличии.',
    body='Новая и проверенная б/у техника разных производителей, а также новые аксессуары с понятной совместимостью.',
    primary_cta_label='Смотреть весь каталог',
    primary_cta_url='/catalog'
FROM site_pages sp
WHERE ps.page=sp.id AND sp.slug='home' AND ps.section_key='catalog_preview';

UPDATE page_sections ps
SET headline='Техника и аксессуары в наличии.',
    body='Используйте поиск, бренды, категории, состояние и совместимость. Цена и наличие управляются в Directus.',
    primary_cta_label='Открыть каталог',
    primary_cta_url='/catalog'
FROM site_pages sp
WHERE ps.page=sp.id AND sp.slug='catalog'
  AND (ps.section_key='catalog_page_live' OR ps.variant='catalog.grid');

UPDATE page_sections ps
SET headline='Посмотрите технику и аксессуары в магазине.',
    body='Сверьте характеристики и комплект, проверьте совместимость аксессуара. Для б/у техники покажем диагностику и Passport до решения.'
FROM site_pages sp
WHERE ps.page=sp.id AND sp.slug='store' AND ps.section_key IN ('store_hero','store_curated_catalog');

UPDATE page_sections ps
SET headline='Passport — доказательства для проверенной б/у техники.',
    body='Новая техника и аксессуары не требуют Passport: для них показываем точные характеристики, совместимость, комплектность и гарантию.'
FROM site_pages sp
WHERE ps.page=sp.id AND sp.slug='passport' AND ps.section_key='passport_hero';

-- Product integrity and publication gates are installed after the legacy copy.
-- Category/type conflicts are rejected as soon as a draft is saved; the
-- remaining completeness checks apply only when the product is published.
CREATE OR REPLACE FUNCTION isvoi_validate_product_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_mode varchar; v_category_section varchar;
BEGIN
  IF NEW.category IS NOT NULL AND NEW.product_type IS NOT NULL THEN
    SELECT catalog_section INTO v_category_section FROM product_categories WHERE id=NEW.category;
    IF v_category_section IS DISTINCT FROM NEW.product_type THEN
      RAISE EXCEPTION 'Категория не соответствует типу товара';
    END IF;
  END IF;

  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF NEW.content_status <> 'ready' OR NULLIF(NEW.sku,'') IS NULL OR NEW.brand IS NULL OR
     NEW.category IS NULL OR NEW.price <= 0 OR NULLIF(NEW.warranty,'') IS NULL OR
     NEW.listing_file IS NULL OR NULLIF(NEW.stock_status,'') IS NULL THEN
    RAISE EXCEPTION 'Товар не готов к публикации: нужны ready, SKU, бренд, категория, цена, гарантия, главное фото и наличие';
  END IF;
  IF NEW.product_type='device' AND (
    NEW.device_model IS NULL OR NOT EXISTS (SELECT 1 FROM device_details WHERE product=NEW.id)
  ) THEN
    RAISE EXCEPTION 'Для публикации техники нужны точная модель и структурированные характеристики';
  END IF;
  IF NEW.product_type='device' AND NEW.condition='used' AND NOT EXISTS (
    SELECT 1 FROM device_details dd JOIN device_passports dp ON dp.product=NEW.id
    WHERE dd.product=NEW.id AND dd.diagnostic_date IS NOT NULL AND NULLIF(dd.grade,'') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Для публикации б/у техники нужны Passport, дата диагностики и грейд';
  END IF;
  IF NEW.product_type='accessory' THEN
    SELECT compatibility_mode INTO v_mode FROM accessory_details WHERE product=NEW.id;
    IF v_mode IS NULL THEN RAISE EXCEPTION 'Для аксессуара нужны accessory_details'; END IF;
    IF v_mode='model_specific' AND NOT EXISTS (
      SELECT 1 FROM product_compatible_models WHERE product=NEW.id
    ) THEN
      RAISE EXCEPTION 'Для модельного аксессуара нужна хотя бы одна точная модель совместимости';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_publication_guard ON products;
CREATE TRIGGER products_publication_guard
BEFORE INSERT OR UPDATE OF status,content_status,sku,brand,category,price,warranty,listing_file,stock_status,product_type,condition
ON products FOR EACH ROW EXECUTE FUNCTION isvoi_validate_product_publication();

SELECT 'catalog_v3.products' AS check_name, count(*)::text AS value FROM products
UNION ALL SELECT 'catalog_v3.legacy_products', count(*)::text FROM products WHERE source_system <> 'catalog_v3_qa'
UNION ALL SELECT 'catalog_v3.qa_drafts', count(*)::text FROM products WHERE source_system='catalog_v3_qa' AND status='draft'
UNION ALL SELECT 'catalog_v3.collections', count(*)::text FROM directus_collections WHERE collection IN (
  'products','product_brands','product_categories','device_models','product_images','device_details','accessory_details','product_compatible_models'
)
UNION ALL SELECT 'catalog_v3.presets', count(*)::text FROM directus_presets WHERE collection='products' AND bookmark IN (
  'Техника','Аксессуары','Новые','Б/у','Требует совместимости','Не готово к публикации'
);

COMMIT;
`);
