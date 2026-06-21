#!/usr/bin/env node
/**
 * Print SQL that audits the production Directus schema contract.
 *
 * Usage:
 *   node scripts/audit_directus_schema_sql.mjs > /tmp/isvoi_schema_audit.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_schema_audit.sql
 */

process.stdout.write(String.raw`
WITH expected_tables(table_name) AS (
  VALUES
    ('devices'),
    ('device_images'),
    ('device_passports'),
    ('trade_options'),
    ('site_pages'),
    ('page_sections'),
    ('site_settings'),
    ('navigation_items'),
    ('faq_items'),
    ('leads'),
    ('lead_comments'),
    ('catalog_import_batches')
),
expected_fields(table_name, field_name) AS (
  VALUES
    ('devices', 'id'),
    ('devices', 'status'),
    ('devices', 'stock_status'),
    ('devices', 'content_status'),
    ('devices', 'title'),
    ('devices', 'price'),
    ('devices', 'price_text'),
    ('devices', 'listing_file'),
    ('devices', 'passport_record'),
    ('devices', 'trade_options'),
    ('device_images', 'device'),
    ('device_images', 'image'),
    ('device_images', 'role'),
    ('device_images', 'shot_status'),
    ('device_passports', 'device'),
    ('device_passports', 'defect_photo'),
    ('device_passports', 'summary_rows'),
    ('device_passports', 'diagnostics_checklist'),
    ('trade_options', 'device'),
    ('trade_options', 'label'),
    ('trade_options', 'value'),
    ('trade_options', 'is_active'),
    ('site_pages', 'slug'),
    ('site_pages', 'status'),
    ('site_pages', 'sections'),
    ('site_pages', 'og_image'),
    ('page_sections', 'page'),
    ('page_sections', 'section_key'),
    ('page_sections', 'variant'),
    ('page_sections', 'image'),
    ('page_sections', 'content'),
    ('site_settings', 'brand_name'),
    ('site_settings', 'default_og_image'),
    ('navigation_items', 'url'),
    ('navigation_items', 'location'),
    ('navigation_items', 'is_active'),
    ('faq_items', 'key'),
    ('faq_items', 'question'),
    ('faq_items', 'answer'),
    ('faq_items', 'page'),
    ('leads', 'status'),
    ('leads', 'contact'),
    ('leads', 'device_id'),
    ('leads', 'source_url'),
    ('lead_comments', 'lead'),
    ('lead_comments', 'comment'),
    ('catalog_import_batches', 'workbook'),
    ('catalog_import_batches', 'photos_archive'),
    ('catalog_import_batches', 'last_run_status')
),
expected_relations(many_collection, many_field, one_collection) AS (
  VALUES
    ('devices', 'listing_file', 'directus_files'),
    ('device_images', 'device', 'devices'),
    ('device_images', 'image', 'directus_files'),
    ('device_passports', 'device', 'devices'),
    ('device_passports', 'defect_photo', 'directus_files'),
    ('trade_options', 'device', 'devices'),
    ('site_pages', 'og_image', 'directus_files'),
    ('page_sections', 'page', 'site_pages'),
    ('page_sections', 'image', 'directus_files'),
    ('site_settings', 'default_og_image', 'directus_files'),
    ('faq_items', 'page', 'site_pages'),
    ('leads', 'assigned_to', 'directus_users'),
    ('leads', 'device_id', 'devices'),
    ('lead_comments', 'lead', 'leads'),
    ('lead_comments', 'created_by', 'directus_users'),
    ('catalog_import_batches', 'workbook', 'directus_files'),
    ('catalog_import_batches', 'photos_archive', 'directus_files')
),
system_collections(collection) AS (
  VALUES
    ('directus_access'),
    ('directus_activity'),
    ('directus_dashboards'),
    ('directus_extensions'),
    ('directus_flows'),
    ('directus_migrations'),
    ('directus_notifications'),
    ('directus_operations'),
    ('directus_panels'),
    ('directus_permissions'),
    ('directus_policies'),
    ('directus_presets'),
    ('directus_relations'),
    ('directus_revisions'),
    ('directus_roles'),
    ('directus_sessions'),
    ('directus_settings'),
    ('directus_shares'),
    ('directus_users'),
    ('directus_versions'),
    ('directus_webhooks')
)
SELECT 'schema.tables.missing' AS check_name, count(*)::text AS value
FROM expected_tables et
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_name = et.table_name
)
UNION ALL
SELECT 'schema.directus_collections.missing', count(*)::text
FROM expected_tables et
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections dc WHERE dc.collection = et.table_name
)
UNION ALL
SELECT 'schema.fields.missing', count(*)::text
FROM expected_fields ef
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = ef.table_name
    AND c.column_name = ef.field_name
)
  AND NOT EXISTS (
    SELECT 1
    FROM directus_fields df
    WHERE df.collection = ef.table_name
      AND df.field = ef.field_name
      AND (
        coalesce(df.special, '') LIKE '%alias%'
        OR coalesce(df.special, '') LIKE '%o2m%'
        OR coalesce(df.special, '') LIKE '%m2m%'
        OR coalesce(df.special, '') LIKE '%m2a%'
      )
  )
UNION ALL
SELECT 'schema.directus_field_metadata.missing', count(*)::text
FROM expected_fields ef
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_fields df
  WHERE df.collection = ef.table_name
    AND df.field = ef.field_name
)
UNION ALL
SELECT 'schema.relations.missing', count(*)::text
FROM expected_relations er
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_relations dr
  WHERE dr.many_collection = er.many_collection
    AND dr.many_field = er.many_field
    AND dr.one_collection = er.one_collection
)
UNION ALL
SELECT 'schema.custom_tables.untracked', count(*)::text
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT LIKE 'directus_%'
  AND t.table_name NOT IN (SELECT table_name FROM expected_tables)
UNION ALL
SELECT 'schema.required_file_folders.missing', count(*)::text
FROM (
  VALUES
    ('ISVOI Device Photos'),
    ('ISVOI Site Assets'),
    ('ISVOI Editorial'),
    ('ISVOI File Review'),
    ('ISVOI Catalog Imports')
) AS expected_folders(name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_folders f WHERE f.name = expected_folders.name
)
UNION ALL
SELECT 'schema.import_flows.missing', count(*)::text
FROM (
  VALUES
    ('ISVOI: проверить партию каталога'),
    ('ISVOI: импортировать партию каталога')
) AS expected_flows(name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_flows f WHERE f.name = expected_flows.name
)
UNION ALL
SELECT 'permissions.non_admin_admin_access', count(*)::text
FROM directus_policies
WHERE name <> 'Administrator'
  AND coalesce(admin_access, false) = true
UNION ALL
SELECT 'permissions.service_app_access', count(*)::text
FROM directus_policies
WHERE name IN ('$t:public_label', 'ISVOI Public Read', 'ISVOI Lead Intake', 'ISVOI Catalog Import')
  AND coalesce(app_access, false) = true
UNION ALL
SELECT 'permissions.studio_tfa_policies', count(*)::text
FROM directus_policies
WHERE name IN ('Administrator', 'ISVOI Editor', 'ISVOI Importer')
  AND coalesce(enforce_tfa, false) = true
UNION ALL
SELECT 'permissions.non_admin_system_permissions', count(*)::text
FROM directus_permissions pe
JOIN directus_policies p ON p.id = pe.policy
WHERE coalesce(p.admin_access, false) = false
  AND pe.collection IN (SELECT collection FROM system_collections)
UNION ALL
SELECT 'permissions.public_writes', count(*)::text
FROM directus_permissions
WHERE policy IN (
    SELECT id FROM directus_policies
    WHERE name IN ('$t:public_label', 'ISVOI Public Read')
  )
  AND action <> 'read'
UNION ALL
SELECT 'permissions.lead_intake_extra_permissions', count(*)::text
FROM directus_permissions
WHERE policy IN (SELECT id FROM directus_policies WHERE name = 'ISVOI Lead Intake')
  AND NOT (collection = 'leads' AND action = 'create')
UNION ALL
SELECT 'permissions.non_admin_wildcards', count(*)::text
FROM directus_permissions pe
JOIN directus_policies p ON p.id = pe.policy
WHERE pe.fields = '*'
  AND p.name IN ('ISVOI Editor', 'ISVOI Importer', 'ISVOI Catalog Import')
UNION ALL
SELECT 'permissions.public_read_rows', count(*)::text
FROM directus_permissions
WHERE policy IN (
    SELECT id FROM directus_policies
    WHERE name IN ('$t:public_label', 'ISVOI Public Read')
  )
  AND action = 'read'
UNION ALL
SELECT 'schema.snapshot_audit_rows', 'ok';
`);
