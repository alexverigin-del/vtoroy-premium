#!/usr/bin/env node
import {
  collectionGroups,
  defaults,
  humanRoles,
  literal as q,
  navigationGroups,
  russianValues,
  sqlJson as j,
  workingLeadOptionsSql,
} from "./lib/studio-ux.mjs";

const rollback = process.argv.includes("--rehearse");
const statements = [
  String.raw`\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';`,
];

for (const [collection, label, icon, parent, sort] of navigationGroups) {
  statements.push(`INSERT INTO directus_collections(collection,icon,note,hidden,singleton,sort,translations,collapse,"group")
VALUES(${q(collection)},${q(icon)},${q(label)},false,false,${sort},${j([{ language: "ru-RU", translation: label }])},'closed',${q(parent)})
ON CONFLICT(collection) DO UPDATE SET icon=EXCLUDED.icon,sort=EXCLUDED.sort,translations=EXCLUDED.translations,collapse='closed',"group"=EXCLUDED."group";`);
}
for (const [collection, parent] of Object.entries(collectionGroups))
  statements.push(
    `UPDATE directus_collections SET "group"=${q(parent)} WHERE collection=${q(collection)};`,
  );

// Defaults supplement personal presets; never delete a user's layout or bookmark.
for (const [collection, config] of Object.entries(defaults)) {
  const query = j({ tabular: { fields: config.fields, sort: config.sort, page: 1 } });
  statements.push(`DO $$ DECLARE role_id uuid; BEGIN
FOR role_id IN SELECT id FROM directus_roles WHERE name IN (${humanRoles.map(q).join(",")}) LOOP
IF EXISTS(SELECT 1 FROM directus_permissions p JOIN directus_access a ON a.policy=p.policy WHERE a.role=role_id AND p.collection=${q(collection)} AND p.action='read')
OR EXISTS(SELECT 1 FROM directus_access a JOIN directus_policies p ON p.id=a.policy WHERE a.role=role_id AND p.admin_access) THEN
UPDATE directus_presets SET layout='tabular',layout_query=${query},filter=${j(config.filter ?? {})},refresh_interval=NULL
WHERE role=role_id AND "user" IS NULL AND bookmark IS NULL AND collection=${q(collection)};
IF NOT FOUND THEN INSERT INTO directus_presets(role,collection,layout,layout_query,filter)
VALUES(role_id,${q(collection)},'tabular',${query},${j(config.filter ?? {})}); END IF;
END IF;
END LOOP; END $$;`);
}

statements.push(`
UPDATE directus_panels SET options=(${workingLeadOptionsSql("options")})::json
WHERE dashboard='f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100' AND options->>'collection'='leads';
UPDATE directus_presets SET filter=(coalesce(filter::jsonb,'{}') || '{"is_test":{"_eq":false}}')::json
WHERE collection='leads' AND "user" IS NULL AND role IN (SELECT id FROM directus_roles WHERE name IN (${humanRoles.map(q).join(",")}))
AND coalesce(bookmark,'') NOT ILIKE '%тест%' AND coalesce(filter::text,'') NOT LIKE '%"is_test"%';

UPDATE directus_presets SET filter='{"pricing_version":{"status":{"_eq":"published"}}}'::json
WHERE collection IN ('trade_condition_rules','trade_device_configs') AND "user" IS NULL AND bookmark IN ('Trade-in · правила оценки','Trade-in · диапазоны');

INSERT INTO directus_presets(role,collection,bookmark,layout,layout_query,filter)
SELECT r.id,'leads','Тестовые заявки','tabular',
 '{"tabular":{"fields":["created_at","kind","status","contact"],"sort":["-created_at"]}}'::json,
 '{"is_test":{"_eq":true}}'::json
FROM directus_roles r WHERE r.name IN ('Administrator','ISVOI Editor','ISVOI Advanced Editor')
AND NOT EXISTS(SELECT 1 FROM directus_presets p WHERE p.role=r.id AND p."user" IS NULL AND p.collection='leads' AND p.bookmark='Тестовые заявки');

-- This redundant view has no filter; the collection default is the same entry point.
DELETE FROM directus_presets WHERE collection='device_passports' AND bookmark='Все паспорта' AND "user" IS NULL
AND coalesce(filter::jsonb,'{}')='{}'::jsonb;

UPDATE directus_collections SET display_template='{{version}}' WHERE collection='trade_pricing_versions';
UPDATE directus_collections SET translations='[{"language":"ru-RU","translation":"Карточки товаров"}]'::json WHERE collection='products';
UPDATE directus_collections SET display_template='{{question_label}} · {{option_label}}' WHERE collection='trade_condition_rules';
UPDATE directus_collections SET display_template='{{product.title}} · {{plan.name}}' WHERE collection='club_offers';
UPDATE directus_collections SET display_template='Настройки Club' WHERE collection='club_page_settings';
UPDATE directus_collections SET display_template='Настройки Trade-in' WHERE collection='trade_settings';
UPDATE directus_fields SET display='related-values',display_options='{"template":"{{version}}"}'::json
WHERE collection IN ('trade_device_configs','trade_condition_rules','trade_settings') AND field IN ('pricing_version','active_pricing_version');

UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Заголовок блока"}]'::json
WHERE collection='page_sections' AND field='headline';
UPDATE directus_fields SET translations=json_build_array(json_build_object('language','ru-RU','translation',CASE field WHEN 'created_at' THEN 'Создано' ELSE 'Обновлено' END))
WHERE collection IN ('trade_pricing_versions','trade_device_configs','trade_condition_rules') AND field IN ('created_at','updated_at');

-- Display labels are separate from the input's choices in Directus.
WITH names(value,label) AS (VALUES ${Object.entries(russianValues)
  .map(([v, l]) => `(${q(v)},${q(l)})`)
  .join(",")})
UPDATE directus_fields f SET display='labels',display_options=jsonb_build_object('choices',(
SELECT jsonb_agg(jsonb_build_object('value',choice->>'value','text',coalesce(n.label,choice->>'text'),'foreground',choice->>'color'))
FROM jsonb_array_elements(f.options::jsonb->'choices') choice LEFT JOIN names n ON n.value=choice->>'value'
))::json
WHERE f.collection NOT LIKE 'directus_%' AND f.interface='select-dropdown'
AND jsonb_typeof(f.options::jsonb->'choices')='array';

UPDATE directus_fields SET options=(coalesce(options::jsonb,'{}') || '{"start":"closed"}')::json
WHERE interface='group-detail' AND collection IN ('site_settings','device_page_settings','club_page_settings','store_locations')
AND field NOT IN ('group_brand','group_publication','group_hero','group_contacts','group_breadcrumbs');
UPDATE directus_fields SET options=(coalesce(options::jsonb,'{}') || '{"start":"closed"}')::json
WHERE collection='site_settings' AND field='group_contacts';
UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Резервные контакты и реквизиты"}]'::json,
note='Для футера приоритет имеют данные выбранного магазина. Эти значения используются как резерв при единственном магазине; также используются глобальными сервисами. Не дублируйте здесь городские правки.'
WHERE collection='site_settings' AND field='group_contacts';
UPDATE directus_fields SET note='Данные выбранного магазина имеют приоритет в футере. Для адреса конкретного города откройте Магазины → Магазины и города.'
WHERE collection='site_settings' AND "group"='group_contacts' AND field<>'privacy_url';

UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Редакторская заметка"}]'::json,
note='Заметка не управляет включением интеграции. Фактическое состояние определяется полем «Статус»; сверяйте заметку с ним после изменения публикации.'
WHERE collection='site_integrations' AND field='notes';

UPDATE directus_settings SET project_descriptor='Сайт, каталог и продажи';
`);
statements.push(rollback ? "ROLLBACK;" : "COMMIT;");
process.stdout.write(statements.join("\n"));
