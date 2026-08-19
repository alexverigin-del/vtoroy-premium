#!/usr/bin/env node
/**
 * Print idempotent SQL for the admin-only ISVOI Insights dashboard.
 *
 * Usage:
 *   npm run directus:setup:insights > /tmp/isvoi_setup_directus_insights.sql
 *   npm run directus:setup:insights -- --rollback > /tmp/isvoi_rollback_directus_insights.sql
 */

const rollback = process.argv.includes("--rollback");

if (rollback) {
  process.stdout.write(String.raw`
BEGIN;

DELETE FROM directus_panels
WHERE dashboard = 'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid;

DELETE FROM directus_dashboards
WHERE id = 'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid;

COMMIT;
`);
  process.exit(0);
}

process.stdout.write(String.raw`
BEGIN;

SET client_encoding = 'UTF8';

INSERT INTO directus_dashboards (
  id, name, icon, note, date_created, user_created, color
) VALUES (
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid,
  'Руководитель · Операционный обзор',
  'space_dashboard',
  'Короткий контроль заявок, готовности каталога, складских блокеров и последних импортов. Для обработки записей переходите из списков в Content и сохранённые представления.',
  now(),
  NULL,
  '#1d1d1f'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  note = EXCLUDED.note,
  color = EXCLUDED.color;

CREATE OR REPLACE FUNCTION pg_temp.isvoi_upsert_insights_panel(
  p_id uuid,
  p_name varchar,
  p_icon varchar,
  p_color varchar,
  p_note text,
  p_type varchar,
  p_position_x integer,
  p_position_y integer,
  p_width integer,
  p_height integer,
  p_options json
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO directus_panels (
    id, dashboard, name, icon, color, show_header, note, type,
    position_x, position_y, width, height, options, date_created, user_created
  ) VALUES (
    p_id,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid,
    p_name,
    p_icon,
    p_color,
    true,
    p_note,
    p_type,
    p_position_x,
    p_position_y,
    p_width,
    p_height,
    p_options,
    now(),
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    dashboard = EXCLUDED.dashboard,
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    show_header = EXCLUDED.show_header,
    note = EXCLUDED.note,
    type = EXCLUDED.type,
    position_x = EXCLUDED.position_x,
    position_y = EXCLUDED.position_y,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    options = EXCLUDED.options;
END;
$$;

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0101'::uuid,
  'Новые заявки',
  'mark_email_unread',
  '#d97706',
  'Заявки, которые ещё не взяты в работу.',
  'metric',
  0, 0, 6, 2,
  '{"collection":"leads","field":"id","function":"count","filter":{"status":{"_eq":"new"}},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#d97706"}]}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0102'::uuid,
  'Заявки требуют внимания',
  'notification_important',
  '#dc2626',
  'Активные заявки без ответственного или с просроченным следующим шагом.',
  'metric',
  6, 0, 6, 2,
  '{"collection":"leads","field":"id","function":"count","filter":{"_and":[{"status":{"_in":["new","in_progress","waiting"]}},{"_or":[{"assigned_to":{"_null":true}},{"next_action_at":{"_lt":"$NOW"}}]}]},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#dc2626"}]}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0103'::uuid,
  'Товары доступны',
  'storefront',
  '#059669',
  'Опубликованные товары, доступные для продажи на сайте.',
  'metric',
  12, 0, 6, 2,
  '{"collection":"products","field":"id","function":"count","filter":{"_and":[{"status":{"_eq":"published"}},{"stock_status":{"_eq":"available"}}]},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#059669"}]}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0104'::uuid,
  'Открытые блокеры',
  'report_problem',
  '#dc2626',
  'Нерешённые блокеры проверки складских данных.',
  'metric',
  18, 0, 6, 2,
  '{"collection":"inventory_import_issues","field":"id","function":"count","filter":{"_and":[{"severity":{"_eq":"blocker"}},{"resolved":{"_eq":false}}]},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"textAlign":"center","fontWeight":700,"fontStyle":"normal","fontSize":"auto","font":"sans-serif","conditionalFormatting":[{"operator":">","value":"0","color":"#dc2626"}]}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0105'::uuid,
  'Заявки за 30 дней',
  'show_chart',
  '#2563eb',
  'Динамика входящих заявок по дням.',
  'time-series',
  0, 2, 12, 6,
  '{"collection":"leads","color":"#2563eb","function":"count","precision":"day","dateField":"created_at","range":"1 month","valueField":"id","decimals":0,"curveType":"straight","fillType":"solid","missingData":"0","filter":{},"showXAxis":true,"showYAxis":true}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0106'::uuid,
  'Готовность каталога',
  'format_list_numbered_rtl',
  '#2563eb',
  'Распределение товаров по редакционному статусу.',
  'metric-list',
  12, 2, 12, 6,
  '{"collection":"products","limit":8,"groupByField":"content_status","aggregateField":"id","aggregateFunction":"count","sortDirection":"desc","filter":{},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"conditionalFormatting":[{"operator":">","value":"0","color":"#2563eb"}]}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0107'::uuid,
  'Активные заявки',
  'support_agent',
  '#d97706',
  'Последние открытые заявки. Нажмите строку, чтобы открыть карточку.',
  'list',
  0, 8, 12, 6,
  '{"collection":"leads","limit":5,"sortField":"created_at","sortDirection":"desc","displayTemplate":"{{status}} · {{contact}} · {{kind}}","linkToItem":true,"filter":{"status":{"_in":["new","in_progress","waiting"]}}}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0108'::uuid,
  'Последние блокеры',
  'report_problem',
  '#dc2626',
  'Последние нерешённые блокеры. Нажмите строку, чтобы открыть проблему.',
  'list',
  12, 8, 12, 6,
  '{"collection":"inventory_import_issues","limit":5,"sortField":"created_at","sortDirection":"desc","displayTemplate":"{{code}} · {{message}}","linkToItem":true,"filter":{"_and":[{"severity":{"_eq":"blocker"}},{"resolved":{"_eq":false}}]}}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0109'::uuid,
  'Заявки по типам',
  'donut_large',
  '#6366f1',
  'Структура входящих заявок за последние 90 дней.',
  'metric-list',
  0, 14, 12, 6,
  '{"collection":"leads","limit":8,"groupByField":"kind","aggregateField":"id","aggregateFunction":"count","sortDirection":"desc","filter":{"created_at":{"_gte":"$NOW(-90 days)"}},"numberStyle":"decimal","notation":"standard","minimumFractionDigits":0,"maximumFractionDigits":0,"conditionalFormatting":[{"operator":">","value":"0","color":"#6366f1"}]}'::json
);

SELECT pg_temp.isvoi_upsert_insights_panel(
  'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0110'::uuid,
  'Последние импорты',
  'sync',
  '#0f766e',
  'Последние складские snapshot. Нажмите строку, чтобы открыть партию.',
  'list',
  12, 14, 12, 6,
  '{"collection":"inventory_import_batches","limit":5,"sortField":"snapshot_at","sortDirection":"desc","displayTemplate":"{{snapshot_at}} · {{batch_name}} · {{status}} · {{blocker_count}} блокеров","linkToItem":true,"filter":{}}'::json
);

DELETE FROM directus_panels
WHERE dashboard = 'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0100'::uuid
  AND id NOT IN (
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0101'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0102'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0103'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0104'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0105'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0106'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0107'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0108'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0109'::uuid,
    'f7a3e5bc-1c5b-4d72-8b91-0ea45c6f0110'::uuid
  );

COMMIT;
`);
