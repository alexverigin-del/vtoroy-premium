#!/usr/bin/env node
/**
 * Execute Directus SQL audit generators against production psql and fail on
 * blocker metrics. The *_sql.mjs files remain the SQL source of truth; this
 * runner turns them into operator-friendly pass/fail commands.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sshKey = process.env.DIRECTUS_AUDIT_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
const sshTarget = process.env.DIRECTUS_AUDIT_SSH_TARGET || "deploy@217.114.14.32";
const remoteCommand =
  process.env.DIRECTUS_AUDIT_REMOTE_PSQL ||
  "cd /opt/isvoi/infra/directus-beget && docker compose exec -T database psql -U isvoi -d isvoi -v ON_ERROR_STOP=1 -A -F '|'";

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
      "permissions.non_admin_system_permissions",
      "permissions.public_writes",
      "permissions.lead_intake_extra_permissions",
      "permissions.non_admin_wildcards",
    ],
    equals: { "permissions.studio_tfa_policies": "3", "schema.snapshot_audit_rows": "ok" },
  },
  studio: {
    script: "scripts/audit_directus_studio_sql.mjs",
    zero: [
      "studio.collections.missing_ux_metadata",
      "studio.fields.missing_notes",
      "studio.fields.required_without_note",
      "studio.faq.invalid_validation_shape",
      "studio.site_settings.singleton_not_one",
      "studio.device_page_settings.singleton_not_one",
      "studio.bookmarks.missing",
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
  leads: {
    script: "scripts/audit_directus_leads_sql.mjs",
    zero: [
      "leads.open_without_source_context",
      "leads.invalid_status",
      "leads.waiting_without_next_action",
      "leads.in_progress_without_assignee",
      "leads.closed_without_manager_note",
      "leads.device_slug_without_relation",
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
};

const prodAuditOrder = [
  "schema",
  "studio",
  "catalog",
  "images",
  "navigation",
  "legacy-fallback",
  "page-sections",
  "leads",
  "files",
  "import",
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
  const result = spawnSync("ssh", ["-i", sshKey, sshTarget, remoteCommand], {
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
