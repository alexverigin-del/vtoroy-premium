#!/usr/bin/env node

process.stdout.write(String.raw`
SELECT 'product_passports_v8.schema.tables_missing' AS check_name,count(*)::text AS value
FROM (VALUES ('device_diagnostic_reports'),('device_model_specifications')) expected(name)
WHERE to_regclass('public.'||expected.name) IS NULL
UNION ALL
SELECT 'product_passports_v8.schema.fields_missing',count(*)::text
FROM (VALUES
  ('device_details','imei_primary_last4'),('device_details','imei_secondary_last4'),
  ('device_diagnostic_reports','product'),('device_diagnostic_reports','passport'),
  ('device_diagnostic_reports','original_file'),('device_diagnostic_reports','public_file'),
  ('device_model_specifications','device_model'),('device_model_specifications','source_url')
) expected(collection,field)
WHERE NOT EXISTS(
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name=expected.collection AND c.column_name=expected.field
)
UNION ALL
SELECT 'product_passports_v8.schema.relations_missing',count(*)::text
FROM (VALUES
  ('device_diagnostic_reports','product','products'),
  ('device_diagnostic_reports','passport','device_passports'),
  ('device_diagnostic_reports','original_file','directus_files'),
  ('device_diagnostic_reports','public_file','directus_files'),
  ('device_model_specifications','device_model','device_models')
) expected(many_collection,many_field,one_collection)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_relations r
  WHERE r.many_collection=expected.many_collection AND r.many_field=expected.many_field
    AND r.one_collection=expected.one_collection
)
UNION ALL
SELECT 'product_passports_v8.studio.metadata_missing',count(*)::text
FROM (VALUES
  ('device_diagnostic_reports','product'),('device_diagnostic_reports','public_file'),
  ('device_model_specifications','device_model'),('device_model_specifications','value'),
  ('device_details','imei_primary_last4')
) expected(collection,field)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_fields f WHERE f.collection=expected.collection AND f.field=expected.field
    AND coalesce(f.note,'')<>'' AND coalesce(f.hidden,false)=false
)
UNION ALL
SELECT 'product_passports_v8.files.folders_missing',count(*)::text
FROM (VALUES
  ('ISVOI Passport Originals'),
  ('ISVOI Passport Public'),
  ('ISVOI Passport Archive')
) expected(name)
WHERE NOT EXISTS(SELECT 1 FROM directus_folders f WHERE f.name=expected.name)
UNION ALL
SELECT 'product_passports_v8.permissions.original_exposure',count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name IN ('$t:public_label','ISVOI Public Read','ISVOI Editor','ISVOI Advanced Editor')
  AND permission.collection='device_diagnostic_reports'
  AND (permission.fields='*' OR 'original_file'=ANY(string_to_array(permission.fields,',')))
UNION ALL
SELECT 'product_passports_v8.permissions.public_missing',count(*)::text
FROM (VALUES ('device_diagnostic_reports'),('device_model_specifications')) expected(collection)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Public Read' AND permission.collection=expected.collection
    AND permission.action='read'
)
UNION ALL
SELECT 'product_passports_v8.models.specifications_missing',count(*)::text
FROM (VALUES ('iphone-14-pro'),('iphone-14-pro-max'),('iphone-16-pro'),('iphone-16-pro-max')) expected(slug)
WHERE NOT EXISTS(
  SELECT 1 FROM device_models model
  JOIN device_model_specifications specification ON specification.device_model=model.id AND specification.is_active=true
  WHERE model.slug=expected.slug
  GROUP BY model.id HAVING count(*)>=7
)
UNION ALL
SELECT 'product_passports_v8.publication.model_specifications_missing',count(*)::text
FROM products product
WHERE product.status='published' AND product.product_type='device'
  AND NOT EXISTS (
    SELECT 1 FROM device_model_specifications specification
    WHERE specification.device_model=product.device_model AND specification.is_active=true
      AND btrim(specification.label)<>'' AND btrim(specification.value)<>''
  )
UNION ALL
SELECT 'product_passports_v8.data.invalid_identifier_tails',count(*)::text
FROM device_details
WHERE (imei_primary_last4 IS NOT NULL AND imei_primary_last4 !~ '^[0-9]{4}$')
   OR (imei_secondary_last4 IS NOT NULL AND imei_secondary_last4 !~ '^[0-9]{4}$')
   OR (serial IS NOT NULL AND serial ~ '^[A-Z0-9]{8,}$')
UNION ALL
SELECT 'product_passports_v8.publication.current_report_missing',count(*)::text
FROM products product
WHERE product.status='published' AND product.product_type='device' AND product.condition='used'
  AND NOT EXISTS(
    SELECT 1 FROM device_diagnostic_reports report
    WHERE report.product=product.id AND report.status='current' AND report.public_file IS NOT NULL
  )
UNION ALL
SELECT 'product_passports_v8.publication.original_in_public_folder',count(*)::text
FROM device_diagnostic_reports report
JOIN directus_files file ON file.id=report.original_file
JOIN directus_folders folder ON folder.id=file.folder
WHERE folder.name<>'ISVOI Passport Originals'
UNION ALL
SELECT 'product_passports_v8.publication.public_copy_wrong_folder',count(*)::text
FROM device_diagnostic_reports report
JOIN directus_files file ON file.id=report.public_file
JOIN directus_folders folder ON folder.id=file.folder
WHERE folder.name<>'ISVOI Passport Public'
UNION ALL
SELECT 'product_passports_v8.revalidation.collections_missing',count(*)::text
FROM directus_flows flow
WHERE flow.name='ISVOI: обновить кэш контента сайта'
  AND NOT (
    (flow.options::jsonb->'collections') ? 'device_model_specifications'
    AND (flow.options::jsonb->'collections') ? 'device_diagnostic_reports'
  );
`);
