#!/usr/bin/env node
/**
 * Print idempotent SQL that fills Directus `device_passports.story_*` fields.
 *
 * Run this after `directus:setup:catalog-structured-data` has added the
 * columns. The update is Studio-safe: existing non-empty editor copy wins.
 *
 * Usage:
 *   node scripts/update_directus_device_stories_sql.mjs > /tmp/isvoi_device_stories.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_device_stories.sql
 */

process.stdout.write(String.raw`
BEGIN;

WITH stories(device, story_title, story_body, story_facts) AS (
  VALUES
    (
      'iphone-13-pro',
      'Рабочий телефон из закрытого круга',
      'Эта вещь пришла от постоянного клиента I СВОИ: использовалась как основной рабочий телефон для встреч, поездок и деловой связи. Перед передачей данные удалены, устройство прошло диагностику, а небольшие следы на ребре уже учтены в грейде и цене.',
      '["Один аккуратный владелец","Передан после планового обновления","История без сервисного вскрытия"]'::json
    ),
    (
      'iphone-14',
      'Телефон после аккуратного апгрейда',
      'iPhone перешёл в I СВОИ после планового обновления на свежую модель. Им пользовались бережно: без ремонта, без следов влаги и без спорных сервисных вмешательств. Поэтому история вещи короткая и понятная: покупка, аккуратное использование, проверка, новая карточка в Store.',
      '["Плановый апгрейд владельца","Оригинальная история обслуживания","Без скрытых сервисных работ"]'::json
    ),
    (
      'macbook-air-m1',
      'Ноутбук для поездок и документов',
      'MacBook использовался как лёгкий рабочий ноутбук: документы, переговоры, поездки и ежедневная связь. Следы на нижней крышке честно вынесены в грейд B+, зато экран, клавиатура, трекпад и батарея прошли проверку без замечаний.',
      '["Рабочая история без ремонта","214 циклов батареи","Следы корпуса учтены в цене"]'::json
    ),
    (
      'ipad-air',
      'Домашний планшет с понятным сценарием',
      'iPad был домашним устройством для чтения, видео и поездок, без тяжёлых рабочих нагрузок и спорного ремонта. Перед публикацией его проверили по экрану, Touch ID, камерам, динамикам и зарядке, а небольшой след на кромке зафиксировали отдельно.',
      '["Домашний сценарий использования","Touch ID и экран проверены","Нюанс корпуса раскрыт заранее"]'::json
    )
)
INSERT INTO device_passports (device, story_title, story_body, story_facts)
SELECT s.device, s.story_title, s.story_body, s.story_facts
FROM stories s
JOIN devices d ON d.id = s.device
ON CONFLICT (device) DO UPDATE SET
  story_title = COALESCE(NULLIF(device_passports.story_title, ''), EXCLUDED.story_title),
  story_body = COALESCE(NULLIF(device_passports.story_body, ''), EXCLUDED.story_body),
  story_facts = COALESCE(device_passports.story_facts, EXCLUDED.story_facts);

COMMIT;
`);
