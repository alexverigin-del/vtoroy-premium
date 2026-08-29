#!/usr/bin/env node
/** Forward-only, idempotent isolation fields and Studio views for protected Trade-in QA. */

const rehearse = process.argv.includes("--rehearse");

const sql = String.raw`\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE trade_quotes ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE trade_events ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS trade_quotes_test_idx ON trade_quotes(is_test,created_at DESC);
CREATE INDEX IF NOT EXISTS trade_events_test_idx ON trade_events(is_test,created_at DESC);
CREATE INDEX IF NOT EXISTS leads_test_idx ON leads(is_test,created_at DESC);

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_qa_field(
  p_collection varchar,p_field varchar,p_sort integer,p_note text,p_group varchar DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface='boolean',display='boolean',width='half',sort=p_sort,
      note=p_note,"group"=p_group,readonly=true,hidden=false
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,interface,display,width,sort,note,"group",readonly,hidden
    ) VALUES (
      p_collection,p_field,'boolean','boolean','half',p_sort,p_note,p_group,true,false
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_trade_qa_field(
  'trade_quotes','is_test',14,'QA-оценка. Не использовать как клиентскую.',NULL
);
SELECT pg_temp.isvoi_trade_qa_field(
  'trade_events','is_test',9,'QA-событие. Исключать из продуктовой воронки.',NULL
);
SELECT pg_temp.isvoi_trade_qa_field(
  'leads','is_test',100,'Тестовая заявка из закрытого Trade-in QA. Не связываться с контактом.','group_system'
);

UPDATE directus_fields field
SET translations=json_build_array(json_build_object('language','ru-RU','translation',labels.label))::json
FROM (VALUES
  ('trade_quotes','is_test','Тестовая оценка'),
  ('trade_events','is_test','Тестовое событие'),
  ('leads','is_test','Тестовая заявка')
) labels(collection,field,label)
WHERE field.collection=labels.collection AND field.field=labels.field;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_append_permission_field(
  p_policy text,p_collection varchar,p_action varchar,p_field text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE directus_permissions permission
  SET fields=CASE
    WHEN permission.fields='*' THEN '*'
    WHEN permission.fields IS NULL OR permission.fields='' THEN p_field
    ELSE permission.fields||','||p_field
  END
  WHERE permission.policy IN(SELECT id FROM directus_policies WHERE name=p_policy)
    AND permission.collection=p_collection AND permission.action=p_action
    AND position(','||p_field||',' IN ','||replace(coalesce(permission.fields,''),' ','')||',')=0;
END $$;

SELECT pg_temp.isvoi_append_permission_field('ISVOI Trade Service','trade_quotes','read','is_test');
SELECT pg_temp.isvoi_append_permission_field('ISVOI Trade Service','trade_quotes','create','is_test');
SELECT pg_temp.isvoi_append_permission_field('ISVOI Trade Service','trade_events','create','is_test');
SELECT pg_temp.isvoi_append_permission_field('ISVOI Trade Service','leads','read','is_test');
SELECT pg_temp.isvoi_append_permission_field('ISVOI Lead Intake','leads','create','is_test');
SELECT pg_temp.isvoi_append_permission_field('ISVOI Lead Intake','leads','read','is_test');

DO $$
DECLARE policy_name text;
BEGIN
  FOREACH policy_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_append_permission_field(policy_name,'trade_quotes','read','is_test');
    PERFORM pg_temp.isvoi_append_permission_field(policy_name,'trade_events','read','is_test');
    PERFORM pg_temp.isvoi_append_permission_field(policy_name,'leads','read','is_test');
  END LOOP;
END $$;

INSERT INTO directus_presets(bookmark,role,"user",collection,layout,layout_query,filter,icon,color)
SELECT 'Trade-in · тестовые заявки',role.id,NULL,'leads','tabular',
  '{"tabular":{"sort":["-created_at"],"fields":["created_at","reference_code","scenario","device","is_test"],"page":1}}'::json,
  '{"_and":[{"kind":{"_eq":"trade"}},{"is_test":{"_eq":true}}]}'::json,
  'science','#946000'
FROM directus_roles role
WHERE role.name IN ('Administrator','ISVOI Editor','ISVOI Advanced Editor')
  AND NOT EXISTS(
    SELECT 1 FROM directus_presets preset
    WHERE preset.role=role.id AND preset."user" IS NULL AND preset.collection='leads'
      AND preset.bookmark='Trade-in · тестовые заявки'
  );

${
  rehearse
    ? "ROLLBACK;\nSELECT 'trade_qa.rehearsal' AS check_name,'rolled_back' AS value;"
    : `COMMIT;

SELECT 'trade_qa.fields' AS check_name,count(*)::text AS value
FROM information_schema.columns
WHERE table_schema='public' AND (table_name,column_name) IN (
  ('trade_quotes','is_test'),('trade_events','is_test'),('leads','is_test')
)
UNION ALL
SELECT 'trade_qa.test_rows',(
  (SELECT count(*) FROM trade_quotes WHERE is_test)+
  (SELECT count(*) FROM trade_events WHERE is_test)+
  (SELECT count(*) FROM leads WHERE is_test)
)::text;`
}
`;

process.stdout.write(sql);
