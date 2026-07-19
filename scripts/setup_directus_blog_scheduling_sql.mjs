#!/usr/bin/env node
/**
 * Print idempotent SQL for the Directus CRON Flow that publishes complete blog
 * posts whose publish_at timestamp has arrived.
 */

const flowOptions = JSON.stringify({ cron: "0 * * * * *" });
const operationOptions = JSON.stringify({
  collection: "blog_posts",
  permissions: "$full",
  emitEvents: true,
  query: {
    filter: {
      _and: [
        { status: { _eq: "scheduled" } },
        { publish_at: { _nnull: true } },
        { publish_at: { _lte: "$NOW" } },
        { excerpt: { _nempty: true } },
        {
          blocks: {
            _some: {
              _and: [{ block_type: { _eq: "rich_text" } }, { body: { _nempty: true } }],
            },
          },
        },
        {
          blocks: {
            _none: {
              _or: [
                {
                  _and: [{ block_type: { _eq: "rich_text" } }, { body: { _empty: true } }],
                },
                {
                  _and: [{ block_type: { _eq: "image" } }, { image: { _null: true } }],
                },
                {
                  _and: [{ block_type: { _eq: "image" } }, { image_alt: { _empty: true } }],
                },
              ],
            },
          },
        },
        { cover_image: { _nnull: true } },
        { cover_alt: { _nempty: true } },
        { category: { _nnull: true } },
        { author: { _nnull: true } },
        { category: { is_active: { _eq: true } } },
        { author: { is_active: { _eq: true } } },
      ],
    },
  },
  payload: { status: "published" },
});

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_flow uuid;
  v_operation uuid;
BEGIN
  SELECT id INTO v_flow FROM directus_flows
  WHERE name = 'ISVOI: опубликовать запланированные статьи'
  LIMIT 1;

  IF v_flow IS NULL THEN
    v_flow := gen_random_uuid();
    INSERT INTO directus_flows (
      id,name,icon,color,description,status,trigger,accountability,options,date_created
    ) VALUES (
      v_flow,
      'ISVOI: опубликовать запланированные статьи',
      'schedule_send',
      '#2563eb',
      'Раз в минуту публикует только полные материалы со статусом scheduled и наступившей publish_at.',
      'active',
      'schedule',
      '$full',
      ${sql(flowOptions)}::json,
      now()
    );
  ELSE
    UPDATE directus_flows SET
      icon='schedule_send', color='#2563eb',
      description='Раз в минуту публикует только полные материалы со статусом scheduled и наступившей publish_at.',
      status='active', trigger='schedule', accountability='$full',
      options=${sql(flowOptions)}::json
    WHERE id=v_flow;
  END IF;

  SELECT id INTO v_operation FROM directus_operations
  WHERE flow=v_flow AND key='isvoi_publish_scheduled_blog_posts'
  LIMIT 1;

  IF v_operation IS NULL THEN
    v_operation := gen_random_uuid();
    INSERT INTO directus_operations (
      id,name,key,type,position_x,position_y,options,flow,date_created
    ) VALUES (
      v_operation,
      'Опубликовать готовые материалы',
      'isvoi_publish_scheduled_blog_posts',
      'item-update',
      19,1,
      ${sql(operationOptions)}::json,
      v_flow,
      now()
    );
  ELSE
    UPDATE directus_operations SET
      name='Опубликовать готовые материалы', type='item-update',
      options=${sql(operationOptions)}::json
    WHERE id=v_operation;
  END IF;

  DELETE FROM directus_operations
  WHERE flow=v_flow AND id<>v_operation AND key='isvoi_publish_scheduled_blog_posts';

  UPDATE directus_flows SET operation=v_operation WHERE id=v_flow;
END;
$$;

COMMIT;

SELECT 'blog.scheduling_flow' AS check_name, count(*)::text AS value
FROM directus_flows
WHERE name='ISVOI: опубликовать запланированные статьи'
  AND status='active' AND trigger='schedule'
  AND options->>'cron'='0 * * * * *'
UNION ALL
SELECT 'blog.scheduling_operation', count(*)::text
FROM directus_operations
WHERE key='isvoi_publish_scheduled_blog_posts' AND type='item-update';
`);
