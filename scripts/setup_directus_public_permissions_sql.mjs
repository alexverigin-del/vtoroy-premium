#!/usr/bin/env node
/**
 * Print idempotent SQL that hardens public Directus read permissions.
 *
 * This keeps the anonymous Directus Public policy minimal: only allowed file
 * assets can be read without a token. Editable content is read by the Next.js
 * site through the project service-read policy with row filters and field
 * allowlists.
 *
 * Usage:
 *   node scripts/setup_directus_public_permissions_sql.mjs > /tmp/isvoi_setup_directus_public_permissions_sql.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_public_permissions_sql.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE OR REPLACE FUNCTION isvoi_public_file_filter()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_folder_ids text[];
BEGIN
  SELECT array_agg(id::text ORDER BY name)
  INTO v_folder_ids
  FROM directus_folders
  WHERE name IN ('ISVOI Device Photos', 'ISVOI Site Assets', 'ISVOI Editorial');

  IF v_folder_ids IS NULL OR array_length(v_folder_ids, 1) IS NULL THEN
    RETURN '{"id":{"_null":true}}'::json;
  END IF;

  RETURN json_build_object('folder', json_build_object('_in', v_folder_ids))::json;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_upsert_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar,
  p_fields text,
  p_permissions json DEFAULT NULL,
  p_validation json DEFAULT NULL,
  p_presets json DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy = v_policy AND collection = p_collection AND action = p_action
  ) THEN
    UPDATE directus_permissions
    SET fields = p_fields,
      permissions = p_permissions,
      validation = p_validation,
      presets = p_presets
    WHERE policy = v_policy AND collection = p_collection AND action = p_action;
  ELSE
    INSERT INTO directus_permissions (
      policy, collection, action, fields, permissions, validation, presets
    ) VALUES (
      v_policy, p_collection, p_action, p_fields, p_permissions, p_validation, p_presets
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_delete_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM directus_permissions
  WHERE policy = v_policy
    AND collection = p_collection
    AND action = p_action;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_apply_anonymous_public_permissions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM isvoi_delete_permission('$t:public_label', 'devices', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'device_images', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'device_passports', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'trade_options', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'site_pages', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'page_sections', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'site_settings', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'navigation_items', 'read');
  PERFORM isvoi_delete_permission('$t:public_label', 'faq_items', 'read');

  PERFORM isvoi_upsert_permission(
    '$t:public_label',
    'directus_files',
    'read',
    'id,filename_download,type,width,height,focal_point_x,focal_point_y',
    isvoi_public_file_filter()
  );
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_apply_service_public_permissions(p_policy_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'devices',
    'read',
    'id,status,sort,tags,category,title,model,specs,storage,color,serial,price,price_text,grade,battery,battery_text,meta_battery,warranty,warranty_text,exit,exit_text,availability,short_description,headline,listing_image,listing_alt,cta_label,has_detail_page,detail_href,visual_class,gallery,passport,trade,listing_file,updated_at,stock_status,content_status',
    '{"_and":[{"status":{"_eq":"published"}},{"stock_status":{"_neq":"hidden"}},{"content_status":{"_eq":"ready"}}]}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'device_images',
    'read',
    'id,status,sort,device,role,image,label,alt,updated_at,shot_status',
    '{"_and":[{"status":{"_eq":"published"}},{"shot_status":{"_eq":"approved"}},{"device":{"status":{"_eq":"published"}}},{"device":{"stock_status":{"_neq":"hidden"}}},{"device":{"content_status":{"_eq":"ready"}}}]}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'device_passports',
    'read',
    'id,device,repair,water,summary_rows,diagnostics_status,diagnostics_checklist,condition_grade_text,condition_note,condition_notes,defect_photo,defect_photo_alt,story_title,story_body,story_facts,warranty_duration,warranty_covered,warranty_not_covered,exit_headline,exit_buy_today,exit_trade_in_estimate,exit_condition,exit_note,updated_at',
    '{"_and":[{"device":{"status":{"_eq":"published"}}},{"device":{"stock_status":{"_neq":"hidden"}}},{"device":{"content_status":{"_eq":"ready"}}}]}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'trade_options',
    'read',
    'id,device,value,label,sort,is_active,updated_at',
    '{"_and":[{"is_active":{"_eq":true}},{"device":{"status":{"_eq":"published"}}},{"device":{"stock_status":{"_neq":"hidden"}}},{"device":{"content_status":{"_eq":"ready"}}}]}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'directus_files',
    'read',
    'id,filename_download,type,width,height,focal_point_x,focal_point_y',
    isvoi_public_file_filter()
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'site_pages',
    'read',
    'id,slug,template,status,title,meta_description,og_image',
    '{"status":{"_eq":"published"}}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'page_sections',
    'read',
    'id,page,section_key,variant,eyebrow,headline,subheadline,body,primary_cta_label,primary_cta_url,secondary_cta_label,secondary_cta_url,image,sort_order,is_active,content',
    '{"_and":[{"is_active":{"_eq":true}},{"page":{"status":{"_eq":"published"}}}]}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'site_settings',
    'read',
    'id,brand_name,tagline,city,logo_file,logo_alt,logo_href,logo_width,logo_height,logo_caption,show_brand_name,header_cta_label,header_cta_url,phone,telegram,email,address,default_og_image,footer_legal,maintenance_mode,footer_note,footer_brand_text,footer_copyright',
    NULL
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'navigation_items',
    'read',
    'id,label,label_short,aria_label,link_type,page,section_anchor,custom_url,url,location,parent,sort,is_active,open_in_new,item_role,icon',
    '{"is_active":{"_eq":true}}'::json
  );

  PERFORM isvoi_upsert_permission(
    p_policy_name,
    'faq_items',
    'read',
    'id,key,question,answer,page,category,sort,is_active',
    '{"is_active":{"_eq":true}}'::json
  );
END;
$$;

SELECT isvoi_apply_anonymous_public_permissions();
SELECT isvoi_apply_service_public_permissions('ISVOI Public Read');

DROP FUNCTION isvoi_apply_service_public_permissions(text);
DROP FUNCTION isvoi_apply_anonymous_public_permissions();
DROP FUNCTION isvoi_delete_permission(text, varchar, varchar);
DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_public_file_filter();

SELECT p.name AS policy,
  pe.collection,
  pe.action,
  pe.fields,
  pe.permissions
FROM directus_permissions pe
JOIN directus_policies p ON p.id = pe.policy
WHERE p.name IN ('$t:public_label', 'ISVOI Public Read')
  AND pe.action = 'read'
ORDER BY p.name, pe.collection;

COMMIT;
`);
