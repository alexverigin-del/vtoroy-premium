#!/usr/bin/env node
/**
 * Execute Directus SQL audit generators against production psql and fail on
 * blocker metrics. The *_sql.mjs files remain the SQL source of truth; this
 * runner turns them into operator-friendly pass/fail commands.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sshKey = process.env.DIRECTUS_AUDIT_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
const sshTarget = process.env.DIRECTUS_AUDIT_SSH_TARGET || "deploy@217.114.14.32";
const remoteCommand =
  process.env.DIRECTUS_AUDIT_REMOTE_PSQL ||
  "cd /opt/isvoi/infra/directus-beget && docker compose exec -T database psql -U isvoi -d isvoi -v ON_ERROR_STOP=1 -A -F '|'";
const canRunLocalPsql =
  process.env.DIRECTUS_AUDIT_LOCAL_PSQL === "1" ||
  (process.platform !== "win32" &&
    root.startsWith("/opt/isvoi") &&
    fs.existsSync("/opt/isvoi/infra/directus-beget/docker-compose.yml"));

const auditDefinitions = {
  schema: {
    script: "scripts/audit_directus_schema_sql.mjs",
    zero: [
      "schema.tables.missing",
      "schema.directus_collections.missing",
      "schema.fields.missing",
      "schema.directus_field_metadata.missing",
      "schema.relations.missing",
      "schema.custom_tables.untracked",
      "schema.required_file_folders.missing",
      "schema.import_flows.missing",
      "schema.revalidation_flows.missing",
      "schema.revalidation_flows.legacy_active",
      "permissions.non_admin_admin_access",
      "permissions.service_app_access",
      "permissions.self_security_policy_missing",
      "permissions.self_security_permission_missing",
      "permissions.self_security_bindings_missing",
      "permissions.self_security_unexpected_bindings",
      "permissions.non_admin_system_permissions",
      "permissions.public_writes",
      "permissions.lead_intake_extra_permissions",
      "permissions.non_admin_wildcards",
    ],
    equals: { "permissions.studio_tfa_policies": "5", "schema.snapshot_audit_rows": "ok" },
  },
  studio: {
    script: "scripts/audit_directus_studio_sql.mjs",
    zero: [
      "studio.collections.missing_ux_metadata",
      "studio.fields.missing_notes",
      "studio.fields.required_without_note",
      "studio.faq.invalid_validation_shape",
      "studio.faq.home_editability_missing",
      "studio.site_settings.singleton_not_one",
      "studio.device_page_settings.singleton_not_one",
      "studio.bookmarks.missing",
      "studio.editor_layout_groups_missing",
      "studio.page_sections.advanced_json_editable_by_editor",
      "studio.page_sections.content.local_assets",
      "studio.page_sections.content.direct_asset_urls.warning",
      "studio.page_sections.content.image_src_keys",
      "studio.import_batches.missing_files",
      "studio.import_batches.invalid_last_run_status",
      "studio.import_batches.failed_without_log",
      "studio.destructive_editor_permissions",
      "studio.files.required_folders_missing",
      "studio.files.review_folder_count",
      "studio.files.used_without_folder",
      "studio.files.device_originals_over_10mb.warning",
      "studio.files.non_image_in_device_photos",
      "studio.device_images.missing_alt_or_label",
      "studio.leads.open_without_source_context",
      "studio.leads.in_progress_without_assignee.warning",
      "studio.leads.invalid_status",
      "studio.native_groups.missing",
      "studio.technical_children.visible_in_navigation",
      "studio.human_collections.missing_ru_labels",
      "studio.human_fields.missing_ru_labels",
      "studio.human_fields.fallback_ru_labels",
      "studio.legacy_catalog.human_permissions",
      "studio.importer.product_write_or_delete",
      "studio.editor.system_product_fields_writable",
      "studio.products.type_conditions_missing",
      "studio.inventory.computed_fields_not_readonly",
      "studio.inventory.manager_unexpected_update_fields",
      "studio.fields.orphan_group_references",
      "studio.locations.group_missing",
      "studio.locations.form_groups_missing",
      "studio.locations.ungrouped_business_fields",
      "studio.navigation.permission_location_mismatch",
      "studio.leads.club_context_group_missing",
      "studio.leads.club_context_fields_misgrouped",
      "studio.club.settings_groups_missing",
      "studio.bookmarks.too_many",
      "studio.bookmarks.duplicates",
    ],
  },
  catalog: {
    script: "scripts/audit_directus_catalog_sql.mjs",
    zero: [
      "devices.visible.missing_required_copy",
      "devices.visible.not_ready",
      "devices.visible.no_listing_file",
      "devices.visible.no_card_image",
      "devices.visible.no_gallery_image",
      "device_images.without_file",
      "device_images.orphan_device",
    ],
  },
  images: {
    script: "scripts/audit_directus_image_refs_sql.mjs",
    zero: [
      "devices.listing_image.local",
      "devices.gallery.local",
      "devices.passport.local",
      "page_sections.content.local",
    ],
  },
  navigation: {
    script: "scripts/audit_directus_navigation_sql.mjs",
    zero: [
      "navigation.header.too_many",
      "navigation.header.duplicate_labels",
      "navigation.header.club_store_confusion",
      "navigation.page_links_without_page",
      "navigation.external_without_new_tab",
      "navigation.footer_relative_anchors",
      "navigation.site_logo_file_missing",
      "navigation.header_cta_missing",
      "navigation.blog.header_missing",
      "navigation.blog.footer_missing",
      "navigation.main.canonical_mismatch",
      "navigation.main.unmanaged_active",
      "navigation.main.legacy_rows",
      "navigation.footer.duplicate_destinations",
      "navigation.footer.invalid_structure",
      "navigation.site_city_mismatch",
      "navigation.studio.bookmarks_missing",
    ],
  },
  "legacy-fallback": {
    script: "scripts/audit_directus_legacy_fallback_sql.mjs",
    zero: [
      "legacy.listing_image_fallback",
      "legacy.missing_card_image",
      "legacy.gallery_json_fallback",
      "legacy.passport_json_fallback",
      "legacy.trade_json_fallback",
      "legacy.any_fallback",
    ],
  },
  "page-sections": {
    script: "scripts/audit_directus_page_sections_contract_sql.mjs",
    zero: [
      "page_sections.unknown_variants",
      "page_sections.content.unknown_keys",
      "page_sections.content.local_assets",
      "page_sections.content.direct_asset_urls",
      "page_sections.content.legacy_image_keys",
      "page_sections.cta.empty_label_with_url",
      "page_sections.cta.label_without_url",
      "page_sections.required_image_missing",
      "page_sections.inactive_page_active_sections",
    ],
  },
  "homepage-copy": {
    script: "scripts/audit_directus_homepage_copy_sql.mjs",
    zero: [
      "homepage_copy.sections.missing_or_duplicate",
      "homepage_copy.sections.text_mismatch",
      "homepage_copy.sections.unexpected_active",
      "homepage_copy.footer.mismatch",
      "homepage_copy.forbidden.city",
      "homepage_copy.forbidden.commission",
      "homepage_copy.forbidden.demo_values",
      "homepage_copy.faq.missing_or_duplicate",
      "homepage_copy.faq.text_mismatch",
    ],
    equals: {
      "homepage_copy.info.section_count": "9",
      "homepage_copy.info.faq_count": "6",
    },
  },
  leads: {
    script: "scripts/audit_directus_leads_sql.mjs",
    zero: [
      "leads.open_without_source_context",
      "leads.invalid_status",
      "leads.waiting_without_next_action",
      "leads.in_progress_without_assignee",
      "leads.closed_without_manager_note",
      "leads.device_slug_without_relation",
      "leads.blog_attribution_bookmarks_missing",
      "leads.blog_utm_without_campaign",
      "leads.blog_utm_without_content",
      "leads.blog_related_device_without_relation",
      "lead_hardening.device_consent_fields_missing",
      "lead_hardening.final_cta_consent_copy_missing",
    ],
  },
  files: {
    script: "scripts/audit_directus_files_governance_sql.mjs",
    zero: [
      "files.review_folder_count",
      "files.used_without_folder",
      "files.device_non_images",
      "files.site_non_images",
      "files.editorial_non_images",
      "files.blog_non_images",
      "files.device_originals_over_10mb",
      "files.duplicate_isvoi_titles",
    ],
  },
  import: {
    script: "scripts/audit_directus_import_workflow_sql.mjs",
    zero: [
      "import_batches.missing_files",
      "import_batches.invalid_last_run_status",
      "import_batches.failed_without_log",
      "import_batches.importer_missing_permissions",
      "import_batches.flows_missing",
    ],
  },
  blog: {
    script: "scripts/audit_directus_blog_sql.mjs",
    zero: [
      "blog.schema.tables_missing",
      "blog.schema.fields_missing",
      "blog.schema.collections_missing",
      "blog.schema.version_collection_guard_missing",
      "blog.schema.relations_missing",
      "blog.studio.folder_missing",
      "blog.studio.collection_metadata_missing",
      "blog.studio.post_groups_missing",
      "blog.studio.blocks_field_missing",
      "blog.studio.media_folder_options_invalid",
      "blog.studio.versioning_missing",
      "blog.studio.unexpected_versioned_collections",
      "blog.studio.preview_url_missing",
      "blog.studio.presets_missing",
      "blog.permissions.editor_missing",
      "blog.permissions.editor_post_groups_missing",
      "blog.permissions.workflow_missing",
      "blog.permissions.workflow_policy_invalid",
      "blog.permissions.workflow_revisions_scope_invalid",
      "blog.permissions.workflow_role_bindings_missing",
      "blog.permissions.workflow_unexpected_bindings",
      "blog.permissions.publisher_policy_missing",
      "blog.permissions.publisher_permissions_missing",
      "blog.permissions.publisher_role_binding_missing",
      "blog.permissions.publisher_unexpected_bindings",
      "blog.permissions.publisher_scope_invalid",
      "blog.permissions.media_missing",
      "blog.permissions.media_policy_invalid",
      "blog.permissions.media_role_bindings_missing",
      "blog.permissions.media_unexpected_bindings",
      "blog.permissions.media_scope_invalid",
      "blog.permissions.public_missing",
      "blog.permissions.public_posts_scope_invalid",
      "blog.permissions.public_file_scope_missing",
      "blog.permissions.preview_missing",
      "blog.permissions.wildcard_fields",
      "blog.permissions.public_writes",
      "blog.permissions.preview_writes",
      "blog.permissions.editor_destructive_content_delete",
      "blog.permissions.workflow_versions_count_invalid",
      "blog.permissions.workflow_versions_scope_invalid",
      "blog.permissions.preview_versions_count_invalid",
      "blog.permissions.preview_versions_scope_invalid",
      "blog.content.invalid_slugs",
      "blog.content.published_incomplete",
      "blog.content.published_legacy_body",
      "blog.content.published_invalid_blocks",
      "blog.content.published_private_cover",
      "blog.content.published_private_block_image",
      "blog.content.scheduled_without_date",
      "blog.content.published_inactive_relations",
      "blog.content.orphan_junctions",
      "blog.content.legacy_links_not_backfilled",
      "blog.automation.scheduling_flow_missing",
      "blog.automation.scheduling_operation_missing",
      "blog.automation.schedule_revalidation_missing",
      "blog.automation.schedule_revalidation_chain_invalid",
    ],
  },
  club: {
    script: "scripts/audit_directus_club_sql.mjs",
    zero: [
      "club.schema.tables_missing",
      "club.schema.fields_missing",
      "club.schema.relations_missing",
      "club.studio.collections_missing",
      "club.studio.folder_missing",
      "club.studio.collection_grouping_missing",
      "club.studio.field_groups_missing",
      "club.studio.ungrouped_fields",
      "club.studio.nav_locations_missing",
      "club.permissions.public_missing",
      "club.permissions.editor_missing",
      "club.permissions.wildcard_fields",
      "club.permissions.editor_publication_mode_write",
      "club.permissions.lead_intake_fields_missing",
      "club.content.published_plans_missing",
      "club.content.published_rule_categories_missing",
      "club.content.published_process_items_missing",
      "club.content.invalid_offer_product",
      "club.content.invalid_approved_offers",
      "club.content.plan_comparison_differences_missing",
      "club.content.invalid_hero_cta",
      "club.content.stale_hero_copy",
      "club.content.selection_copy_missing",
      "club.content.invalid_publication_mode",
      "club.legal.published_without_review",
      "club.launch.public_index_blockers",
      "club.leads.views_missing",
    ],
  },
  "conversion-v2": {
    script: "scripts/audit_directus_conversion_v2_sql.mjs",
    zero: [
      "conversion_v2.prototype_copy",
      "conversion_v2.broken_known_links",
      "conversion_v2.header_club",
      "conversion_v2.home_deprecated_active",
      "conversion_v2.repair_story_conflicts",
      "conversion_v2.unverified_social_proof_published",
      "conversion_v2.retired_exit_terms",
      "conversion_v2.public_question_mark_placeholders",
      "conversion_v2.store_club_promotion",
      "conversion_v2.trade_cross_page_cta",
      "conversion_v2.club_risky_sections_active",
      "conversion_v2.club_nonpilot_cta",
      "conversion_v2.catalog_club_filter",
      "conversion_v2.footer_legacy_positioning",
    ],
  },
  "catalog-v3": {
    script: "scripts/audit_directus_catalog_v3_sql.mjs",
    zero: [
      "catalog_v3.schema.tables_missing",
      "catalog_v3.schema.product_fields_missing",
      "catalog_v3.schema.lead_fields_missing",
      "catalog_v3.studio.collections_missing",
      "catalog_v3.studio.product_groups_missing",
      "catalog_v3.studio.presets_missing",
      "catalog_v3.schema.relations_missing",
      "catalog_v3.permissions.public_missing",
      "catalog_v3.permissions.editor_missing",
      "catalog_v3.permissions.advanced_reference_missing",
      "catalog_v3.permissions.importer_product_writes",
      "catalog_v3.permissions.editor_publication_write",
      "catalog_v3.publication.invalid_required",
      "catalog_v3.publication.accessory_not_new",
      "catalog_v3.publication.device_details_missing",
      "catalog_v3.publication.used_passport_missing",
      "catalog_v3.publication.new_items_missing_diagnostic_date",
      "catalog_v3.publication.model_compatibility_missing",
      "catalog_v3.migration.legacy_products_missing",
      "catalog_v3.migration.passport_links_missing",
      "catalog_v3.migration.trade_links_missing",
      "catalog_v3.qa.drafts_missing",
      "catalog_v3.publication.guard_missing",
    ],
  },
  multicity: {
    script: "scripts/audit_directus_multicity_sql.mjs",
    zero: [
      "multicity.schema.tables_missing",
      "multicity.schema.relations_missing",
      "multicity.studio.collection_layout",
      "multicity.content.belgorod_missing",
      "multicity.migration.products_without_offer",
      "multicity.offers.invalid_published",
      "multicity.offers.split_without_pay",
      "multicity.permissions.public_missing",
      "multicity.permissions.public_writes",
      "multicity.permissions.editor_actions_missing",
      "multicity.studio.presets_missing",
      "multicity.revalidation.collections_missing",
      "multicity.content.old_city_mentions",
      "multicity.guard.missing",
    ],
  },
  inventory: {
    script: "scripts/audit_directus_inventory_sql.mjs",
    zero: [
      "inventory.schema.tables_missing",
      "inventory.schema.unit_view_missing",
      "inventory.schema.receipt_movement_fields_missing",
      "inventory.studio.collections_missing",
      "inventory.studio.receipt_movement_fields_missing",
      "inventory.schema.relations_missing",
      "inventory.studio.aliases_missing",
      "inventory.security.manager_policy_missing",
      "inventory.security.manager_permissions_missing",
      "inventory.security.receipt_movement_fields_missing",
      "inventory.security.public_or_editor_access",
      "inventory.security.wildcard_fields",
      "inventory.security.service_batch_delete_permissions_missing",
      "inventory.flows.missing",
      "inventory.data.invalid_item_values",
      "inventory.data.eligible_without_review",
      "inventory.data.invalid_receipt_movement",
      "inventory.channels.active_invalid",
      "inventory.security.identifiers_in_batch_logs",
    ],
  },
  insights: {
    script: "scripts/audit_directus_insights_sql.mjs",
    zero: [
      "insights.dashboard.missing",
      "insights.dashboard.duplicate_name",
      "insights.panels.missing",
      "insights.panels.unexpected",
      "insights.panels.config_mismatch",
      "insights.panels.invalid_type",
      "insights.panels.invalid_bounds",
      "insights.panels.overlaps",
      "insights.source_fields.missing",
      "insights.permissions.non_admin",
      "insights.panels.sensitive_templates",
    ],
    equals: {
      "insights.info.dashboard_count": "1",
      "insights.info.panel_count": "10",
    },
  },
};

const prodAuditOrder = [
  "schema",
  "studio",
  "catalog",
  "images",
  "navigation",
  "legacy-fallback",
  "page-sections",
  "homepage-copy",
  "leads",
  "files",
  "import",
  "blog",
  "club",
  "conversion-v2",
  "catalog-v3",
  "multicity",
  "inventory",
  "insights",
];

function selectedAudits() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (args.length === 0 || args.includes("prod")) return prodAuditOrder;
  return args;
}

function runNodeScript(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  if (result.status !== 0) {
    throw new Error(`SQL generator failed: ${script}\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function runPsql(sql) {
  const result = canRunLocalPsql
    ? spawnSync("bash", ["-lc", remoteCommand], {
        input: sql,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20,
      })
    : spawnSync("ssh", ["-i", sshKey, sshTarget, remoteCommand], {
        input: sql,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20,
      });
  if (result.status !== 0) {
    throw new Error(`psql audit failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function parseRows(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes("|") && !line.startsWith("("))
    .map((line) => {
      const [checkName, ...rest] = line.split("|");
      return { checkName, value: rest.join("|") };
    })
    .filter((row) => row.checkName !== "check_name" && row.checkName.includes("."));
}

function isZero(value) {
  return Number(value) === 0;
}

function assertAudit(name, definition, rows) {
  const byName = new Map(rows.map((row) => [row.checkName, row.value]));
  const failures = [];

  for (const checkName of definition.zero ?? []) {
    if (!byName.has(checkName)) {
      failures.push(`${checkName}: missing result`);
    } else if (!isZero(byName.get(checkName))) {
      failures.push(`${checkName}: expected 0, got ${byName.get(checkName)}`);
    }
  }

  for (const [checkName, expected] of Object.entries(definition.equals ?? {})) {
    if (!byName.has(checkName)) {
      failures.push(`${checkName}: missing result`);
    } else if (String(byName.get(checkName)) !== String(expected)) {
      failures.push(`${checkName}: expected ${expected}, got ${byName.get(checkName)}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Directus audit failed: ${name}`);
    for (const failure of failures) console.error(`- ${failure}`);
    return false;
  }

  console.log(`Directus audit passed: ${name}`);
  for (const row of rows) console.log(`- ${row.checkName}: ${row.value}`);
  return true;
}

let ok = true;

for (const name of selectedAudits()) {
  const definition = auditDefinitions[name];
  if (!definition) {
    console.error(`Unknown Directus audit: ${name}`);
    process.exit(1);
  }
  const sql = runNodeScript(definition.script);
  const output = runPsql(sql);
  const rows = parseRows(output);
  ok = assertAudit(name, definition, rows) && ok;
}

if (!ok) process.exit(1);
