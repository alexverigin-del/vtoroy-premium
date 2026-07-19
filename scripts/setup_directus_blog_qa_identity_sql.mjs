#!/usr/bin/env node
/**
 * Print SQL that creates or removes a temporary Editor identity for a real
 * blog workflow rehearsal. The static token is generated in PostgreSQL and is
 * never printed. Remove the identity immediately after the rehearsal.
 *
 * Optional env:
 *   BLOG_QA_IDENTITY_MODE=create|delete
 */

const mode = (process.env.BLOG_QA_IDENTITY_MODE || "create").trim().toLowerCase();
if (!new Set(["create", "delete"]).has(mode)) {
  console.error("BLOG_QA_IDENTITY_MODE must be create or delete.");
  process.exit(1);
}

if (mode === "delete") {
  process.stdout.write(String.raw`
BEGIN;
DELETE FROM directus_access
WHERE policy=(SELECT id FROM directus_policies WHERE name='ISVOI Temporary Blog Editorial QA');
DELETE FROM directus_permissions
WHERE policy=(SELECT id FROM directus_policies WHERE name='ISVOI Temporary Blog Editorial QA');
DELETE FROM directus_policies WHERE name='ISVOI Temporary Blog Editorial QA';
DELETE FROM directus_users WHERE email='blog-editorial-qa@service.isvoi';
COMMIT;
SELECT 'blog.qa_identity_removed' AS check_name,
  CASE WHEN count(*)=0 THEN '1' ELSE '0' END AS value
FROM directus_users WHERE email='blog-editorial-qa@service.isvoi';
SELECT 'blog.qa_policy_removed' AS check_name,
  CASE WHEN count(*)=0 THEN '1' ELSE '0' END AS value
FROM directus_policies WHERE name='ISVOI Temporary Blog Editorial QA';
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
  v_policy uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name='ISVOI Editor' LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ISVOI Editor role is missing';
  END IF;

  SELECT id INTO v_user
  FROM directus_users
  WHERE email='blog-editorial-qa@service.isvoi'
  LIMIT 1;

  IF v_user IS NULL THEN
    INSERT INTO directus_users (
      id,first_name,last_name,email,title,description,status,role,token,provider
    ) VALUES (
      gen_random_uuid(),'ISVOI','Editorial QA','blog-editorial-qa@service.isvoi',
      'Temporary blog workflow rehearsal',
      'Temporary Editor identity. Delete immediately after the production rehearsal.',
      'active',v_role,encode(gen_random_bytes(32),'hex'),'default'
    );
  ELSE
    UPDATE directus_users
    SET first_name='ISVOI',last_name='Editorial QA',
      title='Temporary blog workflow rehearsal',
      description='Temporary Editor identity. Delete immediately after the production rehearsal.',
      status='active',role=v_role,password=NULL,
      token=encode(gen_random_bytes(32),'hex')
    WHERE id=v_user;
  END IF;

  SELECT id INTO v_policy
  FROM directus_policies
  WHERE name='ISVOI Temporary Blog Editorial QA'
  LIMIT 1;

  IF v_policy IS NULL THEN
    v_policy := gen_random_uuid();
    INSERT INTO directus_policies (
      id,name,icon,description,app_access,admin_access,enforce_tfa
    ) VALUES (
      v_policy,
      'ISVOI Temporary Blog Editorial QA',
      'fact_check',
      'Temporary user-bound workaround for Directus relational version promotion. Delete after rehearsal.',
      false,false,false
    );
  ELSE
    UPDATE directus_policies
    SET icon='fact_check',
      description='Temporary user-bound workaround for Directus relational version promotion. Delete after rehearsal.',
      app_access=false,admin_access=false,enforce_tfa=false
    WHERE id=v_policy;
  END IF;

  DELETE FROM directus_access WHERE policy=v_policy;
  INSERT INTO directus_access (id,role,"user",policy,sort)
  VALUES (gen_random_uuid(),NULL,v_user,v_policy,99);

  DELETE FROM directus_permissions WHERE policy=v_policy;
  INSERT INTO directus_permissions (
    policy,collection,action,fields,permissions,validation,presets
  ) VALUES
  (
    v_policy,
    'blog_posts',
    'read',
    '*',
    NULL,
    NULL,
    NULL
  ),
  (
    v_policy,
    'blog_posts',
    'update',
    '*',
    NULL,
    '{"status":{"_in":["draft","review","scheduled","published","archived"]},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"title":{"_nnull":true}}'::json,
    NULL
  ),
  (
    v_policy,
    'blog_post_blocks',
    'read',
    '*',
    NULL,
    NULL,
    NULL
  ),
  (
    v_policy,
    'blog_post_blocks',
    'create',
    '*',
    NULL,
    '{"post":{"slug":{"_in":["chto-pokazyvaet-diagnostika-iphone","kak-proverit-batareyu-iphone","kak-ponyat-kakie-detali-menyali-v-iphone"]}},"block_type":{"_in":["rich_text","image"]},"image_width":{"_in":["content","wide"]}}'::json,
    NULL
  ),
  (
    v_policy,
    'blog_post_blocks',
    'update',
    '*',
    NULL,
    '{"post":{"slug":{"_in":["chto-pokazyvaet-diagnostika-iphone","kak-proverit-batareyu-iphone","kak-ponyat-kakie-detali-menyali-v-iphone"]}},"block_type":{"_in":["rich_text","image"]},"image_width":{"_in":["content","wide"]}}'::json,
    NULL
  ),
  (
    v_policy,
    'blog_post_blocks',
    'delete',
    '*',
    NULL,
    NULL,
    NULL
  );
END;
$$;

COMMIT;

SELECT 'blog.qa_identity_ready' AS check_name, count(*)::text AS value
FROM directus_users users
JOIN directus_roles role ON role.id=users.role
WHERE users.email='blog-editorial-qa@service.isvoi'
  AND users.status='active' AND users.password IS NULL
  AND length(users.token)>=64 AND role.name='ISVOI Editor';
SELECT 'blog.qa_policy_ready' AS check_name, count(*)::text AS value
FROM directus_access access
JOIN directus_users users ON users.id=access."user"
JOIN directus_policies policy ON policy.id=access.policy
JOIN directus_permissions permission ON permission.policy=policy.id
WHERE users.email='blog-editorial-qa@service.isvoi'
  AND policy.name='ISVOI Temporary Blog Editorial QA'
  AND policy.app_access=false AND policy.admin_access=false
  AND permission.collection IN ('blog_posts','blog_post_blocks')
  AND permission.fields='*';
`);
