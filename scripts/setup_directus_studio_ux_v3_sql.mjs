#!/usr/bin/env node
/**
 * Native-first Studio UX v3.
 *
 * This idempotent metadata migration keeps business rows unchanged. It groups
 * the multicity workflow, restores Club context in leads, aligns navigation
 * validation with Studio choices and replaces bookmark sprawl with compact
 * role-parity views.
 */

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
BEGIN;
SET client_encoding TO 'UTF8';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_ux_group(
  p_collection varchar,p_field varchar,p_translation text,p_icon varchar,
  p_sort integer,p_start varchar DEFAULT 'closed',p_hidden boolean DEFAULT false,
  p_conditions json DEFAULT NULL,p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface='group-detail',special='alias,no-data,group',
      options=json_build_object('headerIcon',p_icon,'start',p_start),width='full',
      sort=p_sort,hidden=p_hidden,readonly=false,required=false,conditions=p_conditions,
      note=p_note,
      translations=json_build_array(json_build_object('language','ru-RU','translation',p_translation))
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,special,interface,options,width,sort,hidden,readonly,required,
      conditions,note,translations
    ) VALUES (
      p_collection,p_field,'alias,no-data,group','group-detail',
      json_build_object('headerIcon',p_icon,'start',p_start),'full',p_sort,p_hidden,
      false,false,p_conditions,p_note,
      json_build_array(json_build_object('language','ru-RU','translation',p_translation))
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_ux_field(
  p_collection varchar,p_field varchar,p_group varchar,p_sort integer,
  p_width varchar DEFAULT 'full',p_hidden boolean DEFAULT false,
  p_conditions json DEFAULT NULL,p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE directus_fields SET "group"=p_group,sort=p_sort,width=p_width,
    hidden=p_hidden,conditions=p_conditions,note=COALESCE(p_note,note)
  WHERE collection=p_collection AND field=p_field;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_append_permission_fields(
  p_policy text,p_collection varchar,p_action varchar,p_fields text[]
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY p_fields LOOP
    UPDATE directus_permissions permission
    SET fields=permission.fields || ',' || field_name
    FROM directus_policies policy
    WHERE permission.policy=policy.id AND policy.name=p_policy
      AND permission.collection=p_collection AND permission.action=p_action
      AND permission.fields IS NOT NULL AND permission.fields<>'*'
      AND NOT (field_name=ANY(string_to_array(permission.fields,',')));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_ux_preset(
  p_role varchar,p_collection varchar,p_bookmark varchar,p_icon varchar,p_color varchar,
  p_filter json,p_fields json,p_sort json,p_refresh integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE role_id uuid;
BEGIN
  SELECT id INTO role_id FROM directus_roles WHERE name=p_role LIMIT 1;
  IF role_id IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM directus_presets
    WHERE role=role_id AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL
  ) THEN
    UPDATE directus_presets SET icon=p_icon,color=p_color,filter=p_filter,layout='tabular',
      layout_query=json_build_object('tabular',json_build_object(
        'sort',p_sort,'fields',p_fields,'page',1
      )),refresh_interval=p_refresh
    WHERE role=role_id AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets(
      role,"user",collection,bookmark,icon,color,filter,layout,layout_query,refresh_interval
    ) VALUES (
      role_id,NULL,p_collection,p_bookmark,p_icon,p_color,p_filter,'tabular',
      json_build_object('tabular',json_build_object('sort',p_sort,'fields',p_fields,'page',1)),
      p_refresh
    );
  END IF;
END $$;

-- One scenario-first section for stores, availability and delivery.
INSERT INTO directus_collections(
  collection,icon,note,hidden,singleton,sort,translations,collapse
) VALUES (
  'isvoi_locations','storefront',
  'Магазины, локальные цены, остатки и способы получения. Начните с магазина или представления «Требуют внимания».',
  false,false,25,
  '[{"language":"ru-RU","translation":"Магазины, адреса и наличие"}]'::json,'open'
)
ON CONFLICT (collection) DO UPDATE SET
  icon=EXCLUDED.icon,note=EXCLUDED.note,hidden=false,singleton=false,sort=EXCLUDED.sort,
  translations=EXCLUDED.translations,collapse='open';

UPDATE directus_collections SET "group"='isvoi_locations',sort=10
WHERE collection='store_locations';
UPDATE directus_collections SET "group"='isvoi_locations',sort=20
WHERE collection='product_offers';
UPDATE directus_collections SET "group"='isvoi_locations',sort=30,hidden=true
WHERE collection='store_location_images';

UPDATE directus_collections
SET note='Города и магазины сети. Заполните контакты, способы получения и контент страницы; предложения редактируются внутри магазина или через отдельную очередь.'
WHERE collection='store_locations';
UPDATE directus_collections
SET note='Цена, остаток и получение товара в конкретном магазине. Для ежедневной работы используйте представления «Требуют внимания» и «В наличии».'
WHERE collection='product_offers';

-- Store form.
SELECT pg_temp.isvoi_ux_group('store_locations','group_publication','Публикация и город','fact_check',1,'open',false,NULL,'Статус, адрес страницы и порядок города.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_contacts','Адрес и контакты','contact_phone',20,'open',false,NULL,'Фактический адрес и проверенные способы связи.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_legal','Реквизиты продавца','gavel',30,'closed',false,NULL,'Юридическое лицо или ИП, которое продаёт товары в этой точке.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_fulfillment','Получение заказов','local_shipping',40,'closed',false,NULL,'Самовывоз, локальная и межгородская доставка.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_content','Страница города и SEO','web_asset',60,'closed',false,NULL,'Первый экран, фотография и поисковые метаданные.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_relations','Фотографии и предложения','photo_library',80,'closed',false,NULL,'Связанные фотографии магазина и товарные предложения.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_system','Системные данные','settings',100,'closed',false,NULL,'Автоматические даты.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_city_hero','Первый экран','web_asset',1,'open',false,NULL,'Заголовок, изображение и подписи переходов городской страницы.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_city_contact_card','Карточка контактов','contact_phone',2,'closed',false,NULL,'Публичные подписи карточки магазина.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_city_catalog','Каталог города','storefront',3,'open',false,NULL,'Eyebrow, тексты, кнопка и пустое состояние локального каталога.');
SELECT pg_temp.isvoi_ux_group('store_locations','group_city_seo','SEO','search',4,'closed',false,NULL,'Поисковые метаданные городской страницы.');
UPDATE directus_fields SET "group"='group_content'
WHERE collection='store_locations'
  AND field IN ('group_city_hero','group_city_contact_card','group_city_catalog','group_city_seo');

SELECT pg_temp.isvoi_ux_field('store_locations','status','group_publication',1,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','slug','group_publication',2,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','name','group_publication',3,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','city','group_publication',4,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','region','group_publication',5,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','sort','group_publication',6,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','address','group_contacts',1,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','phone','group_contacts',2,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','telegram','group_contacts',3,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','email','group_contacts',4,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','business_hours','group_contacts',5,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','map_url','group_contacts',6,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','latitude','group_contacts',7,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','longitude','group_contacts',8,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','footer_eyebrow','group_contacts',9,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','legal_name','group_legal',1,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','inn','group_legal',2,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','ogrn','group_legal',3,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','legal_address','group_legal',4,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','pickup_enabled','group_fulfillment',1,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','local_delivery_enabled','group_fulfillment',2,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','intercity_delivery_enabled','group_fulfillment',3,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','hero_file','group_city_hero',1,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','hero_eyebrow','group_city_hero',2,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','hero_title','group_city_hero',3,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','hero_body','group_city_hero',4,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','hero_primary_cta_label','group_city_hero',5,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','hero_secondary_cta_label','group_city_hero',6,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_eyebrow','group_city_contact_card',1,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_address_label','group_city_contact_card',2,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_hours_label','group_city_contact_card',3,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_address_fallback','group_city_contact_card',4,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_hours_fallback','group_city_contact_card',5,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_phone_label','group_city_contact_card',6,'third');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_telegram_label','group_city_contact_card',7,'third');
SELECT pg_temp.isvoi_ux_field('store_locations','contact_map_label','group_city_contact_card',8,'third');
SELECT pg_temp.isvoi_ux_field('store_locations','catalog_eyebrow','group_city_catalog',1,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','catalog_title','group_city_catalog',2,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','catalog_body','group_city_catalog',3,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','catalog_cta_label','group_city_catalog',4,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','catalog_empty_title','group_city_catalog',5,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','catalog_empty_body','group_city_catalog',6,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','seo_title','group_city_seo',1,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','meta_description','group_city_seo',2,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','images','group_relations',1,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','offers','group_relations',2,'full');
SELECT pg_temp.isvoi_ux_field('store_locations','created_at','group_system',1,'half');
SELECT pg_temp.isvoi_ux_field('store_locations','updated_at','group_system',2,'half');

-- Offer form.
SELECT pg_temp.isvoi_ux_group('product_offers','group_identity','Товар и магазин','storefront',1,'open',false,NULL,'Товар, исполняющий магазин и публичный статус предложения.');
SELECT pg_temp.isvoi_ux_group('product_offers','group_stock','Цена и остаток','payments',20,'open',false,NULL,'Локальная цена, остаток и сценарий продажи.');
SELECT pg_temp.isvoi_ux_group('product_offers','group_fulfillment','Получение и доставка','local_shipping',40,'closed',false,NULL,'Доступные способы получения и публичные сроки.');
SELECT pg_temp.isvoi_ux_group('product_offers','group_payment','Оплата','account_balance_wallet',60,'closed',false,NULL,'Платёжные способы после фактического подключения.');
SELECT pg_temp.isvoi_ux_group('product_offers','group_source','Источник остатка','sync',80,'closed',false,NULL,'Источник синхронизации и внешний идентификатор.');
SELECT pg_temp.isvoi_ux_group('product_offers','group_system','Системные данные','settings',100,'closed',false,NULL,'Автоматические даты.');

SELECT pg_temp.isvoi_ux_field('product_offers','product','group_identity',1,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','location','group_identity',2,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','local_sku','group_identity',3,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','status','group_identity',4,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','price','group_stock',1,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','price_text','group_stock',2,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','stock_quantity','group_stock',3,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','stock_status','group_stock',4,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','sale_mode','group_stock',5,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','pickup_enabled','group_fulfillment',1,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','local_delivery_enabled','group_fulfillment',2,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','intercity_delivery_enabled','group_fulfillment',3,'half');
SELECT pg_temp.isvoi_ux_field(
  'product_offers','preparation_days','group_fulfillment',4,'half',true,
  '[{"name":"Есть самовывоз или локальная доставка","rule":{"_or":[{"pickup_enabled":{"_eq":true}},{"local_delivery_enabled":{"_eq":true}}]},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
);
SELECT pg_temp.isvoi_ux_field(
  'product_offers','delivery_estimate','group_fulfillment',5,'full',true,
  '[{"name":"Есть доставка","rule":{"_or":[{"local_delivery_enabled":{"_eq":true}},{"intercity_delivery_enabled":{"_eq":true}}]},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
);
SELECT pg_temp.isvoi_ux_field('product_offers','yandex_pay_enabled','group_payment',1,'half');
SELECT pg_temp.isvoi_ux_field(
  'product_offers','yandex_split_enabled','group_payment',2,'half',true,
  '[{"name":"Яндекс Пэй включён","rule":{"yandex_pay_enabled":{"_eq":true}},"hidden":false,"readonly":false,"required":true,"options":{}}]'::json
);
SELECT pg_temp.isvoi_ux_field('product_offers','source_system','group_source',1,'half');
SELECT pg_temp.isvoi_ux_field(
  'product_offers','source_id','group_source',2,'half',true,
  '[{"name":"Указан источник","rule":{"source_system":{"_nempty":true}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json
);
SELECT pg_temp.isvoi_ux_field('product_offers','created_at','group_system',1,'half');
SELECT pg_temp.isvoi_ux_field('product_offers','updated_at','group_system',2,'half');

-- Club context belongs to its own conditional group in lead processing.
SELECT pg_temp.isvoi_ux_group(
  'leads','group_context','Контекст Club','workspace_premium',50,'closed',true,
  '[{"name":"Заявка Club","rule":{"kind":{"_eq":"club"}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json,
  'Выбранное предложение, тариф, срок, бюджет и зафиксированное согласие.'
);
SELECT pg_temp.isvoi_ux_field('leads','club_offer','group_context',1,'half');
SELECT pg_temp.isvoi_ux_field('leads','club_plan','group_context',2,'half');
SELECT pg_temp.isvoi_ux_field('leads','club_term_months','group_context',3,'half');
SELECT pg_temp.isvoi_ux_field('leads','club_budget_text','group_context',4,'half');
SELECT pg_temp.isvoi_ux_field('leads','club_device_request','group_context',5,'full');
SELECT pg_temp.isvoi_ux_field('leads','club_consent_version','group_context',6,'half');
SELECT pg_temp.isvoi_ux_field('leads','club_consent_at','group_context',7,'half');

-- Split the oversized Club story group without changing content fields.
SELECT pg_temp.isvoi_ux_group('club_page_settings','group_story','Сценарии завершения','route',4,'closed',false,NULL,'Продлить, сменить, выкупить или вернуть устройство.');
SELECT pg_temp.isvoi_ux_group('club_page_settings','group_passport','Passport цикла','verified_user',5,'closed',false,NULL,'Передача, возврат и проверяемая история устройства.');
SELECT pg_temp.isvoi_ux_group('club_page_settings','group_plans','Тарифы','badge',6,'closed',false,NULL,'Заголовки блока тарифов.');
SELECT pg_temp.isvoi_ux_group('club_page_settings','group_rules','Правила','rule',7,'closed',false,NULL,'Заголовки публичных правил Club.');
SELECT pg_temp.isvoi_ux_group('club_page_settings','group_participation','Участие в пилоте','how_to_reg',8,'closed',false,NULL,'Порядок участия и пояснение пилота.');
SELECT pg_temp.isvoi_ux_group('club_page_settings','group_final','Финальный CTA','ads_click',11,'closed',false,NULL,'Финальный переход к форме расчёта.');
UPDATE directus_fields SET sort=9 WHERE collection='club_page_settings' AND field='group_legal';
UPDATE directus_fields SET sort=10 WHERE collection='club_page_settings' AND field='group_form';
UPDATE directus_fields SET sort=12 WHERE collection='club_page_settings' AND field='group_advanced';

SELECT pg_temp.isvoi_ux_field('club_page_settings','cycle_eyebrow','group_story',1,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','cycle_title','group_story',2,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','cycle_body','group_story',3,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','passport_eyebrow','group_passport',1,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','passport_title','group_passport',2,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','passport_body','group_passport',3,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','plans_eyebrow','group_plans',1,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','plans_title','group_plans',2,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','rules_eyebrow','group_rules',1,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','rules_title','group_rules',2,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','participation_eyebrow','group_participation',1,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','participation_title','group_participation',2,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','participation_body','group_participation',3,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','final_eyebrow','group_final',1,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','final_title','group_final',2,'full');
SELECT pg_temp.isvoi_ux_field('club_page_settings','final_body','group_final',3,'full');

-- Group aliases must be readable for Studio forms.
DO $$ DECLARE policy_name text; BEGIN
  FOREACH policy_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_append_permission_fields(policy_name,'store_locations','read',ARRAY[
      'group_publication','group_contacts','group_legal','group_fulfillment','group_content',
      'group_city_hero','group_city_contact_card','group_city_catalog','group_city_seo',
      'group_relations','group_system'
    ]);
    PERFORM pg_temp.isvoi_append_permission_fields(policy_name,'product_offers','read',ARRAY[
      'group_identity','group_stock','group_fulfillment','group_payment','group_source','group_system'
    ]);
    PERFORM pg_temp.isvoi_append_permission_fields(policy_name,'leads','read',ARRAY['group_context']);
    PERFORM pg_temp.isvoi_append_permission_fields(policy_name,'club_page_settings','read',ARRAY[
      'group_passport','group_plans','group_rules','group_participation','group_final'
    ]);
  END LOOP;
END $$;

-- Safe defaults improve create UX without widening permissions.
UPDATE directus_permissions permission SET presets=(COALESCE(permission.presets,'{}'::json)::jsonb ||
  '{"status":"draft","pickup_enabled":false,"local_delivery_enabled":false,"intercity_delivery_enabled":false,"sort":100}'::jsonb)::json
FROM directus_policies policy
WHERE permission.policy=policy.id AND policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.collection='store_locations' AND permission.action='create';

UPDATE directus_permissions permission SET presets=(COALESCE(permission.presets,'{}'::json)::jsonb ||
  '{"status":"draft","price":0,"stock_quantity":0,"stock_status":"hidden","sale_mode":"reservation","pickup_enabled":false,"local_delivery_enabled":false,"intercity_delivery_enabled":false,"yandex_pay_enabled":false,"yandex_split_enabled":false,"source_system":"manual"}'::jsonb)::json
FROM directus_policies policy
WHERE permission.policy=policy.id AND policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.collection='product_offers' AND permission.action='create';

-- Studio choices and permission validation now use the same locations/roles.
UPDATE directus_permissions permission SET validation=CASE permission.action
  WHEN 'create' THEN '{"label":{"_nnull":true},"link_type":{"_in":["page","section","external","custom"]},"location":{"_in":["header","footer","club_header","club_footer"]},"item_role":{"_in":["link","group"]}}'::json
  ELSE '{"link_type":{"_in":["page","section","external","custom"]},"location":{"_in":["header","footer","club_header","club_footer"]},"item_role":{"_in":["link","group"]}}'::json
END
FROM directus_policies policy
WHERE permission.policy=policy.id AND policy.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND permission.collection='navigation_items' AND permission.action IN ('create','update');

-- Replace role bookmark sprawl only; user-specific views remain untouched.
DELETE FROM directus_presets preset USING directus_roles role
WHERE preset.role=role.id AND role.name IN ('ISVOI Editor','ISVOI Advanced Editor')
  AND preset."user" IS NULL
  AND preset.collection IN ('products','leads','product_offers','store_locations')
  AND preset.bookmark IS NOT NULL;

DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Требует заполнения','edit_note','#d97706',
      '{"content_status":{"_in":["needs_content","needs_photo"]}}',
      '["title","sku","product_type","condition","content_status","updated_at"]','["sort","title"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Нужен Passport или диагностика','verified_user','#dc2626',
      '{"_and":[{"product_type":{"_eq":"device"}},{"condition":{"_eq":"used"}},{"passport":{"_none":{}}}]}',
      '["title","sku","condition","content_status","status"]','["sort","title"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Готово к проверке','fact_check','#2563eb',
      '{"content_status":{"_eq":"review"}}',
      '["title","sku","product_type","content_status","status","updated_at"]','["sort","title"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Опубликовано','public','#059669',
      '{"status":{"_eq":"published"}}',
      '["title","sku","product_type","stock_status","offers","updated_at"]','["sort","title"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Продано или скрыто','visibility_off','#64748b',
      '{"stock_status":{"_in":["sold","hidden"]}}',
      '["title","sku","stock_status","status","content_status","updated_at"]','["-updated_at"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Техника','devices','#2563eb',
      '{"product_type":{"_eq":"device"}}','["title","sku","condition","status","content_status","offers"]','["sort","title"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Аксессуары','cable','#7c3aed',
      '{"product_type":{"_eq":"accessory"}}','["title","sku","brand","category","status","content_status"]','["sort","title"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'products','Аксессуары без совместимости','link_off','#d97706',
      '{"_and":[{"product_type":{"_eq":"accessory"}},{"accessory_details":{"compatibility_mode":{"_eq":"model_specific"}}},{"compatible_models":{"_none":{}}}]}',
      '["title","sku","brand","category","content_status","status"]','["sort","title"]');

    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Обработка заявок','fact_check','#2563eb',
      '{"status":{"_in":["new","in_progress","waiting"]}}',
      '["created_at","status","priority","contact","kind","product","assigned_to","next_action_at"]','["-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Новые заявки','mark_email_unread','#059669',
      '{"status":{"_eq":"new"}}','["created_at","contact","kind","product","source_path"]','["-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','В работе','pending_actions','#d97706',
      '{"status":{"_in":["in_progress","waiting"]}}','["created_at","status","contact","assigned_to","next_action_at"]','["next_action_at","-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Просрочены','schedule','#dc2626',
      '{"_and":[{"status":{"_in":["new","in_progress","waiting"]}},{"next_action_at":{"_lt":"$NOW"}}]}',
      '["next_action_at","status","priority","contact","assigned_to","kind"]','["next_action_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Без ответственного','person_off','#dc2626',
      '{"_and":[{"status":{"_in":["new","in_progress","waiting"]}},{"assigned_to":{"_null":true}}]}',
      '["created_at","status","priority","contact","kind","source_path"]','["-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Club: новые','workspace_premium','#2563eb',
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_eq":"new"}}]}',
      '["created_at","contact","club_device_request","club_offer","club_plan","club_term_months","status","assigned_to"]','["-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Club: без ответственного','person_off','#dc2626',
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_in":["new","in_progress","waiting"]}},{"assigned_to":{"_null":true}}]}',
      '["created_at","status","contact","club_device_request","club_offer","club_plan","next_action_at"]','["-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Club: расчёт отправлен','send','#d97706',
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_eq":"waiting"}}]}',
      '["created_at","status","contact","club_device_request","club_offer","club_plan","assigned_to","next_action_at"]','["-created_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Club: просрочен SLA','event_busy','#dc2626',
      '{"_and":[{"kind":{"_eq":"club"}},{"status":{"_in":["in_progress","waiting"]}},{"next_action_at":{"_lt":"$NOW"}}]}',
      '["next_action_at","created_at","status","contact","club_device_request","club_offer","club_plan","assigned_to"]','["next_action_at"]',60);
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Блог: заявки','article','#2563eb',
      '{"_and":[{"_or":[{"utm_source":{"_eq":"blog"}},{"source_url":{"_contains":"utm_source=blog"}}]},{"_or":[{"utm_content":{"_eq":"article-end"}},{"source_url":{"_contains":"utm_content=article-end"}}]}]}',
      '["created_at","status","contact","kind","utm_campaign","utm_content","source_path","assigned_to","next_action_at"]','["-created_at"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Блог: устройства','devices','#059669',
      '{"_and":[{"_or":[{"utm_source":{"_eq":"blog"}},{"source_url":{"_contains":"utm_source=blog"}}]},{"_or":[{"utm_content":{"_eq":"related-device"}},{"source_url":{"_contains":"utm_content=related-device"}}]}]}',
      '["created_at","status","contact","kind","device_id","utm_campaign","utm_content","source_path","assigned_to"]','["-created_at"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'leads','Закрытые заявки','task_alt','#64748b',
      '{"status":{"_in":["won","closed"]}}','["created_at","status","contact","kind","assigned_to","manager_note"]','["-created_at"]');

    PERFORM pg_temp.isvoi_ux_preset(role_name,'product_offers','Все предложения','storefront','#2563eb','{}',
      '["location","product","status","price","stock_quantity","stock_status","updated_at"]','["-updated_at"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'product_offers','Требуют внимания','report_problem','#dc2626',
      '{"_or":[{"status":{"_eq":"draft"}},{"price":{"_lte":0}},{"updated_at":{"_lt":"$NOW(-7 days)"}}]}',
      '["location","product","status","price","stock_quantity","stock_status","updated_at"]','["-updated_at"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'product_offers','Белгород','location_city','#2563eb',
      '{"location":{"slug":{"_eq":"belgorod"}}}','["location","product","price","stock_quantity","stock_status","updated_at"]','["-updated_at"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'product_offers','В наличии','inventory','#059669',
      '{"_and":[{"status":{"_eq":"published"}},{"stock_status":{"_eq":"available"}},{"stock_quantity":{"_gt":0}}]}',
      '["location","product","price","stock_quantity","sale_mode","updated_at"]','["location","product"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'product_offers','Доступно с доставкой','local_shipping','#0891b2',
      '{"intercity_delivery_enabled":{"_eq":true}}','["location","product","price","stock_quantity","delivery_estimate","updated_at"]','["location","product"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'product_offers','Архив','archive','#64748b',
      '{"status":{"_eq":"archived"}}','["location","product","price","stock_status","updated_at"]','["-updated_at"]');

    PERFORM pg_temp.isvoi_ux_preset(role_name,'store_locations','Опубликованные магазины','public','#059669',
      '{"status":{"_eq":"published"}}','["sort","city","name","address","pickup_enabled","intercity_delivery_enabled","updated_at"]','["sort","city"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'store_locations','Черновики магазинов','draft','#d97706',
      '{"status":{"_eq":"draft"}}','["sort","city","name","address","updated_at"]','["sort","city"]');
    PERFORM pg_temp.isvoi_ux_preset(role_name,'store_locations','Архив магазинов','archive','#64748b',
      '{"status":{"_eq":"archived"}}','["sort","city","name","updated_at"]','["sort","city"]');
  END LOOP;
END $$;

${rollback ? "ROLLBACK;" : "COMMIT;"}
`);
