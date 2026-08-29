#!/usr/bin/env node

const rehearse = process.argv.includes("--rehearse");

process.stdout.write(String.raw`
BEGIN;

WITH labels(collection,label) AS (
  VALUES
    ('trade_pricing_versions','Trade-in · версии цен'),
    ('trade_device_configs','Trade-in · диапазоны по моделям'),
    ('trade_condition_rules','Trade-in · вопросы и поправки'),
    ('trade_settings','Trade-in · настройки сервиса'),
    ('trade_quotes','Trade-in · предварительные оценки'),
    ('trade_events','Trade-in · события воронки')
)
UPDATE directus_collections collection
SET translations=json_build_array(
  json_build_object('language','ru-RU','translation',labels.label)
)::json
FROM labels
WHERE collection.collection=labels.collection;

WITH labels(collection,field,label) AS (
  VALUES
    ('trade_pricing_versions','version','Версия цен'),
    ('trade_pricing_versions','status','Статус'),
    ('trade_pricing_versions','published_at','Дата публикации'),
    ('trade_pricing_versions','published_by','Ответственный Trade Desk'),
    ('trade_pricing_versions','change_reason','Причина изменения'),
    ('trade_device_configs','status','Статус'),
    ('trade_device_configs','pricing_version','Версия цен'),
    ('trade_device_configs','device_model','Модель устройства'),
    ('trade_device_configs','storage','Память'),
    ('trade_device_configs','base_min','Оценка от, ₽'),
    ('trade_device_configs','base_max','Оценка до, ₽'),
    ('trade_device_configs','sort','Порядок'),
    ('trade_condition_rules','status','Статус'),
    ('trade_condition_rules','pricing_version','Версия цен'),
    ('trade_condition_rules','question_key','Системный ключ вопроса'),
    ('trade_condition_rules','question_label','Текст вопроса'),
    ('trade_condition_rules','question_help','Подсказка'),
    ('trade_condition_rules','question_sort','Порядок вопроса'),
    ('trade_condition_rules','option_value','Значение ответа'),
    ('trade_condition_rules','option_label','Подпись ответа'),
    ('trade_condition_rules','option_sort','Порядок ответа'),
    ('trade_condition_rules','delta_min','Поправка к минимуму, ₽'),
    ('trade_condition_rules','delta_max','Поправка к максимуму, ₽'),
    ('trade_condition_rules','factor_label','Объяснение для клиента'),
    ('trade_condition_rules','factor_type','Тип фактора'),
    ('trade_condition_rules','manual_evaluation','Передать на ручную оценку'),
    ('trade_condition_rules','safety_stop','Остановить по безопасности'),
    ('trade_settings','status','Состояние сервиса'),
    ('trade_settings','active_pricing_version','Активная версия цен'),
    ('trade_settings','quote_validity_days','Срок оценки, дней'),
    ('trade_settings','default_store','Магазин по умолчанию'),
    ('trade_settings','updated_at','Обновлено')
)
UPDATE directus_fields field
SET translations=json_build_array(
  json_build_object('language','ru-RU','translation',labels.label)
)::json
FROM labels
WHERE field.collection=labels.collection AND field.field=labels.field;

UPDATE directus_fields
SET options='{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#16a34a"},{"text":"Архив","value":"archived","color":"#9ca3af"}]}'::json
WHERE (collection,field) IN (
  ('trade_pricing_versions','status'),
  ('trade_device_configs','status'),
  ('trade_condition_rules','status')
);

UPDATE directus_fields
SET options='{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Работает","value":"published","color":"#16a34a"},{"text":"Приостановлено","value":"paused","color":"#f59e0b"}]}'::json
WHERE collection='trade_settings' AND field='status';

UPDATE directus_fields
SET options='{"choices":[{"text":"Да","value":"yes"},{"text":"Нет","value":"no"},{"text":"Не знаю","value":"unknown"}]}'::json
WHERE collection='trade_condition_rules' AND field='option_value';

UPDATE directus_fields
SET options='{"choices":[{"text":"Положительный","value":"positive","color":"#16a34a"},{"text":"Риск","value":"risk","color":"#f59e0b"},{"text":"Нейтральный","value":"neutral","color":"#6b7280"}]}'::json
WHERE collection='trade_condition_rules' AND field='factor_type';

CREATE OR REPLACE FUNCTION pg_temp.isvoi_trade_studio_preset(
  p_role_name text,
  p_collection varchar,
  p_bookmark varchar,
  p_icon varchar,
  p_color varchar,
  p_filter json,
  p_layout_query json
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_role uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name=p_role_name LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;

  IF EXISTS(
    SELECT 1 FROM directus_presets
    WHERE role=v_role AND "user" IS NULL AND collection=p_collection AND bookmark=p_bookmark
  ) THEN
    UPDATE directus_presets
    SET icon=p_icon,color=p_color,filter=p_filter,layout='tabular',layout_query=p_layout_query,
        layout_options=NULL,refresh_interval=NULL,search=NULL
    WHERE role=v_role AND "user" IS NULL AND collection=p_collection AND bookmark=p_bookmark;
  ELSE
    INSERT INTO directus_presets(
      bookmark,role,"user",collection,search,layout,layout_query,layout_options,
      refresh_interval,filter,icon,color
    ) VALUES(
      p_bookmark,v_role,NULL,p_collection,NULL,'tabular',p_layout_query,NULL,
      NULL,p_filter,p_icon,p_color
    );
  END IF;
END $$;

SELECT pg_temp.isvoi_trade_studio_preset(
  'ISVOI Advanced Editor','page_sections','Trade','sync_alt','#7c3aed',
  '{"page":{"slug":{"_eq":"trade"}}}'::json,
  '{"tabular":{"sort":["sort_order"],"fields":["sort_order","is_active","headline","section_key","image"],"page":1}}'::json
);

DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['ISVOI Editor','ISVOI Advanced Editor'] LOOP
    PERFORM pg_temp.isvoi_trade_studio_preset(
      role_name,'trade_pricing_versions','Trade-in · версии цен','currency_ruble','#0071e3',
      '{}'::json,
      '{"tabular":{"sort":["-created_at"],"fields":["status","version","published_at","published_by","updated_at"],"page":1}}'::json
    );
    PERFORM pg_temp.isvoi_trade_studio_preset(
      role_name,'trade_device_configs','Trade-in · диапазоны','devices','#0071e3',
      '{}'::json,
      '{"tabular":{"sort":["sort"],"fields":["status","pricing_version","device_model","storage","base_min","base_max","sort"],"page":1}}'::json
    );
    PERFORM pg_temp.isvoi_trade_studio_preset(
      role_name,'trade_condition_rules','Trade-in · правила оценки','rule','#946000',
      '{}'::json,
      '{"tabular":{"sort":["question_sort","option_sort"],"fields":["status","pricing_version","question_sort","question_label","option_label","delta_min","delta_max","manual_evaluation","safety_stop"],"page":1}}'::json
    );
  END LOOP;
END $$;

DROP FUNCTION pg_temp.isvoi_trade_studio_preset(text,varchar,varchar,varchar,varchar,json,json);

${rehearse ? "ROLLBACK;" : "COMMIT;"}
`);
