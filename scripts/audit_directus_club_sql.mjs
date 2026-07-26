#!/usr/bin/env node
/**
 * Print read-only SQL checks for the ISVOI Club schema, Studio setup,
 * permissions, content safety and public-index launch gate.
 */

process.stdout.write(String.raw`
CREATE TEMP TABLE IF NOT EXISTS isvoi_audit_results (
  check_name text PRIMARY KEY,
  value text NOT NULL
);

WITH expected_tables(table_name) AS (
  VALUES
    ('club_plans'),
    ('club_offers'),
    ('club_rule_items'),
    ('club_process_items'),
    ('club_legal_documents'),
    ('club_page_settings')
),
expected_fields(table_name, field_name) AS (
  VALUES
    ('club_plans','id'),('club_plans','status'),('club_plans','slug'),
    ('club_plans','name'),('club_plans','summary'),('club_plans','min_term_months'),
    ('club_plans','features'),('club_plans','support_level'),
    ('club_plans','service_response_text'),('club_plans','diagnostics_text'),
    ('club_plans','replacement_text'),('club_plans','early_exit_text'),
    ('club_plans','damage_text'),('club_plans','is_future'),('club_plans','sort'),
    ('club_offers','id'),('club_offers','status'),('club_offers','offer_status'),
    ('club_offers','product'),('club_offers','plan'),('club_offers','term_months'),
    ('club_offers','monthly_from'),('club_offers','pricing_mode'),
    ('club_offers','terms_text'),('club_offers','sort'),
    ('club_rule_items','id'),('club_rule_items','status'),('club_rule_items','category'),
    ('club_rule_items','title'),('club_rule_items','body'),('club_rule_items','sort'),
    ('club_process_items','id'),('club_process_items','status'),
    ('club_process_items','group_key'),('club_process_items','slug'),
    ('club_process_items','title'),('club_process_items','body'),('club_process_items','sort'),
    ('club_legal_documents','id'),('club_legal_documents','status'),
    ('club_legal_documents','document_type'),('club_legal_documents','slug'),
    ('club_legal_documents','title'),('club_legal_documents','body'),
    ('club_legal_documents','version'),('club_legal_documents','file'),
    ('club_legal_documents','legal_reviewed'),('club_legal_documents','sort'),
    ('club_page_settings','id'),('club_page_settings','singleton_key'),
    ('club_page_settings','publication_mode'),('club_page_settings','hero_eyebrow'),
    ('club_page_settings','hero_title'),('club_page_settings','hero_body'),
    ('club_page_settings','hero_primary_label'),('club_page_settings','hero_primary_url'),
    ('club_page_settings','hero_secondary_label'),('club_page_settings','hero_secondary_url'),
    ('club_page_settings','hero_disclaimer'),('club_page_settings','form_device_label'),
    ('club_page_settings','form_device_placeholder'),('club_page_settings','form_device_error'),
    ('club_page_settings','form_consent_label'),('club_page_settings','consent_version'),
    ('club_page_settings','privacy_url'),
    ('leads','club_offer'),('leads','club_plan'),('leads','club_term_months'),
    ('leads','club_budget_text'),('leads','club_device_request'),
    ('leads','club_consent_version'),('leads','club_consent_at')
),
expected_relations(many_collection, many_field, one_collection) AS (
  VALUES
    ('club_offers','product','products'),
    ('club_offers','plan','club_plans'),
    ('club_legal_documents','file','directus_files'),
    ('leads','club_offer','club_offers'),
    ('leads','club_plan','club_plans')
),
expected_collections(collection) AS (
  VALUES
    ('club_plans'),('club_offers'),('club_rule_items'),
    ('club_process_items'),('club_legal_documents'),('club_page_settings')
),
expected_group_fields(collection, field_name) AS (
  VALUES
    ('club_plans','group_identity'),
    ('club_plans','group_public'),
    ('club_plans','group_comparison'),
    ('club_offers','group_publication'),
    ('club_offers','group_device'),
    ('club_offers','group_pricing'),
    ('club_offers','group_card'),
    ('club_rule_items','group_publication'),
    ('club_rule_items','group_content'),
    ('club_process_items','group_publication'),
    ('club_process_items','group_content'),
    ('club_process_items','group_advanced'),
    ('club_legal_documents','group_publication'),
    ('club_legal_documents','group_content'),
    ('club_legal_documents','group_version'),
    ('club_page_settings','group_publication'),
    ('club_page_settings','group_hero'),
    ('club_page_settings','group_offers'),
    ('club_page_settings','group_story'),
    ('club_page_settings','group_legal'),
    ('club_page_settings','group_form'),
    ('club_page_settings','group_advanced')
),
expected_grouped_fields(collection, field_name, group_name) AS (
  VALUES
    ('club_plans','status','group_identity'),('club_plans','slug','group_identity'),
    ('club_plans','name','group_identity'),('club_plans','is_featured','group_identity'),
    ('club_plans','is_future','group_identity'),('club_plans','sort','group_identity'),
    ('club_plans','badge','group_public'),('club_plans','summary','group_public'),
    ('club_plans','features','group_public'),('club_plans','min_term_months','group_public'),
    ('club_plans','monthly_note','group_public'),
    ('club_plans','support_level','group_comparison'),
    ('club_plans','service_response_text','group_comparison'),
    ('club_plans','diagnostics_text','group_comparison'),
    ('club_plans','replacement_text','group_comparison'),
    ('club_plans','early_exit_text','group_comparison'),
    ('club_plans','damage_text','group_comparison'),
    ('club_offers','status','group_publication'),('club_offers','offer_status','group_publication'),
    ('club_offers','sort','group_publication'),('club_offers','product','group_device'),
    ('club_offers','plan','group_device'),('club_offers','term_months','group_device'),
    ('club_offers','pricing_mode','group_pricing'),('club_offers','monthly_from','group_pricing'),
    ('club_offers','terms_text','group_pricing'),('club_offers','badge','group_card'),
    ('club_offers','cta_label','group_card'),
    ('club_rule_items','status','group_publication'),
    ('club_rule_items','category','group_publication'),
    ('club_rule_items','sort','group_publication'),
    ('club_rule_items','title','group_content'),('club_rule_items','body','group_content'),
    ('club_process_items','status','group_publication'),
    ('club_process_items','group_key','group_publication'),
    ('club_process_items','sort','group_publication'),
    ('club_process_items','label','group_content'),
    ('club_process_items','title','group_content'),
    ('club_process_items','body','group_content'),
    ('club_process_items','slug','group_advanced'),
    ('club_legal_documents','status','group_publication'),
    ('club_legal_documents','document_type','group_publication'),
    ('club_legal_documents','legal_reviewed','group_publication'),
    ('club_legal_documents','sort','group_publication'),
    ('club_legal_documents','title','group_content'),
    ('club_legal_documents','summary','group_content'),
    ('club_legal_documents','body','group_content'),
    ('club_legal_documents','slug','group_version'),
    ('club_legal_documents','version','group_version'),
    ('club_legal_documents','effective_date','group_version'),
    ('club_legal_documents','file','group_version')
),
expected_public_permissions(collection, action) AS (
  VALUES
    ('club_plans','read'),('club_offers','read'),('club_rule_items','read'),
    ('club_process_items','read'),('club_legal_documents','read'),
    ('club_page_settings','read')
),
expected_editor_permissions(collection, action) AS (
  VALUES
    ('club_plans','read'),('club_plans','create'),('club_plans','update'),
    ('club_offers','read'),('club_offers','create'),('club_offers','update'),
    ('club_rule_items','read'),('club_rule_items','create'),('club_rule_items','update'),
    ('club_process_items','read'),('club_process_items','create'),('club_process_items','update'),
    ('club_legal_documents','read'),('club_legal_documents','create'),
    ('club_legal_documents','update'),
    ('club_page_settings','read'),('club_page_settings','update')
)
INSERT INTO isvoi_audit_results(check_name,value)
SELECT 'club.schema.tables_missing', count(*)::text
FROM expected_tables expected
WHERE to_regclass('public.' || expected.table_name) IS NULL
UNION ALL
SELECT 'club.schema.fields_missing', count(*)::text
FROM expected_fields expected
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns column_info
  WHERE column_info.table_schema='public'
    AND column_info.table_name=expected.table_name
    AND column_info.column_name=expected.field_name
)
UNION ALL
SELECT 'club.schema.relations_missing', count(*)::text
FROM expected_relations expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_relations relation
  WHERE relation.many_collection=expected.many_collection
    AND relation.many_field=expected.many_field
    AND relation.one_collection=expected.one_collection
)
UNION ALL
SELECT 'club.studio.collections_missing', count(*)::text
FROM expected_collections expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections collection
  WHERE collection.collection=expected.collection
    AND collection.hidden=false
    AND collection.note IS NOT NULL
    AND collection.display_template IS NOT NULL
)
UNION ALL
SELECT 'club.studio.folder_missing', count(*)::text
FROM (VALUES (1)) expected(value)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections collection
  WHERE collection.collection='isvoi_club'
    AND collection.hidden=false
    AND collection."group" IS NULL
    AND collection.collapse IN ('open','closed','locked')
    AND collection.translations::text LIKE '%I СВОИ Club%'
)
UNION ALL
SELECT 'club.studio.collection_grouping_missing', count(*)::text
FROM expected_collections expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_collections collection
  WHERE collection.collection=expected.collection
    AND collection."group"='isvoi_club'
    AND collection.translations::text LIKE '%ru-RU%'
)
UNION ALL
SELECT 'club.studio.field_groups_missing', count(*)::text
FROM expected_group_fields expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection=expected.collection
    AND field.field=expected.field_name
    AND field.interface='group-detail'
    AND field.special LIKE '%group%'
    AND field.translations::text LIKE '%ru-RU%'
)
UNION ALL
SELECT 'club.studio.ungrouped_fields', count(*)::text
FROM expected_grouped_fields expected
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection=expected.collection
    AND field.field=expected.field_name
    AND field."group"=expected.group_name
)
UNION ALL
SELECT 'club.studio.nav_locations_missing', count(*)::text
FROM (VALUES ('club_header'),('club_footer')) expected(location)
WHERE NOT EXISTS (
  SELECT 1 FROM directus_fields field
  WHERE field.collection='navigation_items'
    AND field.field='location'
    AND field.options::text LIKE '%' || expected.location || '%'
)
UNION ALL
SELECT 'club.permissions.public_missing', count(*)::text
FROM expected_public_permissions expected
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Public Read'
    AND permission.collection=expected.collection
    AND permission.action=expected.action
)
UNION ALL
SELECT 'club.permissions.editor_missing', count(*)::text
FROM expected_editor_permissions expected
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Editor'
    AND permission.collection=expected.collection
    AND permission.action=expected.action
)
UNION ALL
SELECT 'club.permissions.wildcard_fields', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE permission.collection IN (
    'club_plans','club_offers','club_rule_items','club_process_items',
    'club_legal_documents','club_page_settings'
  )
  AND coalesce(permission.fields,'')='*'
  AND policy.admin_access=false
UNION ALL
SELECT 'club.permissions.editor_publication_mode_write', count(*)::text
FROM directus_permissions permission
JOIN directus_policies policy ON policy.id=permission.policy
WHERE policy.name='ISVOI Editor'
  AND permission.collection='club_page_settings'
  AND permission.action='update'
  AND permission.fields LIKE '%publication_mode%'
UNION ALL
SELECT 'club.permissions.lead_intake_fields_missing', count(*)::text
FROM (
  VALUES
    ('club_offer'),('club_plan'),('club_term_months'),('club_budget_text'),
    ('club_device_request'),('club_consent_version'),('club_consent_at')
) required(field)
WHERE NOT EXISTS (
  SELECT 1
  FROM directus_permissions permission
  JOIN directus_policies policy ON policy.id=permission.policy
  WHERE policy.name='ISVOI Lead Intake'
    AND permission.collection='leads'
    AND permission.action='create'
    AND permission.fields LIKE '%' || required.field || '%'
);

DO $$
DECLARE
  v_missing_plans integer := 2;
  v_missing_rules integer := 9;
  v_missing_processes integer := 9;
  v_invalid_offers integer := 0;
  v_invalid_approved_offers integer := 0;
  v_plan_differences_missing integer := 2;
  v_invalid_hero_cta integer := 1;
  v_stale_hero_copy integer := 1;
  v_selection_copy_missing integer := 1;
  v_invalid_publication_mode integer := 1;
  v_published_unreviewed_legal integer := 0;
  v_public_index_blockers integer := 0;
  v_views_missing integer := 4;
BEGIN
  IF to_regclass('public.club_plans') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST(0, 2 - count(*)) FROM club_plans WHERE status=''published'' AND is_future=false'
      INTO v_missing_plans;
    EXECUTE $query$
      WITH compared AS (
        SELECT
          support_level, service_response_text, diagnostics_text,
          replacement_text, early_exit_text, damage_text
        FROM club_plans
        WHERE status='published' AND slug IN ('base','care')
      )
      SELECT GREATEST(0, 2 - (
        SELECT count(*) FROM (
          SELECT 1 WHERE (SELECT count(DISTINCT support_level) FROM compared WHERE coalesce(trim(support_level),'')<>'') > 1
          UNION ALL SELECT 1 WHERE (SELECT count(DISTINCT service_response_text) FROM compared WHERE coalesce(trim(service_response_text),'')<>'') > 1
          UNION ALL SELECT 1 WHERE (SELECT count(DISTINCT diagnostics_text) FROM compared WHERE coalesce(trim(diagnostics_text),'')<>'') > 1
          UNION ALL SELECT 1 WHERE (SELECT count(DISTINCT replacement_text) FROM compared WHERE coalesce(trim(replacement_text),'')<>'') > 1
          UNION ALL SELECT 1 WHERE (SELECT count(DISTINCT early_exit_text) FROM compared WHERE coalesce(trim(early_exit_text),'')<>'') > 1
          UNION ALL SELECT 1 WHERE (SELECT count(DISTINCT damage_text) FROM compared WHERE coalesce(trim(damage_text),'')<>'') > 1
        ) differences
      ))
    $query$ INTO v_plan_differences_missing;
  END IF;

  IF to_regclass('public.club_rule_items') IS NOT NULL THEN
    EXECUTE $query$
      SELECT count(*) FROM (
        VALUES ('wear'),('damage'),('return'),('buyout'),('early_exit'),
               ('payment'),('loss'),('data'),('service')
      ) required(category)
      WHERE NOT EXISTS (
        SELECT 1 FROM club_rule_items rule
        WHERE rule.status='published' AND rule.category=required.category
      )
    $query$ INTO v_missing_rules;
  END IF;

  IF to_regclass('public.club_process_items') IS NOT NULL THEN
    EXECUTE $query$
      SELECT
        GREATEST(0, 4 - count(*) FILTER (WHERE group_key='scenario')) +
        GREATEST(0, 2 - count(*) FILTER (WHERE group_key='passport')) +
        GREATEST(0, 3 - count(*) FILTER (WHERE group_key='participation'))
      FROM club_process_items WHERE status='published'
    $query$ INTO v_missing_processes;
  END IF;

  IF to_regclass('public.club_offers') IS NOT NULL AND to_regclass('public.products') IS NOT NULL THEN
    EXECUTE $query$
      SELECT count(*)
      FROM club_offers offer
      LEFT JOIN products product ON product.id=offer.product
      WHERE offer.status='published'
        AND offer.offer_status IN ('approved','waitlist')
        AND (
          product.id IS NULL
          OR product.status<>'published'
          OR product.stock_status<>'available'
          OR coalesce(product.stock_quantity,0)<=0
        )
    $query$ INTO v_invalid_offers;
    EXECUTE $query$
      SELECT count(*)
      FROM club_offers
      WHERE status='published' AND offer_status='approved'
        AND (
          coalesce(term_months,0) <= 0
          OR coalesce(trim(terms_text),'')=''
          OR pricing_mode NOT IN ('manual','monthly_from')
          OR (pricing_mode='monthly_from' AND coalesce(monthly_from,0) <= 0)
        )
    $query$ INTO v_invalid_approved_offers;
  END IF;

  IF to_regclass('public.club_page_settings') IS NOT NULL THEN
    EXECUTE $query$
      SELECT count(*) FROM club_page_settings
      WHERE hero_primary_url NOT IN ('#club-request')
         OR hero_secondary_url NOT IN ('#devices','#how-it-works')
         OR hero_primary_url LIKE '/#%'
         OR hero_secondary_url LIKE '/#%'
    $query$ INTO v_invalid_hero_cta;
    EXECUTE $query$
      SELECT count(*) FROM club_page_settings
      WHERE lower(hero_title) LIKE '%пилотный формат%'
         OR lower(hero_title) LIKE '%спокойного обновления%'
    $query$ INTO v_stale_hero_copy;
    EXECUTE $query$
      SELECT count(*) FROM club_page_settings
      WHERE coalesce(trim(offers_title),'')=''
         OR coalesce(trim(offers_empty_title),'')=''
         OR coalesce(trim(offers_empty_body),'')=''
         OR coalesce(trim(form_device_label),'')=''
         OR coalesce(trim(form_device_placeholder),'')=''
         OR coalesce(trim(form_device_error),'')=''
    $query$ INTO v_selection_copy_missing;
    EXECUTE $query$
      SELECT count(*) FROM club_page_settings
      WHERE publication_mode NOT IN ('pilot_noindex','public_index','paused')
    $query$ INTO v_invalid_publication_mode;
  END IF;

  IF to_regclass('public.club_legal_documents') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM club_legal_documents WHERE status=''published'' AND legal_reviewed=false'
      INTO v_published_unreviewed_legal;
  END IF;

  IF to_regclass('public.club_page_settings') IS NOT NULL
     AND to_regclass('public.club_offers') IS NOT NULL
     AND to_regclass('public.club_legal_documents') IS NOT NULL
     AND EXISTS (SELECT 1 FROM club_page_settings WHERE publication_mode='public_index') THEN
    v_public_index_blockers :=
      CASE WHEN EXISTS (
        SELECT 1 FROM club_offers
        WHERE status='published' AND offer_status='approved'
          AND coalesce(term_months,0)>0 AND coalesce(trim(terms_text),'')<>''
          AND (pricing_mode='manual' OR coalesce(monthly_from,0)>0)
      ) THEN 0 ELSE 1 END
      +
      (
        SELECT count(*) FROM (
          VALUES ('privacy'),('pilot_terms'),('contract_draft')
        ) required(document_type)
        WHERE NOT EXISTS (
          SELECT 1 FROM club_legal_documents document
          WHERE document.status='published'
            AND document.legal_reviewed=true
            AND document.document_type=required.document_type
            AND coalesce(trim(document.version),'')<>''
            AND (coalesce(trim(document.body),'')<>'' OR document.file IS NOT NULL)
        )
      )
      +
      CASE WHEN EXISTS (
        SELECT 1 FROM club_page_settings
        WHERE coalesce(trim(privacy_url),'')<>'' AND hero_primary_url='#club-request'
      ) THEN 0 ELSE 1 END;
  END IF;

  SELECT count(*) INTO v_views_missing
  FROM (
    VALUES
      ('Club: новые'),
      ('Club: без ответственного'),
      ('Club: расчёт отправлен'),
      ('Club: просрочен SLA')
  ) required(bookmark)
  WHERE NOT EXISTS (
    SELECT 1 FROM directus_presets preset
    JOIN directus_roles role ON role.id=preset.role
    WHERE role.name='ISVOI Editor'
      AND preset.collection='leads'
      AND preset.bookmark=required.bookmark
      AND preset."user" IS NULL
  );

  INSERT INTO isvoi_audit_results(check_name,value)
  VALUES
    ('club.content.published_plans_missing', v_missing_plans::text),
    ('club.content.published_rule_categories_missing', v_missing_rules::text),
    ('club.content.published_process_items_missing', v_missing_processes::text),
    ('club.content.invalid_offer_product', v_invalid_offers::text),
    ('club.content.invalid_approved_offers', v_invalid_approved_offers::text),
    ('club.content.plan_comparison_differences_missing', v_plan_differences_missing::text),
    ('club.content.invalid_hero_cta', v_invalid_hero_cta::text),
    ('club.content.stale_hero_copy', v_stale_hero_copy::text),
    ('club.content.selection_copy_missing', v_selection_copy_missing::text),
    ('club.content.invalid_publication_mode', v_invalid_publication_mode::text),
    ('club.legal.published_without_review', v_published_unreviewed_legal::text),
    ('club.launch.public_index_blockers', v_public_index_blockers::text),
    ('club.leads.views_missing', v_views_missing::text);
END;
$$;

SELECT check_name, value
FROM isvoi_audit_results
ORDER BY check_name;
`);
