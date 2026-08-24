#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

-- These fields store string[], so the Directus tags interface is the native
-- editor. An unconfigured list interface renders an empty object repeater.
UPDATE directus_fields
SET interface='tags',
    special='cast-json',
    options='{"placeholder":"Введите факт и нажмите Enter"}'::json,
    width='full',
    readonly=false,
    hidden=false,
    note='Короткие проверяемые факты о состоянии. Один факт — одна строка; добавляйте пункт клавишей Enter.'
WHERE collection='device_passports' AND field='condition_notes';

UPDATE directus_fields
SET interface='tags',
    special='cast-json',
    options='{"placeholder":"Введите факт и нажмите Enter"}'::json,
    width='full',
    readonly=false,
    hidden=false,
    note='Короткие подтверждённые факты истории без персональных данных. Один факт — одна строка; добавляйте пункт клавишей Enter.'
WHERE collection='device_passports' AND field='story_facts';

${
  rollback
    ? "ROLLBACK;\nSELECT 'catalog_passport_facts_v7.rollback' AS check_name,'ok' AS value;"
    : `COMMIT;

SELECT 'catalog_passport_facts_v7.metadata_invalid' AS check_name,count(*)::text AS value
FROM (VALUES ('condition_notes'),('story_facts')) expected(field)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_fields actual
  WHERE actual.collection='device_passports'
    AND actual.field=expected.field
    AND actual.interface='tags'
    AND coalesce(actual.special,'') LIKE '%cast-json%'
    AND coalesce(actual.readonly,false)=false
    AND coalesce(actual.hidden,false)=false
)
UNION ALL
SELECT 'catalog_passport_facts_v7.invalid_values',count(*)::text
FROM device_passports passport
CROSS JOIN LATERAL (VALUES
  ('condition_notes',passport.condition_notes::jsonb),
  ('story_facts',passport.story_facts::jsonb)
) value(field,payload)
WHERE value.payload IS NOT NULL
  AND (
    jsonb_typeof(value.payload) <> 'array'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(value.payload)='array' THEN value.payload ELSE '[]'::jsonb END
      ) item
      WHERE jsonb_typeof(item) <> 'string'
         OR nullif(trim(item #>> '{}'),'') IS NULL
    )
  );`
}
`);
