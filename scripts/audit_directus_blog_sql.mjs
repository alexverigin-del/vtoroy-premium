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
    ('blog_posts_devices'),
    ('blog_post_blocks')
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
    ('blog_posts_devices','devices_id'),('blog_posts_devices','sort'),
    ('blog_post_blocks','id'),('blog_post_blocks','post'),('blog_post_blocks','sort'),
    ('blog_post_blocks','block_type'),('blog_post_blocks','body'),
    ('blog_post_blocks','image'),('blog_post_blocks','image_alt'),
    ('blog_post_blocks','image_caption'),('blog_post_blocks','image_width'),
    ('blog_post_blocks','date_created'),('blog_post_blocks','date_updated')
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
    ('blog_posts_devices','devices_id','devices',NULL,'blog_posts_id'),
    ('blog_post_blocks','post','blog_posts','blocks',NULL),
    ('blog_post_blocks','image','directus_files',NULL,NULL)
),
expected_editor_permissions(collection, action) AS (
  VALUES
    ('blog_posts','read'),('blog_posts','create'),('blog_posts','update'),
    ('blog_authors','read'),('blog_authors','create'),('blog_authors','update'),
    ('blog_categories','read'),('blog_categories','create'),('blog_categories','update'),
    ('blog_tags','read'),('blog_tags','create'),('blog_tags','update'),
    ('blog_posts_tags','read'),('blog_posts_tags','create'),('blog_posts_tags','update'),('blog_posts_tags','delete'),
    ('blog_posts_devices','read'),('blog_posts_devices','create'),('blog_posts_devices','update'),('blog_posts_devices','delete'),
    ('blog_post_blocks','read'),('blog_post_blocks','create'),('blog_post_blocks','update'),('blog_post_blocks','delete')
),
expected_editor_post_groups(action, field) AS (
  SELECT action, field
  FROM (VALUES ('read'),('create'),('update')) actions(action)
  CROSS JOIN (VALUES
    ('group_publication'),('group_content'),('group_media'),
    ('group_relations'),('group_seo'),('group_system')
  ) groups(field)
),
expected_blog_media_fields(collection, field) AS (
  VALUES
    ('blog_posts','body'),('blog_posts','cover_image'),('blog_posts','og_image'),
    ('blog_authors','avatar'),('blog_post_blocks','body'),('blog_post_blocks','image')
),
expected_workflow_permissions(collection, action) AS (
  VALUES
    ('directus_versions','read'),('directus_versions','create'),
    ('directus_versions','update'),('directus_versions','delete'),
    ('directus_revisions','read')
),
expected_publisher_permissions(collection, action, fields, validation) AS (
  VALUES
    ('blog_posts','read','*',NULL::jsonb),
    ('blog_posts','update','*','{"status":{"_in":["draft","review","scheduled","published","archived"]},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"title":{"_nnull":true}}'::jsonb),
    ('blog_post_blocks','read','*',NULL::jsonb),
    ('blog_post_blocks','create','*','{}'::jsonb),
    ('blog_post_blocks','update','*','{}'::jsonb),
    ('blog_post_blocks','delete','*',NULL::jsonb)
),
expected_media_permissions(collection, action) AS (
  VALUES ('directus_files','create')
),
expected_public_permissions(collection, action) AS (
  VALUES
    ('blog_posts','read'),('blog_authors','read'),('blog_categories','read'),
    ('blog_tags','read'),('blog_posts_tags','read'),('blog_posts_devices','read'),
    ('blog_post_blocks','read')
),
expected_preview_permissions(collection, action) AS (
  VALUES
    ('blog_posts','read'),('blog_authors','read'),('blog_categories','read'),
    ('blog_tags','read'),('blog_posts_tags','read'),('blog_posts_devices','read'),
    ('blog_post_blocks','read'),
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
SELECT 'blog.schema.version_collection_guard_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname='isvoi_directus_versions_blog_only'
    AND conrelid='directus_versions'::regclass
    AND pg_get_constraintdef(oid)='CHECK (((collection)::text = ''blog_posts''::text))'
    AND convalidated=true
)
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
SELECT 'blog.studio.blocks_field_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields
  WHERE collection='blog_posts' AND field='blocks'
    AND coalesce(special,'') LIKE '%o2m%'
    AND interface='list-o2m'
)
UNION ALL
SELECT 'blog.studio.media_folder_options_invalid', count(*)::text
FROM expected_blog_media_fields expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  JOIN directus_folders folder ON folder.name='ISVOI Blog' AND folder.parent IS NULL
  WHERE field.collection=expected.collection
    AND field.field=expected.field
    AND field.options::jsonb->>'folder'=folder.id::text
)
UNION ALL
SELECT 'blog.studio.versioning_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections
  WHERE collection='blog_posts' AND versioning=true
)
UNION ALL
SELECT 'blog.studio.unexpected_versioned_collections', count(*)::text
FROM directus_collections
WHERE versioning=true AND collection<>'blog_posts'
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
SELECT 'blog.permissions.editor_post_groups_missing', count(*)::text
FROM expected_editor_post_groups expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Editor'
    AND permission.collection='blog_posts'
    AND permission.action=expected.action
    AND (',' || permission.fields || ',') LIKE ('%,' || expected.field || ',%')
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
SELECT 'blog.permissions.public_posts_scope_invalid', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Public Read'
  AND p.collection='blog_posts'
  AND p.action='read'
  AND NOT (
    (',' || p.fields || ',') LIKE '%,status,%'
    AND p.permissions::jsonb IS NOT DISTINCT FROM '{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}'::jsonb
  )
UNION ALL
SELECT 'blog.permissions.public_file_scope_missing', count(*)::text
FROM (VALUES ('ISVOI Public Read'),('$t:public_label')) required(policy_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions p
  JOIN directus_policies policy ON policy.id=p.policy
  WHERE policy.name=required.policy_name
    AND p.collection='directus_files'
    AND p.action='read'
    AND p.permissions::jsonb IS NOT NULL
    AND p.permissions::jsonb::text LIKE '%folder%'
)
UNION ALL
SELECT 'blog.permissions.workflow_missing', count(*)::text
FROM expected_workflow_permissions ep
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions p
  JOIN directus_policies policy ON policy.id=p.policy
  WHERE policy.name='ISVOI Blog Version Workflow'
    AND p.collection=ep.collection AND p.action=ep.action
)
UNION ALL
SELECT 'blog.permissions.workflow_policy_invalid', count(*)::text
FROM directus_policies
WHERE name='ISVOI Blog Version Workflow'
  AND (coalesce(app_access,false) OR coalesce(admin_access,false) OR coalesce(enforce_tfa,false))
UNION ALL
SELECT 'blog.permissions.workflow_revisions_scope_invalid', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Blog Version Workflow'
  AND permission.collection='directus_revisions'
  AND NOT (
    permission.action='read'
    AND permission.fields='*'
    AND permission.permissions::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
    AND permission.validation IS NULL
    AND permission.presets IS NULL
  )
UNION ALL
SELECT 'blog.permissions.workflow_role_bindings_missing', count(*)::text
FROM (VALUES ('ISVOI Editor'),('ISVOI Advanced Editor')) required(role_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_access access
  JOIN directus_roles role ON role.id=access.role
  JOIN directus_policies policy ON policy.id=access.policy
  WHERE role.name=required.role_name
    AND policy.name='ISVOI Blog Version Workflow'
    AND access."user" IS NULL
)
UNION ALL
SELECT 'blog.permissions.workflow_unexpected_bindings', count(*)::text
FROM directus_access access
JOIN directus_policies policy ON policy.id=access.policy
LEFT JOIN directus_roles role ON role.id=access.role
WHERE policy.name='ISVOI Blog Version Workflow'
  AND (access."user" IS NOT NULL OR role.name NOT IN ('ISVOI Editor','ISVOI Advanced Editor'))
UNION ALL
SELECT 'blog.permissions.publisher_policy_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_policies
  WHERE name='ISVOI Blog Publisher'
    AND coalesce(app_access,false)=false
    AND coalesce(admin_access,false)=false
    AND coalesce(enforce_tfa,false)=false
)
UNION ALL
SELECT 'blog.permissions.publisher_permissions_missing', count(*)::text
FROM expected_publisher_permissions expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Blog Publisher'
    AND permission.collection=expected.collection
    AND permission.action=expected.action
    AND permission.fields=expected.fields
    AND permission.permissions IS NULL
    AND permission.validation::jsonb IS NOT DISTINCT FROM expected.validation
    AND permission.presets IS NULL
)
UNION ALL
SELECT 'blog.permissions.publisher_role_binding_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_access access
  JOIN directus_roles role ON role.id=access.role
  JOIN directus_policies policy ON policy.id=access.policy
  WHERE role.name='ISVOI Advanced Editor'
    AND policy.name='ISVOI Blog Publisher'
    AND access."user" IS NULL
)
UNION ALL
SELECT 'blog.permissions.publisher_unexpected_bindings', count(*)::text
FROM directus_access access
JOIN directus_policies policy ON policy.id=access.policy
LEFT JOIN directus_roles role ON role.id=access.role
WHERE policy.name='ISVOI Blog Publisher'
  AND (access."user" IS NOT NULL OR role.name<>'ISVOI Advanced Editor')
UNION ALL
SELECT 'blog.permissions.publisher_scope_invalid', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Blog Publisher'
  AND NOT EXISTS (
    SELECT 1 FROM expected_publisher_permissions expected
    WHERE permission.collection=expected.collection
      AND permission.action=expected.action
      AND permission.fields=expected.fields
      AND permission.permissions IS NULL
      AND permission.validation::jsonb IS NOT DISTINCT FROM expected.validation
      AND permission.presets IS NULL
  )
UNION ALL
SELECT 'blog.permissions.media_missing', count(*)::text
FROM expected_media_permissions ep
WHERE NOT EXISTS (
  SELECT 1 FROM directus_permissions p
  JOIN directus_policies policy ON policy.id=p.policy
  WHERE policy.name='ISVOI Editor Media Workflow'
    AND p.collection=ep.collection AND p.action=ep.action
)
UNION ALL
SELECT 'blog.permissions.media_policy_invalid', count(*)::text
FROM directus_policies
WHERE name='ISVOI Editor Media Workflow'
  AND (coalesce(app_access,false) OR coalesce(admin_access,false) OR coalesce(enforce_tfa,false))
UNION ALL
SELECT 'blog.permissions.media_role_bindings_missing', count(*)::text
FROM (VALUES ('ISVOI Editor'),('ISVOI Advanced Editor')) required(role_name)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_access access
  JOIN directus_roles role ON role.id=access.role
  JOIN directus_policies policy ON policy.id=access.policy
  WHERE role.name=required.role_name
    AND policy.name='ISVOI Editor Media Workflow'
    AND access."user" IS NULL
)
UNION ALL
SELECT 'blog.permissions.media_unexpected_bindings', count(*)::text
FROM directus_access access
JOIN directus_policies policy ON policy.id=access.policy
LEFT JOIN directus_roles role ON role.id=access.role
WHERE policy.name='ISVOI Editor Media Workflow'
  AND (access."user" IS NOT NULL OR role.name NOT IN ('ISVOI Editor','ISVOI Advanced Editor'))
UNION ALL
SELECT 'blog.permissions.media_scope_invalid', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Editor Media Workflow'
  AND NOT (
    p.collection='directus_files'
    AND p.action='create'
    AND p.fields='*'
    AND p.permissions IS NULL
    AND p.presets IS NULL
    AND p.validation::jsonb IS NOT DISTINCT FROM (
      SELECT jsonb_build_object(
        'folder',
        jsonb_build_object(
          '_in',
          COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb)
        )
      )
      FROM directus_folders
      WHERE name IN ('ISVOI Device Photos','ISVOI Site Assets','ISVOI Editorial','ISVOI Blog')
        AND parent IS NULL
    )
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
WHERE (p.collection LIKE 'blog_%' OR policy.name IN ('ISVOI Blog Preview','ISVOI Blog Version Workflow','ISVOI Editor Media Workflow'))
  AND policy.name IN ('ISVOI Editor','ISVOI Public Read','ISVOI Blog Preview','ISVOI Blog Version Workflow','ISVOI Editor Media Workflow')
  AND (p.fields='*' OR p.fields LIKE '%,*,%' OR p.fields LIKE '*,%' OR p.fields LIKE '%,*')
  AND NOT (
    p.collection='directus_versions'
    AND policy.name IN ('ISVOI Blog Version Workflow','ISVOI Blog Preview')
  )
  AND NOT (
    p.collection='directus_files'
    AND p.action='create'
    AND policy.name='ISVOI Editor Media Workflow'
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
SELECT 'blog.permissions.workflow_versions_count_invalid',
  CASE WHEN count(*)=4 THEN '0' ELSE '1' END
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Blog Version Workflow' AND p.collection='directus_versions'
UNION ALL
SELECT 'blog.permissions.workflow_versions_scope_invalid', count(*)::text
FROM directus_permissions p
JOIN directus_policies policy ON policy.id=p.policy
WHERE policy.name='ISVOI Blog Version Workflow' AND p.collection='directus_versions'
  AND NOT (
    (p.action='read'
      AND p.fields='*'
      AND p.permissions::jsonb IS NOT DISTINCT FROM '{"collection":{"_eq":"blog_posts"}}'::jsonb
      AND p.validation IS NULL AND p.presets IS NULL)
    OR (p.action='create'
      AND p.fields='*'
      AND p.permissions IS NULL
      AND p.validation IS NULL
      AND p.presets IS NULL)
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
  cover_image IS NULL OR
  nullif(btrim(cover_alt),'') IS NULL OR category IS NULL OR author IS NULL OR
  published_at IS NULL OR published_at > now() OR NOT EXISTS (
    SELECT 1 FROM blog_post_blocks block
    WHERE block.post=blog_posts.id AND block.block_type='rich_text'
      AND nullif(btrim(block.body),'') IS NOT NULL
  )
)
UNION ALL
SELECT 'blog.content.published_legacy_body', count(*)::text
FROM blog_posts
WHERE status='published' AND nullif(btrim(body),'') IS NOT NULL
UNION ALL
SELECT 'blog.content.published_invalid_blocks', count(*)::text
FROM blog_post_blocks block
JOIN blog_posts post ON post.id=block.post
WHERE post.status='published' AND (
  (block.block_type='rich_text' AND nullif(btrim(block.body),'') IS NULL) OR
  (block.block_type='image' AND (block.image IS NULL OR nullif(btrim(block.image_alt),'') IS NULL))
)
UNION ALL
SELECT 'blog.content.published_private_cover', count(*)::text
FROM blog_posts post
JOIN directus_files file ON file.id=post.cover_image
LEFT JOIN directus_folders folder ON folder.id=file.folder
WHERE post.status='published'
  AND coalesce(folder.name,'') NOT IN ('ISVOI Device Photos','ISVOI Site Assets','ISVOI Editorial')
UNION ALL
SELECT 'blog.content.published_private_block_image', count(*)::text
FROM blog_post_blocks block
JOIN blog_posts post ON post.id=block.post
JOIN directus_files file ON file.id=block.image
LEFT JOIN directus_folders folder ON folder.id=file.folder
WHERE post.status='published' AND block.block_type='image'
  AND coalesce(folder.name,'') NOT IN ('ISVOI Device Photos','ISVOI Site Assets','ISVOI Editorial')
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
  (SELECT count(*) FROM blog_posts_devices pd LEFT JOIN blog_posts p ON p.id=pd.blog_posts_id LEFT JOIN devices d ON d.id=pd.devices_id WHERE p.id IS NULL OR d.id IS NULL) +
  (SELECT count(*) FROM blog_post_blocks block LEFT JOIN blog_posts p ON p.id=block.post LEFT JOIN directus_files file ON file.id=block.image WHERE p.id IS NULL OR (block.image IS NOT NULL AND file.id IS NULL))
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
)
UNION ALL
SELECT 'blog.automation.schedule_revalidation_missing', count(*)::text
FROM (VALUES (1)) required(dummy)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_operations
  WHERE key='isvoi_revalidate_after_blog_schedule' AND type='request'
)
UNION ALL
SELECT 'blog.automation.schedule_revalidation_chain_invalid', count(*)::text
FROM directus_operations publish
LEFT JOIN directus_operations revalidate ON revalidate.id=publish.resolve
WHERE publish.key='isvoi_publish_scheduled_blog_posts'
  AND (
    revalidate.id IS NULL
    OR revalidate.key<>'isvoi_revalidate_after_blog_schedule'
    OR revalidate.type<>'request'
    OR revalidate.flow<>publish.flow
  );
`);
