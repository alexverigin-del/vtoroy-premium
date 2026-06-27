# Architecture: Next.js + Directus + PostgreSQL + Jobs

This document describes the current ISVOI production shape. The public site is
Next.js. Directus is the editor and data platform. Root-level legacy HTML pages
have been retired; old `.html` URLs are compatibility redirects only.

## Overview

```text
Visitors
  -> nginx
  -> Next.js public site (apps/web, PM2, next start)
  -> Directus API for published content and catalog data
  -> PostgreSQL

Staff
  -> Directus Studio at api.isvoi.ru/admin
  -> Directus API
  -> PostgreSQL

Jobs
  -> scripts/import_devices_from_excel.py
  -> scripts/import_device_media.mjs
  -> scripts/optimize_images.py
  -> scripts/notify_telegram.py (later for leads)
```

## Runtime Roles

- **Next.js public site**: renders `/`, `/catalog`, marketing pages,
  `/device/[slug]` and `/lead-intake`.
- **Directus**: owns editable content, catalog rows, files, lead workflow,
  roles, permissions and Studio.
- **PostgreSQL**: Directus-owned persistence.
- **Jobs/scripts**: idempotent imports, media migration, setup SQL and audits.

## Repository Layout

| Path | Role |
| --- | --- |
| `apps/web/` | Production Next.js public site |
| `apps/web/public/` | Static assets served by Next |
| `directus/` | Data model and workflow docs |
| `infra/directus-beget/` | Docker Compose and nginx examples |
| `packages/shared/` | Shared TypeScript contracts |
| `scripts/` | Setup, import, media, audit and ops helpers |
| `data/` | Legacy/reference seed data for fallback and migration |
| `apps/web/public/assets/` | Public fallback/reference media while Directus Files migration finishes |

## Public Routing

Canonical routes:

- `/`
- `/catalog`
- `/store`
- `/passport`
- `/trade`
- `/club`
- `/device/[slug]`

Compatibility redirects are defined in `apps/web/next.config.mjs`:

- `/index.html` -> `/`
- `/{catalog,store,passport,trade,club}/index.html` -> canonical route
- `/device/:slug/index.html` -> `/device/:slug`

Run `npm run legacy:audit` before deployment to confirm the old static HTML
entrypoints and content links have not returned.

## Deployment Flow

On Beget, the project lives at `/opt/isvoi`.

```bash
git pull --ff-only
npm run web:build
pm2 restart isvoi-web
```

When Directus schema or Studio metadata changes, run the relevant setup script
and pipe it into the Postgres container:

```bash
npm run directus:setup:catalog > /tmp/isvoi_directus_setup.sql

cd infra/directus-beget
set -a && . ./.env && set +a
docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_directus_setup.sql
```

Use the same pattern for `directus:setup:leads`, `directus:setup:editor` and
other SQL-printing setup scripts.

After schema, Studio, role or Flow changes, export and audit the running
Directus contract:

```bash
npm run directus:schema:snapshot
npm run directus:audit-schema
```

See `docs/directus-schema-snapshot-audit.md`.

## Decommissioning Legacy

Completed:

- Next routes cover the old static pages.
- Directus-backed renderer owns page sections.
- Legacy `.html` URLs redirect to canonical routes.
- Root legacy HTML entrypoints are removed from the repo.

Still temporary:

- `data/devices.json` and `apps/web/data/devices.ts` remain as fallback seed
  data until the Directus catalog is fully filled.
- `apps/web/public/assets/` remains as fallback/source media for local builds
  and import scripts while product images continue moving to Directus Files.
- The old root `script.js` and `styles.css` were removed with the static HTML.
  The production app uses `apps/web/public/interactions.js` and
  `apps/web/public/styles.css`.

## Secrets

No secrets in the repo. Use local/server `.env` files based on:

- `apps/web/.env.example`
- `infra/directus-beget/.env.example`
- `scripts/.env.example`
