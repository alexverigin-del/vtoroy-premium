# Directus schema snapshot and audit

Use this after any Directus schema, Studio metadata, permission, role, Flow or
Files workflow change.

## Snapshot

Export the running Directus schema snapshot:

```bash
npm run directus:schema:snapshot
```

Default output:

```text
directus/schema/snapshots/current.json
```

Useful variants:

```bash
npm run directus:schema:snapshot -- --out directus/schema/snapshots/prod.json
npm run directus:schema:snapshot -- --stdout
```

The command reads `DIRECTUS_URL` and `DIRECTUS_TOKEN` from the shell, `.env`,
`scripts/.env`, or `apps/web/.env.local`. The token must be able to read schema
metadata. Do not commit admin tokens; use a temporary shell env when needed.

Commit the snapshot when the Directus schema contract intentionally changes.

## Audit

Print the SQL audit:

```bash
npm run directus:audit-schema
```

Print the Studio/editor workflow audit:

```bash
npm run directus:audit-studio
```

Production:

```bash
npm run directus:audit-schema > /tmp/isvoi_schema_audit.sql
npm run directus:audit-studio > /tmp/isvoi_studio_audit.sql

cd infra/directus-beget
set -a && . ./.env && set +a
docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_schema_audit.sql

docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_studio_audit.sql
```

Run it after:

- `directus:setup:*` scripts;
- manual Studio schema edits;
- role/policy/permission changes;
- Flow changes;
- Directus upgrades.

## Expected Audit Shape

Blockers should be `0`:

- `schema.tables.missing`
- `schema.directus_collections.missing`
- `schema.fields.missing`
- `schema.directus_field_metadata.missing`
- `schema.relations.missing`
- `schema.required_file_folders.missing`
- `schema.import_flows.missing`
- `permissions.non_admin_admin_access`
- `permissions.service_app_access`
- `permissions.non_admin_system_permissions`
- `permissions.public_writes`
- `permissions.lead_intake_extra_permissions`
- `permissions.non_admin_wildcards`

Expected non-zero values:

- `permissions.studio_tfa_policies = 3`
- `permissions.public_read_rows` should match the intentional public/read-token
  surface.
- `schema.snapshot_audit_rows = ok`

`schema.custom_tables.untracked` should normally be `0`. If it is non-zero,
either document the table and add it to the audit contract, or remove the
unexpected table after a backup/review.

## Studio Audit Shape

`directus:audit-studio` checks the editor layer around the schema: collection
metadata, field notes, bookmarks, page-section JSON guardrails, import batches,
Files hygiene, destructive permissions and lead source context.

Blockers should be `0`:

- `studio.collections.missing_ux_metadata`
- `studio.fields.missing_notes`
- `studio.fields.required_without_note`
- `studio.site_settings.singleton_not_one`
- `studio.bookmarks.missing`
- `studio.page_sections.advanced_json_editable_by_editor`
- `studio.page_sections.content.local_assets`
- `studio.page_sections.content.image_src_keys`
- `studio.import_batches.missing_files`
- `studio.import_batches.invalid_last_run_status`
- `studio.import_batches.failed_without_log`
- `studio.files.required_folders_missing`
- `studio.files.used_without_folder`
- `studio.files.non_image_in_device_photos`
- `studio.device_images.missing_alt_or_label`
- `studio.leads.open_without_source_context`
- `studio.destructive_editor_permissions`
- `studio.leads.invalid_status`

Expected or informational non-zero values:

- `studio.import_batches.count` may be `0` before the first real catalog batch.
- `studio.files.review_folder_count` shows files still waiting for review.
- `studio.page_sections.content.direct_asset_urls.warning`,
  `studio.files.device_originals_over_10mb.warning` and
  `studio.leads.in_progress_without_assignee.warning` are review prompts, not
  automatic deploy blockers.
