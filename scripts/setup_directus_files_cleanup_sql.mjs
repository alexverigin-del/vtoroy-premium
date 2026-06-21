#!/usr/bin/env node
/**
 * Print idempotent SQL that cleans up Directus Files organization.
 *
 * Safe cleanup only:
 * - creates an internal review folder;
 * - keeps files referenced by site/catalog records in production folders;
 * - moves unreferenced ISVOI site assets to the review folder;
 * - adds editor bookmarks for common Files views.
 *
 * It does not delete physical files.
 *
 * Usage:
 *   node scripts/setup_directus_files_cleanup_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
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
  v_fields json := '["filename_download","title","folder","type","filesize","width","height","uploaded_on"]'::json;
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
      layout_options = '{"tabular":{"spacing":"comfortable","widths":{"filename_download":240,"title":260,"folder":190,"type":140,"filesize":110,"width":90,"height":90,"uploaded_on":180}}}'::json,
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
      '{"tabular":{"spacing":"comfortable","widths":{"filename_download":240,"title":260,"folder":190,"type":140,"filesize":110,"width":90,"height":90,"uploaded_on":180}}}'::json,
      NULL,
      p_filter,
      p_icon,
      p_color
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

DROP FUNCTION isvoi_upsert_files_preset(text, varchar, varchar, varchar, json, json);
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
  AND role IN (SELECT id FROM directus_roles WHERE name = 'ISVOI Editor');

COMMIT;
`);
