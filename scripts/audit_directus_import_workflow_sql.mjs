#!/usr/bin/env node
/**
 * Print SQL that audits catalog import operator readiness.
 */

process.stdout.write(String.raw`
WITH expected_flows(name) AS (
  VALUES
    ('ISVOI: проверить партию каталога'),
    ('ISVOI: импортировать партию каталога')
),
required_permissions(collection, action) AS (
  VALUES
    ('catalog_import_batches', 'read'),
    ('catalog_import_batches', 'create'),
    ('catalog_import_batches', 'update'),
    ('directus_files', 'read'),
    ('directus_files', 'create'),
    ('devices', 'read'),
    ('devices', 'create'),
    ('devices', 'update'),
    ('device_images', 'read'),
    ('device_images', 'create'),
    ('device_images', 'update')
),
importer_permissions AS (
  SELECT pe.collection, pe.action
  FROM directus_permissions pe
  JOIN directus_policies p ON p.id = pe.policy
  WHERE p.name IN ('ISVOI Importer', 'ISVOI Catalog Import')
)
SELECT 'import_batches.count' AS check_name, count(*)::text AS value
FROM catalog_import_batches
UNION ALL
SELECT 'import_batches.demo_or_real_batches.warning', (
  CASE WHEN (SELECT count(*) FROM catalog_import_batches) > 0 THEN '0' ELSE '1' END
)
UNION ALL
SELECT 'import_batches.missing_files', count(*)::text
FROM catalog_import_batches
WHERE workbook IS NULL OR photos_archive IS NULL
UNION ALL
SELECT 'import_batches.invalid_last_run_status', count(*)::text
FROM catalog_import_batches
WHERE last_run_status IS NOT NULL
  AND last_run_status NOT IN ('running', 'success', 'failed')
UNION ALL
SELECT 'import_batches.failed_without_log', count(*)::text
FROM catalog_import_batches
WHERE last_run_status = 'failed'
  AND nullif(last_run_log, '') IS NULL
UNION ALL
SELECT 'import_batches.flows_missing', count(*)::text
FROM expected_flows ef
WHERE NOT EXISTS (
  SELECT 1 FROM directus_flows f WHERE f.name = ef.name AND f.status = 'active'
)
UNION ALL
SELECT 'import_batches.importer_missing_permissions', count(*)::text
FROM required_permissions rp
WHERE NOT EXISTS (
  SELECT 1
  FROM importer_permissions ip
  WHERE ip.collection = rp.collection
    AND ip.action = rp.action
);
`);
