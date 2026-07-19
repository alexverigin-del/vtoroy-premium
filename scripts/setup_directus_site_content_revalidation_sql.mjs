#!/usr/bin/env node
/**
 * Print idempotent SQL for an event Flow that invalidates the Next.js site
 * content cache after editors create, update or delete managed content.
 *
 * Required env:
 *   SITE_REVALIDATION_SECRET
 *
 * Optional env:
 *   SITE_REVALIDATION_URL=https://isvoi.ru/api/revalidate/site-content
 */

const secret = process.env.SITE_REVALIDATION_SECRET || "";
const webhookUrl =
  process.env.SITE_REVALIDATION_URL || "https://isvoi.ru/api/revalidate/site-content";

if (!secret) {
  console.error("SITE_REVALIDATION_SECRET must be set.");
  process.exit(1);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const flowOptions = JSON.stringify({
  type: "action",
  scope: ["items.create", "items.update", "items.delete"],
  collections: [
    "site_settings",
    "site_pages",
    "page_sections",
    "navigation_items",
    "faq_items",
    "device_page_settings",
    "blog_posts",
    "blog_authors",
    "blog_categories",
    "blog_tags",
    "blog_posts_tags",
    "blog_posts_devices",
    "blog_post_blocks",
  ],
});

const requestOptions = JSON.stringify({
  url: webhookUrl,
  method: "POST",
  headers: [
    { header: "Content-Type", value: "application/json" },
    { header: "x-isvoi-revalidate-secret", value: secret },
  ],
  body: JSON.stringify({ scope: "site-content" }),
});

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_flow uuid;
  v_operation uuid;
  v_scheduling_flow uuid;
  v_publish_operation uuid;
  v_schedule_revalidation_operation uuid;
BEGIN
  SELECT id INTO v_flow
  FROM directus_flows
  WHERE name IN (
    'ISVOI: обновить кэш контента сайта',
    'ISVOI: обновить кэш настроек сайта'
  )
  ORDER BY CASE WHEN name = 'ISVOI: обновить кэш контента сайта' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_flow IS NULL THEN
    v_flow := gen_random_uuid();
    INSERT INTO directus_flows (
      id, name, icon, color, description, status, trigger, accountability,
      options, date_created
    ) VALUES (
      v_flow,
      'ISVOI: обновить кэш контента сайта',
      'cached',
      '#2563eb',
      'После создания, изменения или удаления редакторского контента сразу обновляет публичный кэш Next.js.',
      'active',
      'event',
      '$full',
      ${sql(flowOptions)}::json,
      now()
    );
  ELSE
    UPDATE directus_flows
    SET name = 'ISVOI: обновить кэш контента сайта',
      icon = 'cached',
      color = '#2563eb',
      description = 'После создания, изменения или удаления редакторского контента сразу обновляет публичный кэш Next.js.',
      status = 'active',
      trigger = 'event',
      accountability = '$full',
      options = ${sql(flowOptions)}::json
    WHERE id = v_flow;
  END IF;

  UPDATE directus_flows
  SET status = 'inactive'
  WHERE id <> v_flow
    AND name IN (
      'ISVOI: обновить кэш контента сайта',
      'ISVOI: обновить кэш настроек сайта'
    );

  SELECT id INTO v_operation
  FROM directus_operations
  WHERE flow = v_flow
    AND key IN ('isvoi_revalidate_site_content', 'isvoi_revalidate_site_settings')
  ORDER BY CASE WHEN key = 'isvoi_revalidate_site_content' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_operation IS NULL THEN
    v_operation := gen_random_uuid();
    INSERT INTO directus_operations (
      id, name, key, type, position_x, position_y, options, flow, date_created
    ) VALUES (
      v_operation,
      'Обновить публичный кэш',
      'isvoi_revalidate_site_content',
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
      key = 'isvoi_revalidate_site_content',
      type = 'request',
      options = ${sql(requestOptions)}::json
    WHERE id = v_operation;
  END IF;

  DELETE FROM directus_operations
  WHERE flow = v_flow
    AND id <> v_operation
    AND key IN ('isvoi_revalidate_site_content', 'isvoi_revalidate_site_settings');

  UPDATE directus_flows SET operation = v_operation WHERE id = v_flow;

  -- Updates emitted from a scheduled Flow do not reliably start another event
  -- Flow. Chain the same revalidation request directly after blog publication.
  SELECT id INTO v_scheduling_flow
  FROM directus_flows
  WHERE name = 'ISVOI: опубликовать запланированные статьи'
  LIMIT 1;

  SELECT id INTO v_publish_operation
  FROM directus_operations
  WHERE flow = v_scheduling_flow
    AND key = 'isvoi_publish_scheduled_blog_posts'
  LIMIT 1;

  IF v_scheduling_flow IS NOT NULL AND v_publish_operation IS NOT NULL THEN
    SELECT id INTO v_schedule_revalidation_operation
    FROM directus_operations
    WHERE flow = v_scheduling_flow
      AND key = 'isvoi_revalidate_after_blog_schedule'
    LIMIT 1;

    IF v_schedule_revalidation_operation IS NULL THEN
      v_schedule_revalidation_operation := gen_random_uuid();
      INSERT INTO directus_operations (
        id, name, key, type, position_x, position_y, options, flow, date_created
      ) VALUES (
        v_schedule_revalidation_operation,
        'Обновить кэш после публикации',
        'isvoi_revalidate_after_blog_schedule',
        'request',
        38,
        1,
        ${sql(requestOptions)}::json,
        v_scheduling_flow,
        now()
      );
    ELSE
      UPDATE directus_operations
      SET name = 'Обновить кэш после публикации',
        type = 'request',
        options = ${sql(requestOptions)}::json,
        resolve = NULL,
        reject = NULL
      WHERE id = v_schedule_revalidation_operation;
    END IF;

    DELETE FROM directus_operations
    WHERE flow = v_scheduling_flow
      AND id <> v_schedule_revalidation_operation
      AND key = 'isvoi_revalidate_after_blog_schedule';

    UPDATE directus_operations
    SET resolve = v_schedule_revalidation_operation
    WHERE id = v_publish_operation;
  END IF;
END;
$$;

COMMIT;

SELECT 'site_content_revalidation_flow' AS check_name, count(*)::text AS value
FROM directus_flows
WHERE name = 'ISVOI: обновить кэш контента сайта'
  AND status = 'active'
  AND trigger = 'event'
UNION ALL
SELECT 'site_content_revalidation_operation', count(*)::text
FROM directus_operations
WHERE key = 'isvoi_revalidate_site_content'
  AND type = 'request'
UNION ALL
SELECT 'blog_schedule_revalidation_operation', count(*)::text
FROM directus_operations
WHERE key = 'isvoi_revalidate_after_blog_schedule'
  AND type = 'request'
UNION ALL
SELECT 'legacy_site_settings_revalidation_active', count(*)::text
FROM directus_flows
WHERE name = 'ISVOI: обновить кэш настроек сайта'
  AND status = 'active';
`);
