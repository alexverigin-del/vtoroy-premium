#!/usr/bin/env node
/**
 * Print read-only SQL checks for the ISVOI Club pilot schema, Studio setup,
 * permissions and publication readiness.
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
    ('club_page_settings')
),
expected_fields(table_name, field_name) AS (
  VALUES
    ('club_plans','id'),('club_plans','status'),('club_plans','slug'),
    ('club_plans','name'),('club_plans','badge'),('club_plans','summary'),
    ('club_plans','min_term_months'),('club_plans','monthly_note'),
    ('club_plans','features'),('club_plans','is_featured'),('club_plans','is_future'),
    ('club_plans','sort'),('club_plans','created_at'),('club_plans','updated_at'),
    ('club_offers','id'),('club_offers','status'),('club_offers','offer_status'),
    ('club_offers','product'),('club_offers','plan'),('club_offers','term_months'),
    ('club_offers','monthly_from'),('club_offers','terms_text'),('club_offers','badge'),
    ('club_offers','cta_label'),('club_offers','sort'),('club_offers','created_at'),
    ('club_offers','updated_at'),
    ('club_rule_items','id'),('club_rule_items','status'),('club_rule_items','category'),
    ('club_rule_items','title'),('club_rule_items','body'),('club_rule_items','sort'),
    ('club_rule_items','created_at'),('club_rule_items','updated_at'),
    ('club_page_settings','id'),('club_page_settings','singleton_key'),
    ('club_page_settings','hero_disclaimer'),('club_page_settings','offers_eyebrow'),
    ('club_page_settings','offers_title'),('club_page_settings','offers_empty_title'),
    ('club_page_settings','offers_empty_body'),('club_page_settings','monthly_fallback'),
    ('club_page_settings','offer_cta_label'),('club_page_settings','plans_eyebrow'),
    ('club_page_settings','plans_title'),('club_page_settings','rules_eyebrow'),
    ('club_page_settings','rules_title'),('club_page_settings','form_title'),
    ('club_page_settings','form_scenario'),('club_page_settings','form_contact_label'),
    ('club_page_settings','form_contact_placeholder'),('club_page_settings','form_budget_label'),
    ('club_page_settings','form_budget_placeholder'),('club_page_settings','form_term_label'),
    ('club_page_settings','form_message_label'),('club_page_settings','form_message_placeholder'),
    ('club_page_settings','form_submit_label'),('club_page_settings','form_submitting_label'),
    ('club_page_settings','form_idle_note'),('club_page_settings','form_success_note'),
    ('club_page_settings','form_error_note'),('club_page_settings','form_consent_note'),
    ('leads','club_offer'),('leads','club_plan'),('leads','club_term_months'),
    ('leads','club_budget_text')
),
expected_relations(many_collection, many_field, one_collection) AS (
  VALUES
    ('club_offers','product','products'),
    ('club_offers','plan','club_plans'),
    ('leads','club_offer','club_offers'),
    ('leads','club_plan','club_plans')
),
expected_collections(collection) AS (
  VALUES ('club_plans'),('club_offers'),('club_rule_items'),('club_page_settings')
),
expected_public_permissions(collection, action) AS (
  VALUES
    ('club_plans','read'),
    ('club_offers','read'),
    ('club_rule_items','read'),
    ('club_page_settings','read')
),
expected_editor_permissions(collection, action) AS (
  VALUES
    ('club_plans','read'),('club_plans','create'),('club_plans','update'),
    ('club_offers','read'),('club_offers','create'),('club_offers','update'),
    ('club_rule_items','read'),('club_rule_items','create'),('club_rule_items','update'),
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
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public'
    AND c.table_name=expected.table_name
    AND c.column_name=expected.field_name
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
WHERE permission.collection IN ('club_plans','club_offers','club_rule_items','club_page_settings')
  AND coalesce(permission.fields,'')='*'
  AND policy.admin_access=false
UNION ALL
SELECT 'club.permissions.lead_intake_fields_missing', count(*)::text
FROM (VALUES ('club_offer'),('club_plan'),('club_term_months'),('club_budget_text')) required(field)
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
  v_missing_rules integer := 5;
  v_invalid_offers integer := 0;
  v_approved_without_terms integer := 0;
  v_views_missing integer := 1;
BEGIN
  IF to_regclass('public.club_plans') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST(0, 2 - count(*)) FROM club_plans WHERE status=''published'' AND is_future=false'
      INTO v_missing_plans;
  END IF;

  IF to_regclass('public.club_rule_items') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST(0, 5 - count(*)) FROM club_rule_items WHERE status=''published'''
      INTO v_missing_rules;
  END IF;

  IF to_regclass('public.club_offers') IS NOT NULL AND to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM club_offers offer LEFT JOIN products product ON product.id=offer.product WHERE offer.status=''published'' AND offer.offer_status IN (''approved'',''waitlist'') AND product.id IS NULL'
      INTO v_invalid_offers;
    EXECUTE 'SELECT count(*) FROM club_offers WHERE status=''published'' AND offer_status=''approved'' AND coalesce(trim(terms_text),'''')='''''
      INTO v_approved_without_terms;
  END IF;

  SELECT count(*) INTO v_views_missing
  FROM (VALUES ('Club: новые')) required(bookmark)
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
    ('club.content.published_rules_missing', v_missing_rules::text),
    ('club.content.invalid_offer_product', v_invalid_offers::text),
    ('club.content.approved_offers_without_terms', v_approved_without_terms::text),
    ('club.leads.views_missing', v_views_missing::text);
END;
$$;

SELECT check_name, value
FROM isvoi_audit_results
ORDER BY check_name;
`);
