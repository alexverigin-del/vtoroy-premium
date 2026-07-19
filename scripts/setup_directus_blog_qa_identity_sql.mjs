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
DELETE FROM directus_users WHERE email='blog-editorial-qa@service.isvoi';
COMMIT;
SELECT 'blog.qa_identity_removed' AS check_name,
  CASE WHEN count(*)=0 THEN '1' ELSE '0' END AS value
FROM directus_users WHERE email='blog-editorial-qa@service.isvoi';
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
END;
$$;

COMMIT;

SELECT 'blog.qa_identity_ready' AS check_name, count(*)::text AS value
FROM directus_users users
JOIN directus_roles role ON role.id=users.role
WHERE users.email='blog-editorial-qa@service.isvoi'
  AND users.status='active' AND users.password IS NULL
  AND length(users.token)>=64 AND role.name='ISVOI Editor';
`);
