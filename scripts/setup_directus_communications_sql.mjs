import { readFileSync } from "node:fs";
export const communicationsSql = readFileSync(
  new URL("../packages/communications/schema.sql", import.meta.url),
  "utf8",
);
export const communicationsMetadataSql = `
BEGIN;
INSERT INTO directus_collections(collection,icon,note,hidden,singleton,accountability)
SELECT tablename,'forum','Служебные данные коммуникаций. Изменения через модуль Коммуникации.',true,false,'all'
FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'comm_%'
ON CONFLICT(collection) DO NOTHING;
UPDATE directus_settings
SET module_bar = CASE
 WHEN module_bar IS NULL THEN
  '[{"type":"module","id":"content","enabled":true},{"type":"module","id":"isvoi-inbox","enabled":true},{"type":"module","id":"visual","enabled":false},{"type":"module","id":"users","enabled":true},{"type":"module","id":"files","enabled":true},{"type":"module","id":"insights","enabled":true},{"type":"module","id":"deployments","enabled":false},{"type":"link","id":"docs","enabled":true,"name":"$t:documentation","icon":"help","url":"https://docs.directus.io"},{"type":"module","id":"settings","enabled":true,"locked":true}]'::json
 WHEN NOT module_bar::jsonb @> '[{"type":"module","id":"isvoi-inbox"}]'::jsonb THEN
  (module_bar::jsonb || '[{"type":"module","id":"isvoi-inbox","enabled":true}]'::jsonb)::json
 ELSE (
  SELECT jsonb_agg(
   CASE WHEN item->>'type'='module' AND item->>'id'='isvoi-inbox'
    THEN item || '{"enabled":true}'::jsonb ELSE item END ORDER BY ordinal
  )::json
  FROM jsonb_array_elements(module_bar::jsonb) WITH ORDINALITY AS entries(item,ordinal)
 )
END;
-- No collection permissions are granted: reads and commands use scoped endpoints.
COMMIT;
`;
if (process.argv[1]?.endsWith("setup_directus_communications_sql.mjs"))
  process.stdout.write(communicationsSql + communicationsMetadataSql);
