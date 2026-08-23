#!/usr/bin/env node

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-city-page-copy");

if (apply !== confirmed) {
  throw new Error("Production apply requires --apply --confirm-city-page-copy");
}

process.stdout.write(String.raw`
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS hero_eyebrow varchar(160);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS hero_primary_cta_label varchar(160);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS hero_secondary_cta_label varchar(160);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_eyebrow varchar(160);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_address_label varchar(120);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_address_fallback varchar(240);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_hours_label varchar(120);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_hours_fallback varchar(240);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_phone_label varchar(120);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_telegram_label varchar(120);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS contact_map_label varchar(120);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS catalog_eyebrow varchar(160);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS catalog_title varchar(255);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS catalog_body text;
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS catalog_cta_label varchar(160);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS catalog_empty_title varchar(255);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS catalog_empty_body text;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_city_page_group(
  p_field varchar,p_label text,p_icon varchar,p_sort integer,p_start varchar,p_note text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection='store_locations' AND field=p_field) THEN
    UPDATE directus_fields
    SET special='alias,no-data,group',interface='group-detail',
      options=json_build_object('headerIcon',p_icon,'start',p_start),width='full',sort=p_sort,
      "group"='group_content',hidden=false,readonly=false,required=false,note=p_note,
      translations=json_build_array(json_build_object('language','ru-RU','translation',p_label))
    WHERE collection='store_locations' AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,special,interface,options,width,sort,"group",hidden,readonly,
      required,note,translations
    ) VALUES (
      'store_locations',p_field,'alias,no-data,group','group-detail',
      json_build_object('headerIcon',p_icon,'start',p_start),'full',p_sort,'group_content',
      false,false,false,p_note,
      json_build_array(json_build_object('language','ru-RU','translation',p_label))
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_city_page_field(
  p_field varchar,p_group varchar,p_interface varchar,p_width varchar,p_sort integer,
  p_note text,p_label text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection='store_locations' AND field=p_field) THEN
    UPDATE directus_fields
    SET interface=p_interface,width=p_width,sort=p_sort,"group"=p_group,hidden=false,
      readonly=false,required=false,note=p_note,
      translations=json_build_array(json_build_object('language','ru-RU','translation',p_label))
    WHERE collection='store_locations' AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,interface,width,sort,"group",hidden,readonly,required,note,translations
    ) VALUES (
      'store_locations',p_field,p_interface,p_width,p_sort,p_group,false,false,false,p_note,
      json_build_array(json_build_object('language','ru-RU','translation',p_label))
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_city_page_group('group_city_hero','Первый экран','web_asset',1,'open','Заголовок, изображение и подписи переходов городской страницы.');
SELECT pg_temp.isvoi_city_page_group('group_city_contact_card','Карточка контактов','contact_phone',2,'closed','Подписи карточки магазина. Адрес, телефон, часы и URL карты заполняются в группе «Адрес и контакты».');
SELECT pg_temp.isvoi_city_page_group('group_city_catalog','Каталог города','storefront',3,'open','Eyebrow, тексты, кнопка и пустое состояние локального каталога.');
SELECT pg_temp.isvoi_city_page_group('group_city_seo','SEO','search',4,'closed','Метаданные городской страницы для поиска и социальных сетей.');

SELECT pg_temp.isvoi_city_page_field('hero_file','group_city_hero','file-image','half',1,'Реальная главная фотография магазина.','Главная фотография');
SELECT pg_temp.isvoi_city_page_field('hero_eyebrow','group_city_hero','input','half',2,'Короткая строка над H1. Можно использовать {city}.','Eyebrow первого экрана');
SELECT pg_temp.isvoi_city_page_field('hero_title','group_city_hero','input','full',3,'Главный H1 городской страницы.','Заголовок первого экрана');
SELECT pg_temp.isvoi_city_page_field('hero_body','group_city_hero','input-multiline','full',4,'Пояснение под H1.','Текст первого экрана');
SELECT pg_temp.isvoi_city_page_field('hero_primary_cta_label','group_city_hero','input','half',5,'Подпись основной кнопки; ссылка ведёт в каталог этого города.','Кнопка: каталог');
SELECT pg_temp.isvoi_city_page_field('hero_secondary_cta_label','group_city_hero','input','half',6,'Подпись второй кнопки; ссылка ведёт к информации о магазине.','Кнопка: контакты');

SELECT pg_temp.isvoi_city_page_field('contact_eyebrow','group_city_contact_card','input','full',1,'Надзаголовок карточки контактов.','Eyebrow карточки');
SELECT pg_temp.isvoi_city_page_field('contact_address_label','group_city_contact_card','input','half',2,'Подпись перед адресом.','Подпись адреса');
SELECT pg_temp.isvoi_city_page_field('contact_hours_label','group_city_contact_card','input','half',3,'Подпись перед часами работы.','Подпись часов');
SELECT pg_temp.isvoi_city_page_field('contact_address_fallback','group_city_contact_card','input','half',4,'Текст, если адрес магазина ещё не указан.','Нет адреса');
SELECT pg_temp.isvoi_city_page_field('contact_hours_fallback','group_city_contact_card','input','half',5,'Текст, если часы работы ещё не указаны.','Нет часов работы');
SELECT pg_temp.isvoi_city_page_field('contact_phone_label','group_city_contact_card','input','third',6,'Подпись ссылки с номером телефона.','Кнопка: телефон');
SELECT pg_temp.isvoi_city_page_field('contact_telegram_label','group_city_contact_card','input','third',7,'Подпись ссылки на Telegram.','Кнопка: Telegram');
SELECT pg_temp.isvoi_city_page_field('contact_map_label','group_city_contact_card','input','third',8,'Подпись ссылки на карту; URL берётся из поля карты магазина.','Кнопка: карта');

SELECT pg_temp.isvoi_city_page_field('catalog_eyebrow','group_city_catalog','input','full',1,'Короткая строка над заголовком каталога. Можно использовать {city}.','Eyebrow каталога');
SELECT pg_temp.isvoi_city_page_field('catalog_title','group_city_catalog','input','full',2,'Заголовок локального каталога. Можно использовать {city}.','Заголовок каталога');
SELECT pg_temp.isvoi_city_page_field('catalog_body','group_city_catalog','input-multiline','full',3,'Пояснение о локальном наличии и доставке. Можно использовать {city}.','Текст каталога');
SELECT pg_temp.isvoi_city_page_field('catalog_cta_label','group_city_catalog','input','full',4,'Подпись кнопки полного каталога города.','Кнопка каталога');
SELECT pg_temp.isvoi_city_page_field('catalog_empty_title','group_city_catalog','input','full',5,'Заголовок, если в городе пока нет опубликованных предложений.','Пустой каталог: заголовок');
SELECT pg_temp.isvoi_city_page_field('catalog_empty_body','group_city_catalog','input-multiline','full',6,'Пояснение пустого состояния локального каталога.','Пустой каталог: текст');

SELECT pg_temp.isvoi_city_page_field('seo_title','group_city_seo','input','full',1,'SEO title городской страницы.','SEO title');
SELECT pg_temp.isvoi_city_page_field('meta_description','group_city_seo','input-multiline','full',2,'Meta description городской страницы.','Meta description');

UPDATE store_locations
SET hero_eyebrow=coalesce(nullif(hero_eyebrow,''),'I СВОИ · {city}'),
  hero_primary_cta_label=coalesce(nullif(hero_primary_cta_label,''),'Смотреть каталог города'),
  hero_secondary_cta_label=coalesce(nullif(hero_secondary_cta_label,''),'Контакты и часы'),
  contact_eyebrow=coalesce(nullif(contact_eyebrow,''),'Магазин'),
  contact_address_label=coalesce(nullif(contact_address_label,''),'Адрес'),
  contact_address_fallback=coalesce(nullif(contact_address_fallback,''),'Точный адрес уточняется перед визитом'),
  contact_hours_label=coalesce(nullif(contact_hours_label,''),'Часы работы'),
  contact_hours_fallback=coalesce(nullif(contact_hours_fallback,''),'Уточняются перед визитом'),
  contact_phone_label=coalesce(nullif(contact_phone_label,''),'Позвонить'),
  contact_telegram_label=coalesce(nullif(contact_telegram_label,''),'Telegram'),
  contact_map_label=coalesce(nullif(contact_map_label,''),'Открыть карту'),
  catalog_eyebrow=coalesce(nullif(catalog_eyebrow,''),'Локальное наличие'),
  catalog_title=coalesce(nullif(catalog_title,''),'Сначала — товары в городе {city}.'),
  catalog_body=coalesce(nullif(catalog_body,''),'Остальные позиции показываем отдельно, если их можно доставить из другой точки.'),
  catalog_cta_label=coalesce(nullif(catalog_cta_label,''),'Открыть весь каталог'),
  catalog_empty_title=coalesce(nullif(catalog_empty_title,''),'Локальный каталог обновляется'),
  catalog_empty_body=coalesce(nullif(catalog_empty_body,''),'Товары появятся после подтверждения цены и остатка для этой точки.');

CREATE OR REPLACE FUNCTION pg_temp.isvoi_append_city_page_fields(
  p_policy text,p_action varchar,p_include_groups boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY ARRAY[
    'hero_eyebrow','hero_primary_cta_label','hero_secondary_cta_label',
    'contact_eyebrow','contact_address_label','contact_address_fallback',
    'contact_hours_label','contact_hours_fallback','contact_phone_label',
    'contact_telegram_label','contact_map_label','catalog_eyebrow','catalog_title',
    'catalog_body','catalog_cta_label','catalog_empty_title','catalog_empty_body'
  ] LOOP
    UPDATE directus_permissions permission
    SET fields=permission.fields || ',' || field_name
    FROM directus_policies policy
    WHERE permission.policy=policy.id AND policy.name=p_policy
      AND permission.collection='store_locations' AND permission.action=p_action
      AND permission.fields IS NOT NULL AND permission.fields<>'*'
      AND NOT (field_name=ANY(string_to_array(permission.fields,',')));
  END LOOP;

  IF p_include_groups THEN
    FOREACH field_name IN ARRAY ARRAY[
      'group_city_hero','group_city_contact_card','group_city_catalog','group_city_seo'
    ] LOOP
      UPDATE directus_permissions permission
      SET fields=permission.fields || ',' || field_name
      FROM directus_policies policy
      WHERE permission.policy=policy.id AND policy.name=p_policy
        AND permission.collection='store_locations' AND permission.action=p_action
        AND permission.fields IS NOT NULL AND permission.fields<>'*'
        AND NOT (field_name=ANY(string_to_array(permission.fields,',')));
    END LOOP;
  END IF;
END $$;

SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Public Read','read',false);
SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Editor','read',true);
SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Editor','create',false);
SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Editor','update',false);
SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Advanced Editor','read',true);
SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Advanced Editor','create',false);
SELECT pg_temp.isvoi_append_city_page_fields('ISVOI Advanced Editor','update',false);

SELECT 'city_page_copy.fields_missing|' || (17-count(*))::text
FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_locations'
  AND column_name IN (
    'hero_eyebrow','hero_primary_cta_label','hero_secondary_cta_label',
    'contact_eyebrow','contact_address_label','contact_address_fallback',
    'contact_hours_label','contact_hours_fallback','contact_phone_label',
    'contact_telegram_label','contact_map_label','catalog_eyebrow','catalog_title',
    'catalog_body','catalog_cta_label','catalog_empty_title','catalog_empty_body'
  );
SELECT 'city_page_copy.published_incomplete|' || count(*)::text
FROM store_locations location
WHERE status='published' AND EXISTS (
  SELECT 1 FROM jsonb_each_text(to_jsonb(location)) value
  WHERE value.key IN (
    'hero_eyebrow','hero_primary_cta_label','hero_secondary_cta_label',
    'contact_eyebrow','contact_address_label','contact_address_fallback',
    'contact_hours_label','contact_hours_fallback','contact_phone_label',
    'contact_telegram_label','contact_map_label','catalog_eyebrow','catalog_title',
    'catalog_body','catalog_cta_label','catalog_empty_title','catalog_empty_body'
  ) AND nullif(value.value,'') IS NULL
);

${apply ? "COMMIT;" : "ROLLBACK;"}
`);
