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

UPDATE directus_fields
SET note='HTTPS-ссылка на карту. Вставляйте только URL, без iframe-кода.'
WHERE collection='store_locations' AND field='map_url';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_append_location_footer_fields(
  p_policy text,p_action varchar
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY ARRAY[
    'legal_name','inn','ogrn','legal_address','group_legal'
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
      AND column_name IN ('legal_name','inn','ogrn','legal_address')
  ) <> 4 THEN
    RAISE EXCEPTION 'Location footer legal fields are incomplete';
  END IF;
END
$guard$;

SELECT 'location_footer.schema_fields' AS check_name,count(*)::text AS value
FROM information_schema.columns
WHERE table_schema='public' AND table_name='store_locations'
  AND column_name IN ('legal_name','inn','ogrn','legal_address')
UNION ALL
SELECT 'location_footer.studio_fields',count(*)::text
FROM directus_fields
WHERE collection='store_locations'
  AND field IN ('group_legal','legal_name','inn','ogrn','legal_address');

${apply ? "COMMIT;" : "ROLLBACK;"}
`);
