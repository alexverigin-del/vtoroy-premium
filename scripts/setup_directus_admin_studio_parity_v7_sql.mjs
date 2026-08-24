#!/usr/bin/env node
/**
 * Keep the Administrator role fully privileged and give it every operational
 * Studio bookmark exposed to ISVOI's human operator roles.
 *
 * User-owned presets are never changed. Role presets with the same collection
 * and bookmark are refreshed from the canonical operator preset.
 */

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_role uuid;
  v_policy uuid;
BEGIN
  SELECT id INTO v_role
  FROM directus_roles
  WHERE name='Administrator'
  LIMIT 1;

  SELECT id INTO v_policy
  FROM directus_policies
  WHERE name='Administrator'
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Directus Administrator role is missing';
  END IF;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Directus Administrator policy is missing';
  END IF;

  UPDATE directus_policies
  SET app_access=true,
      admin_access=true,
      enforce_tfa=true,
      description=COALESCE(
        NULLIF(description,''),
        'Full Directus administration. Use only for schema, users, roles, policies and emergency maintenance.'
      )
  WHERE id=v_policy;

  IF NOT EXISTS (
    SELECT 1
    FROM directus_access
    WHERE role=v_role AND policy=v_policy AND "user" IS NULL
  ) THEN
    INSERT INTO directus_access(id,role,"user",policy,sort)
    VALUES(gen_random_uuid(),v_role,NULL,v_policy,1);
  END IF;
END $$;

-- Prefer the most capable human role when two roles expose a bookmark with
-- the same collection and name. This normally affects identical Editor and
-- Advanced Editor views.
WITH source_presets AS (
  SELECT
    preset.*,
    row_number() OVER (
      PARTITION BY preset.collection,preset.bookmark
      ORDER BY CASE role.name
        WHEN 'ISVOI Inventory Manager' THEN 1
        WHEN 'ISVOI Advanced Editor' THEN 2
        WHEN 'ISVOI Editor' THEN 3
        WHEN 'ISVOI Importer' THEN 4
        ELSE 5
      END,
      preset.id
    ) AS source_rank
  FROM directus_presets preset
  JOIN directus_roles role ON role.id=preset.role
  WHERE role.name IN (
    'ISVOI Editor',
    'ISVOI Advanced Editor',
    'ISVOI Importer',
    'ISVOI Inventory Manager'
  )
    AND preset."user" IS NULL
    AND preset.bookmark IS NOT NULL
), admin_role AS (
  SELECT id FROM directus_roles WHERE name='Administrator' LIMIT 1
)
DELETE FROM directus_presets target
USING source_presets source,admin_role admin
WHERE source.source_rank=1
  AND target.role=admin.id
  AND target."user" IS NULL
  AND target.collection=source.collection
  AND target.bookmark=source.bookmark;

WITH source_presets AS (
  SELECT
    preset.*,
    row_number() OVER (
      PARTITION BY preset.collection,preset.bookmark
      ORDER BY CASE role.name
        WHEN 'ISVOI Inventory Manager' THEN 1
        WHEN 'ISVOI Advanced Editor' THEN 2
        WHEN 'ISVOI Editor' THEN 3
        WHEN 'ISVOI Importer' THEN 4
        ELSE 5
      END,
      preset.id
    ) AS source_rank
  FROM directus_presets preset
  JOIN directus_roles role ON role.id=preset.role
  WHERE role.name IN (
    'ISVOI Editor',
    'ISVOI Advanced Editor',
    'ISVOI Importer',
    'ISVOI Inventory Manager'
  )
    AND preset."user" IS NULL
    AND preset.bookmark IS NOT NULL
), admin_role AS (
  SELECT id FROM directus_roles WHERE name='Administrator' LIMIT 1
)
INSERT INTO directus_presets(
  bookmark,role,"user",collection,search,layout,layout_query,layout_options,
  refresh_interval,filter,icon,color
)
SELECT
  source.bookmark,admin.id,NULL,source.collection,source.search,source.layout,
  source.layout_query,source.layout_options,source.refresh_interval,
  source.filter,source.icon,source.color
FROM source_presets source
CROSS JOIN admin_role admin
WHERE source.source_rank=1;

${
  rollback
    ? "ROLLBACK;\nSELECT 'admin_studio_parity_v7.rollback' AS check_name,'ok' AS value;"
    : `COMMIT;

SELECT 'admin_studio_parity_v7.admin_access_missing' AS check_name,count(*)::text AS value
FROM (VALUES (1)) marker(value)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_roles role
  JOIN directus_access access ON access.role=role.id AND access."user" IS NULL
  JOIN directus_policies policy ON policy.id=access.policy
  WHERE role.name='Administrator'
    AND policy.name='Administrator'
    AND policy.app_access=true
    AND policy.admin_access=true
    AND policy.enforce_tfa=true
)
UNION ALL
SELECT 'admin_studio_parity_v7.bookmarks_missing',count(*)::text
FROM (
  SELECT DISTINCT source.collection,source.bookmark
  FROM directus_presets source
  JOIN directus_roles source_role ON source_role.id=source.role
  WHERE source_role.name IN (
    'ISVOI Editor','ISVOI Advanced Editor','ISVOI Importer','ISVOI Inventory Manager'
  )
    AND source."user" IS NULL
    AND source.bookmark IS NOT NULL
) expected
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_presets target
  JOIN directus_roles target_role ON target_role.id=target.role
  WHERE target_role.name='Administrator'
    AND target."user" IS NULL
    AND target.collection=expected.collection
    AND target.bookmark=expected.bookmark
)
UNION ALL
SELECT 'admin_studio_parity_v7.bookmark_duplicates',count(*)::text
FROM (
  SELECT preset.collection,preset.bookmark
  FROM directus_presets preset
  JOIN directus_roles role ON role.id=preset.role
  WHERE role.name='Administrator'
    AND preset."user" IS NULL
    AND preset.bookmark IS NOT NULL
  GROUP BY preset.collection,preset.bookmark
  HAVING count(*) > 1
) duplicate;`
}
`);
