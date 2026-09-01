#!/usr/bin/env node
/** Read-only production audit for managed third-party integrations. */

process.stdout.write(String.raw`
SELECT 'site_integrations.tables_missing' AS check_name,(2-count(*))::text AS value
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('site_integrations','integration_consent_settings')
UNION ALL
SELECT 'site_integrations.metadata_missing',count(*)::text
FROM (VALUES('site_integrations'),('integration_consent_settings')) expected(collection)
WHERE NOT EXISTS (SELECT 1 FROM directus_collections c WHERE c.collection=expected.collection)
UNION ALL
SELECT 'site_integrations.consent_singleton_invalid',count(*)::text
FROM (SELECT count(*) AS total FROM integration_consent_settings) value
WHERE value.total<>1
UNION ALL
SELECT 'site_integrations.metrika_template_missing',count(*)::text
FROM (VALUES(1)) value(marker)
WHERE NOT EXISTS (
  SELECT 1 FROM site_integrations
  WHERE id='00000000-0000-4000-8000-000000000101'
    AND provider='yandex_metrika'
)
UNION ALL
SELECT 'site_integrations.published_invalid',count(*)::text
FROM site_integrations
WHERE status='published' AND (
  name IS NULL OR btrim(name)='' OR
  provider NOT IN ('yandex_metrika','custom') OR
  consent_category NOT IN ('necessary','analytics','marketing','support') OR
  load_strategy NOT IN ('after_interactive','lazy_onload') OR
  jsonb_typeof(provider_settings)<>'object' OR
  jsonb_typeof(hostnames)<>'array' OR
  jsonb_typeof(include_paths)<>'array' OR
  jsonb_typeof(exclude_paths)<>'array' OR
  (provider='yandex_metrika' AND coalesce(provider_settings->>'counterId','') !~ '^[1-9][0-9]*$') OR
  (provider='custom' AND coalesce(script_url,'')='' AND coalesce(bootstrap_code,'')='') OR
  (provider='custom' AND coalesce(script_url,'')<>'' AND script_url !~* '^https://') OR
  (provider='custom' AND (
    CASE WHEN jsonb_typeof(include_paths)='array' THEN jsonb_array_length(include_paths)>0 ELSE true END OR
    CASE WHEN jsonb_typeof(exclude_paths)='array' THEN jsonb_array_length(exclude_paths)>0 ELSE true END
  ) AND coalesce(cleanup_code,'')='')
)
UNION ALL
SELECT 'site_integrations.anonymous_exposure',count(*)::text
FROM directus_permissions pe JOIN directus_policies p ON p.id=pe.policy
WHERE p.name='$t:public_label' AND pe.collection IN ('site_integrations','integration_consent_settings')
UNION ALL
SELECT 'site_integrations.service_read_missing',count(*)::text
FROM (VALUES('site_integrations'),('integration_consent_settings')) expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions pe JOIN directus_policies p ON p.id=pe.policy
  WHERE p.name='ISVOI Public Read' AND pe.collection=expected.collection AND pe.action='read'
    AND pe.fields<>'*'
    AND (
      expected.collection<>'site_integrations' OR (
        pe.permissions::jsonb @> '{"status":{"_eq":"published"}}'::jsonb AND
        pe.fields LIKE '%bootstrap_code%' AND pe.fields NOT LIKE '%notes%'
      )
    )
)
UNION ALL
SELECT 'site_integrations.editor_custom_write_access',count(*)::text
FROM directus_permissions pe JOIN directus_policies p ON p.id=pe.policy
WHERE p.name='ISVOI Editor' AND pe.collection='site_integrations'
  AND pe.action IN ('create','update')
  AND pe.fields ~ '(^|,)(script_url|bootstrap_code|cleanup_code)(,|$)'
UNION ALL
SELECT 'site_integrations.editor_provider_guard_missing',count(*)::text
FROM (VALUES('create'),('update')) expected(action)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions pe JOIN directus_policies p ON p.id=pe.policy
  WHERE p.name='ISVOI Editor' AND pe.collection='site_integrations'
    AND pe.action=expected.action
    AND pe.validation::jsonb @> '{"provider":{"_eq":"yandex_metrika"}}'::jsonb
    AND (
      expected.action='create' OR
      pe.permissions::jsonb @> '{"provider":{"_eq":"yandex_metrika"}}'::jsonb
    )
)
UNION ALL
SELECT 'site_integrations.advanced_write_missing',count(*)::text
FROM (VALUES('create'),('update')) expected(action)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions pe JOIN directus_policies p ON p.id=pe.policy
  WHERE p.name='ISVOI Advanced Editor' AND pe.collection='site_integrations'
    AND pe.action=expected.action
    AND pe.fields LIKE '%bootstrap_code%' AND pe.fields LIKE '%cleanup_code%'
)
UNION ALL
SELECT 'site_integrations.revalidation_scope_missing',count(*)::text
FROM (VALUES('site_integrations'),('integration_consent_settings')) expected(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_flows f
  WHERE f.name='ISVOI: обновить кэш контента сайта' AND f.status='active'
    AND f.options::text LIKE '%' || expected.collection || '%'
);
`);
