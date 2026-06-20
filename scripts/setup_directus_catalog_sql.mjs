#!/usr/bin/env node

/**
 * Print idempotent SQL that prepares Directus for a larger product catalog.
 *
 * Usage:
 *   node scripts/setup_directus_catalog_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS stock_status varchar(32) NOT NULL DEFAULT 'available';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS content_status varchar(32) NOT NULL DEFAULT 'ready';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS source_system varchar(64) NOT NULL DEFAULT 'manual';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS source_id varchar(160);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS import_batch varchar(160);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS imported_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS admin_note text;

ALTER TABLE device_images ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS shot_status varchar(32) NOT NULL DEFAULT 'approved';
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS source_path text;
ALTER TABLE device_images ADD COLUMN IF NOT EXISTS import_batch varchar(160);

ALTER TABLE devices ALTER COLUMN stock_status SET DEFAULT 'available';

UPDATE devices SET stock_status = 'available' WHERE stock_status IS NULL OR stock_status = '' OR stock_status = 'in_stock';
UPDATE devices SET stock_status = 'hidden' WHERE stock_status = 'service';
UPDATE devices SET content_status = 'ready' WHERE content_status IS NULL OR content_status = '';
UPDATE devices SET source_system = 'manual' WHERE source_system IS NULL OR source_system = '';
UPDATE device_images SET shot_status = 'approved' WHERE shot_status IS NULL OR shot_status = '';

CREATE OR REPLACE FUNCTION isvoi_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS devices_touch_updated_at ON devices;
CREATE TRIGGER devices_touch_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION isvoi_touch_updated_at();

DROP TRIGGER IF EXISTS device_images_touch_updated_at ON device_images;
CREATE TRIGGER device_images_touch_updated_at
BEFORE UPDATE ON device_images
FOR EACH ROW
EXECUTE FUNCTION isvoi_touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_images_device_fkey'
  ) THEN
    ALTER TABLE device_images
    ADD CONSTRAINT device_images_device_fkey
    FOREIGN KEY (device) REFERENCES devices(id)
    ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_images_image_fkey'
  ) THEN
    ALTER TABLE device_images
    ADD CONSTRAINT device_images_image_fkey
    FOREIGN KEY (image) REFERENCES directus_files(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'devices_listing_file_fkey'
  ) THEN
    ALTER TABLE devices
    ADD CONSTRAINT devices_listing_file_fkey
    FOREIGN KEY (listing_file) REFERENCES directus_files(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS devices_public_catalog_idx ON devices (status, category, sort, id);
CREATE INDEX IF NOT EXISTS devices_public_stock_idx ON devices (status, stock_status, category, sort, id);
CREATE INDEX IF NOT EXISTS devices_stock_status_idx ON devices (stock_status);
CREATE INDEX IF NOT EXISTS devices_content_status_idx ON devices (content_status);
CREATE INDEX IF NOT EXISTS devices_price_idx ON devices (price);
CREATE INDEX IF NOT EXISTS devices_import_batch_idx ON devices (import_batch);
CREATE INDEX IF NOT EXISTS devices_source_idx ON devices (source_system, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS devices_source_unique_idx
  ON devices (source_system, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS device_images_device_status_sort_idx ON device_images (device, status, sort);
CREATE INDEX IF NOT EXISTS device_images_role_idx ON device_images (role);
CREATE INDEX IF NOT EXISTS device_images_shot_status_idx ON device_images (shot_status);
CREATE INDEX IF NOT EXISTS device_images_import_batch_idx ON device_images (import_batch);

INSERT INTO directus_collections (
  collection, icon, note, display_template, archive_field, archive_value,
  unarchive_value, accountability, sort, color
) VALUES (
  'devices',
  'devices',
  'Большой каталог устройств. Public сайт читает только status=published; редакторы сначала доводят content_status и фото до ready/approved.',
  '{{title}} · {{price_text}} · {{stock_status}}',
  'status',
  'archived',
  'draft',
  'all',
  10,
  '#0071e3'
) ON CONFLICT (collection) DO UPDATE SET
  icon = EXCLUDED.icon,
  note = EXCLUDED.note,
  display_template = EXCLUDED.display_template,
  archive_field = EXCLUDED.archive_field,
  archive_value = EXCLUDED.archive_value,
  unarchive_value = EXCLUDED.unarchive_value,
  accountability = EXCLUDED.accountability,
  sort = EXCLUDED.sort,
  color = EXCLUDED.color;

INSERT INTO directus_collections (
  collection, icon, note, display_template, archive_field, archive_value,
  unarchive_value, accountability, sort, color
) VALUES (
  'device_images',
  'photo_library',
  'Фотографии устройств. Для карточки используйте role=card, для галереи main/screen/body/defect/other. Публикуются только approved + published.',
  '{{device}} · {{role}} · {{label}}',
  'status',
  'archived',
  'draft',
  'all',
  11,
  '#10b981'
) ON CONFLICT (collection) DO UPDATE SET
  icon = EXCLUDED.icon,
  note = EXCLUDED.note,
  display_template = EXCLUDED.display_template,
  archive_field = EXCLUDED.archive_field,
  archive_value = EXCLUDED.archive_value,
  unarchive_value = EXCLUDED.unarchive_value,
  accountability = EXCLUDED.accountability,
  sort = EXCLUDED.sort,
  color = EXCLUDED.color;

CREATE OR REPLACE FUNCTION isvoi_upsert_directus_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_readonly boolean DEFAULT false,
  p_special varchar DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields WHERE collection = p_collection AND field = p_field
  ) THEN
    UPDATE directus_fields
    SET interface = p_interface,
        display = p_display,
        options = p_options,
        width = p_width,
        sort = p_sort,
        note = p_note,
        readonly = p_readonly,
        special = p_special
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, interface, display, options, width, sort, note, readonly, special
    ) VALUES (
      p_collection, p_field, p_interface, p_display, p_options, p_width, p_sort, p_note, p_readonly, p_special
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_directus_field('devices', 'id', 'input', NULL, NULL, 'half', 1, 'Публичный slug и primary key. Используется в URL /device/{id}.', false);
SELECT isvoi_upsert_directus_field('devices', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 2, 'Публичная видимость. Сайт показывает только published.');
SELECT isvoi_upsert_directus_field('devices', 'stock_status', 'select-dropdown', 'labels', '{"choices":[{"text":"В наличии","value":"available","color":"#10b981"},{"text":"Бронь","value":"reserved","color":"#f59e0b"},{"text":"Продано","value":"sold","color":"#6b7280"},{"text":"Скрыть","value":"hidden","color":"#111827"}]}'::json, 'half', 3, 'Операционный статус склада. Hidden полностью убирает карточку с публичной витрины.');
SELECT isvoi_upsert_directus_field('devices', 'content_status', 'select-dropdown', 'labels', '{"choices":[{"text":"Нужны данные","value":"needs_content","color":"#ef4444"},{"text":"Нужны фото","value":"needs_photo","color":"#f59e0b"},{"text":"На проверке","value":"review","color":"#3b82f6"},{"text":"Готово","value":"ready","color":"#10b981"}]}'::json, 'half', 4, 'Редакционный статус карточки перед публикацией.');
SELECT isvoi_upsert_directus_field('devices', 'sort', 'input', NULL, NULL, 'half', 5, 'Порядок в каталоге.');
SELECT isvoi_upsert_directus_field('devices', 'category', 'select-dropdown', 'labels', '{"choices":[{"text":"iPhone","value":"iphone"},{"text":"iPad","value":"ipad"},{"text":"MacBook","value":"macbook"},{"text":"Watch","value":"watch"},{"text":"AirPods","value":"airpods"},{"text":"Другое","value":"other"}]}'::json, 'half', 6, 'Категория для фильтров витрины.');
SELECT isvoi_upsert_directus_field('devices', 'title', 'input', NULL, NULL, 'half', 7, 'Название в карточке и в заявках.');
SELECT isvoi_upsert_directus_field('devices', 'model', 'input', NULL, NULL, 'half', 8, 'Модель/линейка.');
SELECT isvoi_upsert_directus_field('devices', 'price', 'input', 'formatted-value', NULL, 'half', 9, 'Цена числом в рублях. Нужна для сортировки и фильтров.');
SELECT isvoi_upsert_directus_field('devices', 'price_text', 'input', NULL, NULL, 'half', 10, 'Готовая строка цены для интерфейса, например 59 900 ₽.');
SELECT isvoi_upsert_directus_field('devices', 'listing_file', 'file-image', 'image', NULL, 'full', 11, 'Основное фото карточки из Directus Files. Используется раньше legacy listing_image.', false, 'm2o');
SELECT isvoi_upsert_directus_field('devices', 'listing_image', 'input', NULL, NULL, 'half', 12, 'Legacy fallback path. Для новых устройств оставляйте пустым и используйте listing_file/device_images.');
SELECT isvoi_upsert_directus_field('devices', 'listing_alt', 'input', NULL, NULL, 'half', 13, 'Alt-текст основного фото.');
SELECT isvoi_upsert_directus_field('devices', 'short_description', 'input-multiline', NULL, NULL, 'full', 14, 'Короткое описание для карточки каталога.');
SELECT isvoi_upsert_directus_field('devices', 'headline', 'input', NULL, NULL, 'full', 15, 'Заголовок товарной страницы.');
SELECT isvoi_upsert_directus_field('devices', 'admin_note', 'input-multiline', NULL, NULL, 'full', 16, 'Внутренняя заметка для редактора/менеджера. На сайт не выводится.');
SELECT isvoi_upsert_directus_field('devices', 'source_system', 'input', NULL, NULL, 'half', 90, 'Источник импорта: manual, xlsx, crm, supplier.');
SELECT isvoi_upsert_directus_field('devices', 'source_id', 'input', NULL, NULL, 'half', 91, 'Стабильный внешний ID из источника. Вместе с source_system защищает от дублей.');
SELECT isvoi_upsert_directus_field('devices', 'import_batch', 'input', NULL, NULL, 'half', 92, 'Метка партии импорта, например 2026-06-stock.');
SELECT isvoi_upsert_directus_field('devices', 'imported_at', 'datetime', 'datetime', NULL, 'half', 93, 'Когда строка была импортирована.');
SELECT isvoi_upsert_directus_field('devices', 'created_at', 'datetime', 'datetime', NULL, 'half', 94, 'Когда карточка создана.', true, 'date-created');
SELECT isvoi_upsert_directus_field('devices', 'updated_at', 'datetime', 'datetime', NULL, 'half', 95, 'Когда карточка обновлена.', true, 'date-updated');

SELECT isvoi_upsert_directus_field('device_images', 'id', 'input', NULL, NULL, 'half', 1, 'ID изображения.', true, 'uuid');
SELECT isvoi_upsert_directus_field('device_images', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 2, 'Публичная видимость строки изображения.');
SELECT isvoi_upsert_directus_field('device_images', 'shot_status', 'select-dropdown', 'labels', '{"choices":[{"text":"На проверке","value":"needs_review","color":"#f59e0b"},{"text":"Одобрено","value":"approved","color":"#10b981"},{"text":"Заменить","value":"rejected","color":"#ef4444"}]}'::json, 'half', 3, 'Качество кадра перед публикацией.');
SELECT isvoi_upsert_directus_field('device_images', 'device', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}}"}'::json, 'half', 4, 'Связанное устройство.', false, 'm2o');
SELECT isvoi_upsert_directus_field('device_images', 'role', 'select-dropdown', 'labels', '{"choices":[{"text":"Карточка","value":"card"},{"text":"Главный вид","value":"main"},{"text":"Экран","value":"screen"},{"text":"Корпус","value":"body"},{"text":"Дефект","value":"defect"},{"text":"Другое","value":"other"}]}'::json, 'half', 5, 'Роль фото. role=card используется для плитки каталога.');
SELECT isvoi_upsert_directus_field('device_images', 'sort', 'input', NULL, NULL, 'half', 6, 'Порядок в галерее.');
SELECT isvoi_upsert_directus_field('device_images', 'image', 'file-image', 'image', NULL, 'full', 7, 'Файл из Directus Files.', false, 'm2o');
SELECT isvoi_upsert_directus_field('device_images', 'label', 'input', NULL, NULL, 'half', 8, 'Подпись кадра.');
SELECT isvoi_upsert_directus_field('device_images', 'alt', 'input-multiline', NULL, NULL, 'full', 9, 'Alt-текст изображения.');
SELECT isvoi_upsert_directus_field('device_images', 'source_path', 'input', NULL, NULL, 'full', 90, 'Исходный путь/имя файла при импорте.');
SELECT isvoi_upsert_directus_field('device_images', 'import_batch', 'input', NULL, NULL, 'half', 91, 'Метка партии импорта.');
SELECT isvoi_upsert_directus_field('device_images', 'created_at', 'datetime', 'datetime', NULL, 'half', 92, 'Когда строка создана.', true, 'date-created');
SELECT isvoi_upsert_directus_field('device_images', 'updated_at', 'datetime', 'datetime', NULL, 'half', 93, 'Когда строка обновлена.', true, 'date-updated');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar);

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'devices', 'listing_file', 'directus_files', NULL, 'nullify'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'devices' AND many_field = 'listing_file'
);

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'device_images', 'device', 'devices', NULL, 'delete'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'device_images' AND many_field = 'device'
);

INSERT INTO directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
SELECT 'device_images', 'image', 'directus_files', NULL, 'nullify'
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations
  WHERE many_collection = 'device_images' AND many_field = 'image'
);

COMMIT;

SELECT 'devices_columns' AS check_name, count(*)::text AS value
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'devices'
UNION ALL
SELECT 'device_images_columns' AS check_name, count(*)::text AS value
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'device_images';
`);
