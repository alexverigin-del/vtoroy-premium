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
DECLARE v_role uuid; v_user uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Inventory Manager' LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'ISVOI Inventory Manager role is missing'; END IF;
  SELECT id INTO v_user FROM directus_users WHERE email='catalog-release-qa@service.isvoi' LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO directus_users(id,first_name,last_name,email,title,description,status,role,token,provider)
    VALUES(gen_random_uuid(),'ISVOI','Catalog Release QA','catalog-release-qa@service.isvoi',
      'Temporary catalog release identity',
      'Temporary Inventory Manager identity. Delete immediately after release.',
      'active',v_role,encode(gen_random_bytes(32),'hex'),'default');
  ELSE
    UPDATE directus_users SET status='active',role=v_role,password=NULL,
      token=encode(gen_random_bytes(32),'hex') WHERE id=v_user;
  END IF;
END $$;
COMMIT;
SELECT 'catalog_release.identity_ready' AS check_name,count(*)::text AS value
FROM directus_users users JOIN directus_roles role ON role.id=users.role
WHERE users.email='catalog-release-qa@service.isvoi' AND users.status='active'
  AND users.password IS NULL AND length(users.token)>=64 AND role.name='ISVOI Inventory Manager';
`);
