#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

-- A closed issue without an operator decision is not auditable. Reopen it
-- instead of inventing a resolution during migration.
UPDATE inventory_import_issues
SET resolved=false
WHERE resolved=true AND NULLIF(trim(resolution_note),'') IS NULL;

UPDATE directus_fields SET
  note='Обязательно опишите, что проверено и какое решение принято перед закрытием.',
  conditions='[{"name":"Закрытие проблемы","rule":{"resolved":{"_eq":true}},"hidden":false,"readonly":false,"required":true,"options":{}}]'::json
WHERE collection='inventory_import_issues' AND field='resolution_note';

CREATE OR REPLACE FUNCTION isvoi_validate_inventory_issue_resolution()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resolved=true AND NULLIF(trim(NEW.resolution_note),'') IS NULL THEN
    RAISE EXCEPTION 'Перед закрытием проблемы заполните «Как решено»';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_issue_resolution_guard ON inventory_import_issues;
CREATE TRIGGER inventory_issue_resolution_guard
BEFORE INSERT OR UPDATE OF resolved,resolution_note ON inventory_import_issues
FOR EACH ROW EXECUTE FUNCTION isvoi_validate_inventory_issue_resolution();

DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id
  AND role.name='ISVOI Inventory Manager'
  AND preset."user" IS NULL
  AND preset.collection='inventory_import_issues'
  AND preset.bookmark='4 · Решённые проблемы';

INSERT INTO directus_presets(
  bookmark,role,"user",collection,layout,layout_query,filter,icon,color
)
SELECT
  '4 · Решённые проблемы',role.id,NULL,'inventory_import_issues','tabular',
  '{"tabular":{"sort":["-created_at"],"fields":["inventory_item","batch","severity","code","message","resolution_note","resolved"],"page":1}}'::json,
  '{"resolved":{"_eq":true}}'::json,
  'task_alt','#059669'
FROM directus_roles role
WHERE role.name='ISVOI Inventory Manager'
LIMIT 1;

${rollback ? "ROLLBACK;\nSELECT 'inventory_issue_lifecycle_v6.rollback' AS check_name,'ok' AS value;" : `COMMIT;

SELECT 'inventory_issue_lifecycle_v6.resolved_without_note' AS check_name,count(*)::text AS value
FROM inventory_import_issues
WHERE resolved=true AND NULLIF(trim(resolution_note),'') IS NULL
UNION ALL
SELECT 'inventory_issue_lifecycle_v6.resolved_preset_missing',
  CASE WHEN EXISTS (
    SELECT 1 FROM directus_presets preset
    JOIN directus_roles role ON role.id=preset.role
    WHERE role.name='ISVOI Inventory Manager'
      AND preset.collection='inventory_import_issues'
      AND preset.bookmark='4 · Решённые проблемы'
      AND preset.filter::jsonb @> '{"resolved":{"_eq":true}}'::jsonb
  ) THEN '0' ELSE '1' END
UNION ALL
SELECT 'inventory_issue_lifecycle_v6.guard_missing',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='inventory_issue_resolution_guard' AND NOT tgisinternal
  ) THEN '0' ELSE '1' END;`}
`);
