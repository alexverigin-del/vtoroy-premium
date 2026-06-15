# Directus Catalog MVP (apps/web)

First working slice of the future Next.js site: a **catalog** and **product
(passport)** experience that reads from Directus when configured and otherwise
falls back to bundled demo data. The live static site in the repo root is
untouched.

## Routes

| Route             | File                                  | Purpose                                  |
| ----------------- | ------------------------------------- | ---------------------------------------- |
| `/`               | `app/page.tsx`                        | Home with a 4-card catalog preview.      |
| `/catalog`        | `app/catalog/page.tsx`                | Full device grid.                        |
| `/device/[slug]`  | `app/device/[slug]/page.tsx`          | Product page + Passport Премиума summary.|

Components: `components/DeviceCard.tsx`, `components/PassportSummary.tsx`,
`components/CTAButton.tsx`.

## Data flow & fallback

```
getPublishedDevices() / getDeviceBySlug(slug)        ── lib/directus.ts
        │
        ├─ DIRECTUS_URL (or NEXT_PUBLIC_DIRECTUS_URL) set AND request OK
        │     → live data from Directus  GET /items/devices?...
        │
        └─ URL missing OR fetch fails OR empty result
              → fallbackDevices from apps/web/data/devices.ts
                (a build-time mirror of repo-root data/devices.json)
```

- **No backend required.** With no env vars, the app builds and renders the four
  prototype devices from the bundled module — no runtime file reads, no network.
- **Resilient.** Any network/JSON error falls back to bundled data for catalog
  reads. Editable-content reads (`getSitePage`, `getPageSections`, `getFaqItems`)
  return `null`/`[]` so routes can render template defaults (content has no demo
  seed by design; the static prototype is the reference).
- **URL preference.** Server components prefer `DIRECTUS_URL` (not exposed to the
  browser); `NEXT_PUBLIC_DIRECTUS_URL` is the browser-visible fallback.

### Image note

Bundled fallback devices reference repo-root-relative paths (e.g.
`assets/...webp`) that this app does not serve. `DeviceCard` renders the real
image only when the URL is absolute (a resolved Directus asset) and otherwise
shows a neutral placeholder. This keeps the MVP credible without copying binary
assets into the app.

## Run locally

```bash
# from the repo root (installs the workspaces; does NOT affect the static site)
npm install

# fallback mode (no Directus) — uses bundled demo data
npm run web:dev          # http://localhost:3000  → /  /catalog  /device/iphone-13-pro

# live mode — point at a Directus instance
cd apps/web && cp .env.example .env.local   # set DIRECTUS_URL, then:
npm run web:dev
```

## Switch to Directus

1. Stand up Directus (see `infra/directus-beget/README.md`).
2. Seed the catalog automatically: `python scripts/seed_directus.py` creates the
   `devices` collection (if absent) and upserts the 4 devices from
   `data/devices.json`. See **Local run** below for the full flow. (Editable site
   content collections are separate — see `directus/schema/content-model.md`.)
3. Set `DIRECTUS_URL` (and a `DIRECTUS_TOKEN` if your public role is not
   anonymous-read) in `apps/web/.env.local`.
4. `getPublishedDevices()` / `getDeviceBySlug()` automatically use live data; the
   fallback engages only on missing config or error.

### MVP `devices` shape

The MVP uses a **single** `devices` collection: scalar fields are snake_case
columns, and `tags` / `gallery` / `passport` / `trade` are **JSON columns**
(`listing_image` is a plain string path — no file relation, so no binary upload
is required for the MVP). The fetcher requests a flat `fields=*` and maps each
row to the app `Device` type via `mapDeviceFromDirectus()` in `lib/directus.ts`.
The relational sub-collections in `directus/schema/collections.md`
(`device_gallery`, `device_passports`, `trade_options`) remain the documented
future target for richer admin editing.

## Local run (Docker)

End-to-end on a local machine with Docker:

```bash
# 1. Directus + Postgres
cd infra/directus-beget
cp .env.example .env          # set SECRET (openssl rand -hex 32), DB_*, ADMIN_*; PUBLIC_URL=http://localhost:8055
docker compose up -d          # Directus → http://localhost:8055

# 2. In Directus Studio (http://localhost:8055), log in with ADMIN_* and create a
#    static token for an Editor (or Admin) service account: User → Token → save.

# 3. Seed the catalog
cd ../../scripts
cp .env.example .env          # set DIRECTUS_URL=http://localhost:8055 and DIRECTUS_TOKEN=<the token>
pip install -r requirements.txt
python seed_directus.py --dry-run   # optional: preview calls, no writes
python seed_directus.py             # creates collection + upserts 4 devices (idempotent)

# 4. Point the Next.js app at Directus
cd ../apps/web
cp .env.example .env.local    # set DIRECTUS_URL=http://localhost:8055 (token only if the public role is not anon-read)
npm run web:dev               # from repo root, or: npm run dev

# 5. Verify LIVE data (not fallback)
#    http://localhost:3000/catalog              → grid from Directus
#    http://localhost:3000/device/iphone-13-pro → product + Passport from Directus
#    The home page note reads "Данные загружаются из Directus." when DIRECTUS_URL is set.
```

`.env` / `.env.local` are gitignored — never commit real tokens.

## Regenerate fallback data

After editing `data/devices.json`:

```bash
node -e 'const d=require("./data/devices.json");require("fs").writeFileSync("apps/web/data/devices.ts","// AUTO-GENERATED\nimport type { Device } from \"@vtoroy/shared\";\nexport const fallbackDevices: Device[] = "+JSON.stringify(d.devices,null,2)+" as Device[];\n")'
```

## Types

All data is typed via `@vtoroy/shared` (`packages/shared`):
- `Device`, `DevicePassport`, `PassportState`, … (`src/device.ts`)
- `SitePage`, `PageSection`, `FaqItem`, `SiteSettings`, … (`src/content.ts`)

Keep these in sync with the Directus schema docs when collections change.
