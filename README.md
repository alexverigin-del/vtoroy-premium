# ISVOI

ISVOI is a Next.js + Directus storefront for a curated device catalog: Store,
Passport, Trade and Club.

The production site is the Next.js app in `apps/web`, served behind nginx and
PM2. Directus is the editor-facing data platform for pages, devices, files and
leads. The old root-level static HTML pages have been retired; legacy `.html`
URLs are kept only as Next.js redirects.

## Public Routes

Current Next routes:

- `/`
- `/catalog`
- `/store`
- `/passport`
- `/trade`
- `/club`
- `/device/[slug]`
- `/lead-intake` (POST only)

Compatibility redirects live in `apps/web/next.config.mjs`:

- `/index.html` -> `/`
- `/catalog/index.html` -> `/catalog`
- `/store/index.html` -> `/store`
- `/passport/index.html` -> `/passport`
- `/trade/index.html` -> `/trade`
- `/club/index.html` -> `/club`
- `/device/:slug/index.html` -> `/device/:slug`

## Repository Layout

| Path | Purpose |
| --- | --- |
| `apps/web/` | Next.js public site and renderer |
| `apps/web/public/` | Static assets served by Next |
| `directus/` | Directus schema and workflow docs |
| `docs/` | Architecture, launch and catalog runbooks |
| `infra/directus-beget/` | Docker Compose and nginx examples for Beget |
| `packages/shared/` | Shared TypeScript contracts |
| `scripts/` | Directus setup, imports, media, audits and ops helpers |
| `data/` | Legacy/reference seed data for fallback and migration scripts |
| `assets/` | Legacy/reference media used during the migration to Directus Files |

## Common Commands

```bash
npm install
npm run web:dev
npm run web:build
npm run web:start
```

Quality checks:

```bash
npm run text:audit
npm run legacy:audit
```

Directus setup scripts print idempotent SQL. On the server, write the SQL to a
temporary file and apply it through the Beget compose env:

```bash
cd /opt/isvoi
npm run directus:setup:catalog > /tmp/isvoi_directus_setup.sql

cd infra/directus-beget
set -a && . ./.env && set +a
docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_directus_setup.sql
```

## Production

Production is deployed from the git checkout at `/opt/isvoi` on the Beget VPS.
The public nginx vhost proxies to `next start`; Directus runs in Docker Compose
behind `api.isvoi.ru`.

Typical deploy:

```bash
git pull --ff-only
npm run web:build
pm2 restart isvoi-web
```

Run Directus setup scripts only when schema/metadata changes are intentional.
Secrets stay in local/server `.env` files and are never committed.
