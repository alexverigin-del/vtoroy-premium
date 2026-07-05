#!/usr/bin/env node
/**
 * Print idempotent SQL that updates public-facing brand copy in Directus.
 *
 * This intentionally targets content tables only. Technical identifiers such as
 * Directus roles, policies, folders, package names and operator runbooks keep
 * the stable ISVOI project name.
 *
 * Usage:
 *   node scripts/update_directus_public_brand_copy_sql.mjs > /tmp/isvoi_public_brand_copy.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_public_brand_copy.sql
 */

const publicTables = [
  "site_settings",
  "navigation_items",
  "site_pages",
  "page_sections",
  "faq_items",
  "devices",
  "device_passports",
];

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `ARRAY[${values.map(sqlString).join(", ")}]`;
}

process.stdout.write(String.raw`
BEGIN;

UPDATE site_settings
SET brand_name = 'I СВОИ'
WHERE brand_name IS DISTINCT FROM 'I СВОИ';

DO $$
DECLARE
  v_table_name text;
  v_column_name text;
  v_data_type text;
BEGIN
  FOR v_table_name, v_column_name IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${sqlArray(publicTables)})
      AND data_type IN ('character varying', 'text')
      AND column_name NOT IN ('id', 'slug', 'status', 'template', 'type', 'key')
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
      v_table_name,
      v_column_name,
      v_column_name,
      'ISVOI',
      'I СВОИ',
      v_column_name,
      '%ISVOI%'
    );
  END LOOP;

  FOR v_table_name, v_column_name, v_data_type IN
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${sqlArray(publicTables)})
      AND data_type IN ('json', 'jsonb')
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = replace(%I::text, %L, %L)::%s WHERE %I::text LIKE %L',
      v_table_name,
      v_column_name,
      v_column_name,
      'ISVOI',
      'I СВОИ',
      v_data_type,
      v_column_name,
      '%ISVOI%'
    );
  END LOOP;
END;
$$;

SELECT 'site_settings.brand_name' AS check_name, brand_name AS value
FROM site_settings
ORDER BY id
LIMIT 1;

CREATE TEMP TABLE isvoi_public_brand_leftovers (
  source text,
  matches integer
) ON COMMIT DROP;

DO $$
DECLARE
  v_table_name text;
  v_column_name text;
  v_data_type text;
BEGIN
  FOR v_table_name, v_column_name IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${sqlArray(publicTables)})
      AND data_type IN ('character varying', 'text')
      AND column_name NOT IN ('id', 'slug', 'status', 'template', 'type', 'key')
  LOOP
    EXECUTE format(
      'INSERT INTO isvoi_public_brand_leftovers (source, matches) SELECT %L, count(*)::integer FROM %I WHERE %I LIKE %L',
      v_table_name || '.' || v_column_name,
      v_table_name,
      v_column_name,
      '%ISVOI%'
    );
  END LOOP;

  FOR v_table_name, v_column_name, v_data_type IN
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${sqlArray(publicTables)})
      AND data_type IN ('json', 'jsonb')
  LOOP
    EXECUTE format(
      'INSERT INTO isvoi_public_brand_leftovers (source, matches) SELECT %L, count(*)::integer FROM %I WHERE %I::text LIKE %L',
      v_table_name || '.' || v_column_name,
      v_table_name,
      v_column_name,
      '%ISVOI%'
    );
  END LOOP;
END;
$$;

SELECT source, matches
FROM isvoi_public_brand_leftovers
WHERE matches > 0
ORDER BY source;

COMMIT;
`);
