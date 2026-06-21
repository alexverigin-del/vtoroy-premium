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

Production:

```bash
npm run directus:audit-schema > /tmp/isvoi_schema_audit.sql

cd infra/directus-beget
set -a && . ./.env && set +a
docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_schema_audit.sql
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
