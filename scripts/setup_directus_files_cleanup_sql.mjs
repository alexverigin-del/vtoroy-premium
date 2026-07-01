#!/usr/bin/env node
/**
 * Print idempotent SQL that cleans up Directus Files organization.
 *
 * Safe cleanup only:
 * - creates an internal review folder;
 * - keeps files referenced by site/catalog records in production folders;
 * - moves unreferenced ISVOI site assets to the review folder;
 * - adds editor bookmarks and Studio notes for common Files views.
 *
 * It does not delete physical files.
 *
 * Usage:
 *   node scripts/setup_directus_files_cleanup_sql.mjs > /tmp/isvoi_setup_directus_files_cleanup_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_files_cleanup_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION isvoi_file_folder_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM directus_folders
  WHERE name = p_name AND parent IS NULL
  ORDER BY name
  LIMIT 1;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_folders (id, name, parent)
    VALUES (v_id, p_name, NULL);
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_upsert_files_preset(
  p_role_name text,
  p_bookmark varchar,
  p_icon varchar,
  p_color varchar,
  p_filter json,
  p_sort json DEFAULT '["-uploaded_on"]'::json
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_role uuid;
  v_fields json := '["filename_download","title","folder","description","tags","type","filesize","width","height","uploaded_on"]'::json;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name = p_role_name LIMIT 1;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_presets
    WHERE role = v_role
      AND collection = 'directus_files'
      AND bookmark = p_bookmark
      AND "user" IS NULL
  ) THEN
    UPDATE directus_presets
    SET icon = p_icon,
      color = p_color,
      filter = p_filter,
      layout = 'tabular',
      layout_query = json_build_object('tabular', json_build_object('fields', v_fields, 'sort', p_sort, 'page', 1))::json,
      layout_options = '{"tabular":{"spacing":"comfortable","widths":{"filename_download":240,"title":260,"folder":190,"description":320,"tags":180,"type":140,"filesize":110,"width":90,"height":90,"uploaded_on":180}}}'::json,
      refresh_interval = NULL,
      search = NULL
    WHERE role = v_role
      AND collection = 'directus_files'
      AND bookmark = p_bookmark
      AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets (
      bookmark, role, "user", collection, search, layout, layout_query,
      layout_options, refresh_interval, filter, icon, color
    ) VALUES (
      p_bookmark,
      v_role,
      NULL,
      'directus_files',
      NULL,
      'tabular',
      json_build_object('tabular', json_build_object('fields', v_fields, 'sort', p_sort, 'page', 1))::json,
      '{"tabular":{"spacing":"comfortable","widths":{"filename_download":240,"title":260,"folder":190,"description":320,"tags":180,"type":140,"filesize":110,"width":90,"height":90,"uploaded_on":180}}}'::json,
      NULL,
      p_filter,
      p_icon,
      p_color
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_set_file_field_note(
  p_field varchar,
  p_note text,
  p_translation text,
  p_sort integer,
  p_width varchar DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_translations json := json_build_array(json_build_object('language', 'ru-RU', 'translation', p_translation))::json;
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields
    WHERE collection = 'directus_files' AND field = p_field
  ) THEN
    UPDATE directus_fields
    SET note = p_note,
      translations = v_translations,
      sort = p_sort,
      width = COALESCE(p_width, width)
    WHERE collection = 'directus_files' AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, note, translations, sort, width
    ) VALUES (
      'directus_files', p_field, p_note, v_translations, p_sort, p_width
    );
  END IF;
END;
$$;

DO $$
DECLARE
  v_device_folder uuid;
  v_site_folder uuid;
  v_editorial_folder uuid;
  v_review_folder uuid;
BEGIN
  v_device_folder := isvoi_file_folder_id('ISVOI Device Photos');
  v_site_folder := isvoi_file_folder_id('ISVOI Site Assets');
  v_editorial_folder := isvoi_file_folder_id('ISVOI Editorial');
  v_review_folder := isvoi_file_folder_id('ISVOI File Review');

  UPDATE directus_collections
  SET note = 'Памятка ISVOI Files: товарные фото хранятся в ISVOI Device Photos, но появляются на сайте только после связи через device_images.image или fallback devices.listing_file. Не вставляйте товарные фото в JSON-поля, listing_image или внешними URL. Изображения страниц — в ISVOI Site Assets; редакционные материалы — в ISVOI Editorial; спорные и неиспользуемые файлы — в ISVOI File Review. Не удаляйте файл, пока не проверили его связи с каталогом или страницами.',
    display_template = '{{title}} · {{filename_download}}',
    icon = 'perm_media'
  WHERE collection = 'directus_files';

  -- Canonical folders for files currently used by the live site/catalog.
  UPDATE directus_files
  SET folder = v_device_folder,
    tags = 'isvoi,device,used',
    description = coalesce(nullif(description, ''), 'ISVOI product photo used by catalog/device pages.')
  WHERE id IN (
    SELECT listing_file::uuid FROM devices WHERE listing_file IS NOT NULL
    UNION
    SELECT image::uuid FROM device_images WHERE image IS NOT NULL
  );

  UPDATE directus_files
  SET folder = v_site_folder,
    tags = 'isvoi,site,used',
    description = coalesce(nullif(description, ''), 'ISVOI site asset used by editable site content.')
  WHERE id IN (
    SELECT image::uuid FROM page_sections WHERE image IS NOT NULL
    UNION
    SELECT og_image::uuid FROM site_pages WHERE og_image IS NOT NULL
    UNION
    SELECT default_og_image::uuid FROM site_settings WHERE default_og_image IS NOT NULL
  );

  UPDATE directus_files
  SET folder = v_editorial_folder
  WHERE title LIKE 'isvoi:editorial:%';

  -- Move unreferenced site uploads out of the public site-assets folder.
  UPDATE directus_files f
  SET folder = v_review_folder,
    tags = 'isvoi,review,unused',
    description = concat_ws(
      E'\n',
      nullif(f.description, ''),
      'Moved to ISVOI File Review: not referenced by devices, device_images, page_sections, site_pages or site_settings.'
    )
  WHERE (f.folder = v_site_folder OR f.folder IS NULL)
    AND (f.title LIKE 'isvoi:site:%' OR f.title IS NULL OR f.title = '')
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT listing_file::uuid AS id FROM devices WHERE listing_file IS NOT NULL
        UNION
        SELECT image::uuid FROM device_images WHERE image IS NOT NULL
        UNION
        SELECT image::uuid FROM page_sections WHERE image IS NOT NULL
        UNION
        SELECT og_image::uuid FROM site_pages WHERE og_image IS NOT NULL
        UNION
        SELECT default_og_image::uuid FROM site_settings WHERE default_og_image IS NOT NULL
      ) used
      WHERE used.id = f.id
    );

  PERFORM isvoi_upsert_files_preset(
    'ISVOI Editor',
    'Files: Product Photos',
    'photo_camera',
    '#2563eb',
    json_build_object('folder', json_build_object('_eq', v_device_folder::text))::json
  );
  PERFORM isvoi_upsert_files_preset(
    'ISVOI Editor',
    'Files: Site Assets',
    'web_asset',
    '#0f766e',
    json_build_object('folder', json_build_object('_eq', v_site_folder::text))::json
  );
  PERFORM isvoi_upsert_files_preset(
    'ISVOI Editor',
    'Files: Editorial',
    'image',
    '#7c3aed',
    json_build_object('folder', json_build_object('_eq', v_editorial_folder::text))::json
  );
  PERFORM isvoi_upsert_files_preset(
    'ISVOI Editor',
    'Files: Review Unused',
    'inventory_2',
    '#f59e0b',
    json_build_object('folder', json_build_object('_eq', v_review_folder::text))::json
  );
  PERFORM isvoi_upsert_files_preset(
    'ISVOI Editor',
    'Files: Unsorted',
    'folder_off',
    '#ef4444',
    '{"folder":{"_null":true}}'::json
  );
END $$;

SELECT isvoi_set_file_field_note(
  'folder',
  'Выберите рабочую папку. ISVOI Device Photos — товарные фото, которые затем обязательно связываются через device_images.image или devices.listing_file; ISVOI Site Assets — изображения страниц и секций; ISVOI Editorial — редакционные материалы; ISVOI File Review — спорные или неиспользуемые файлы. Не оставляйте новые файлы без папки.',
  'Папка ISVOI',
  10,
  'half'
);
SELECT isvoi_set_file_field_note(
  'title',
  'Рабочее название/ключ. Для импорта товаров используйте устойчивый формат вроде isvoi:{device_id}:{role}:xlsx; для изображений сайта — isvoi:site:{section}; для редакционных — isvoi:editorial:{topic}. Это помогает не плодить дубли.',
  'Рабочее название',
  20,
  'half'
);
SELECT isvoi_set_file_field_note(
  'description',
  'Коротко опишите, что на изображении и где оно используется. Для товарных фото укажите устройство и роль кадра: card/main/screen/body/defect/other. Для Review-файлов добавьте причину: не привязан, дубль, плохое качество, требует проверки.',
  'Описание и использование',
  30,
  'full'
);
SELECT isvoi_set_file_field_note(
  'tags',
  'Служебные метки через запятую. Примеры: isvoi,device,used; isvoi,site,used; isvoi,editorial; isvoi,review,unused. Теги помогают быстро фильтровать и чистить медиатеку.',
  'Теги для фильтрации',
  40,
  'half'
);
SELECT isvoi_set_file_field_note(
  'filename_download',
  'Исходное имя файла. Его можно узнавать при скачивании, но не используйте его как главный ключ связки: для связок важнее title, folder и relations.',
  'Имя файла',
  50,
  'half'
);
SELECT isvoi_set_file_field_note(
  'type',
  'Тип файла. Для изображений сайта и каталога используйте image/*; документы импорта держите в отдельных import batch-полях, не смешивайте с публичными медиа.',
  'Тип',
  60,
  'half'
);
SELECT isvoi_set_file_field_note(
  'filesize',
  'Размер файла. Если изображение слишком тяжелое, оптимизируйте исходник перед загрузкой; сайт всё равно отдаёт resized/WebP/AVIF через Directus assets.',
  'Размер',
  70,
  'half'
);
SELECT isvoi_set_file_field_note(
  'width',
  'Ширина исходника. Для товарных и hero-изображений лучше загружать качественный исходник, а не уже пережатую миниатюру.',
  'Ширина',
  80,
  'half'
);
SELECT isvoi_set_file_field_note(
  'height',
  'Высота исходника. Проверяйте, что важные детали не будут обрезаны в карточках и галереях.',
  'Высота',
  90,
  'half'
);
SELECT isvoi_set_file_field_note(
  'focal_point_x',
  'Фокусная точка помогает Directus корректнее кадрировать изображение при cover-resize. Ставьте её на устройство, лицо или важную деталь.',
  'Фокус X',
  100,
  'half'
);
SELECT isvoi_set_file_field_note(
  'focal_point_y',
  'Фокусная точка помогает Directus корректнее кадрировать изображение при cover-resize. Ставьте её на устройство, лицо или важную деталь.',
  'Фокус Y',
  110,
  'half'
);

DROP FUNCTION isvoi_upsert_files_preset(text, varchar, varchar, varchar, json, json);
DROP FUNCTION isvoi_set_file_field_note(varchar, text, text, integer, varchar);
DROP FUNCTION isvoi_file_folder_id(text);

SELECT 'files.folders' AS check_name, count(*)::text AS value
FROM directus_folders
WHERE name IN ('ISVOI Device Photos', 'ISVOI Site Assets', 'ISVOI Editorial', 'ISVOI File Review')
UNION ALL
SELECT 'files.unsorted', count(*)::text
FROM directus_files
WHERE folder IS NULL
UNION ALL
SELECT 'files.review_unused', count(*)::text
FROM directus_files f
JOIN directus_folders d ON d.id = f.folder
WHERE d.name = 'ISVOI File Review'
UNION ALL
SELECT 'files.editor_bookmarks', count(*)::text
FROM directus_presets
WHERE collection = 'directus_files'
  AND bookmark IN (
    'Files: Product Photos',
    'Files: Site Assets',
    'Files: Editorial',
    'Files: Review Unused',
    'Files: Unsorted'
  )
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor')
UNION ALL
SELECT 'files.studio_notes', count(*)::text
FROM directus_fields
WHERE collection = 'directus_files'
  AND field IN (
    'folder',
    'title',
    'description',
    'tags',
    'filename_download',
    'type',
    'filesize',
    'width',
    'height',
    'focal_point_x',
    'focal_point_y'
  )
  AND note IS NOT NULL;

COMMIT;
`);
