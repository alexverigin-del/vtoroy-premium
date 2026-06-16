# ISVOI

ISVOI — клуб разумного владения. Хорошие вещи проходят через своих — Store / Passport / Trade / Club, Северодвинск.

This repository currently contains **two things side by side**:

1. **The live static site** — plain HTML/CSS/JS at the repository root. This is what
   is published today (e.g. to the pplx.app preview). It has **no build step** and
   **no dependencies**; you can open `index.html` directly or serve it statically.
2. **A future-ready architecture foundation** — scaffolding for a Next.js public
   site backed by Directus + PostgreSQL, plus Python jobs. None of this is wired
   into production yet; it exists so development can start without disrupting the
   live site.

> **Important:** the static root site does **not** depend on the Node workspaces.
> Running `npm install` or building `apps/web` will never change what the static
> site serves. Migration to Next.js is a deliberate, later step (see the migration
> plan in `docs/`).

---

## Current static site

No tooling required. To preview locally:

```bash
python3 -m http.server 8137
# open http://localhost:8137/index.html
```

Content model for the prototype lives in `data/devices.json` (and the mirrored
`data/devices.js`), consumed by `script.js`.

Pages: `index.html`, `catalog/`, `store/`, `passport/`, `trade/`, `club/`,
`device/<slug>/`.

---

## Future architecture (foundation only)

```
Public Site (Next.js)  ──>  Directus API  ──>  PostgreSQL
Admin                  ──>  Directus Studio
Python jobs            <──> Directus API / PostgreSQL <──> Storage <──> Telegram / Excel / Reports
```

See **[docs/architecture-directus-next-python.md](docs/architecture-directus-next-python.md)**
for the full picture, deployment flow, and the static → Next migration plan.

### Repository layout

| Path                     | Purpose                                                              | Status        |
| ------------------------ | -------------------------------------------------------------------- | ------------- |
| `index.html`, `*/`       | Live static site (published today)                                   | **Production**|
| `data/`, `assets/`       | Static-site content + images                                         | Production    |
| `apps/web/`              | Future Next.js + TypeScript + Tailwind public site                   | Scaffold      |
| `packages/shared/`       | Shared TS types/helpers for devices & passports                      | Scaffold      |
| `infra/directus-beget/`  | Docker Compose + nginx for Directus + Postgres on a Beget VPS        | Scaffold      |
| `directus/schema/`       | Directus collections / roles / permissions specs                     | Docs          |
| `scripts/`               | Python jobs (Excel import, image optimization, Telegram notify)      | Skeleton      |
| `docs/`                  | Architecture, deployment, migration plan                             | Docs          |

### Admin

The real admin is **Directus Studio** (served by the Directus container). There is
no custom admin app in this repo by design — we avoid overbuilding. A thin Next.js
dashboard wrapper can be added later only if it adds value.

---

## Common commands

```bash
# Install workspace dependencies (does NOT affect the static root site)
npm install

# Run the future Next.js site in dev (placeholder app for now)
npm run web:dev

# Build / start the Next.js site
npm run web:build
npm run web:start

# Bring up Directus + Postgres locally (see infra README first)
cd infra/directus-beget && cp .env.example .env && docker compose up -d
```

Secrets are never committed. Each `.env.example` documents the required variables;
copy it to `.env` and fill in real values locally / on the server.
