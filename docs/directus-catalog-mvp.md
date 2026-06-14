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
2. Create the `devices` collection (and related) per
   `directus/schema/collections.md`, and the content collections per
   `directus/schema/content-model.md`.
3. Set `DIRECTUS_URL` (and a `DIRECTUS_TOKEN` if your public role is not
   anonymous-read) in `apps/web/.env.local`.
4. `getPublishedDevices()` / `getDeviceBySlug()` automatically use live data; the
   fallback engages only on missing config or error.

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
