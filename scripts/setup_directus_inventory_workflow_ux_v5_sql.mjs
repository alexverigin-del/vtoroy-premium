#!/usr/bin/env node

const rollback = process.argv.includes("--rollback");

process.stdout.write(String.raw`
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE inventory_import_issues ADD COLUMN IF NOT EXISTS inventory_item uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='inventory_import_issues_inventory_item_fkey'
  ) THEN
    ALTER TABLE inventory_import_issues
      ADD CONSTRAINT inventory_import_issues_inventory_item_fkey
      FOREIGN KEY (inventory_item) REFERENCES inventory_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_issues_item_idx
  ON inventory_import_issues(inventory_item,resolved);

UPDATE inventory_import_issues issue
SET inventory_item=item.id
FROM inventory_import_batches batch, inventory_items item
WHERE batch.id=issue.batch
  AND issue.source_kind='inventory'
  AND issue.source_id IS NOT NULL
  AND item.source_system=batch.source_system
  AND item.source_id=issue.source_id
  AND issue.inventory_item IS DISTINCT FROM item.id;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_inventory_workflow_field(
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM directus_fields WHERE collection='inventory_items' AND field='group_system'
  ) THEN
    INSERT INTO directus_fields(
      collection,field,interface,special,options,width,sort,hidden,readonly,required,translations,note
    ) VALUES (
      'inventory_items','group_system','group-detail','alias,no-data,group',
      '{"headerIcon":"settings","start":"closed"}'::json,'full',6,false,false,false,
      '[{"language":"ru-RU","translation":"Системные данные"}]'::json,
      'Технические поля импорта. Только чтение.'
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_title','input-multiline',NULL,NULL,'full',1,'Наименование из последнего snapshot. Исправляется в учётной системе и повторным импортом.',NULL,true,true,false,'group_item','Название в источнике');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_sku','input',NULL,NULL,'half',2,'Код из учётной системы.',NULL,true,true,false,'group_item','Код товара');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_article','input',NULL,NULL,'half',3,'Артикул из учётной системы.',NULL,false,true,false,'group_item','Артикул');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','barcode','input',NULL,NULL,'half',4,'Штрих-код — внутренний идентификатор товарной позиции.',NULL,false,true,false,'group_item','Штрих-код');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','condition','select-dropdown','labels','{"choices":[{"text":"Новое","value":"new"},{"text":"С пробегом","value":"used"},{"text":"Replica","value":"replica"}]}'::json,'half',5,'Нормализованное состояние из импорта.',NULL,true,true,false,'group_item','Состояние');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','item_kind','select-dropdown','labels','{"choices":[{"text":"Серийный товар","value":"serialized"},{"text":"Групповой остаток","value":"pooled"}]}'::json,'half',6,'Способ учёта идентичности.',NULL,true,true,false,'group_item','Тип учёта');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','quantity','input',NULL,'{"min":0,"step":1}'::json,'half',7,'Текущий остаток из snapshot.',NULL,true,true,false,'group_item','Количество');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','for_sale','boolean','boolean',NULL,'half',8,'Признак продажи из источника.',NULL,true,true,false,'group_item','Доступно для продажи');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','ownership','input',NULL,NULL,'half',9,'Магазин, ЦО или другое место хранения по источнику.',NULL,false,true,false,'group_item','Место хранения');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','product','select-dropdown-m2o','related-values','{"template":"{{title}} · {{sku}}"}'::json,'full',10,'Связь создаёт inventory apply после допуска. Ручное изменение запрещено.','m2o',false,true,false,'group_item','Карточка сайта');

SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_id','input',NULL,NULL,'half',1,'Стабильный Uuid источника.',NULL,true,true,false,'group_identity','ID в источнике');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','serial_full','input',NULL,NULL,'half',2,'Полный серийный номер. Приватное поле.',NULL,false,true,false,'group_identity','Полный серийный номер');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','imei_full','input',NULL,NULL,'half',3,'Полный IMEI. Приватное поле.',NULL,false,true,false,'group_identity','Полный IMEI');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_group','input',NULL,NULL,'half',4,'Листовая группа из выгрузки.',NULL,false,true,false,'group_identity','Группа в источнике');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_group_path','input-multiline',NULL,NULL,'full',5,'Полная структура групп из выгрузки.',NULL,false,true,false,'group_identity','Структура групп');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_description','input-multiline',NULL,NULL,'full',6,'Описание из учётной системы.',NULL,false,true,false,'group_identity','Описание в источнике');

SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','identity_status','select-dropdown','labels','{"choices":[{"text":"Не требуется","value":"not_applicable"},{"text":"Совпадает","value":"matched"},{"text":"Не найдено","value":"unmatched"},{"text":"Конфликт","value":"conflict"}]}'::json,'half',1,'Автоматический результат сверки идентичности. Для исправления измените источник и повторите импорт.',NULL,true,true,false,'group_review','Проверка идентичности');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','authenticity_status','select-dropdown','labels','{"choices":[{"text":"На проверке","value":"pending"},{"text":"Подтверждено","value":"verified"},{"text":"Не требуется","value":"not_required"},{"text":"Заблокировано","value":"blocked"}]}'::json,'half',2,'Решение Inventory Manager по происхождению товара.',NULL,false,false,false,'group_review','Проверка происхождения');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','eligibility_status','select-dropdown','labels','{"choices":[{"text":"На проверке","value":"pending"},{"text":"Можно в каталог","value":"eligible"},{"text":"Заблокировано","value":"blocked"}]}'::json,'half',3,'Eligible разрешён только после подтверждения и заполненного основания.',NULL,false,false,false,'group_review','Допуск в каталог');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','review_override','boolean','boolean',NULL,'half',4,'Подтверждает осознанное решение Inventory Manager.',NULL,false,false,false,'group_review','Ручной допуск');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','review_note','input-multiline',NULL,NULL,'full',5,'Обязательное основание для допуска товара в каталог.',NULL,false,false,false,'group_review','Основание допуска');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','block_reason','input-multiline',NULL,NULL,'full',6,'Автоматические коды причин. Закрываются исправлением источника или осознанным решением оператора.',NULL,false,true,false,'group_review','Причина блокировки');

SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','purchase_price','input',NULL,'{"min":0,"step":0.01}'::json,'half',1,'Закупочная цена из приватного источника.',NULL,true,true,false,'group_economics','Закупочная цена');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','retail_price','input',NULL,'{"min":0,"step":0.01}'::json,'half',2,'Розничная цена из последнего snapshot.',NULL,true,true,false,'group_economics','Розничная цена');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','receipt_lines','list-o2m',NULL,'{"enableCreate":false,"enableSelect":false}'::json,'full',1,'Связанные строки поступлений.','o2m',false,true,false,'group_relations','Строки поступлений');

SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','id','input',NULL,NULL,'half',1,'Внутренний UUID Directus.',NULL,true,true,false,'group_system','ID');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_system','input',NULL,NULL,'half',2,'Стабильное имя системы-источника.',NULL,true,true,false,'group_system','Система-источник');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','last_seen_batch','select-dropdown-m2o','related-values','{"template":"{{batch_name}}"}'::json,'full',3,'Последняя партия, в которой присутствовала позиция.','m2o',false,true,false,'group_system','Последний snapshot');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_created_at','datetime','datetime',NULL,'half',4,'Дата создания в источнике.',NULL,false,true,false,'group_system','Создано в источнике');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','source_updated_at','datetime','datetime',NULL,'half',5,'Дата изменения в источнике.',NULL,false,true,false,'group_system','Обновлено в источнике');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','created_at','datetime','datetime',NULL,'half',6,'Дата создания строки Directus.',NULL,true,true,false,'group_system','Создано');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_items','updated_at','datetime','datetime',NULL,'half',7,'Дата последней синхронизации.',NULL,true,true,false,'group_system','Обновлено');

SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','severity','select-dropdown','labels','{"choices":[{"text":"Блокер","value":"blocker"},{"text":"Предупреждение","value":"warning"}]}'::json,'half',1,'Уровень проблемы.',NULL,true,true,false,'group_issue','Критичность');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','batch','select-dropdown-m2o','related-values','{"template":"{{batch_name}}"}'::json,'half',2,'Партия проверки.','m2o',true,true,false,'group_issue','Партия');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','inventory_item','select-dropdown-m2o','related-values','{"template":"{{source_title}} · {{source_sku}} · {{quantity}} шт."}'::json,'full',3,'Откройте связанную позицию, примите решение и затем закройте проблему.','m2o',false,true,false,'group_issue','Связанная складская позиция');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','code','input',NULL,NULL,'half',4,'Машинный код проверки.',NULL,true,true,false,'group_issue','Код проверки');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','message','input-multiline',NULL,NULL,'full',5,'Описание найденного расхождения.',NULL,true,true,false,'group_issue','Описание проблемы');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','source_kind','select-dropdown','labels','{"choices":[{"text":"Остатки","value":"inventory"},{"text":"Поступления","value":"receipt"}]}'::json,'half',6,'Часть импорта, где найдена проблема.',NULL,true,true,false,'group_issue','Источник проблемы');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','row_number','input',NULL,NULL,'half',7,'Номер строки исходного файла.',NULL,false,true,false,'group_issue','Строка источника');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','source_id','input',NULL,NULL,'half',8,'Идентификатор строки источника.',NULL,false,true,false,'group_issue','ID в источнике');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','resolved','boolean','boolean',NULL,'half',1,'Отметьте после исправления источника или зафиксированного решения.',NULL,false,false,false,'group_resolution','Решено');
SELECT pg_temp.isvoi_inventory_workflow_field('inventory_import_issues','resolution_note','input-multiline',NULL,NULL,'full',2,'Что проверено и какое решение принято.',NULL,false,false,false,'group_resolution','Как решено');

UPDATE directus_fields SET readonly=false
WHERE collection IN ('inventory_items','inventory_import_issues','inventory_receipt_lines','inventory_import_batches')
  AND coalesce(special,'') LIKE '%group%';

UPDATE directus_fields SET
  translations='[{"language":"ru-RU","translation":"Товар из учётной системы"}]'::json,
  note='Основные сведения из snapshot. Поля только для чтения; исправления делаются в учётной системе.'
WHERE collection='inventory_items' AND field='group_item';
UPDATE directus_fields SET
  translations='[{"language":"ru-RU","translation":"Проверка и решение оператора"}]'::json,
  note='Активные поля Inventory Manager для разбора блокера и допуска в каталог.'
WHERE collection='inventory_items' AND field='group_review';
UPDATE directus_fields SET
  translations='[{"language":"ru-RU","translation":"Проблема и связанный товар"}]'::json,
  note='Автоматические сведения о расхождении. Откройте связанную складскую позицию.'
WHERE collection='inventory_import_issues' AND field='group_issue';
UPDATE directus_fields SET
  translations='[{"language":"ru-RU","translation":"Решение оператора"}]'::json,
  note='Активные поля для закрытия проблемы после проверки.'
WHERE collection='inventory_import_issues' AND field='group_resolution';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_relations
    WHERE many_collection='inventory_import_issues' AND many_field='inventory_item'
  ) THEN
    UPDATE directus_relations SET one_collection='inventory_items',one_field=NULL,one_deselect_action='nullify'
    WHERE many_collection='inventory_import_issues' AND many_field='inventory_item';
  ELSE
    INSERT INTO directus_relations(many_collection,many_field,one_collection,one_field,one_deselect_action)
    VALUES('inventory_import_issues','inventory_item','inventory_items',NULL,'nullify');
  END IF;
END $$;

UPDATE directus_permissions permission
SET fields=permission.fields || ',inventory_item'
FROM directus_policies policy
WHERE permission.policy=policy.id
  AND policy.name IN ('ISVOI Inventory Manager','ISVOI Catalog Import')
  AND permission.collection='inventory_import_issues' AND permission.action='read'
  AND NOT ('inventory_item'=ANY(string_to_array(permission.fields,',')));

UPDATE directus_collections SET
  display_template='{{severity}} · {{inventory_item.source_title}} · {{message}}',
  note='Блокеры и предупреждения импорта. Сначала проверьте связанную складскую позицию, затем зафиксируйте решение.'
WHERE collection='inventory_import_issues';

UPDATE directus_presets preset SET
  layout_query=jsonb_set(
    coalesce(preset.layout_query,'{}'::json)::jsonb,
    '{tabular,fields}',
    '["inventory_item","batch","severity","code","message","resolved","resolution_note"]'::jsonb,
    true
  )::json
FROM directus_roles role
WHERE preset.role=role.id AND role.name='ISVOI Inventory Manager'
  AND preset."user" IS NULL AND preset.collection='inventory_import_issues';

${rollback ? "ROLLBACK;\nSELECT 'inventory_ux_v5.rollback' AS check_name,'ok' AS value;" : `COMMIT;

SELECT 'inventory_ux_v5.operator_groups_readonly' AS check_name,count(*)::text AS value
FROM directus_fields
WHERE collection IN ('inventory_items','inventory_import_issues')
  AND coalesce(special,'') LIKE '%group%' AND coalesce(readonly,false)=true
UNION ALL
SELECT 'inventory_ux_v5.item_metadata_missing',count(*)::text
FROM information_schema.columns column_info
WHERE column_info.table_schema='public' AND column_info.table_name='inventory_items'
  AND NOT EXISTS (
    SELECT 1 FROM directus_fields field
    WHERE field.collection='inventory_items' AND field.field=column_info.column_name
  )
UNION ALL
SELECT 'inventory_ux_v5.active_inventory_issues_unlinked',count(*)::text
FROM inventory_import_issues issue
JOIN inventory_import_batches batch ON batch.id=issue.batch
WHERE issue.resolved=false AND batch.status<>'archived'
  AND issue.source_kind='inventory' AND issue.inventory_item IS NULL;`}
`);
