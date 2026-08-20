#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
BEGIN;
SET client_encoding TO 'UTF8';

-- Keep the project location consistent across global settings and homepage SEO.
UPDATE site_settings
SET city='Северодвинск'
WHERE id=1;

UPDATE site_pages
SET title='I СВОИ — техника и аксессуары в Северодвинске',
    meta_description='Новая техника разных брендов, аксессуары и проверенные б/у устройства в Северодвинске. Реальные фото, диагностика, Passport, гарантия и проверка перед покупкой.'
WHERE slug='home';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_navigation_item(
  p_id uuid,
  p_label varchar,
  p_url varchar,
  p_location varchar,
  p_parent uuid,
  p_sort integer,
  p_link_type varchar,
  p_page_slug varchar,
  p_item_role varchar DEFAULT 'link'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_page uuid;
BEGIN
  IF p_page_slug IS NOT NULL THEN
    SELECT id INTO v_page FROM site_pages WHERE slug=p_page_slug LIMIT 1;
  END IF;

  INSERT INTO navigation_items (
    id,label,label_short,aria_label,url,location,parent,sort,is_active,open_in_new,
    link_type,page,section_anchor,custom_url,item_role,icon
  ) VALUES (
    p_id,p_label,NULL,NULL,p_url,p_location,p_parent,p_sort,true,false,
    p_link_type,v_page,NULL,
    CASE WHEN p_link_type IN ('custom','external') THEN p_url ELSE NULL END,
    p_item_role,NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    label=EXCLUDED.label,
    label_short=NULL,
    aria_label=NULL,
    url=EXCLUDED.url,
    location=EXCLUDED.location,
    parent=EXCLUDED.parent,
    sort=EXCLUDED.sort,
    is_active=true,
    open_in_new=false,
    link_type=EXCLUDED.link_type,
    page=EXCLUDED.page,
    section_anchor=NULL,
    custom_url=EXCLUDED.custom_url,
    item_role=EXCLUDED.item_role,
    icon=NULL;
END $$;

-- Header: five top-level entries and a useful catalog submenu.
SELECT pg_temp.isvoi_navigation_item(
  '3eaf7a0d-13a5-4a0e-a729-518f4c6db201','Каталог','/catalog','header',NULL,1,'page','catalog'
);
SELECT pg_temp.isvoi_navigation_item(
  '4b65c9e1-1f90-4f7d-9f89-3c8b8a001001','Все устройства','/catalog','header',
  '3eaf7a0d-13a5-4a0e-a729-518f4c6db201',1,'page','catalog'
);
SELECT pg_temp.isvoi_navigation_item(
  '8e8217b9-6331-40c3-96f4-a98e8a1a69e4','Техника','/catalog/tech','header',
  '3eaf7a0d-13a5-4a0e-a729-518f4c6db201',2,'custom',NULL
);
SELECT pg_temp.isvoi_navigation_item(
  'afa57d77-9c2f-4b65-9798-7ebe9b5bfdab','Аксессуары','/catalog/accessories','header',
  '3eaf7a0d-13a5-4a0e-a729-518f4c6db201',3,'custom',NULL
);
SELECT pg_temp.isvoi_navigation_item(
  '64cf08a2-06fe-4a34-a6f2-7f264562d543','Магазин в Белгороде','/belgorod','header',NULL,2,'custom',NULL
);
SELECT pg_temp.isvoi_navigation_item(
  '39c1e80f-c497-48ef-8665-1ac2f53ddb85','Как мы проверяем','/passport','header',NULL,3,'page','passport'
);
SELECT pg_temp.isvoi_navigation_item(
  '0cc75f59-e244-458c-86e0-e86b4b31b3b4','Продать или обменять','/trade','header',NULL,4,'page','trade'
);
SELECT pg_temp.isvoi_navigation_item(
  'e2d4a482-55aa-4c98-bd37-0c84bf279d01','Блог','/blog','header',NULL,5,'page','blog'
);

-- Footer: three editorially clear groups with no repeated destinations.
SELECT pg_temp.isvoi_navigation_item(
  '9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8','Покупка','/','footer',NULL,1,'custom',NULL,'group'
);
SELECT pg_temp.isvoi_navigation_item(
  'dd29ad40-2d90-4a92-8143-b8a9d22136ce','Сервисы','/','footer',NULL,2,'custom',NULL,'group'
);
SELECT pg_temp.isvoi_navigation_item(
  '0c0ea292-7eb0-4983-af42-cd78f24d0a4b','I СВОИ','/','footer',NULL,3,'custom',NULL,'group'
);
SELECT pg_temp.isvoi_navigation_item(
  'fc94d8fa-4bbb-44b6-8f30-e5e927fe2b50','Каталог','/catalog','footer',
  '9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8',1,'page','catalog'
);
SELECT pg_temp.isvoi_navigation_item(
  '1d837c49-616e-4562-ae2f-f0dfec3ad32d','Техника','/catalog/tech','footer',
  '9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8',2,'custom',NULL
);
SELECT pg_temp.isvoi_navigation_item(
  '3c7a7c09-b8cc-4c48-b271-d161dca6a73a','Аксессуары','/catalog/accessories','footer',
  '9fc5169f-220f-4ef5-8d47-9f4f6a3be5c8',3,'custom',NULL
);
SELECT pg_temp.isvoi_navigation_item(
  '5a465d6f-8a34-4654-9206-a4656219c5d3','Как мы проверяем','/passport','footer',
  'dd29ad40-2d90-4a92-8143-b8a9d22136ce',1,'page','passport'
);
SELECT pg_temp.isvoi_navigation_item(
  '747f3fb7-3c3e-4477-850d-8b833b7658f5','Продать или обменять','/trade','footer',
  'dd29ad40-2d90-4a92-8143-b8a9d22136ce',2,'page','trade'
);
SELECT pg_temp.isvoi_navigation_item(
  '98310275-35d5-4e2e-a248-5ddf871b68be','Club — пилот','/club','footer',
  'dd29ad40-2d90-4a92-8143-b8a9d22136ce',3,'page','club'
);
SELECT pg_temp.isvoi_navigation_item(
  '5a2a6b8d-73e6-4b15-9dfc-1b91c7f16001','Магазин в Белгороде','/belgorod','footer',
  '0c0ea292-7eb0-4983-af42-cd78f24d0a4b',1,'custom',NULL
);
SELECT pg_temp.isvoi_navigation_item(
  'e2d4a482-55aa-4c98-bd37-0c84bf279d02','Блог','/blog','footer',
  '0c0ea292-7eb0-4983-af42-cd78f24d0a4b',2,'page','blog'
);

-- Remove only known legacy rows. Unknown editor-created rows are left intact.
DELETE FROM navigation_items
WHERE id IN (
  'e6f7327c-f4b2-4888-8ac5-c610f20adfe7','7e56f158-a55e-4a69-8c10-73042aa95d28',
  '72dbe57d-e60b-4144-8c06-d52cdd364629','acce4ec0-50cf-40b1-9d36-403d7c0e9b0c',
  'a6d2b5b2-f459-4560-9eff-0ef046a28990','c4436209-36b4-40c1-896d-b91829d62a0a',
  '2c6f7852-1b74-4858-8c73-455e5f6296ee','34a16a77-bb5a-46bc-bbc7-f7715ab03878',
  '8efba434-4a48-4f9e-94a4-99758ce3bb88','8cd9dd69-dbd6-4a4b-8e1f-b7e73061ed93',
  'ec5de379-bb65-49c9-a6de-c44ad4df5984','2cd0c485-4df5-4fc5-bfd0-b1c12ac5c1b5'
);

-- Native Studio metadata: scenario-first labels and conditional fields.
UPDATE directus_collections
SET icon='menu_open',
    note='Управляемое меню сайта. Начните с представления «Шапка сайта» или «Ссылки подвала». CTA и логотип находятся в «Настройки сайта».',
    display_template='{{label}} · {{location}}',
    sort_field='sort',
    translations='[{"language":"ru-RU","translation":"Меню сайта"}]'::json
WHERE collection='navigation_items';

UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Содержание ссылки"}]'::json,
    note='Текст, назначение и целевая страница.',
    options='{"headerIcon":"link","start":"open"}'::json
WHERE collection='navigation_items' AND field='group_link';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Где показывать"}]'::json,
    note='Область сайта, группа и порядок.',
    options='{"headerIcon":"low_priority","start":"open"}'::json
WHERE collection='navigation_items' AND field='group_placement';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Дополнительно"}]'::json,
    note='Видимость и редкие технические параметры.',
    options='{"headerIcon":"settings","start":"closed"}'::json
WHERE collection='navigation_items' AND field='group_behavior';

UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Текст на сайте"}]'::json,
    note='Основная видимая подпись ссылки. После сохранения она попадает на сайт без frontend-переименований.'
WHERE collection='navigation_items' AND field='label';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Короткий текст"}]'::json,
    note='Необязательно. Если заполнено, шапка покажет этот текст вместо основной подписи.'
WHERE collection='navigation_items' AND field='label_short';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Куда ведёт"}]'::json,
    note='Для управляемой страницы выбирайте «Страница сайта». Произвольный адрес нужен для категорий и внешних ссылок.'
WHERE collection='navigation_items' AND field='link_type';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Страница сайта"}]'::json,
    note='Опубликованная страница Directus.',hidden=true,
    conditions='[{"name":"Тип: страница","rule":{"link_type":{"_eq":"page"}},"hidden":false,"readonly":false,"required":true,"options":{}}]'::json
WHERE collection='navigation_items' AND field='page';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Якорь секции"}]'::json,
    note='ID секции без символа #.',hidden=true,
    conditions='[{"name":"Тип: секция","rule":{"link_type":{"_eq":"section"}},"hidden":false,"readonly":false,"required":true,"options":{}}]'::json
WHERE collection='navigation_items' AND field='section_anchor';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Адрес ссылки"}]'::json,
    note='Например /catalog/tech или https://example.com.',hidden=true,
    conditions='[{"name":"Произвольный или внешний адрес","rule":{"link_type":{"_in":["custom","external"]}},"hidden":false,"readonly":false,"required":true,"options":{}}]'::json
WHERE collection='navigation_items' AND field='custom_url';
UPDATE directus_fields
SET hidden=true,readonly=true,"group"='group_behavior',sort=49,
    note='Служебный fallback. Не редактируется вручную.'
WHERE collection='navigation_items' AND field='url';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Область сайта"}]'::json,
    note='Шапка и подвал основного сайта редактируются отдельно от Club.',
    options='{"choices":[{"text":"Шапка сайта","value":"header","color":"#2563eb"},{"text":"Подвал сайта","value":"footer","color":"#0f766e"},{"text":"Club: шапка","value":"club_header","color":"#047857"},{"text":"Club: подвал","value":"club_footer","color":"#059669"}]}'::json
WHERE collection='navigation_items' AND field='location';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Группа / родитель"}]'::json,
    note='Для вложенной ссылки выберите родительскую группу или пункт меню.'
WHERE collection='navigation_items' AND field='parent';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Вложенные ссылки"}]'::json,
    note='Показывается только у групп и пунктов с подменю.',hidden=true,
    conditions='[{"name":"Группа или пункт с подменю","rule":{"_or":[{"item_role":{"_eq":"group"}},{"id":{"_eq":"3eaf7a0d-13a5-4a0e-a729-518f4c6db201"}}]},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
WHERE collection='navigation_items' AND field='children';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Порядок внутри группы"}]'::json,
    note='Меньшее число выводится раньше.'
WHERE collection='navigation_items' AND field='sort';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Показывать на сайте"}]'::json,
    note='Выключите, чтобы временно скрыть ссылку.'
WHERE collection='navigation_items' AND field='is_active';
UPDATE directus_fields
SET hidden=true,
    conditions='[{"name":"Только внешняя ссылка","rule":{"link_type":{"_eq":"external"}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
WHERE collection='navigation_items' AND field='open_in_new';
UPDATE directus_fields
SET translations='[{"language":"ru-RU","translation":"Тип элемента"}]'::json,
    note='Обычная ссылка или заголовок группы в подвале.',
    options='{"choices":[{"text":"Ссылка","value":"link","color":"#2563eb"},{"text":"Группа","value":"group","color":"#64748b"}]}'::json
WHERE collection='navigation_items' AND field='item_role';
UPDATE directus_fields
SET hidden=true,"group"='group_behavior'
WHERE collection='navigation_items' AND field IN ('aria_label','icon');

CREATE OR REPLACE FUNCTION pg_temp.isvoi_navigation_preset(
  p_role_name varchar,p_bookmark varchar,p_icon varchar,p_color varchar,
  p_filter json,p_fields json,p_sort json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_role uuid;
  v_id integer;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name=p_role_name LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  SELECT id INTO v_id FROM directus_presets
  WHERE role=v_role AND "user" IS NULL AND collection='navigation_items' AND bookmark=p_bookmark
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO directus_presets(
      bookmark,role,"user",collection,search,layout,layout_query,layout_options,
      refresh_interval,filter,icon,color
    ) VALUES (
      p_bookmark,v_role,NULL,'navigation_items',NULL,'tabular',
      json_build_object('tabular',json_build_object('page',1,'fields',p_fields,'sort',p_sort)),
      NULL,NULL,p_filter,p_icon,p_color
    );
  ELSE
    UPDATE directus_presets SET
      search=NULL,layout='tabular',
      layout_query=json_build_object('tabular',json_build_object('page',1,'fields',p_fields,'sort',p_sort)),
      layout_options=NULL,refresh_interval=NULL,filter=p_filter,icon=p_icon,color=p_color
    WHERE id=v_id;
  END IF;
END $$;

DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id AND preset."user" IS NULL AND preset.collection='navigation_items'
  AND role.name IN ('Administrator','ISVOI Editor','ISVOI Advanced Editor')
  AND preset.bookmark IN (
    'Header menu','Header CTA','Footer groups','Footer links','Hidden links','Шапка','Footer',
    'Шапка сайта','Подменю каталога','Группы подвала','Ссылки подвала','Скрытые / архив'
  );

DO $$
DECLARE role_name varchar;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['Administrator','ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_navigation_preset(
      role_name,'Шапка сайта','web_asset','#2563eb',
      '{"_and":[{"location":{"_eq":"header"}},{"parent":{"_null":true}},{"is_active":{"_eq":true}}]}'::json,
      '["sort","label","link_type","page","custom_url"]'::json,'["sort","label"]'::json
    );
    PERFORM pg_temp.isvoi_navigation_preset(
      role_name,'Подменю каталога','account_tree','#0891b2',
      '{"_and":[{"location":{"_eq":"header"}},{"parent":{"_nnull":true}},{"is_active":{"_eq":true}}]}'::json,
      '["parent","sort","label","link_type","page","custom_url"]'::json,'["parent","sort","label"]'::json
    );
    PERFORM pg_temp.isvoi_navigation_preset(
      role_name,'Группы подвала','view_column','#0f766e',
      '{"_and":[{"location":{"_eq":"footer"}},{"item_role":{"_eq":"group"}},{"is_active":{"_eq":true}}]}'::json,
      '["sort","label","children"]'::json,'["sort","label"]'::json
    );
    PERFORM pg_temp.isvoi_navigation_preset(
      role_name,'Ссылки подвала','vertical_align_bottom','#059669',
      '{"_and":[{"location":{"_eq":"footer"}},{"item_role":{"_neq":"group"}},{"is_active":{"_eq":true}}]}'::json,
      '["parent","sort","label","link_type","page","custom_url"]'::json,'["parent","sort","label"]'::json
    );
    PERFORM pg_temp.isvoi_navigation_preset(
      role_name,'Скрытые / архив','visibility_off','#64748b',
      '{"is_active":{"_eq":false}}'::json,
      '["location","parent","sort","label","link_type","custom_url"]'::json,'["location","sort","label"]'::json
    );
  END LOOP;
END $$;

UPDATE directus_presets
SET filter='{"is_active":{"_eq":true}}'::json,
    layout='tabular',
    layout_query='{"tabular":{"page":1,"fields":["location","parent","sort","label","link_type","page","custom_url"],"sort":["location","parent","sort","label"]}}'::json
WHERE collection='navigation_items' AND role IS NULL AND "user" IS NULL AND bookmark IS NULL;

${rollback ? "ROLLBACK;" : "COMMIT;"}
`);
