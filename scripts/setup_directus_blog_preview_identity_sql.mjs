#!/usr/bin/env node
/**
 * Print idempotent SQL for the dedicated headless blog preview identity.
 * The static token is generated inside PostgreSQL and is never printed.
 *
 * Optional env:
 *   BLOG_PREVIEW_ROTATE_TOKEN=1
 */

const rotateToken = process.env.BLOG_PREVIEW_ROTATE_TOKEN === "1";

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_policy uuid;
  v_user uuid;
BEGIN
  SELECT id INTO v_policy
  FROM directus_policies
  WHERE name='ISVOI Blog Preview'
  LIMIT 1;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'ISVOI Blog Preview policy is missing';
  END IF;

  SELECT id INTO v_user
  FROM directus_users
  WHERE email='blog-preview@service.isvoi'
  LIMIT 1;

  IF v_user IS NULL THEN
    v_user := gen_random_uuid();
    INSERT INTO directus_users (
      id,first_name,last_name,email,title,description,status,role,token,provider
    )
    VALUES (
      v_user,
      'ISVOI',
      'Blog Preview',
      'blog-preview@service.isvoi',
      'Headless preview service',
      'Read-only service identity for Next.js Draft Mode. No Studio access.',
      'active',
      NULL,
      encode(gen_random_bytes(32),'hex'),
      'default'
    );
  ELSE
    UPDATE directus_users
    SET first_name='ISVOI',
      last_name='Blog Preview',
      title='Headless preview service',
      description='Read-only service identity for Next.js Draft Mode. No Studio access.',
      status='active',
      role=NULL,
      password=NULL,
      token=CASE
        WHEN ${rotateToken ? "true" : "false"} OR token IS NULL OR token=''
          THEN encode(gen_random_bytes(32),'hex')
        ELSE token
      END
    WHERE id=v_user;
  END IF;

  DELETE FROM directus_access
  WHERE "user"=v_user AND policy<>v_policy;

  IF NOT EXISTS (
    SELECT 1 FROM directus_access
    WHERE "user"=v_user AND policy=v_policy
  ) THEN
    INSERT INTO directus_access (id,role,"user",policy,sort)
    VALUES (gen_random_uuid(),NULL,v_user,v_policy,1);
  END IF;
END;
$$;

COMMIT;

SELECT 'blog.preview_identity' AS check_name, count(*)::text AS value
FROM directus_users
WHERE email='blog-preview@service.isvoi'
  AND status='active'
  AND role IS NULL
  AND password IS NULL
  AND length(token)>=64
UNION ALL
SELECT 'blog.preview_identity_policy', count(*)::text
FROM directus_access access
JOIN directus_users users ON users.id=access."user"
JOIN directus_policies policy ON policy.id=access.policy
WHERE users.email='blog-preview@service.isvoi'
  AND policy.name='ISVOI Blog Preview';
`);
