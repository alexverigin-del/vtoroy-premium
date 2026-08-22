#!/usr/bin/env node

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-location-footer");

if (apply && !confirmed) {
  console.error("Apply requires --apply --confirm-location-footer");
  process.exit(1);
}

process.stdout.write(String.raw`BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS inn varchar(32);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS ogrn varchar(32);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS legal_address text;
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS footer_eyebrow varchar(160);

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_contact_eyebrow varchar(160);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_map_label varchar(120);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_store_label varchar(120);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_contact_heading varchar(120);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_hours_heading varchar(120);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_seller_label varchar(120);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_legal_address_label varchar(120);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_contacts_fallback varchar(240);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_hours_fallback varchar(240);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_network_eyebrow varchar(160);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_network_title varchar(240);
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_network_body text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_all_stores_label varchar(120);

UPDATE directus_collections
SET translations='[{"language":"ru-RU","translation":"Магазины, адреса и наличие"}]'::json,
  note='Магазины, городские адреса, контакты, реквизиты, локальные цены и наличие.'
WHERE collection='isvoi_locations';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_location_footer_group()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields
    WHERE collection='store_locations' AND field='group_legal'
  ) THEN
    UPDATE directus_fields
    SET special='alias,no-data,group',interface='group-detail',
      options='{"headerIcon":"gavel","start":"closed"}'::json,
      width='full',sort=30,hidden=false,readonly=false,required=false,
      note='Юридическое лицо или ИП, которое продаёт товары в этой точке.',
      translations='[{"language":"ru-RU","translation":"Реквизиты продавца"}]'::json
    WHERE collection='store_locations' AND field='group_legal';
  ELSE
    INSERT INTO directus_fields(
      collection,field,special,interface,options,width,sort,hidden,readonly,
      required,note,translations
    ) VALUES (
      'store_locations','group_legal','alias,no-data,group','group-detail',
      '{"headerIcon":"gavel","start":"closed"}'::json,'full',30,false,false,
      false,'Юридическое лицо или ИП, которое продаёт товары в этой точке.',
      '[{"language":"ru-RU","translation":"Реквизиты продавца"}]'::json
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_location_footer_field(
  p_field varchar,p_interface varchar,p_width varchar,p_sort integer,
  p_note text,p_label text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields
    WHERE collection='store_locations' AND field=p_field
  ) THEN
    UPDATE directus_fields
    SET interface=p_interface,width=p_width,sort=p_sort,"group"='group_legal',
      hidden=false,readonly=false,required=false,note=p_note,
      translations=json_build_array(
        json_build_object('language','ru-RU','translation',p_label)
      )
    WHERE collection='store_locations' AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,interface,width,sort,"group",hidden,readonly,required,
      note,translations
    ) VALUES (
      'store_locations',p_field,p_interface,p_width,p_sort,'group_legal',
      false,false,false,p_note,
      json_build_array(json_build_object('language','ru-RU','translation',p_label))
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_location_footer_group();
SELECT pg_temp.isvoi_location_footer_field(
  'legal_name','input','full',1,
  'Полное наименование юридического лица или ИП для этой точки.',
  'Наименование продавца'
);
SELECT pg_temp.isvoi_location_footer_field(
  'inn','input','half',2,
  'ИНН продавца без пробелов. Отличается по магазинам, если работают разные юрлица.',
  'ИНН'
);
SELECT pg_temp.isvoi_location_footer_field(
  'ogrn','input','half',3,
  'ОГРН или ОГРНИП продавца без пробелов.',
  'ОГРН / ОГРНИП'
);
SELECT pg_temp.isvoi_location_footer_field(
  'legal_address','input-multiline','full',4,
  'Юридический адрес продавца, если он отличается от адреса магазина.',
  'Юридический адрес'
);

CREATE OR REPLACE FUNCTION pg_temp.isvoi_footer_copy_group()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields
    WHERE collection='site_settings' AND field='group_footer_contacts'
  ) THEN
    UPDATE directus_fields
    SET special='alias,no-data,group',interface='group-detail',
      options='{"headerIcon":"contact_phone","start":"open"}'::json,
      width='full',sort=50,hidden=false,readonly=false,required=false,
      note='Общие подписи блока контактов в footer. Адреса и реквизиты заполняются отдельно в каждом городе.',
      translations='[{"language":"ru-RU","translation":"Footer · контакты"}]'::json
    WHERE collection='site_settings' AND field='group_footer_contacts';
  ELSE
    INSERT INTO directus_fields(
      collection,field,special,interface,options,width,sort,hidden,readonly,
      required,note,translations
    ) VALUES (
      'site_settings','group_footer_contacts','alias,no-data,group','group-detail',
      '{"headerIcon":"contact_phone","start":"open"}'::json,'full',50,false,false,
      false,'Общие подписи блока контактов в footer. Адреса и реквизиты заполняются отдельно в каждом городе.',
      '[{"language":"ru-RU","translation":"Footer · контакты"}]'::json
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_footer_copy_field(
  p_collection varchar,p_field varchar,p_group varchar,p_interface varchar,
  p_width varchar,p_sort integer,p_note text,p_label text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields
    WHERE collection=p_collection AND field=p_field
  ) THEN
    UPDATE directus_fields
    SET interface=p_interface,width=p_width,sort=p_sort,"group"=p_group,
      hidden=false,readonly=false,required=false,note=p_note,
      translations=json_build_array(
        json_build_object('language','ru-RU','translation',p_label)
      )
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,interface,width,sort,"group",hidden,readonly,required,
      note,translations
    ) VALUES (
      p_collection,p_field,p_interface,p_width,p_sort,p_group,false,false,false,p_note,
      json_build_array(json_build_object('language','ru-RU','translation',p_label))
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_footer_copy_group();
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_contact_eyebrow','group_footer_contacts','input','full',1,'Общий eyebrow. Используйте {city}, чтобы автоматически подставлять выбранный город.','Eyebrow контактов');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_map_label','group_footer_contacts','input','half',2,'Подпись ссылки на карту. URL хранится в конкретном магазине.','Ссылка: карта');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_store_label','group_footer_contacts','input','half',3,'Подпись ссылки на городской магазин. Используйте {city} для автоматической подстановки.','Ссылка: магазин');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_contact_heading','group_footer_contacts','input','half',4,'Название колонки с телефоном, Telegram и email.','Заголовок способов связи');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_hours_heading','group_footer_contacts','input','half',5,'Название колонки с часами работы.','Заголовок часов работы');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_seller_label','group_footer_contacts','input','half',6,'Подпись перед юридическим наименованием продавца.','Подпись продавца');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_legal_address_label','group_footer_contacts','input','half',7,'Подпись перед юридическим адресом.','Подпись юридического адреса');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_contacts_fallback','group_footer_contacts','input','half',8,'Текст, если способы связи ещё не заполнены.','Нет контактов');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_hours_fallback','group_footer_contacts','input','half',9,'Текст, если часы работы ещё не заполнены.','Нет часов работы');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_network_eyebrow','group_footer_contacts','input','full',10,'Eyebrow режима выбора города.','Сеть: eyebrow');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_network_title','group_footer_contacts','input','full',11,'Заголовок режима выбора города.','Сеть: заголовок');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_network_body','group_footer_contacts','input-multiline','full',12,'Пояснение над списком городов.','Сеть: пояснение');
SELECT pg_temp.isvoi_footer_copy_field('site_settings','footer_all_stores_label','group_footer_contacts','input','full',13,'Подпись ссылки на список всех магазинов.','Сеть: все магазины');
SELECT pg_temp.isvoi_footer_copy_field('store_locations','footer_eyebrow','group_contacts','input','full',9,'Необязательное переопределение eyebrow только для этого города. Оставьте пустым для глобального шаблона.','Eyebrow футера');

UPDATE directus_fields
SET note='HTTPS-ссылка на карту. Вставляйте только URL, без iframe-кода.'
WHERE collection='store_locations' AND field='map_url';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_append_location_footer_fields(
  p_policy text,p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY ARRAY[
    'legal_name','inn','ogrn','legal_address','footer_eyebrow','group_legal'
  ] LOOP
    UPDATE directus_permissions permission
    SET fields=permission.fields || ',' || field_name
    FROM directus_policies policy
    WHERE permission.policy=policy.id AND policy.name=p_policy
      AND permission.collection='store_locations' AND permission.action=p_action
      AND permission.fields IS NOT NULL AND permission.fields<>'*'
      AND NOT (field_name=ANY(string_to_array(permission.fields,',')));
  END LOOP;
END $$;

SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Public Read','read');
SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Editor','read');
SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Editor','create');
SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Editor','update');
SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Advanced Editor','read');
SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Advanced Editor','create');
SELECT pg_temp.isvoi_append_location_footer_fields('ISVOI Advanced Editor','update');

CREATE OR REPLACE FUNCTION pg_temp.isvoi_append_site_footer_copy_fields(
  p_policy text,p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY ARRAY[
    'group_footer_contacts','footer_contact_eyebrow','footer_map_label',
    'footer_store_label','footer_contact_heading','footer_hours_heading',
    'footer_seller_label','footer_legal_address_label','footer_contacts_fallback',
    'footer_hours_fallback','footer_network_eyebrow','footer_network_title',
    'footer_network_body','footer_all_stores_label'
  ] LOOP
    UPDATE directus_permissions permission
    SET fields=permission.fields || ',' || field_name
    FROM directus_policies policy
    WHERE permission.policy=policy.id AND policy.name=p_policy
      AND permission.collection='site_settings' AND permission.action=p_action
      AND permission.fields IS NOT NULL AND permission.fields<>'*'
      AND NOT (field_name=ANY(string_to_array(permission.fields,',')));
  END LOOP;
END $$;

SELECT pg_temp.isvoi_append_site_footer_copy_fields('ISVOI Public Read','read');
SELECT pg_temp.isvoi_append_site_footer_copy_fields('ISVOI Editor','read');
SELECT pg_temp.isvoi_append_site_footer_copy_fields('ISVOI Editor','update');
SELECT pg_temp.isvoi_append_site_footer_copy_fields('ISVOI Advanced Editor','read');
SELECT pg_temp.isvoi_append_site_footer_copy_fields('ISVOI Advanced Editor','update');

UPDATE site_settings
SET footer_contact_eyebrow=coalesce(nullif(footer_contact_eyebrow,''),'I СВОИ · {city}'),
  footer_map_label=coalesce(nullif(footer_map_label,''),'Открыть на карте ↗'),
  footer_store_label=coalesce(nullif(footer_store_label,''),'Магазин в {city}'),
  footer_contact_heading=coalesce(nullif(footer_contact_heading,''),'Связаться'),
  footer_hours_heading=coalesce(nullif(footer_hours_heading,''),'Часы работы'),
  footer_seller_label=coalesce(nullif(footer_seller_label,''),'Продавец'),
  footer_legal_address_label=coalesce(nullif(footer_legal_address_label,''),'Юридический адрес'),
  footer_contacts_fallback=coalesce(nullif(footer_contacts_fallback,''),'Контакты уточняются'),
  footer_hours_fallback=coalesce(nullif(footer_hours_fallback,''),'Уточняются перед визитом'),
  footer_network_eyebrow=coalesce(nullif(footer_network_eyebrow,''),'I СВОИ · магазины'),
  footer_network_title=coalesce(nullif(footer_network_title,''),'Адрес, контакты и реквизиты зависят от города.'),
  footer_network_body=coalesce(nullif(footer_network_body,''),'Выберите магазин, чтобы увидеть актуальные данные перед визитом.'),
  footer_all_stores_label=coalesce(nullif(footer_all_stores_label,''),'Все магазины');

WITH global_settings AS (
  SELECT address,phone,telegram,email,business_hours,map_url,legal_name,inn,ogrn
  FROM site_settings
  LIMIT 1
)
UPDATE store_locations location
SET address=coalesce(nullif(location.address,''),settings.address),
  phone=coalesce(nullif(location.phone,''),settings.phone),
  telegram=coalesce(nullif(location.telegram,''),settings.telegram),
  email=coalesce(nullif(location.email,''),settings.email),
  business_hours=coalesce(nullif(location.business_hours,''),settings.business_hours),
  map_url=coalesce(nullif(location.map_url,''),settings.map_url),
  legal_name=coalesce(nullif(location.legal_name,''),settings.legal_name),
  inn=coalesce(nullif(location.inn,''),settings.inn),
  ogrn=coalesce(nullif(location.ogrn,''),settings.ogrn)
FROM global_settings settings
WHERE location.slug='belgorod';

UPDATE store_locations
SET map_url=substring(map_url FROM 'src="([^"]+)"')
WHERE map_url ~* '^\s*<iframe[^>]+src="https://';

DO $guard$
BEGIN
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='store_locations'
      AND column_name IN ('legal_name','inn','ogrn','legal_address','footer_eyebrow')
  ) <> 5 THEN
    RAISE EXCEPTION 'Location footer fields are incomplete';
  END IF;
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='site_settings'
      AND column_name IN (
        'footer_contact_eyebrow','footer_map_label','footer_store_label',
        'footer_contact_heading','footer_hours_heading','footer_seller_label',
        'footer_legal_address_label','footer_contacts_fallback','footer_hours_fallback',
        'footer_network_eyebrow','footer_network_title','footer_network_body',
        'footer_all_stores_label'
      )
  ) <> 13 THEN
    RAISE EXCEPTION 'Site footer copy fields are incomplete';
  END IF;
END
$guard$;

SELECT 'location_footer.schema_fields' AS check_name,count(*)::text AS value
FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_locations'
  AND column_name IN ('legal_name','inn','ogrn','legal_address','footer_eyebrow')
UNION ALL
SELECT 'location_footer.studio_fields',count(*)::text
FROM directus_fields
WHERE collection='store_locations'
  AND field IN ('group_legal','legal_name','inn','ogrn','legal_address','footer_eyebrow')
UNION ALL
SELECT 'location_footer.site_copy_schema_fields',count(*)::text
FROM information_schema.columns
WHERE table_schema='public' AND table_name='site_settings'
  AND column_name IN (
    'footer_contact_eyebrow','footer_map_label','footer_store_label',
    'footer_contact_heading','footer_hours_heading','footer_seller_label',
    'footer_legal_address_label','footer_contacts_fallback','footer_hours_fallback',
    'footer_network_eyebrow','footer_network_title','footer_network_body',
    'footer_all_stores_label'
  )
UNION ALL
SELECT 'location_footer.site_copy_studio_fields',count(*)::text
FROM directus_fields
WHERE collection='site_settings'
  AND field IN (
    'group_footer_contacts','footer_contact_eyebrow','footer_map_label',
    'footer_store_label','footer_contact_heading','footer_hours_heading',
    'footer_seller_label','footer_legal_address_label','footer_contacts_fallback',
    'footer_hours_fallback','footer_network_eyebrow','footer_network_title',
    'footer_network_body','footer_all_stores_label'
  );

${apply ? "COMMIT;" : "ROLLBACK;"}
`);
