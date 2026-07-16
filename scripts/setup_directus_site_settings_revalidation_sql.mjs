#!/usr/bin/env node
/**
 * Print idempotent SQL for an event Flow that invalidates the Next.js site
 * settings cache after editors save the Directus singleton.
 *
 * Required env:
 *   SITE_REVALIDATION_SECRET
 *
 * Optional env:
 *   SITE_REVALIDATION_URL=https://isvoi.ru/api/revalidate/site-settings
 */

const secret = process.env.SITE_REVALIDATION_SECRET || "";
const webhookUrl =
  process.env.SITE_REVALIDATION_URL || "https://isvoi.ru/api/revalidate/site-settings";

if (!secret) {
  console.error("SITE_REVALIDATION_SECRET must be set.");
  process.exit(1);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const flowOptions = JSON.stringify({
  type: "action",
  scope: ["items.update"],
  collections: ["site_settings"],
});

const requestOptions = JSON.stringify({
  url: webhookUrl,
  method: "POST",
  headers: [
    { header: "Content-Type", value: "application/json" },
    { header: "x-isvoi-revalidate-secret", value: secret },
  ],
  body: JSON.stringify({ scope: "site-settings" }),
});

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_flow uuid;
  v_operation uuid;
BEGIN
  SELECT id INTO v_flow
  FROM directus_flows
  WHERE name = 'ISVOI: обновить кэш настроек сайта'
  LIMIT 1;

  IF v_flow IS NULL THEN
    v_flow := gen_random_uuid();
    INSERT INTO directus_flows (
      id, name, icon, color, description, status, trigger, accountability,
      options, date_created
    ) VALUES (
      v_flow,
      'ISVOI: обновить кэш настроек сайта',
      'cached',
      '#2563eb',
      'После сохранения настроек сайта сразу обновляет публичный кэш Next.js.',
      'active',
      'event',
      '$full',
      ${sql(flowOptions)}::json,
      now()
    );
  ELSE
    UPDATE directus_flows
    SET icon = 'cached',
      color = '#2563eb',
      description = 'После сохранения настроек сайта сразу обновляет публичный кэш Next.js.',
      status = 'active',
      trigger = 'event',
      accountability = '$full',
      options = ${sql(flowOptions)}::json
    WHERE id = v_flow;
  END IF;

  SELECT id INTO v_operation
  FROM directus_operations
  WHERE flow = v_flow AND key = 'isvoi_revalidate_site_settings'
  LIMIT 1;

  IF v_operation IS NULL THEN
    v_operation := gen_random_uuid();
    INSERT INTO directus_operations (
      id, name, key, type, position_x, position_y, options, flow, date_created
    ) VALUES (
      v_operation,
      'Обновить публичный кэш',
      'isvoi_revalidate_site_settings',
      'request',
      19,
      1,
      ${sql(requestOptions)}::json,
      v_flow,
      now()
    );
  ELSE
    UPDATE directus_operations
    SET name = 'Обновить публичный кэш',
      type = 'request',
      options = ${sql(requestOptions)}::json
    WHERE id = v_operation;
  END IF;

  UPDATE directus_flows SET operation = v_operation WHERE id = v_flow;
END;
$$;

COMMIT;

SELECT 'site_settings_revalidation_flow' AS check_name, count(*)::text AS value
FROM directus_flows
WHERE name = 'ISVOI: обновить кэш настроек сайта'
  AND status = 'active'
  AND trigger = 'event'
UNION ALL
SELECT 'site_settings_revalidation_operation', count(*)::text
FROM directus_operations
WHERE key = 'isvoi_revalidate_site_settings'
  AND type = 'request';
`);
