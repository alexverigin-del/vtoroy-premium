#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_catalog_editor_field(
  p_collection varchar,p_field varchar,p_interface varchar,p_display varchar,
  p_options json,p_width varchar,p_sort integer,p_note text,p_special varchar,
  p_required boolean,p_readonly boolean,p_hidden boolean,p_group varchar,p_translation text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET
      interface=p_interface,display=p_display,options=p_options,width=p_width,sort=p_sort,
      note=p_note,special=p_special,required=p_required,readonly=p_readonly,hidden=p_hidden,
      "group"=p_group,
      translations=json_build_array(json_build_object('language','ru-RU','translation',p_translation))
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields(
      collection,field,interface,display,options,width,sort,note,special,required,
      readonly,hidden,"group",translations
    ) VALUES (
      p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_special,
      p_required,p_readonly,p_hidden,p_group,
      json_build_array(json_build_object('language','ru-RU','translation',p_translation))
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_catalog_editor_group(
  p_collection varchar,p_field varchar,p_translation text,p_icon varchar,
  p_sort integer,p_start varchar,p_hidden boolean DEFAULT false,p_conditions json DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.isvoi_catalog_editor_field(
    p_collection,p_field,'group-detail',NULL,
    json_build_object('headerIcon',p_icon,'start',p_start),
    'full',p_sort,p_translation,'alias,no-data,group',false,false,p_hidden,NULL,p_translation
  );
  UPDATE directus_fields SET conditions=p_conditions
  WHERE collection=p_collection AND field=p_field;
END $$;

-- Product form: one entry point, type-specific related data and explicit QA ownership.
SELECT pg_temp.isvoi_catalog_editor_group('products','group_trade','Trade','sync_alt',9,'closed',true,
  '[{"name":"Техника","rule":{"product_type":{"_eq":"device"}},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json);
UPDATE directus_fields SET
  conditions='[{"name":"Техника с пробегом","rule":{"_and":[{"product_type":{"_eq":"device"}},{"condition":{"_eq":"used"}}]},"hidden":false,"readonly":false,"required":false,"options":{}}]'::json,
  note='Passport заполняется только для проверенной техники с пробегом.'
WHERE collection='products' AND field='group_passport';
UPDATE directus_fields SET "group"='group_trade',sort=1,
  options='{"layout":"table","enableCreate":true,"enableSelect":false,"fields":["sort","is_active","label","value"]}'::json,
  note='Варианты Trade для техники. Публикуются только активные строки.'
WHERE collection='products' AND field='trade_options_v3';
UPDATE directus_fields SET
  options='{"layout":"table","enableCreate":true,"enableSelect":false,"fields":["diagnostics_status","condition_grade_text","updated_at"]}'::json,
  note='Один структурированный Passport для проверенной техники с пробегом.'
WHERE collection='products' AND field='passport';
UPDATE directus_fields SET
  options='{"layout":"table","enableCreate":true,"enableSelect":false,"fields":["storage","battery_text","diagnostic_date","diagnostic_by","grade"]}'::json
WHERE collection='products' AND field='device_details';
UPDATE directus_fields SET
  options='{"layout":"table","enableCreate":true,"enableSelect":false,"fields":["compatibility_mode","material","connection_type","package_contents"]}'::json
WHERE collection='products' AND field='accessory_details';
UPDATE directus_fields SET note='Публичная видимость. Поле активно только у Advanced Editor; публикация проходит серверные guards.'
WHERE collection='products' AND field='status';
UPDATE directus_fields SET note='Editor готовит карточку до статуса «На проверке»; «Готово» подтверждает Advanced Editor.'
WHERE collection='products' AND field='content_status';

UPDATE directus_fields SET readonly=false
WHERE collection IN (
  'products','product_images','device_details','accessory_details',
  'device_passports','trade_options'
)
  AND coalesce(special,'') LIKE '%group%';

SELECT pg_temp.isvoi_catalog_editor_field('products','admin_note','input-multiline',NULL,NULL,'full',6,'Внутренний комментарий редактора и QA. На сайт не выводится.',NULL,false,false,false,'group_status','Комментарий редактора');
SELECT pg_temp.isvoi_catalog_editor_field('products','source_system','input',NULL,NULL,'half',1,'Система, создавшая карточку. Только чтение.',NULL,true,true,true,'group_system','Система-источник');
SELECT pg_temp.isvoi_catalog_editor_field('products','source_id','input',NULL,NULL,'half',2,'Стабильный идентификатор в источнике. Только чтение.',NULL,false,true,true,'group_system','ID в источнике');
SELECT pg_temp.isvoi_catalog_editor_field('products','import_batch','input',NULL,NULL,'half',3,'Партия, создавшая или обновившая карточку.',NULL,false,true,true,'group_system','Партия импорта');
SELECT pg_temp.isvoi_catalog_editor_field('products','imported_at','datetime','datetime',NULL,'half',4,'Дата последней синхронизации с источником.',NULL,false,true,true,'group_system','Импортировано');
SELECT pg_temp.isvoi_catalog_editor_field('products','created_at','datetime','datetime',NULL,'half',5,'Дата создания карточки.',NULL,true,true,false,'group_system','Создано');
SELECT pg_temp.isvoi_catalog_editor_field('products','updated_at','datetime','datetime',NULL,'half',6,'Дата последнего изменения карточки.',NULL,true,true,false,'group_system','Обновлено');

-- Product images.
SELECT pg_temp.isvoi_catalog_editor_group('product_images','group_image','Фото товара','photo_library',1,'open');
SELECT pg_temp.isvoi_catalog_editor_group('product_images','group_system','Системные данные','settings',2,'closed');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}'::json,'full',1,'Товар, которому принадлежит фото.','m2o',true,false,false,'group_image','Товар');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','image','file-image','image',NULL,'half',2,'Файл из Directus Files.','m2o',true,false,false,'group_image','Изображение');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft"},{"text":"Опубликовано","value":"published"},{"text":"Архив","value":"archived"}]}'::json,'half',3,'На сайте показываются только опубликованные фото опубликованного товара.',NULL,true,false,false,'group_image','Статус фото');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','role','select-dropdown','labels','{"choices":[{"text":"Карточка каталога","value":"card"},{"text":"Главный вид","value":"main"},{"text":"Экран","value":"screen"},{"text":"Корпус","value":"body"},{"text":"Дефект","value":"defect"},{"text":"Другое","value":"other"}]}'::json,'half',4,'Роль определяет место изображения в карточке.',NULL,true,false,false,'group_image','Роль фото');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','label','input',NULL,NULL,'half',5,'Короткая подпись изображения.',NULL,false,false,false,'group_image','Подпись');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','alt','input-multiline',NULL,NULL,'half',6,'Обязательное фактическое описание изображения для доступности.',NULL,false,false,false,'group_image','Alt-текст');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','sort','input',NULL,'{"min":1,"step":1}'::json,'half',7,'Порядок показа в галерее.',NULL,true,false,false,'group_image','Порядок');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','id','input',NULL,NULL,'half',1,'Системный UUID.','uuid',true,true,true,'group_system','ID');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','source_path','input-multiline',NULL,NULL,'full',2,'Исходный путь импорта. Не редактировать вручную.',NULL,false,true,true,'group_system','Путь источника');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','import_batch','input',NULL,NULL,'half',3,'Партия импорта изображения.',NULL,false,true,true,'group_system','Партия импорта');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','created_at','datetime','datetime',NULL,'half',4,'Дата создания.','date-created',true,true,false,'group_system','Создано');
SELECT pg_temp.isvoi_catalog_editor_field('product_images','updated_at','datetime','datetime',NULL,'half',5,'Дата изменения.','date-updated',true,true,false,'group_system','Обновлено');

-- Device details.
SELECT pg_temp.isvoi_catalog_editor_group('device_details','group_identity','Модель и конфигурация','memory',1,'open');
SELECT pg_temp.isvoi_catalog_editor_group('device_details','group_diagnostics','Диагностика','fact_check',2,'open');
SELECT pg_temp.isvoi_catalog_editor_group('device_details','group_system','Системные данные','settings',3,'closed');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}'::json,'full',1,'Корневая карточка техники.','m2o',true,false,false,'group_identity','Товар');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','storage','input',NULL,NULL,'half',2,'Объём встроенной памяти.',NULL,false,false,false,'group_identity','Память');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','serial','input',NULL,NULL,'half',3,'Серийный номер для внутренней сверки. Публичный API его не читает.',NULL,false,false,false,'group_identity','Серийный номер');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','year','input',NULL,'{"min":2000,"max":2100,"step":1}'::json,'half',4,'Год модели или выпуска.',NULL,false,false,false,'group_identity','Год');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','model_identifier','input',NULL,NULL,'half',5,'Точный идентификатор модели.',NULL,false,false,false,'group_identity','Идентификатор модели');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','region','input',NULL,NULL,'half',6,'Региональная версия.',NULL,false,false,false,'group_identity','Регион');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','sim','input',NULL,NULL,'half',7,'Формат SIM/eSIM.',NULL,false,false,false,'group_identity','SIM');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','battery','input',NULL,NULL,'half',1,'Краткое значение батареи.',NULL,false,false,false,'group_diagnostics','Батарея');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','battery_text','input',NULL,NULL,'half',2,'Публичная формулировка состояния батареи.',NULL,false,false,false,'group_diagnostics','Состояние батареи');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','battery_cycles','input',NULL,'{"min":0,"step":1}'::json,'half',3,'Количество циклов, если применимо.',NULL,false,false,false,'group_diagnostics','Циклы батареи');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','diagnostic_date','datetime','datetime',NULL,'half',4,'Фактическая дата диагностики. Не подменять датой поступления.',NULL,false,false,false,'group_diagnostics','Дата диагностики');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','diagnostic_by','input',NULL,NULL,'half',5,'Кто выполнил диагностику.',NULL,false,false,false,'group_diagnostics','Диагностику провёл');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','grade','input',NULL,NULL,'half',6,'Итоговый грейд состояния.',NULL,false,false,false,'group_diagnostics','Грейд');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','activation_lock','input',NULL,NULL,'half',7,'Результат проверки Activation Lock.',NULL,false,false,false,'group_diagnostics','Activation Lock');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','mdm','input',NULL,NULL,'half',8,'Результат проверки MDM.',NULL,false,false,false,'group_diagnostics','MDM');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','id','input',NULL,NULL,'half',1,'Системный UUID.','uuid',true,true,true,'group_system','ID');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','created_at','datetime','datetime',NULL,'half',2,'Дата создания.','date-created',true,true,false,'group_system','Создано');
SELECT pg_temp.isvoi_catalog_editor_field('device_details','updated_at','datetime','datetime',NULL,'half',3,'Дата изменения.','date-updated',true,true,false,'group_system','Обновлено');

-- Accessory details and exact model compatibility.
SELECT pg_temp.isvoi_catalog_editor_group('accessory_details','group_main','Характеристики аксессуара','cable',1,'open');
SELECT pg_temp.isvoi_catalog_editor_group('accessory_details','group_system','Системные данные','settings',2,'closed');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}'::json,'full',1,'Корневая карточка аксессуара.','m2o',true,false,false,'group_main','Товар');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','compatibility_mode','select-dropdown','labels','{"choices":[{"text":"Универсальный","value":"universal"},{"text":"По модели","value":"model_specific"}]}'::json,'half',2,'Для режима «По модели» добавьте точные модели в карточке товара.',NULL,true,false,false,'group_main','Совместимость');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','material','input',NULL,NULL,'half',3,'Материал изделия.',NULL,false,false,false,'group_main','Материал');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','connection_type','input',NULL,NULL,'half',4,'Разъём или тип подключения.',NULL,false,false,false,'group_main','Подключение');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','package_contents','input-multiline',NULL,NULL,'full',5,'Комплект поставки аксессуара.',NULL,false,false,false,'group_main','Комплект');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','specifications','input-code',NULL,'{"language":"json","lineWrapping":true}'::json,'full',6,'Дополнительные отображаемые характеристики. Фильтруемые признаки храните в отдельных полях.','cast-json',false,false,false,'group_main','Дополнительные характеристики');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','id','input',NULL,NULL,'half',1,'Системный UUID.','uuid',true,true,true,'group_system','ID');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','created_at','datetime','datetime',NULL,'half',2,'Дата создания.','date-created',true,true,false,'group_system','Создано');
SELECT pg_temp.isvoi_catalog_editor_field('accessory_details','updated_at','datetime','datetime',NULL,'half',3,'Дата изменения.','date-updated',true,true,false,'group_system','Обновлено');
SELECT pg_temp.isvoi_catalog_editor_field('product_compatible_models','id','input',NULL,NULL,'half',3,'Системный UUID.','uuid',true,true,true,NULL,'ID');
UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Товар"}]'::json,note='Модельный аксессуар.'
WHERE collection='product_compatible_models' AND field='product';
UPDATE directus_fields SET translations='[{"language":"ru-RU","translation":"Совместимая модель"}]'::json,note='Точная модель устройства.'
WHERE collection='product_compatible_models' AND field='device_models_id';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_catalog_editor_permission(
  p_collection varchar,p_action varchar,p_fields text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name='ISVOI Editor' LIMIT 1;
  IF v_policy IS NULL THEN RAISE EXCEPTION 'ISVOI Editor policy is missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy=v_policy AND collection=p_collection AND action=p_action
  ) THEN
    UPDATE directus_permissions SET fields=p_fields
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation,presets)
    VALUES(v_policy,p_collection,p_action,p_fields,NULL,NULL,NULL);
  END IF;
END $$;

SELECT pg_temp.isvoi_catalog_editor_permission('product_images','read','id,product,image,status,role,label,alt,sort,source_path,import_batch,created_at,updated_at');
SELECT pg_temp.isvoi_catalog_editor_permission('product_images','create','product,image,status,role,label,alt,sort');
SELECT pg_temp.isvoi_catalog_editor_permission('product_images','update','product,image,status,role,label,alt,sort');
SELECT pg_temp.isvoi_catalog_editor_permission('device_details','read','id,product,storage,serial,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade,created_at,updated_at');
SELECT pg_temp.isvoi_catalog_editor_permission('device_details','create','product,storage,serial,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade');
SELECT pg_temp.isvoi_catalog_editor_permission('device_details','update','product,storage,serial,year,model_identifier,region,sim,battery,battery_text,battery_cycles,diagnostic_date,activation_lock,mdm,diagnostic_by,grade');
SELECT pg_temp.isvoi_catalog_editor_permission('accessory_details','read','id,product,compatibility_mode,material,connection_type,package_contents,specifications,created_at,updated_at');
SELECT pg_temp.isvoi_catalog_editor_permission('accessory_details','create','product,compatibility_mode,material,connection_type,package_contents,specifications');
SELECT pg_temp.isvoi_catalog_editor_permission('accessory_details','update','product,compatibility_mode,material,connection_type,package_contents,specifications');
SELECT pg_temp.isvoi_catalog_editor_permission('product_compatible_models','read','id,product,device_models_id');
SELECT pg_temp.isvoi_catalog_editor_permission('product_compatible_models','create','product,device_models_id');
SELECT pg_temp.isvoi_catalog_editor_permission('product_compatible_models','update','product,device_models_id');
SELECT pg_temp.isvoi_catalog_editor_permission('product_compatible_models','delete','id,product,device_models_id');

-- Passport object arrays must use structured Repeaters, not an unconfigured primitive list.
UPDATE directus_fields SET
  interface='list',special='cast-json',width='full',readonly=false,hidden=false,
  options='{
    "template":"{{label}}: {{value}}",
    "addLabel":"Добавить факт",
    "fields":[
      {"field":"label","name":"Показатель","type":"string","meta":{"interface":"input","width":"half","required":true,"options":{"placeholder":"Например, батарея"}}},
      {"field":"value","name":"Значение","type":"string","meta":{"interface":"input","width":"half","required":true,"options":{"placeholder":"Например, 89%"}}},
      {"field":"state","name":"Оценка","type":"string","meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Норма","value":"ok"},{"text":"Обратить внимание","value":"warn"},{"text":"Критично","value":"bad"}]}}}
    ]
  }'::json,
  note='Короткие проверяемые факты Passport. Заполняйте показатель, значение и оценку; не используйте рекламные формулировки.'
WHERE collection='device_passports' AND field='summary_rows';

UPDATE directus_fields SET
  interface='list',special='cast-json',width='full',readonly=false,hidden=false,
  options='{
    "template":"{{text}} · {{state}}",
    "addLabel":"Добавить проверку",
    "fields":[
      {"field":"text","name":"Что проверено","type":"string","meta":{"interface":"input","width":"full","required":true,"options":{"placeholder":"Например, экран и сенсор"}}},
      {"field":"state","name":"Результат","type":"string","meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Норма","value":"ok"},{"text":"Обратить внимание","value":"warn"},{"text":"Критично","value":"bad"}]}}}
    ]
  }'::json,
  note='Фактический чек-лист диагностики. Каждая строка содержит проверку и результат.'
WHERE collection='device_passports' AND field='diagnostics_checklist';
UPDATE directus_fields SET required=true,
  note='Корневая карточка Catalog V3. Один Passport на один товар с пробегом.'
WHERE collection='device_passports' AND field='product';
UPDATE directus_fields SET note='Краткий фактический итог диагностики, например «Проверено, замечания указаны».',width='full'
WHERE collection='device_passports' AND field='diagnostics_status';

CREATE OR REPLACE FUNCTION isvoi_passport_complete(
  p_summary json,p_status text,p_checklist json
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    coalesce(jsonb_typeof(p_summary::jsonb)='array',false)
    AND jsonb_array_length(coalesce(p_summary::jsonb,'[]'::jsonb))>0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(p_summary::jsonb,'[]'::jsonb)) item
      WHERE nullif(trim(item->>'label'),'') IS NULL
         OR nullif(trim(item->>'value'),'') IS NULL
         OR coalesce(item->>'state','') NOT IN ('ok','warn','bad')
    )
    AND nullif(trim(p_status),'') IS NOT NULL
    AND coalesce(jsonb_typeof(p_checklist::jsonb)='array',false)
    AND jsonb_array_length(coalesce(p_checklist::jsonb,'[]'::jsonb))>0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(p_checklist::jsonb,'[]'::jsonb)) item
      WHERE nullif(trim(item->>'text'),'') IS NULL
         OR coalesce(item->>'state','') NOT IN ('ok','warn','bad')
    );
$$;

CREATE OR REPLACE FUNCTION isvoi_validate_product_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_mode varchar; v_category_section varchar;
BEGIN
  IF NEW.category IS NOT NULL AND NEW.product_type IS NOT NULL THEN
    SELECT catalog_section INTO v_category_section FROM product_categories WHERE id=NEW.category;
    IF v_category_section IS DISTINCT FROM NEW.product_type THEN
      RAISE EXCEPTION 'Категория не соответствует типу товара';
    END IF;
  END IF;
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF NEW.content_status <> 'ready' OR NULLIF(NEW.sku,'') IS NULL OR NEW.brand IS NULL OR
     NEW.category IS NULL OR NEW.price <= 0 OR NULLIF(NEW.warranty,'') IS NULL OR
     NEW.listing_file IS NULL OR NULLIF(NEW.stock_status,'') IS NULL THEN
    RAISE EXCEPTION 'Товар не готов к публикации: нужны ready, SKU, бренд, категория, цена, гарантия, главное фото и наличие';
  END IF;
  IF NEW.product_type='device' AND (
    NEW.device_model IS NULL OR NOT EXISTS (SELECT 1 FROM device_details WHERE product=NEW.id)
  ) THEN
    RAISE EXCEPTION 'Для публикации техники нужны точная модель и структурированные характеристики';
  END IF;
  IF NEW.product_type='device' AND NEW.condition='used' AND NOT EXISTS (
    SELECT 1 FROM device_details dd JOIN device_passports dp ON dp.product=NEW.id
    WHERE dd.product=NEW.id AND dd.diagnostic_date IS NOT NULL
      AND NULLIF(dd.diagnostic_by,'') IS NOT NULL AND NULLIF(dd.grade,'') IS NOT NULL
      AND isvoi_passport_complete(dp.summary_rows,dp.diagnostics_status,dp.diagnostics_checklist)
  ) THEN
    RAISE EXCEPTION 'Для публикации техники с пробегом нужны дата и исполнитель диагностики, грейд, краткие факты и чек-лист Passport';
  END IF;
  IF NEW.product_type='accessory' THEN
    SELECT compatibility_mode INTO v_mode FROM accessory_details WHERE product=NEW.id;
    IF v_mode IS NULL THEN RAISE EXCEPTION 'Для аксессуара нужны accessory_details'; END IF;
    IF v_mode='model_specific' AND NOT EXISTS (
      SELECT 1 FROM product_compatible_models WHERE product=NEW.id
    ) THEN
      RAISE EXCEPTION 'Для модельного аксессуара нужна хотя бы одна точная модель совместимости';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION isvoi_assert_published_product_passport(p_product varchar)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM products product
    WHERE product.id=p_product AND product.status='published'
      AND product.product_type='device' AND product.condition='used'
  ) AND NOT EXISTS (
    SELECT 1 FROM device_passports passport
    WHERE passport.product=p_product
      AND isvoi_passport_complete(passport.summary_rows,passport.diagnostics_status,passport.diagnostics_checklist)
  ) THEN
    RAISE EXCEPTION 'Опубликованный товар с пробегом должен сохранять заполненные краткие факты и чек-лист Passport';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION isvoi_validate_published_passport_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM isvoi_assert_published_product_passport(OLD.product);
  ELSIF TG_OP='INSERT' THEN
    PERFORM isvoi_assert_published_product_passport(NEW.product);
  ELSE
    IF OLD.product IS DISTINCT FROM NEW.product THEN
      PERFORM isvoi_assert_published_product_passport(OLD.product);
    END IF;
    PERFORM isvoi_assert_published_product_passport(NEW.product);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS device_passports_publication_guard ON device_passports;
CREATE TRIGGER device_passports_publication_guard
AFTER INSERT OR UPDATE OR DELETE ON device_passports
FOR EACH ROW EXECUTE FUNCTION isvoi_validate_published_passport_change();

${rollback ? "ROLLBACK;\nSELECT 'catalog_editor_ux_v6.rollback' AS check_name,'ok' AS value;" : `COMMIT;

SELECT 'catalog_editor_ux_v6.metadata_missing' AS check_name,count(*)::text AS value
FROM information_schema.columns column_info
WHERE column_info.table_schema='public'
  AND column_info.table_name IN ('products','product_images','device_details','accessory_details','product_compatible_models','device_passports','trade_options')
  AND NOT EXISTS (
    SELECT 1 FROM directus_fields field
    WHERE field.collection=column_info.table_name AND field.field=column_info.column_name
  )
UNION ALL
SELECT 'catalog_editor_ux_v6.readonly_groups',count(*)::text
FROM directus_fields
WHERE collection IN ('products','product_images','device_details','accessory_details','device_passports','trade_options')
  AND coalesce(special,'') LIKE '%group%' AND coalesce(readonly,false)=true
UNION ALL
SELECT 'catalog_editor_ux_v6.passport_repeaters_invalid',count(*)::text
FROM (VALUES
  ('summary_rows','[{"field":"label"},{"field":"value"},{"field":"state"}]'::jsonb),
  ('diagnostics_checklist','[{"field":"text"},{"field":"state"}]'::jsonb)
) expected(field,fields)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields actual
  WHERE actual.collection='device_passports' AND actual.field=expected.field
    AND actual.interface='list' AND actual.options::jsonb->'fields' @> expected.fields
);`}
`);
