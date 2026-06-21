#!/usr/bin/env node
/**
 * Print idempotent SQL that organizes Directus Files into operational folders.
 *
 * Usage:
 *   node scripts/setup_directus_file_folders_sql.mjs > /tmp/isvoi_setup_directus_file_folders_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_file_folders_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION isvoi_file_folder_id(p_name text, p_previous_name text DEFAULT NULL)
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

  IF v_id IS NULL AND p_previous_name IS NOT NULL THEN
    SELECT id INTO v_id
    FROM directus_folders
    WHERE name = p_previous_name AND parent IS NULL
    ORDER BY name
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      UPDATE directus_folders
      SET name = p_name
      WHERE id = v_id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_folders (id, name, parent)
    VALUES (v_id, p_name, NULL);
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_upsert_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar,
  p_fields text,
  p_permissions json DEFAULT NULL,
  p_validation json DEFAULT NULL,
  p_presets json DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy = v_policy AND collection = p_collection AND action = p_action
  ) THEN
    UPDATE directus_permissions
    SET fields = p_fields,
      permissions = p_permissions,
      validation = p_validation,
      presets = p_presets
    WHERE policy = v_policy AND collection = p_collection AND action = p_action;
  ELSE
    INSERT INTO directus_permissions (
      policy, collection, action, fields, permissions, validation, presets
    ) VALUES (
      v_policy, p_collection, p_action, p_fields, p_permissions, p_validation, p_presets
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
  v_site_folder := isvoi_file_folder_id('ISVOI Site Assets', 'ISVOI Site Images');
  v_editorial_folder := isvoi_file_folder_id('ISVOI Editorial');
  v_review_folder := isvoi_file_folder_id('ISVOI File Review');

  UPDATE directus_files
  SET folder = v_device_folder
  WHERE title LIKE 'isvoi:%'
    AND title NOT LIKE 'isvoi:site:%'
    AND title NOT LIKE 'isvoi:editorial:%';

  UPDATE directus_files
  SET folder = v_site_folder
  WHERE title LIKE 'isvoi:site:%'
    AND (folder IS NULL OR folder <> v_review_folder);

  UPDATE directus_files
  SET folder = v_editorial_folder
  WHERE title LIKE 'isvoi:editorial:%';
END $$;

SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'directus_folders', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Catalog Import',
  'directus_folders',
  'create',
  'id,name,parent',
  NULL,
  '{"name":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Catalog Import', 'directus_folders', 'update', 'name,parent', NULL);

SELECT isvoi_upsert_permission('ISVOI Importer', 'directus_folders', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'directus_folders',
  'create',
  'id,name,parent',
  NULL,
  '{"name":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Importer', 'directus_folders', 'update', 'name,parent', NULL);

SELECT isvoi_upsert_permission('ISVOI Editor', 'directus_folders', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'directus_folders',
  'create',
  'id,name,parent',
  NULL,
  '{"name":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Editor', 'directus_folders', 'update', 'name,parent', NULL);

DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_file_folder_id(text, text);

COMMIT;

SELECT 'file_folders' AS check_name, count(*)::text AS value
FROM directus_folders
WHERE name IN ('ISVOI Device Photos', 'ISVOI Site Assets', 'ISVOI Editorial', 'ISVOI File Review')
UNION ALL
SELECT 'device_files_in_folder', count(*)::text
FROM directus_files f
JOIN directus_folders d ON d.id = f.folder
WHERE d.name = 'ISVOI Device Photos'
  AND f.title LIKE 'isvoi:%'
  AND f.title NOT LIKE 'isvoi:site:%'
  AND f.title NOT LIKE 'isvoi:editorial:%'
UNION ALL
SELECT 'site_files_in_folder', count(*)::text
FROM directus_files f
JOIN directus_folders d ON d.id = f.folder
WHERE d.name = 'ISVOI Site Assets'
  AND f.title LIKE 'isvoi:site:%'
UNION ALL
SELECT 'editorial_folder_ready', count(*)::text
FROM directus_folders
WHERE name = 'ISVOI Editorial'
UNION ALL
SELECT 'folder_permissions', count(*)::text
FROM directus_permissions
WHERE collection = 'directus_folders'
  AND policy IN (
    SELECT id FROM directus_policies
    WHERE name IN ('ISVOI Catalog Import', 'ISVOI Importer', 'ISVOI Editor')
  );
`);
