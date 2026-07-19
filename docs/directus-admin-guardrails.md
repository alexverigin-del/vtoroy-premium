# Directus admin guardrails

This is the final security pass after broader Directus Studio/setup scripts.
Run it last when roles, flows, import screens or permissions were changed:

```bash
npm run directus:setup:admin-guardrails
```

Production:

```bash
cd /opt/isvoi
npm run directus:setup:admin-guardrails > /tmp/isvoi_admin_guardrails.sql

cd infra/directus-beget
set -a && . ./.env && set +a
docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_admin_guardrails.sql
```

## What It Enforces

- `Administrator` is the only policy with `admin_access=true`.
- `Administrator`, `ISVOI Editor`, `ISVOI Advanced Editor` and `ISVOI Importer` keep Studio `app_access=true` and require TFA.
- Service policies stay headless: `$t:public_label`, `ISVOI Public Read`, `ISVOI Lead Intake`, `ISVOI Catalog Import`.
- High-risk Directus system collections stay admin-only for non-admin policies.
- Public policies are read-only.
- `ISVOI Lead Intake` is create-only on `leads`.

`directus_files` and `directus_folders` are intentionally excluded from the
system-collection block because editors/importers need managed media workflows.

## Expected Checks

After a clean run:

- `admin_guardrails.non_admin_admin_access = 0`
- `admin_guardrails.service_app_access = 0`
- `admin_guardrails.studio_tfa_policies = 4`
- `admin_guardrails.system_permissions = 0`
- `admin_guardrails.public_writes = 0`
- `admin_guardrails.lead_intake_extra_permissions = 0`

`admin_guardrails.admin_users_without_tfa` is an action item. If it is greater
than zero, open Directus Studio and enable 2FA for every active Administrator.
