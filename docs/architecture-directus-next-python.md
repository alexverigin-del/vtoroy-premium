# Architecture — Next.js + Directus + PostgreSQL + Python jobs

This document describes the **target** architecture for Второй Премиум and how
the current static site migrates into it. None of this replaces the live site
yet; the repo holds the foundation so work can begin safely.

## Overview

```
                         ┌──────────────────────┐
   Visitors  ───────────▶│  Public Site         │
                         │  Next.js + Tailwind  │  (apps/web)
                         └──────────┬───────────┘
                                    │ REST / GraphQL (read, published only)
                                    ▼
                         ┌──────────────────────┐
   Staff (admin) ───────▶│  Directus            │  Studio admin UI + API
                         │  (Docker on Beget)   │  (infra/directus-beget)
                         └──────────┬───────────┘
                                    │ SQL
                                    ▼
                         ┌──────────────────────┐
                         │  PostgreSQL          │
                         └──────────────────────┘

   Python jobs ◀────────▶ Directus API / PostgreSQL ◀──▶ Storage (uploads)
        │                                                     │
        ├─ import_devices_from_excel.py  (stock spreadsheet → catalog)
        ├─ optimize_images.py            (raw photos → WebP)
        └─ notify_telegram.py            (leads / reports → Telegram)
                                                              │
                                                       Excel / Reports
```

- **Public Site** — `apps/web`, a Next.js (App Router) + TypeScript + Tailwind
  app. Reads published content from Directus through a least-privilege read
  token. Uses ISR (`revalidate`) for fast, cacheable pages.
- **Directus** — headless CMS. Provides the REST/GraphQL API **and** the Studio
  admin UI. This is the real admin — we deliberately do **not** build a custom
  admin app.
- **PostgreSQL** — the database, owned by Directus.
- **Python jobs** — back-office automation (`scripts/`) talking to the Directus
  API and/or storage: Excel import/export, image optimization, Telegram alerts,
  reports.

## Why this shape

- Directus gives a production-grade admin and API for free, so engineering
  effort goes into the public experience, not CRUD screens.
- The public site stays a thin, fast read layer; all editing flows through one
  audited place (Directus).
- Python jobs are decoupled and idempotent — they can run on cron or be
  triggered by Directus flows/webhooks.

## Repository layout

| Path                    | Role                                                        |
| ----------------------- | ----------------------------------------------------------- |
| repo root (`*.html`)    | **Live static site** (today's production)                   |
| `apps/web/`             | Future Next.js public site                                  |
| `packages/shared/`      | Shared TS types/helpers (`Device`, passport, trade)         |
| `infra/directus-beget/` | Docker Compose + nginx for Directus + Postgres on Beget     |
| `directus/schema/`      | Collection / roles / permissions spec                       |
| `scripts/`              | Python jobs                                                  |
| `docs/`                 | This document and future ops notes                          |

The Node workspaces (`apps/*`, `packages/*`) are isolated: installing or
building them never touches the static root site.

## Deployment flow (Beget VPS)

1. **Backend up:** in `infra/directus-beget`, `cp .env.example .env`, fill
   secrets, `docker compose up -d`. Postgres + Directus (+ optional Redis) run;
   Directus is bound to `127.0.0.1:8055`.
2. **TLS + nginx:** issue certs for `your-domain.ru` and `api.your-domain.ru`;
   install the vhosts from `infra/directus-beget/nginx/*.example`.
3. **Model the data:** create the collections from
   `directus/schema/collections.md` in Studio; set roles/permissions; mint a
   public read token and (optionally) a create-only lead token.
4. **Seed content:** run `scripts/import_devices_from_excel.py` (or enter data
   in Studio) to populate `devices` / passports / trade options.
5. **Public site:** set `NEXT_PUBLIC_DIRECTUS_URL`, `npm run web:build`,
   `npm run web:start` behind the public nginx vhost.

## Static → Next.js migration plan

The migration is incremental and reversible at each step.

1. **Foundation (this commit).** Scaffold `apps/web`, shared types, infra, docs.
   Static site untouched and still served.
2. **Stand up Directus.** Deploy the backend; create collections; import the
   four prototype devices so the API returns real data.
3. **Implement data access.** Fill in `apps/web/lib/directus.ts`
   (`fetchDevices`, `fetchDeviceBySlug`) and map Directus rows to the shared
   `Device` type.
4. **Port pages, one at a time.** Rebuild catalog → product/passport → store →
   trade → club in Next.js using the existing Refero-Apple tokens already in
   `tailwind.config.ts` / `globals.css`. Keep visual parity with the static
   pages (use the current HTML/CSS as the reference design).
5. **Forms → leads.** Wire "Получить подборку" / trade forms to create rows in
   the Directus `leads` collection (create-only token), with Telegram alerts via
   `scripts/notify_telegram.py` or a Directus flow.
6. **Cut over.** Point the public nginx vhost from the static files to the
   Next.js app (`location /` proxy in `public-site.conf.example`). Keep the
   static files as an instant rollback until the Next.js site is proven.
7. **Decommission.** Once stable, retire the root static HTML (or keep it as an
   archived fallback).

Throughout, `data/devices.json` remains the canonical reference for field shape
until Directus is the source of truth; `packages/shared` keeps both sides typed.

## Secrets

No secrets in the repo. Every component ships a `.env.example` with placeholders:
`apps/web/.env.example`, `infra/directus-beget/.env.example`,
`scripts/.env.example`. Real `.env` files are gitignored.
