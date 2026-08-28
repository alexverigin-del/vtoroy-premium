#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");
const rehearsal = process.argv.includes("--rehearsal");
const note = "Нет замечаний по корпусу.";

const targetFilter = String.raw`
  p.status = 'published'
  AND upper(btrim(dd.grade)) = 'A'`;

const desiredNotes = rollback
  ? String.raw`
      SELECT COALESCE(jsonb_agg(to_jsonb(existing.value) ORDER BY existing.ordinality), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(COALESCE(dp.condition_notes::jsonb, '[]'::jsonb)) = 'array'
            THEN COALESCE(dp.condition_notes::jsonb, '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS existing(value, ordinality)
      WHERE lower(btrim(existing.value)) <> lower('${note}')`
  : String.raw`
      SELECT jsonb_agg(ordered.value ORDER BY ordered.priority, ordered.ordinality)
      FROM (
        SELECT to_jsonb('${note}'::text) AS value, 0 AS priority, 0::bigint AS ordinality
        UNION ALL
        SELECT to_jsonb(existing.value), 1, existing.ordinality
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(COALESCE(dp.condition_notes::jsonb, '[]'::jsonb)) = 'array'
              THEN COALESCE(dp.condition_notes::jsonb, '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS existing(value, ordinality)
        WHERE lower(btrim(existing.value)) <> lower('${note}')
      ) AS ordered`;

const verification = rollback
  ? String.raw`
  IF EXISTS (
    SELECT 1
    FROM device_passports dp
    JOIN products p ON p.id = dp.product
    JOIN device_details dd ON dd.product = p.id
    WHERE ${targetFilter}
      AND COALESCE(dp.condition_notes::jsonb, '[]'::jsonb) @> jsonb_build_array('${note}'::text)
  ) THEN
    RAISE EXCEPTION 'grade A rollback left the condition note in a published Passport';
  END IF;`
  : String.raw`
  IF EXISTS (
    SELECT 1
    FROM device_passports dp
    JOIN products p ON p.id = dp.product
    JOIN device_details dd ON dd.product = p.id
    WHERE ${targetFilter}
      AND COALESCE(dp.condition_notes::jsonb ->> 0, '') <> '${note}'
  ) THEN
    RAISE EXCEPTION 'published grade A Passport does not start with the approved condition note';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM device_passports dp
    JOIN products p ON p.id = dp.product
    JOIN device_details dd ON dd.product = p.id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(dp.condition_notes::jsonb, '[]'::jsonb)
    ) AS entry(value)
    WHERE ${targetFilter}
      AND lower(btrim(entry.value)) = lower('${note}')
    GROUP BY dp.id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'published grade A Passport contains a duplicate approved condition note';
  END IF;`;

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  target_count integer;
  missing_passport_count integer;
BEGIN
  SELECT count(*) INTO target_count
  FROM products p
  JOIN device_details dd ON dd.product = p.id
  WHERE ${targetFilter};

  IF target_count = 0 THEN
    RAISE EXCEPTION 'no published products with exact grade A were found';
  END IF;

  SELECT count(*) INTO missing_passport_count
  FROM products p
  JOIN device_details dd ON dd.product = p.id
  LEFT JOIN device_passports dp ON dp.product = p.id
  WHERE ${targetFilter}
    AND dp.id IS NULL;

  IF missing_passport_count <> 0 THEN
    RAISE EXCEPTION '% published grade A products do not have a Passport', missing_passport_count;
  END IF;
END $$;

WITH target_passports AS (
  SELECT dp.id, (${desiredNotes}) AS desired_notes
  FROM device_passports dp
  JOIN products p ON p.id = dp.product
  JOIN device_details dd ON dd.product = p.id
  WHERE ${targetFilter}
)
UPDATE device_passports dp
SET condition_notes = target_passports.desired_notes::json,
    updated_at = now()
FROM target_passports
WHERE dp.id = target_passports.id
  AND COALESCE(dp.condition_notes::jsonb, '[]'::jsonb)
      IS DISTINCT FROM target_passports.desired_notes;

DO $$
BEGIN
${verification}
END $$;

${rehearsal ? "ROLLBACK" : "COMMIT"};

SELECT 'grade_a_condition_notes.${rehearsal ? "rehearsal" : rollback ? "rollback" : "apply"}|'
  || count(*)::text
FROM products p
JOIN device_details dd ON dd.product = p.id
WHERE ${targetFilter};
`);
