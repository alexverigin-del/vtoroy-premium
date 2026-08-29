#!/usr/bin/env node

process.stdout.write(String.raw`
WITH collection_labels(collection,label) AS (
  VALUES
    ('trade_pricing_versions','Trade-in · версии цен'),
    ('trade_device_configs','Trade-in · диапазоны по моделям'),
    ('trade_condition_rules','Trade-in · вопросы и поправки'),
    ('trade_settings','Trade-in · настройки сервиса'),
    ('trade_quotes','Trade-in · предварительные оценки'),
    ('trade_events','Trade-in · события воронки')
), field_labels(collection,field,label) AS (
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
), select_values(collection,field,value) AS (
  VALUES
    ('trade_pricing_versions','status','draft'),
    ('trade_pricing_versions','status','published'),
    ('trade_pricing_versions','status','archived'),
    ('trade_device_configs','status','draft'),
    ('trade_device_configs','status','published'),
    ('trade_device_configs','status','archived'),
    ('trade_condition_rules','status','draft'),
    ('trade_condition_rules','status','published'),
    ('trade_condition_rules','status','archived'),
    ('trade_settings','status','draft'),
    ('trade_settings','status','published'),
    ('trade_settings','status','paused'),
    ('trade_condition_rules','option_value','yes'),
    ('trade_condition_rules','option_value','no'),
    ('trade_condition_rules','option_value','unknown'),
    ('trade_condition_rules','factor_type','positive'),
    ('trade_condition_rules','factor_type','risk'),
    ('trade_condition_rules','factor_type','neutral')
), management_collections(collection) AS (
  VALUES ('trade_pricing_versions'),('trade_device_configs'),('trade_condition_rules'),('trade_settings')
), readable_collections(collection) AS (
  VALUES ('trade_pricing_versions'),('trade_device_configs'),('trade_condition_rules'),('trade_settings'),('trade_quotes'),('trade_events')
), advanced_actions(collection,action) AS (
  SELECT collection,'read' FROM readable_collections
  UNION ALL SELECT collection,'create' FROM management_collections
  UNION ALL SELECT collection,'update' FROM management_collections
), expected_presets(role_name,collection,bookmark) AS (
  VALUES
    ('ISVOI Editor','page_sections','Trade'),
    ('ISVOI Advanced Editor','page_sections','Trade'),
    ('ISVOI Editor','trade_pricing_versions','Trade-in · версии цен'),
    ('ISVOI Advanced Editor','trade_pricing_versions','Trade-in · версии цен'),
    ('ISVOI Editor','trade_device_configs','Trade-in · диапазоны'),
    ('ISVOI Advanced Editor','trade_device_configs','Trade-in · диапазоны'),
    ('ISVOI Editor','trade_condition_rules','Trade-in · правила оценки'),
    ('ISVOI Advanced Editor','trade_condition_rules','Trade-in · правила оценки')
)
SELECT 'trade_studio.collections_missing' AS check_name,count(*)::text AS value
FROM collection_labels expected
WHERE NOT EXISTS(SELECT 1 FROM directus_collections actual WHERE actual.collection=expected.collection)
UNION ALL
SELECT 'trade_studio.collections_hidden',count(*)::text
FROM directus_collections WHERE collection IN(SELECT collection FROM management_collections) AND hidden IS DISTINCT FROM false
UNION ALL
SELECT 'trade_studio.collection_labels_missing',count(*)::text
FROM collection_labels expected
WHERE NOT EXISTS(
  SELECT 1 FROM directus_collections actual
  WHERE actual.collection=expected.collection
    AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(coalesce(actual.translations::jsonb,'[]'::jsonb)) item
      WHERE item->>'language'='ru-RU' AND item->>'translation'=expected.label
    )
)
UNION ALL
SELECT 'trade_studio.field_labels_missing',count(*)::text
FROM field_labels expected
WHERE NOT EXISTS(
  SELECT 1 FROM directus_fields actual
  WHERE actual.collection=expected.collection AND actual.field=expected.field
    AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(coalesce(actual.translations::jsonb,'[]'::jsonb)) item
      WHERE item->>'language'='ru-RU' AND item->>'translation'=expected.label
    )
)
UNION ALL
SELECT 'trade_studio.select_choices_missing',count(*)::text
FROM select_values expected
WHERE NOT EXISTS(
  SELECT 1 FROM directus_fields actual,
       jsonb_array_elements(coalesce(actual.options::jsonb->'choices','[]'::jsonb)) choice
  WHERE actual.collection=expected.collection AND actual.field=expected.field
    AND choice->>'value'=expected.value
)
UNION ALL
SELECT 'trade_studio.editor_read_permissions_missing',count(*)::text
FROM readable_collections expected
WHERE NOT EXISTS(
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Editor' AND permission.collection=expected.collection AND permission.action='read'
)
UNION ALL
SELECT 'trade_studio.editor_unexpected_writes',count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Editor'
  AND permission.collection IN(SELECT collection FROM management_collections)
  AND permission.action IN('create','update','delete')
UNION ALL
SELECT 'trade_studio.advanced_permissions_missing',count(*)::text
FROM advanced_actions expected
WHERE NOT EXISTS(
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Advanced Editor'
    AND permission.collection=expected.collection AND permission.action=expected.action
)
UNION ALL
SELECT 'trade_studio.advanced_unexpected_deletes',count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Advanced Editor'
  AND permission.collection IN(SELECT collection FROM management_collections)
  AND permission.action='delete'
UNION ALL
SELECT 'trade_studio.public_exposure',count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Public Read'
  AND permission.collection IN(SELECT collection FROM readable_collections)
UNION ALL
SELECT 'trade_studio.presets_missing',count(*)::text
FROM expected_presets expected
WHERE NOT EXISTS(
  SELECT 1 FROM directus_presets preset
  JOIN directus_roles role ON role.id=preset.role
  WHERE role.name=expected.role_name AND preset."user" IS NULL
    AND preset.collection=expected.collection AND preset.bookmark=expected.bookmark
)
UNION ALL
SELECT 'trade_studio.page_section_controls_missing',count(*)::text
FROM (VALUES
  ('ISVOI Editor','is_active'),
  ('ISVOI Editor','headline'),
  ('ISVOI Advanced Editor','is_active'),
  ('ISVOI Advanced Editor','content')
) expected(policy_name,field_name)
WHERE NOT EXISTS(
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name=expected.policy_name AND permission.collection='page_sections'
    AND permission.action='update'
    AND (permission.fields='*' OR expected.field_name=ANY(string_to_array(permission.fields,',')))
)
UNION ALL
SELECT 'trade_studio.settings_singleton_invalid',count(*)::text
FROM directus_collections
WHERE collection='trade_settings' AND singleton IS DISTINCT FROM true
UNION ALL
SELECT 'trade_studio.info.active_advanced_users',count(*)::text
FROM directus_users users JOIN directus_roles role ON role.id=users.role
WHERE users.status='active' AND role.name='ISVOI Advanced Editor'
UNION ALL
SELECT 'trade_studio.info.current_state',concat(settings.status,' · ',version.version,' · ',settings.quote_validity_days,' days')
FROM trade_settings settings LEFT JOIN trade_pricing_versions version ON version.id=settings.active_pricing_version
WHERE settings.id=1;
`);
