#!/usr/bin/env node
import { literal as q, sqlJson as j } from "./lib/studio-ux.mjs";
import { pageSectionViewsSql } from "./lib/studio-page-section-views.mjs";

const statements = [
  String.raw`\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION pg_temp.studio_field(
  c text,f text,label text,i text,g text,s integer,opts jsonb DEFAULT '{}',sp text DEFAULT NULL,n text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  UPDATE directus_fields SET interface=i,"group"=g,sort=s,options=opts::json,special=sp,width='full',
    translations=json_build_array(json_build_object('language','ru-RU','translation',label)),
    note=coalesce(n,label),hidden=false,readonly=false
  WHERE collection=c AND field=f;
  IF NOT FOUND THEN
    INSERT INTO directus_fields(collection,field,interface,"group",sort,options,special,width,translations,note,hidden,readonly,required)
    VALUES(c,f,i,g,s,opts::json,sp,'full',json_build_array(json_build_object('language','ru-RU','translation',label)),coalesce(n,label),false,false,false);
  END IF;
END $$;
`,
];

function field(c, f, label, i, g, sort, options = {}, special = null, note = label) {
  statements.push(
    `SELECT pg_temp.studio_field(${[c, f, label, i, g].map(q).join(",")},${sort},${j(options)},${q(special)},${q(note)});`,
  );
}
function group(c, f, label, sort, open = false, parent = null) {
  field(
    c,
    f,
    label,
    "group-detail",
    parent,
    sort,
    { start: open ? "open" : "closed" },
    "alias,no-data,group",
  );
}
function place(c, g, fields) {
  fields.forEach((f, index) =>
    statements.push(
      `UPDATE directus_fields SET "group"=${q(g)},sort=${index + 1} WHERE collection=${q(c)} AND field=${q(f)};`,
    ),
  );
}

// Backfill only when a column is first introduced, never on a repeated setup.
for (const [collection, fieldName, type, source] of [
  [
    "site_pages",
    "editor_label",
    "text",
    `CASE slug WHEN 'home' THEN 'Главная' WHEN 'trade' THEN 'Trade' WHEN 'passport' THEN 'Passport' WHEN 'catalog' THEN 'Каталог' WHEN 'store' THEN 'Магазин (архивная подача)' WHEN 'contacts' THEN 'Контакты (черновик)' WHEN 'club' THEN 'Club' ELSE coalesce(nullif(title,''),slug) END`,
  ],
  [
    "page_sections",
    "editor_label",
    "text",
    `coalesce(nullif(headline,''),nullif(eyebrow,''),section_key)`,
  ],
  [
    "page_sections",
    "editor_note",
    "text",
    `CASE WHEN jsonb_typeof(content::jsonb->'note')='string' THEN content::jsonb->>'note' END`,
  ],
  [
    "page_sections",
    "editor_disclaimer",
    "text",
    `CASE WHEN jsonb_typeof(content::jsonb->'disclaimer')='string' THEN content::jsonb->>'disclaimer' END`,
  ],
  [
    "page_sections",
    "editor_steps",
    "json",
    `CASE WHEN jsonb_typeof(content::jsonb->'steps')='array' THEN content::jsonb->'steps' END`,
  ],
  [
    "page_sections",
    "editor_proof",
    "json",
    `CASE WHEN jsonb_typeof(content::jsonb->'proof')='array' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('text',value) ORDER BY ord) FROM jsonb_array_elements(content::jsonb->'proof') WITH ORDINALITY AS p(value,ord)),'[]'::jsonb) END`,
  ],
]) {
  statements.push(`DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${q(collection)} AND column_name=${q(fieldName)}) THEN
    ALTER TABLE ${collection} ADD COLUMN ${fieldName} ${type};
    UPDATE ${collection} SET ${fieldName}=${source};
  END IF;
END $$;`);
}

group("site_pages", "group_page", "Страница", 1, true);
group("site_pages", "group_workflow", "Блоки страницы", 10, true);
group("site_pages", "group_sections", "Все блоки и порядок", 20);
group("site_pages", "group_seo", "Поисковая выдача и соцсети", 60);
group("site_pages", "group_technical", "Технические настройки", 90);
place("site_pages", "group_technical", ["slug", "template", "id"]);
place("site_pages", "group_page", ["status"]);
field(
  "site_pages",
  "editor_label",
  "Название в Studio",
  "input",
  "group_page",
  2,
  {},
  null,
  "Внутреннее название для поиска. Не меняет H1 и заголовок в поисковой выдаче.",
);
field(
  "site_pages",
  "section_views",
  "Открыть блоки",
  "presentation-links",
  "group_workflow",
  1,
  { links: [] },
  "alias,no-data",
  "Два отдельных списка текущей страницы. Для изменения порядка откройте «Все блоки и порядок».",
);
field(
  "site_pages",
  "sections",
  "Блоки и порядок",
  "list-o2m",
  "group_sections",
  1,
  {
    layout: "table",
    enableCreate: false,
    enableSelect: false,
    enableLink: true,
    enableSearchFilter: true,
    limit: 25,
    fields: ["sort_order", "editor_label", "is_active", "image"],
  },
  "o2m",
  "Блоки принадлежат только этой странице. Добавление чужих блоков отключено. Отключённые записи сохраняются для повторного использования.",
);

group("page_sections", "group_placement", "Блок страницы", 1, true);
group("page_sections", "group_editor_lists", "Примечания и списки", 35);
group("page_sections", "group_technical", "Технические настройки", 100);
place("page_sections", "group_technical", ["id", "page", "section_key", "variant"]);
place("page_sections", "group_placement", ["is_active", "sort_order"]);
field(
  "page_sections",
  "editor_label",
  "Название в Studio",
  "input",
  "group_placement",
  3,
  {},
  null,
  "Внутреннее название блока. Не показывается на сайте; публичный текст редактируется ниже.",
);
field(
  "page_sections",
  "editor_note",
  "Примечание",
  "input-multiline",
  "group_editor_lists",
  1,
  {},
  null,
  "Публичное примечание. Очистка поля убирает примечание с сайта.",
);
field(
  "page_sections",
  "editor_disclaimer",
  "Дисклеймер",
  "input-multiline",
  "group_editor_lists",
  2,
  {},
  null,
  "Публичное уточнение условий. Согласие и юридические тексты формы редактируются отдельно.",
);
const repeaterField = (field, name, required = false) => ({
  field,
  name,
  type: "string",
  meta: { interface: field === "title" ? "input" : "input-multiline", width: "full", required },
});
field(
  "page_sections",
  "editor_steps",
  "Шаги",
  "list",
  "group_editor_lists",
  3,
  {
    template: "{{title}}",
    addLabel: "Добавить шаг",
    fields: [
      repeaterField("title", "Заголовок", true),
      repeaterField("text", "Текст", true),
      repeaterField("note", "Примечание"),
    ],
  },
  "cast-json",
  "Порядок строк соответствует сайту. Удаление всех строк сохраняет пустой список; старые шаги из JSON не восстанавливаются.",
);
field(
  "page_sections",
  "editor_proof",
  "Буллеты",
  "list",
  "group_editor_lists",
  4,
  {
    template: "{{text}}",
    addLabel: "Добавить пункт",
    fields: [repeaterField("text", "Текст", true)],
  },
  "cast-json",
  "Короткие пункты под заголовком. Сохраняйте дословность утверждённых формулировок.",
);

// Native Directus repeaters emit null when the last row is removed.
for (const [f, key] of [
  ["editor_note", "note"],
  ["editor_disclaimer", "disclaimer"],
  ["editor_steps", "steps"],
  ["editor_proof", "proof"],
]) {
  statements.push(`UPDATE directus_fields SET conditions=jsonb_build_array(jsonb_build_object(
    'name','Не используется этим блоком','hidden',true,'rule',jsonb_build_object('_and',jsonb_build_array(
      jsonb_build_object(${q(f)},jsonb_build_object('_null',true)),
      jsonb_build_object('section_key',jsonb_build_object('_nin',coalesce((SELECT jsonb_agg(DISTINCT section_key) FROM page_sections WHERE content::jsonb ? ${q(key)} OR ${f} IS NOT NULL),'[]'::jsonb)))
    ))))::json WHERE collection='page_sections' AND field=${q(f)};`);
}
statements.push(`CREATE OR REPLACE FUNCTION isvoi_normalize_editor_clear() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (to_jsonb(NEW)->TG_ARGV[0]) IS NULL OR (to_jsonb(NEW)->TG_ARGV[0])='null'::jsonb THEN
    NEW := jsonb_populate_record(NEW,jsonb_build_object(TG_ARGV[0],TG_ARGV[1]::jsonb));
  END IF;
  RETURN NEW;
END $$;`);
for (const [f, empty] of [
  ["editor_note", '""'],
  ["editor_disclaimer", '""'],
  ["editor_steps", "[]"],
  ["editor_proof", "[]"],
]) {
  statements.push(
    `CREATE OR REPLACE TRIGGER ${f}_clear BEFORE UPDATE OF ${f} ON page_sections FOR EACH ROW EXECUTE FUNCTION isvoi_normalize_editor_clear(${q(f)},${q(empty)});`,
  );
}

statements.push(`
UPDATE directus_collections SET display_template='{{editor_label}}' WHERE collection IN ('site_pages','page_sections');
UPDATE directus_fields SET required=true WHERE collection IN ('site_pages','page_sections') AND field='editor_label';
UPDATE directus_fields SET readonly=true WHERE collection='page_sections' AND field IN ('id','page','section_key','variant');
UPDATE directus_fields SET options='{"toolbar":["bold","italic","bullist","numlist","blockquote","link","removeformat"]}'::json
WHERE collection='page_sections' AND field IN ('body','closing_body');
UPDATE directus_fields SET note='Остальные параметры блока. Примечание, дисклеймер, шаги и буллеты редактируйте в группе «Примечания и списки»: заполненные отдельные поля имеют приоритет над JSON.'
WHERE collection='page_sections' AND field='content';
UPDATE directus_presets SET layout_query=jsonb_set(coalesce(layout_query::jsonb,'{}'),'{tabular}',
  coalesce(layout_query::jsonb->'tabular','{}') || '{"fields":["editor_label","status","slug"]}')::json
WHERE collection='site_pages' AND "user" IS NULL AND bookmark IS NULL;
UPDATE directus_presets SET layout_query=jsonb_set(coalesce(layout_query::jsonb,'{}'),'{tabular}',
  coalesce(layout_query::jsonb->'tabular','{}') || '{"fields":["sort_order","editor_label","is_active","image"]}')::json
WHERE collection='page_sections' AND "user" IS NULL;
`);

group("trade_pricing_versions", "group_version", "Версия цен", 1, true);
group("trade_pricing_versions", "group_ranges", "Диапазоны цен", 20, true);
group("trade_pricing_versions", "group_rules", "Вопросы и поправки", 30, true);
group("trade_pricing_versions", "group_technical", "История и служебные данные", 90);
place("trade_pricing_versions", "group_version", ["version", "status", "change_reason"]);
place("trade_pricing_versions", "group_technical", [
  "published_at",
  "published_by",
  "id",
  "created_at",
  "updated_at",
]);
for (const [c, alias, label, groupName, fields] of [
  [
    "trade_device_configs",
    "price_ranges",
    "Диапазоны цен",
    "group_ranges",
    ["device_model", "storage", "base_min", "base_max", "status"],
  ],
  [
    "trade_condition_rules",
    "condition_rules",
    "Вопросы, ответы и поправки",
    "group_rules",
    ["question_label", "option_label", "delta_min", "delta_max", "status"],
  ],
]) {
  field(
    "trade_pricing_versions",
    alias,
    label,
    "list-o2m",
    groupName,
    1,
    {
      layout: "table",
      enableCreate: true,
      enableSelect: false,
      enableLink: true,
      enableSearchFilter: true,
      limit: 10,
      fields,
    },
    "o2m",
    `${label} только этой версии. Существующие записи других версий не присоединяются.`,
  );
  statements.push(`DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM directus_relations WHERE many_collection=${q(c)} AND many_field='pricing_version' AND one_collection='trade_pricing_versions') THEN
  RAISE EXCEPTION 'Missing pricing-version relation: ${c}';
END IF;
UPDATE directus_relations SET one_field=${q(alias)} WHERE many_collection=${q(c)} AND many_field='pricing_version' AND one_collection='trade_pricing_versions';
END $$;`);
}
group("trade_condition_rules", "group_question", "Вопрос и ответ", 1, true);
group("trade_condition_rules", "group_adjustment", "Поправка и допуск", 20, true);
group("trade_condition_rules", "group_technical", "Технические настройки", 90);
place("trade_condition_rules", "group_question", [
  "status",
  "question_label",
  "question_help",
  "option_label",
  "pricing_version",
]);
place("trade_condition_rules", "group_adjustment", [
  "delta_min",
  "delta_max",
  "factor_label",
  "factor_type",
  "manual_evaluation",
  "safety_stop",
]);
place("trade_condition_rules", "group_technical", [
  "question_key",
  "option_value",
  "question_sort",
  "option_sort",
  "id",
  "created_at",
  "updated_at",
]);

for (const [g, label, sort, fields] of [
  [
    "group_banner",
    "Баннер",
    1,
    ["banner_title", "banner_body", "accept_all_label", "reject_optional_label", "customize_label"],
  ],
  [
    "group_dialog",
    "Окно настроек",
    20,
    [
      "settings_title",
      "settings_body",
      "save_label",
      "close_label",
      "footer_link_label",
      "privacy_link_label",
    ],
  ],
  [
    "group_categories",
    "Категории согласия",
    40,
    [
      "necessary_label",
      "necessary_description",
      "analytics_label",
      "analytics_description",
      "marketing_label",
      "marketing_description",
      "support_label",
      "support_description",
    ],
  ],
  ["group_lifetime", "Версия и срок действия", 60, ["version", "retention_days"]],
  ["group_technical", "Служебные данные", 90, ["id", "user_updated", "date_updated"]],
]) {
  group("integration_consent_settings", g, label, sort, g === "group_banner");
  place("integration_consent_settings", g, fields);
}
statements.push(`
UPDATE directus_fields SET readonly=true WHERE collection='integration_consent_settings' AND "group"='group_technical';
UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Фактические контакты магазина"}]'::json,
 note='Адрес, контакты и часы этого города. Эти данные используются городской страницей и футером выбранного магазина.'
WHERE collection='store_locations' AND field='group_contacts';
UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Оформление городской страницы"}]'::json
WHERE collection='store_locations' AND field='group_content';
UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Продавец и реквизиты города"}]'::json
WHERE collection='store_locations' AND field='group_legal';
`);

// Only additive field access. Existing row filters, validations and policy membership stay unchanged.
statements.push(`
UPDATE directus_permissions p SET fields=(
 SELECT string_agg(DISTINCT value,',' ORDER BY value) FROM unnest(string_to_array(p.fields,',') || ARRAY['editor_note','editor_disclaimer','editor_steps','editor_proof']) value
) WHERE p.collection='page_sections' AND p.action='read' AND p.fields<>'*' AND 'content'=ANY(string_to_array(p.fields,','));

UPDATE directus_permissions p SET fields=(
 SELECT string_agg(DISTINCT value,',' ORDER BY value) FROM unnest(string_to_array(p.fields,',') || ARRAY['editor_label','editor_note','editor_disclaimer','editor_steps','editor_proof','group_editor_lists','group_technical']) value
) WHERE p.collection='page_sections' AND p.action IN ('read','update') AND p.fields<>'*'
AND p.policy IN (SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor','ISVOI Advanced Editor'));

UPDATE directus_permissions p SET fields=(
 SELECT string_agg(DISTINCT value,',' ORDER BY value) FROM unnest(string_to_array(p.fields,',') || ARRAY['editor_label','section_views','group_workflow','group_technical']) value
) WHERE p.collection='site_pages' AND p.action IN ('read','update') AND p.fields<>'*'
AND p.policy IN (SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor','ISVOI Advanced Editor'));

UPDATE directus_permissions p SET fields=(
 SELECT string_agg(DISTINCT value,',' ORDER BY value) FROM unnest(string_to_array(p.fields,',') || ARRAY(
   SELECT field FROM directus_fields f WHERE f.collection=p.collection AND f.interface='group-detail'
 )) value
) WHERE p.collection IN ('trade_pricing_versions','trade_condition_rules','integration_consent_settings') AND p.action IN ('read','create','update') AND p.fields<>'*'
AND p.policy IN (SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor','ISVOI Advanced Editor'));

UPDATE directus_permissions p SET fields=(
 SELECT string_agg(DISTINCT value,',' ORDER BY value) FROM unnest(string_to_array(p.fields,',') || ARRAY['price_ranges','condition_rules']) value
) WHERE p.collection='trade_pricing_versions' AND p.action IN ('read','create','update') AND p.fields<>'*'
AND p.policy IN (SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor','ISVOI Advanced Editor'));

CREATE OR REPLACE FUNCTION isvoi_valid_editor_steps(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN value IS NULL OR value='null'::jsonb THEN true WHEN jsonb_typeof(value)<>'array' THEN false ELSE NOT EXISTS (
 SELECT 1 FROM jsonb_array_elements(value) item WHERE jsonb_typeof(item)<>'object'
 OR jsonb_typeof(item->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'text') IS DISTINCT FROM 'string'
 OR (item ? 'note' AND jsonb_typeof(item->'note') NOT IN ('string','null'))
 ) END;
$$;
CREATE OR REPLACE FUNCTION isvoi_valid_editor_proof(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN value IS NULL OR value='null'::jsonb THEN true WHEN jsonb_typeof(value)<>'array' THEN false ELSE NOT EXISTS (
 SELECT 1 FROM jsonb_array_elements(value) item WHERE jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'text') IS DISTINCT FROM 'string'
 ) END;
$$;
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='page_sections_editor_steps_valid' AND conrelid='page_sections'::regclass) THEN
 ALTER TABLE page_sections ADD CONSTRAINT page_sections_editor_steps_valid CHECK(isvoi_valid_editor_steps(editor_steps::jsonb));
END IF;
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='page_sections_editor_proof_valid' AND conrelid='page_sections'::regclass) THEN
 ALTER TABLE page_sections ADD CONSTRAINT page_sections_editor_proof_valid CHECK(isvoi_valid_editor_proof(editor_proof::jsonb));
END IF;
END $$;
`);
statements.push(pageSectionViewsSql);
statements.push(process.argv.includes("--rehearse") ? "ROLLBACK;" : "COMMIT;");
process.stdout.write(statements.join("\n"));
