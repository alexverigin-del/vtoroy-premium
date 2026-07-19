#!/usr/bin/env node
/**
 * Print read-only SQL checks for the ISVOI blog schema, Studio workflow,
 * permissions and publication readiness.
 */

process.stdout.write(String.raw`
WITH expected_tables(table_name) AS (
  VALUES
    ('blog_posts'),
    ('blog_authors'),
    ('blog_categories'),
    ('blog_tags'),
    ('blog_posts_tags'),
    ('blog_posts_devices')
),
expected_fields(table_name, field_name) AS (
  VALUES
    ('blog_posts','id'),('blog_posts','status'),('blog_posts','slug'),
    ('blog_posts','title'),('blog_posts','excerpt'),('blog_posts','body'),
    ('blog_posts','cover_image'),('blog_posts','cover_alt'),('blog_posts','cover_caption'),
    ('blog_posts','category'),('blog_posts','author'),('blog_posts','featured'),
    ('blog_posts','publish_at'),('blog_posts','published_at'),('blog_posts','seo_title'),
    ('blog_posts','meta_description'),('blog_posts','canonical_url'),('blog_posts','no_index'),
    ('blog_posts','og_image'),('blog_posts','date_created'),('blog_posts','date_updated'),
    ('blog_posts','user_created'),('blog_posts','user_updated'),
    ('blog_authors','id'),('blog_authors','name'),('blog_authors','slug'),
    ('blog_authors','role_title'),('blog_authors','bio'),('blog_authors','avatar'),
    ('blog_authors','is_active'),('blog_authors','sort'),
    ('blog_categories','id'),('blog_categories','name'),('blog_categories','slug'),
    ('blog_categories','description'),('blog_categories','is_active'),('blog_categories','sort'),
    ('blog_tags','id'),('blog_tags','name'),('blog_tags','slug'),('blog_tags','is_active'),
    ('blog_posts_tags','id'),('blog_posts_tags','blog_posts_id'),('blog_posts_tags','blog_tags_id'),
    ('blog_posts_devices','id'),('blog_posts_devices','blog_posts_id'),
    ('blog_posts_devices','devices_id'),('blog_posts_devices','sort')
),
expected_relations(many_collection, many_field, one_collection, one_field, junction_field) AS (
  VALUES
    ('blog_authors','avatar','directus_files',NULL,NULL),
    ('blog_posts','cover_image','directus_files',NULL,NULL),
    ('blog_posts','og_image','directus_files',NULL,NULL),
    ('blog_posts','category','blog_categories',NULL,NULL),
    ('blog_posts','author','blog_authors',NULL,NULL),
    ('blog_posts','user_created','directus_users',NULL,NULL),
    ('blog_posts','user_updated','directus_users',NULL,NULL),
    ('blog_posts_tags','blog_posts_id','blog_posts','tags','blog_tags_id'),
    ('blog_posts_tags','blog_tags_id','blog_tags',NULL,'blog_posts_id'),
    ('blog_posts_devices','blog_posts_id','blog_posts','devices','devices_id'),
    ('blog_posts_devices','devices_id','devices',NULL,'blog_posts_id')
),
expected_editor_permissions(collection, action) AS (
  VALUES
    ('blog_posts','read'),('blog_posts','create'),('blog_posts','update'),
    ('blog_authors','read'),('blog_authors','create'),('blog_authors','update'),
    ('blog_categories','read'),('blog_categories','create'),('blog_categories','update'),
    ('blog_tags','read'),('blog_tags','create'),('blog_tags','update'),
    ('blog_posts_tags','read'),('blog_posts_tags','create'),('blog_posts_tags','update'),('blog_posts_tags','delete'),
    ('blog_posts_devices','read'),('blog_posts_devices','create'),('blog_posts_devices','update'),('blog_posts_devices','delete'),
    ('directus_versions','read'),('directus_versions','create'),
    ('directus_versions','update'),('directus_versions','delete')
),
expected_public_permissions(collection, action) AS (
  VALUES
    ('blog_posts','read'),('blog_authors','read'),('blog_categories','read'),
    ('blog_tags','read'),('blog_posts_tags','read'),('blog_posts_devices','read')
),
expected_preview_permissions(collection, action) AS (
  VALUES
    ('blog_posts','read'),('blog_authors','read'),('blog_categories','read'),
    ('blog_tags','read'),('blog_posts_tags','read'),('blog_posts_devices','read'),
    ('directus_files','read'),('devices','read'),('directus_versions','read')
)
SELECT 'blog.schema.tables_missing' AS check_name, count(*)::text AS value
FROM expected_tables et
WHERE to_regclass('public.' || et.table_name) IS NULL
UNION ALL
SELECT 'blog.schema.fields_missing', count(*)::text
FROM expected_fields ef
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name=ef.table_name AND c.column_name=ef.field_name
)
UNION ALL
SELECT 'blog.schema.collections_missing', count(*)::text
FROM expected_tables et
WHERE NOT EXISTS (SELECT 1 FROM directus_collections dc WHERE dc.collection=et.table_name)
UNION ALL
SELECT 'blog.schema.relations_missing', count(*)::text
FROM expected_relations er
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations dr
  WHERE dr.many_collection=er.many_collection
    AND dr.many_field=er.many_field
    AND dr.one_collection=er.one_collection
    AND dr.one_field IS NOT DISTINCT FROM er.one_field
    AND dr.junction_field IS NOT DISTINCT FROM er.junction_field
)
UNION ALL
SELECT 'blog.studio.folder_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (SELECT 1 FROM directus_folders WHERE name='ISVOI Blog' AND parent IS NULL)
UNION ALL
SELECT 'blog.studio.collection_metadata_missing', count(*)::text
FROM (VALUES ('blog_posts'),('blog_authors'),('blog_categories'),('blog_tags')) required(collection)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections dc
  WHERE dc.collection=required.collection AND dc.hidden=false
    AND dc.note IS NOT NULL AND dc.display_template IS NOT NULL
)
UNION ALL
SELECT 'blog.studio.post_groups_missing', count(*)::text
FROM (VALUES
  ('group_publication'),('group_content'),('group_media'),
  ('group_relations'),('group_seo'),('group_system')
) required(field)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields df
  WHERE df.collection='blog_posts' AND df.field=required.field
    AND coalesce(df.special,'') LIKE '%group%'
)
UNION ALL
SELECT 'blog.studio.versioning_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections
  WHERE collection='blog_posts' AND versioning=true
)
UNION ALL
SELECT 'blog.studio.preview_url_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections
  WHERE collection='blog_posts' AND preview_url IS NOT NULL
)
UNION ALL
SELECT 'blog.studio.presets_missing', count(*)::text
FROM (VALUES
  ('Черновики'),('На проверке'),('Запланированные'),
  ('Опубликованные'),('Неполные материалы')
) required(bookmark)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_presets dp
  JOIN directus_roles dr ON dr.id=dp.role
  WHERE dr.name='ISVOI Editor' AND dp.collection='blog_posts'
    AND dp.bookmark=required.bookmark AND dp."user" IS NULL
)
UNION ALL
SELECT 'blog.permissions.editor_missing', count(*)::text
FROM expected_editor_permissions ep
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions p
  JOIN directus_policies policy ON policy.id=p.policy
  WHERE policy.name='ISVOI Editor' AND p.collection=ep.collection AND p.action=ep.action
)
UNION ALL
SELECT 'blog.permissions.public_missing', count(*)::text
FROM expected_public_permissions ep
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions p
  JOIN directus_policies policy ON policy.id=p.policy
  WHERE policy.name='ISVOI Public Read' AND p.collection=ep.collection AND p.action=ep.action
)
UNION ALL
SELECT 'blog.permissions.preview_missing', count(*)::text
FROM expected_preview_permissions ep
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions p
  JOIN directus_policies policy ON policy.id=p.policy
  WHERE policy.name='ISVOI Blog Preview' AND p.collection=ep.collection AND p.action=ep.action
)
UNION ALL
SELECT 'blog.permissions.wildcard_fields', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE (p.collection LIKE 'blog_%' OR policy.name='ISVOI Blog Preview')
  AND policy.name IN ('ISVOI Editor','ISVOI Public Read','ISVOI Blog Preview')
  AND (p.fields='*' OR p.fields LIKE '%,*,%' OR p.fields LIKE '*,%' OR p.fields LIKE '%,*')
  AND NOT (
    p.collection='directus_versions'
    AND policy.name IN ('ISVOI Editor','ISVOI Blog Preview')
  )
UNION ALL
SELECT 'blog.permissions.public_writes', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE p.collection LIKE 'blog_%' AND policy.name='ISVOI Public Read' AND p.action<>'read'
UNION ALL
SELECT 'blog.permissions.preview_writes', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Blog Preview' AND p.action<>'read'
UNION ALL
SELECT 'blog.permissions.editor_destructive_content_delete', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Editor' AND p.action='delete'
  AND p.collection IN ('blog_posts','blog_authors','blog_categories','blog_tags')
UNION ALL
SELECT 'blog.permissions.editor_versions_count_invalid',
  CASE WHEN count(*)=4 THEN '0' ELSE '1' END
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Editor' AND p.collection='directus_versions'
UNION ALL
SELECT 'blog.permissions.editor_versions_scope_invalid', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Editor' AND p.collection='directus_versions'
  AND NOT (
    (p.action='read'
      AND p.fields='*'
      AND p.permissions::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
      AND p.validation IS NULL AND p.presets IS NULL)
    OR (p.action='create'
      AND p.fields='*'
      AND p.permissions IS NULL
      AND p.validation::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
      AND p.presets::jsonb IS NOT DISTINCT FROM '{"collection":"blog_posts"}'::jsonb)
    OR (p.action='update'
      AND p.fields='*'
      AND p.permissions::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
      AND p.validation IS NULL AND p.presets IS NULL)
    OR (p.action='delete'
      AND p.fields='*'
      AND p.permissions::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
      AND p.validation IS NULL AND p.presets IS NULL)
  )
UNION ALL
SELECT 'blog.permissions.preview_versions_count_invalid',
  CASE WHEN count(*)=1 THEN '0' ELSE '1' END
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Blog Preview' AND p.collection='directus_versions'
UNION ALL
SELECT 'blog.permissions.preview_versions_scope_invalid', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Blog Preview' AND p.collection='directus_versions'
  AND NOT (
    p.action='read'
    AND p.fields='*'
    AND p.permissions::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
    AND p.validation IS NULL AND p.presets IS NULL
  )
UNION ALL
SELECT 'blog.content.invalid_slugs', (
  (SELECT count(*) FROM blog_posts WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') +
  (SELECT count(*) FROM blog_authors WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') +
  (SELECT count(*) FROM blog_categories WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') +
  (SELECT count(*) FROM blog_tags WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
)::text
UNION ALL
SELECT 'blog.content.published_incomplete', count(*)::text
FROM blog_posts
WHERE status='published' AND (
  nullif(btrim(title),'') IS NULL OR nullif(btrim(excerpt),'') IS NULL OR
  nullif(btrim(body),'') IS NULL OR cover_image IS NULL OR
  nullif(btrim(cover_alt),'') IS NULL OR category IS NULL OR author IS NULL OR
  published_at IS NULL OR published_at > now()
)
UNION ALL
SELECT 'blog.content.scheduled_without_date', count(*)::text
FROM blog_posts WHERE status='scheduled' AND publish_at IS NULL
UNION ALL
SELECT 'blog.content.published_inactive_relations', count(*)::text
FROM blog_posts p
LEFT JOIN blog_authors a ON a.id=p.author
LEFT JOIN blog_categories c ON c.id=p.category
WHERE p.status='published' AND (a.id IS NULL OR a.is_active=false OR c.id IS NULL OR c.is_active=false)
UNION ALL
SELECT 'blog.content.orphan_junctions', (
  (SELECT count(*) FROM blog_posts_tags pt LEFT JOIN blog_posts p ON p.id=pt.blog_posts_id LEFT JOIN blog_tags t ON t.id=pt.blog_tags_id WHERE p.id IS NULL OR t.id IS NULL) +
  (SELECT count(*) FROM blog_posts_devices pd LEFT JOIN blog_posts p ON p.id=pd.blog_posts_id LEFT JOIN devices d ON d.id=pd.devices_id WHERE p.id IS NULL OR d.id IS NULL)
)::text
UNION ALL
SELECT 'blog.automation.scheduling_flow_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_flows
  WHERE name='ISVOI: опубликовать запланированные статьи'
    AND status='active' AND trigger='schedule'
    AND options->>'cron'='0 * * * * *'
)
UNION ALL
SELECT 'blog.automation.scheduling_operation_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_operations
  WHERE key='isvoi_publish_scheduled_blog_posts' AND type='item-update'
);
`);
