#!/usr/bin/env node

const mode = (process.env.CATALOG_RELEASE_IDENTITY_MODE || "create").trim().toLowerCase();
if (!new Set(["create", "delete"]).has(mode)) {
  throw new Error("CATALOG_RELEASE_IDENTITY_MODE must be create or delete");
}

if (mode === "delete") {
  process.stdout.write(String.raw`
BEGIN;
UPDATE directus_files
SET uploaded_by=CASE WHEN uploaded_by=(SELECT id FROM directus_users WHERE email='catalog-release-qa@service.isvoi') THEN NULL ELSE uploaded_by END,
    modified_by=CASE WHEN modified_by=(SELECT id FROM directus_users WHERE email='catalog-release-qa@service.isvoi') THEN NULL ELSE modified_by END
WHERE uploaded_by=(SELECT id FROM directus_users WHERE email='catalog-release-qa@service.isvoi')
   OR modified_by=(SELECT id FROM directus_users WHERE email='catalog-release-qa@service.isvoi');
DELETE FROM directus_access
WHERE "user"=(SELECT id FROM directus_users WHERE email='catalog-release-qa@service.isvoi');
DELETE FROM directus_users WHERE email='catalog-release-qa@service.isvoi';
DELETE FROM directus_permissions
WHERE policy=(SELECT id FROM directus_policies WHERE name='ISVOI Catalog Release QA');
DELETE FROM directus_policies WHERE name='ISVOI Catalog Release QA';
COMMIT;
SELECT 'catalog_release.identity_removed' AS check_name,count(*)::text AS value
FROM directus_users WHERE email='catalog-release-qa@service.isvoi';
`);
  process.exit(0);
}

process.stdout.write(String.raw`
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
DECLARE
  v_role uuid;
  v_user uuid;
  v_manager_policy uuid;
  v_import_policy uuid;
  v_release_policy uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'ISVOI Inventory Manager role is missing'; END IF;
  SELECT id INTO v_manager_policy FROM directus_policies WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF v_manager_policy IS NULL THEN RAISE EXCEPTION 'ISVOI Inventory Manager policy is missing'; END IF;
  SELECT id INTO v_import_policy FROM directus_policies WHERE name='ISVOI Catalog Import' LIMIT 1;
  IF v_import_policy IS NULL THEN RAISE EXCEPTION 'ISVOI Catalog Import policy is missing'; END IF;
  SELECT id INTO v_release_policy FROM directus_policies WHERE name='ISVOI Catalog Release QA' LIMIT 1;
  IF v_release_policy IS NULL THEN
    v_release_policy := gen_random_uuid();
    INSERT INTO directus_policies(id,name,icon,description,app_access,admin_access,enforce_tfa)
    VALUES(
      v_release_policy,
      'ISVOI Catalog Release QA',
      'published_with_changes',
      'Temporary non-admin union of Inventory Manager and Catalog Import permissions.',
      true,
      false,
      false
    );
  ELSE
    UPDATE directus_policies
    SET app_access=true,admin_access=false,enforce_tfa=false
    WHERE id=v_release_policy;
  END IF;
  DELETE FROM directus_permissions WHERE policy=v_release_policy;
  WITH source_permissions AS (
    SELECT
      permission.*,
      CASE source_policy.id WHEN v_import_policy THEN 0 ELSE 1 END AS source_priority
    FROM directus_permissions permission
    JOIN directus_policies source_policy ON source_policy.id=permission.policy
    WHERE source_policy.id IN (v_manager_policy,v_import_policy)
  ),
  preferred AS (
    SELECT DISTINCT ON (collection,action)
      collection,action,permissions,validation,presets
    FROM source_permissions
    ORDER BY collection,action,source_priority
  ),
  field_sets AS (
    SELECT
      source.collection,
      source.action,
      CASE
        WHEN bool_or(source.fields='*') THEN '*'
        ELSE string_agg(DISTINCT btrim(field.value),',' ORDER BY btrim(field.value))
          FILTER (WHERE btrim(field.value)<>'')
      END AS fields
    FROM source_permissions source
    LEFT JOIN LATERAL unnest(string_to_array(COALESCE(source.fields,''),',')) AS field(value)
      ON true
    GROUP BY source.collection,source.action
  )
  INSERT INTO directus_permissions(policy,collection,action,permissions,validation,presets,fields)
  SELECT
    v_release_policy,
    preferred.collection,
    preferred.action,
    preferred.permissions,
    preferred.validation,
    preferred.presets,
    field_sets.fields
  FROM preferred
  JOIN field_sets USING (collection,action);
  SELECT id INTO v_user FROM directus_users WHERE email='catalog-release-qa@service.isvoi' LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO directus_users(id,first_name,last_name,email,title,description,status,role,token,provider)
    VALUES(gen_random_uuid(),'ISVOI','Catalog Release QA','catalog-release-qa@service.isvoi',
      'Temporary catalog release identity',
      'Temporary non-admin service identity. Delete immediately after release.',
      'active',NULL,encode(gen_random_bytes(32),'hex'),'default');
  ELSE
    UPDATE directus_users SET status='active',role=NULL,password=NULL,
      token=encode(gen_random_bytes(32),'hex') WHERE id=v_user;
  END IF;
  SELECT id INTO v_user FROM directus_users WHERE email='catalog-release-qa@service.isvoi' LIMIT 1;
  DELETE FROM directus_access WHERE "user"=v_user;
  INSERT INTO directus_access(id,role,"user",policy,sort)
  VALUES(gen_random_uuid(),NULL,v_user,v_release_policy,1);
END $$;
COMMIT;
SELECT 'catalog_release.identity_ready' AS check_name,count(*)::text AS value
FROM directus_users users
WHERE users.email='catalog-release-qa@service.isvoi' AND users.status='active'
  AND users.password IS NULL AND length(users.token)>=64 AND users.role IS NULL;
SELECT 'catalog_release.access_policy_ready' AS check_name,count(*)::text AS value
FROM directus_access access
JOIN directus_users users ON users.id=access."user"
JOIN directus_policies policy ON policy.id=access.policy
WHERE users.email='catalog-release-qa@service.isvoi'
  AND access.role IS NULL
  AND policy.name='ISVOI Catalog Release QA'
  AND policy.app_access=true
  AND policy.admin_access=false;
`);
