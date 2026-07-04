# Project Operating Decisions

Last updated: 2026-07-04.

This document records the working agreements and production decisions for the
ISVOI site so future changes can continue from the repository, not from chat
memory alone.

## New Chat Handoff

When starting work in a new Codex chat, read this file first, then use the
documentation map near the end of this file for deeper context. The minimum
startup reading order is:

1. `README.md`
2. `PRODUCT.md`
3. `DESIGN.md`
4. `docs/beget-vps-launch-checklist.md`
5. `docs/architecture-directus-next-python.md`
6. `directus/schema/content-model.md`
7. `directus/schema/collections.md`
8. `docs/catalog-workflow.md`
9. `docs/catalog-operator-guide.md`
10. `docs/directus-backup-restore.md`

Before assuming the state of the project, compare local git, GitHub and
production:

```powershell
git status --short
git log -6 --oneline
git status -sb
git ls-remote origin master
ssh -i C:\Users\1\.ssh\isvoi_beget_ed25519 deploy@217.114.14.32 "cd /opt/isvoi && git log -1 --oneline && git status --short"
```

New chat rules:

- Use `C:\Users\1\Documents\ISVOI` as the primary local workspace. The older
  Codex export/work path should not be treated as the default working copy.
- Do not assume local commits are pushed or deployed until GitHub and Beget are
  checked.
- Do not assume production is on the same commit as the local workspace.
- Do not print secrets or full env files. Inspect only explicit safe keys.
- Prefer the `deploy` user for Beget checks and deploys. Use root only for
  nginx/system operations that require it.
- Before live schema, media or deployment changes, confirm there is a recent
  backup or create one with the documented backup script.
- Push, deploy and external infrastructure changes still require explicit user
  wording in the current chat.

## Working Mode

- Keep the project work in one long-running thread when possible. The thread
  has operational context for Beget, Directus, GitHub, Studio, catalog import,
  leads, backups and deployment.
- Prefer small production-safe iterations: audit, implement one logical step,
  verify, commit, then deploy only when explicitly requested.
- Use these request modes:
  - `проведи аудит и дай рекомендации` means inspect and report without edits.
  - `реализуй` means edit locally and verify.
  - `реализуй и задеплой` / `пушь и деплой` means push to GitHub and apply on
    Beget after checks.
  - `только объясни` means answer without code or infrastructure changes.
- Pushes, external deploys and live infrastructure changes require explicit
  wording from the user. Local commits are acceptable for completed repo work.

## Codex Skills

Use relevant local Codex skills deliberately, then record durable project
decisions in this repo rather than relying on chat memory.

- Use `directus-platform` for Directus architecture, Studio structure, roles,
  permissions, schema scripts, file handling, cache and production operations.
- Use `build-web-apps:react-best-practices` for Next.js/App Router changes,
  React component refactors, data-fetching changes and frontend performance
  cleanup.
- Use `playwright` or the existing `scripts/smoke_playwright.mjs` flow for
  browser smoke checks of `/catalog`, `/store` and device pages.
- Use `impeccable` for frontend design audits, design-system documentation,
  critique/polish work and UI hardening. Its durable project context is
  `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json`.
- Use `skill-creator` only when maintaining a reusable project/platform skill,
  not for one-off project notes.
- If a new skill materially changes how the project is operated, add it here
  or to the relevant focused document in `docs/`.

## Shell And Remote Execution

- Use simple local PowerShell commands for local file/git inspection.
- Avoid long inline chains like PowerShell -> SSH -> bash -> SQL. For complex
  remote work, use a heredoc/runner script passed to SSH or a committed script.
- Avoid quote acrobatics in PowerShell. Prefer existing npm scripts, checked-in
  helper scripts, temp files, or simple `Start-Process -ArgumentList @(...)`
  calls over nested `node -e`, SSH, bash and JavaScript strings. If logs are
  needed, write stdout and stderr to separate files because `Start-Process`
  rejects one shared redirect target.
- Prefer `rg` for repository search.
- Use `apply_patch` for text edits. Use shell deletion only for binary files or
  other cases where patch tooling cannot safely read the file, after verifying
  target paths.

## Local Development Baseline

- Primary local workspace: `C:\Users\1\Documents\ISVOI`.
- Local Node.js was installed through `winget` in user scope.
- Local Node.js version: `v24.18.0`.
- Local npm version: `11.16.0`.
- The project uses the npm/package-lock workflow. Use `npm install`, not pnpm,
  for normal local setup.
- Standard local checks:

```powershell
npm install
npm run web:verify
```

- Temporary bundled `pnpm` workarounds were only used before npm was available
  in PATH. Do not commit `pnpm-lock.yaml` or `pnpm-workspace.yaml` unless the
  project explicitly migrates package managers.

## Source Of Truth

- GitHub `master` is the source for deployable code.
- Production checkout is `/opt/isvoi` on the Beget VPS.
- Keep local git, GitHub `master` and the Beget checkout synchronized after
  deploy. A completed deploy should end with clean local and production git
  status, except ignored runtime directories such as `backups/`.
- Directus schema, permissions and Studio metadata changes should be captured
  as idempotent scripts in `scripts/` and documented in `directus/` or `docs/`.
- Runtime data, uploads, backups and secrets stay outside git:
  - `.env*`
  - `var/`
  - `backups/`
  - `infra/directus-beget/data/`
  - `infra/directus-beget/uploads/`
  - `infra/directus-beget/extensions/`

## Production Baseline

- Public site: `https://isvoi.ru/`
- Directus API: `https://api.isvoi.ru/`
- Directus Studio: `https://api.isvoi.ru/admin/`
- Beget host: `deploy@217.114.14.32`
- Production checkout: `/opt/isvoi`
- PM2 app: `isvoi-web`
- Directus compose stack: `/opt/isvoi/infra/directus-beget`
- Next.js is on the 15.x line (`next@^15.5.19`) with React 18.3.
- Directus image is pinned to `directus/directus:11.17.4` in
  `infra/directus-beget/docker-compose.yml`.
- PostgreSQL is `postgres:16-alpine`; Redis is `redis:7-alpine`.
- Directus is bound to `127.0.0.1:8055` and exposed through nginx.
- Certbot uses the project email recorded in
  `docs/beget-vps-launch-checklist.md`; certificate renewal should stay
  automated and periodically dry-run checked.

Keep the full production snapshot in
`docs/beget-vps-launch-checklist.md` current when infrastructure changes.

## Verification Gates

Use the smallest relevant gate for the change, but production changes should
normally pass:

```bash
npm run web:verify
npm run smoke:prod
npm run smoke:images
npm run smoke:visual
npm run smoke:performance
npm run smoke:copy
```

`web:verify` is the local pre-deploy web gate. It runs `legacy:audit`,
`tailwind:post-audit`, Tailwind-aware format check, ESLint, TypeScript, the
production build and `bundle:budget`. `smoke:prod` is the live post-deploy gate
against `https://isvoi.ru` unless `SMOKE_BASE_URL` is overridden.
`smoke:visual` is the Playwright visual smoke gate for desktop/mobile route
screenshots and catches horizontal overflow, clipped text and suspicious visible
element overlap.
Playwright smoke scripts must use `scripts/playwright_browser.mjs` for browser
launch. Do not replace them with long `node -e` one-liners in PowerShell: the
helper first tries the normal Playwright browser cache, then falls back to
`PLAYWRIGHT_EXECUTABLE_PATH`, `CHROME_EXECUTABLE_PATH`, or installed
Windows Chrome/Edge. Intentional horizontally scrollable UI rows should declare
`data-allow-horizontal-scroll="true"` so the visual smoke can distinguish a
controlled chip rail from document-level overflow.
`smoke:images` is the lightweight Directus/Next image latency gate. It samples
Directus asset ids from `/catalog`, `/store` and one device page, then checks
3-5 Directus transform URLs and matching `/_next/image` optimizer URLs. Defaults
can be tuned with `IMAGE_SMOKE_LIMIT`, `IMAGE_SMOKE_MIN_ASSETS`,
`IMAGE_SMOKE_DIRECTUS_BUDGET_MS` and `IMAGE_SMOKE_NEXT_BUDGET_MS`.
`smoke:performance` is the lightweight Playwright performance gate for `/`,
`/catalog` and `/store`. It records desktop/mobile LCP through
`PerformanceObserver`, fails on near-viewport pending or broken images, and
uses `PERFORMANCE_DESKTOP_LCP_BUDGET_MS`,
`PERFORMANCE_MOBILE_LCP_BUDGET_MS` and `PERFORMANCE_SMOKE_ROUTES` for scoped
runs.
`smoke:copy` is the public HTML copy gate for `/`, `/catalog`, `/store`,
`/trade`, `/passport`, `/club` and one device page. It fails on production-facing
prototype/concept/Directus wording and should run after global content edits or
before deploy when public copy changed.

`bundle:budget` reads `apps/web/.next/build-manifest.json` and
`apps/web/.next/app-build-manifest.json` after `next build`, then checks shared
app JS, the largest route JS payload, total emitted client JS and key commercial
route payloads. It checks raw, gzip and brotli sizes by compressing each emitted
client chunk individually. Default budgets are intentionally modest and can be
overridden only after review:
`BUNDLE_SHARED_JS_KB=380`, `BUNDLE_SHARED_JS_GZIP_KB=115`,
`BUNDLE_SHARED_JS_BROTLI_KB=100`; `BUNDLE_ROUTE_JS_KB=460`,
`BUNDLE_ROUTE_JS_GZIP_KB=150`, `BUNDLE_ROUTE_JS_BROTLI_KB=130`;
`BUNDLE_TOTAL_JS_KB=900`, `BUNDLE_TOTAL_JS_GZIP_KB=290`,
`BUNDLE_TOTAL_JS_BROTLI_KB=250`. Route-specific budgets currently guard
`app:/page` via `BUNDLE_ROUTE_HOME_JS_*`, `app:/catalog/page` via
`BUNDLE_ROUTE_CATALOG_JS_*` and `app:/device/[slug]/page` via
`BUNDLE_ROUTE_DEVICE_JS_*`.

The `@vtoroy/web` lint script uses ESLint CLI over source folders
(`app`, `components`, `lib`, `data`) instead of deprecated `next lint`.
Do not include generated files such as `next-env.d.ts` in that CLI target.

Known acceptable warnings as of 2026-06-27:

- `npm audit --omit=dev` has no high or critical advisories. Moderate bundled
  dependency advisories should be reviewed during framework upgrades.

Directus/schema changes should also run the relevant SQL audits:

```bash
npm run directus:audit-schema
npm run directus:audit-navigation
npm run directus:audit-catalog
npm run directus:audit-images
npm run directus:audit-legacy-fallback
```

Tailwind-first/runtime migration changes are covered by:

```bash
npm run web:verify
```

The included `legacy:audit` guards against reintroducing root static HTML
entrypoints, deleted `site.css`/`interactions.js` runtime files or old `.html`
content links.

Live deploy checks should include:

- `https://isvoi.ru/`
- `https://isvoi.ru/catalog`
- desktop/mobile `smoke:visual` screenshots for `/`, `/catalog`, `/store`,
  `/trade`, `/passport`, `/club` and one device page when UI/layout changes;
- one device page, currently `/device/iphone-13-pro`
- `https://isvoi.ru/robots.txt`
- `https://isvoi.ru/sitemap.xml`
- `https://api.isvoi.ru/server/health`
- baseline security headers on `https://isvoi.ru/`;
- Directus env guardrails inside the container;
- the latest backup archive integrity when backup logic changes.

## Backup Decision

- Back up both PostgreSQL and Directus uploads. Database-only backups are not
  enough because Directus Files live in the uploads volume.
- Use `scripts/backup_beget_directus.sh` on production.
- Daily cron for `deploy` should run:

```cron
17 2 * * * cd /opt/isvoi && bash scripts/backup_beget_directus.sh >> /opt/isvoi/backups/directus/backup.log 2>&1
```

- Backups are stored under `/opt/isvoi/backups/directus/`.
- Each backup must contain `postgres.sql.gz`, `uploads.tar.gz`, `SHA256SUMS`
  and `RESTORE.md`.
- Off-server backup copy is supported through `OFFSITE_BACKUP_DEST` and
  `rclone`; storage credentials and remote configuration stay in the production
  deploy user's environment, not in git.
- On Beget, `rclone` is installed user-local at `/home/deploy/bin/rclone`
  because `deploy` has no passwordless sudo. Cron entries that use off-server
  copy should set `PATH=/home/deploy/bin:...` explicitly.
- Restore rehearsal instructions live in `docs/directus-backup-restore.md`.
- Restore rehearsals should run after backup logic changes and at least
  quarterly once off-server storage is configured.
- `npm run directus:restore-rehearsal` restores an off-server backup into a
  disposable `postgres:16-alpine` container and verifies uploads without
  overwriting production.
- As of 2026-06-28, the restore rehearsal script is implemented in repo, but
  live off-server rehearsal is still blocked until real `isvoi-backups` rclone
  credentials are configured for the `deploy` user. Production cron still runs
  the local VPS backup until that remote exists.

## Directus Decisions

- Treat Directus as a data platform, not just a CMS.
- Public role should stay minimal: public reads only intentionally public
  content and never writes to system collections or files.
- Service tokens should be least-privilege and server-only.
- `Administrator`, `ISVOI Editor` and `ISVOI Importer` are the human/operator
  Studio roles. Admin users require 2FA.
- Headless/service policies include public read, lead intake and catalog import
  policies. They should not have Studio app access.
- `ISVOI Lead Intake` is create-only on `leads`.
- `ISVOI Catalog Import` is for batch import automation and should remain
  scoped to import/media/catalog collections.
- Catalog import Manual Flow buttons call the Next.js webhook with
  `x-isvoi-import-secret` or bearer auth only. Do not put
  `CATALOG_IMPORT_WEBHOOK_SECRET` in query strings because Flow request URLs can
  be logged.
- Studio should be editor-friendly: field groups, notes, display templates,
  presets and safe roles matter as much as table structure.
- Keep schema/metadata setup scripts idempotent so they can be reapplied.
- After schema/permission changes, account for Directus/Redis cache. Restart
  Directus or flush cache when API/Studio metadata appears stale.
- On 2026-06-28, stale Redis permission cache caused Directus API to return
  `403` for fields that were already present in `directus_permissions`
  (`site_settings.logo_width`, `site_settings.logo_height`,
  `site_settings.logo_caption`). The safe recovery was: restart only the
  Directus container, delete Redis keys matching `permissions:*`,
  `isvoi-directus-*` and `sets:namespace:isvoi-directus-*`, then restart
  Directus again and re-check API reads with the production site token.

## Content Model Decisions

- `site_settings` owns brand, logo, global contacts and header CTA.
- Header/footer logo presentation is controlled by `site_settings.logo_width`,
  `site_settings.logo_height` and `site_settings.logo_caption`. The uploaded
  image may be a complete logo lockup (`I СВОИ` plus descriptor) or just the
  main mark/name with `logo_caption` providing the second line.
- `navigation_items` owns header/footer/mobile/utility navigation.
- `site_pages` and `page_sections` own managed marketing pages.
- `faq_items` owns reusable FAQ content.
- `devices` owns product records and stock/content status.
- `device_images` owns product photo variants.
- `device_passports` owns structured Passport details.
- `trade_options` owns structured Trade/Upgrade options.
- `leads` owns submitted requests and operator workflow.
- `lead_comments` owns durable processing history for leads.
- `catalog_import_batches` owns Studio-triggered catalog import batches.

Legacy JSON fields in `devices` may remain as fallback during migration, but
new commercial content should use structured collections and Directus Files.

## Styling Decisions

- `PRODUCT.md` is the strategic design context for ISVOI: register, users,
  product purpose, brand personality, anti-references, design principles and
  accessibility baseline.
- `DESIGN.md` is the current visual system reference for agents and future UI
  work. It follows the `impeccable document` / DESIGN.md format with tokens,
  typography, elevation, component rules and Do/Don't guardrails.
- `.impeccable/design.json` is the generated sidecar for the local impeccable
  live/design panel. Regenerate it when `DESIGN.md` is regenerated.
- Current frontend styling is Tailwind-first:
  - `apps/web/app/globals.css` loads Tailwind base/components/utilities and
    owns the small shared layer for `body`, `.btn-pill`, `.card` and
    `.focus-ring`.
  - React/Next components, marketing pages, catalog, leads and product pages use
    Tailwind utility classes directly.
  - `apps/web/app/site.css` has been removed from the layout and deleted.
- Do not add new large global CSS blocks for normal product/catalog/lead UI.
  Build new UI as React components with Tailwind utilities and shared tokens.
- Keep only minimal global CSS for Tailwind directives, base tokens and shared
  primitives.
- New visual decisions should update `DESIGN.md` first when they change shared
  color, type, spacing, elevation, component or motion rules.
- Completed impeccable hardening point 3 on 2026-06-28: header links, brand
  link, mobile menu button, catalog filter chips, sort select, card CTAs,
  gallery tabs and device-page back link now keep at least a 44px hit area and
  visible focus rings. Current runtime hardening is handled through Tailwind
  utilities and shared `.focus-ring` primitives.
- Tailwind-first migration started on 2026-06-29:
  - `apps/web/tailwind.config.ts` is aligned with `DESIGN.md` tokens for the
    ISVOI palette, 8px card/image/input radii, product/soft/focus shadows and
    shared focus styling.
  - `SiteShell`, `SiteHeader`, `SiteFooter` and `SiteLogo` render the
    Directus-managed chrome through React/Tailwind components.
  - `/catalog` uses a React/Tailwind `CatalogGrid` with client filters,
    sorting, status chips and empty states; it no longer loads
    `interactions.js`.
  - Shared lead submission moved into `useLeadIntake`, preserving
    `/lead-intake`, source/page/UTM tracking and Turnstile.
  - Product lead form and homepage `final_cta` use React/Tailwind lead UI.
  - `HomeSectionRenderer` introduces the section-key mapping pattern. Homepage
    `hero`, `trust` and `path_router` render through React/Tailwind; unknown
    homepage sections should be mapped explicitly before editors use them.
  - Homepage `catalog_preview` uses `CatalogPreviewSection`, a React/Tailwind
    client component with Directus-configured category/status filters, sorting,
    `DeviceCard` cards and CTA links. It no longer depends on legacy
    `.catalog-toolbar` markup or `interactions.js` catalog wiring.
  - Homepage `passport_preview` uses `PassportPreviewSection`, a
    React/Tailwind section with Directus-managed feature rows, Passport card
    data and CTA links.
  - Homepage `store_preview` uses `StorePreviewSection`, a React/Tailwind
    section with Directus-managed visual image/caption, steps and CTA links.
  - Homepage `trade_preview` uses `TradePreviewSection`, a React/Tailwind
    section with Directus-managed choices, valuation example and CTA links.
  - Homepage `club_preview` uses `ClubPreviewSection`, a React/Tailwind dark
    section with Directus-managed levels, featured state, feature lists and CTA
    links.
  - Homepage `diagnostics_compare` uses `DiagnosticsCompareSection`, a
    React/Tailwind section with Directus-managed diagnostics image/note and
    comparison rows.
  - `/` no longer loads `interactions.js`; homepage mobile nav, catalog
    filters/sort, lead form and sections are React-managed.
  - Homepage sections no longer use string-rendered fallback markup; unknown
    homepage sections should be given explicit React mappings before editors use
    them.
  - Marketing route bodies (`/[slug]`) use `MarketingSectionRenderer`, so pages
    are composed as explicit React sections instead of one full-page
    `dangerouslySetInnerHTML` blob.
  - Marketing `page.hero` sections render through React/Tailwind, and `/store`
    uses the shared React/Tailwind `CatalogGrid` for the live catalog insert
    before `final_cta`.
  - Marketing `cards.grid` and `steps` variants render through
    `MarketingSectionRenderer` as React/Tailwind sections while preserving the
    same Directus `items/cards` and `steps` content shape.
  - Marketing `compare` and `faq` variants render through
    `MarketingSectionRenderer` as React/Tailwind sections while preserving the
    same Directus `comparison.rows` and enriched FAQ `items` content shape.
  - Marketing `levels`, `page.cta` and `visual.band` variants render through
    `MarketingSectionRenderer` as React/Tailwind sections while preserving the
    same Directus `levels`, CTA fields and `visual` content shape.
  - `/[slug]` no longer loads `interactions.js`; standard marketing section
    variants now render through React/Tailwind, and unknown/custom sections
    should be given explicit React mappings before editors use them.
- `apps/web/lib/site-content.ts` provides Directus/fallback data helpers:
  `siteChrome`, marketing fallback pages and homepage fallback sections. It is
  intentionally not an HTML renderer.
- Cleanup completed after standard marketing section migration:
  `MarketingSectionRenderer` no longer imports string-rendered marketing
  fallback markup, and unused full-page/catalog/marketing/homepage HTML helpers
  were removed before the fallback/content helper module was finalized as
  `apps/web/lib/site-content.ts`.
- Tailwind-first CSS/JS cleanup completed on 2026-06-29:
  `apps/web/app/layout.tsx` imports only `globals.css`; `apps/web/app/site.css`
  and `apps/web/public/interactions.js` were deleted after `/`, `/catalog`,
  marketing routes and product lead flows moved to React/Tailwind.
- Tailwind post-migration guardrails completed first pass on 2026-06-30:
  - `prettier` with `prettier-plugin-tailwindcss` sorts utility classes through
    `npm run web:format:check` / `npm run web:format:write`.
  - `clsx` + `tailwind-merge` are wrapped by `apps/web/lib/cn.ts`; use `cn()`
    for conditional className composition instead of template strings or
    array `.join(" ")` chains.
  - `eslint-plugin-tailwindcss` is enabled as warn-level feedback through
    `apps/web/.eslintrc.cjs`. The plugin uses root
    `tailwind.config.eslint.cjs` because the package is hoisted in the npm
    workspace; keep it synchronized with `apps/web/tailwind.config.ts` when
    shared tokens change.
  - `npm run tailwind:post-audit` blocks reintroduced `site.css`,
    `interactions.js`, risky dynamic Tailwind class patterns, oversized inline
    `className` literals and unapproved `@apply` expansion.
  - `npm run web:verify` now runs legacy audit, Tailwind post-audit, format
    check, lint, typecheck and build in that order, and passed locally after
    the guardrail pass.
- For DevTools navigation, important top-level UI surfaces may use
  non-styling `data-component` markers. Do not add named CSS classes solely for
  styling or navigation convenience.
- Tailwind post-migration cleanup continued after the first guardrail pass:
  repeated long CTA/back-link/card utility chains were moved into
  `apps/web/components/ui-classes.ts`. These are TypeScript presentation
  constants, not a revived CSS layer. `npm run tailwind:post-audit` now passes
  without long `className` warnings.
- Tailwind token drift guard added after the cleanup pass: shared design tokens
  now live in root `tailwind.shared.cjs`, while `apps/web/tailwind.config.ts`
  and root `tailwind.config.eslint.cjs` import that file. The post-audit script
  fails if either config stops using the shared token source or starts defining
  core tokens directly.
- Tailwind arbitrary utility governance added after the token guard:
  `npm run tailwind:post-audit` now blocks unreviewed arbitrary utilities such
  as new `max-w-[...]`, `grid-cols-[...]`, opacity slash values or hex-color
  utilities unless they match the explicit allowlist in
  `scripts/audit_tailwind_post_migration.mjs`. Repeated or brand-level values
  should become shared tokens instead of expanding the allowlist casually.
- CSS variables in `apps/web/app/globals.css` are allowed only as a raw-CSS
  mirror of shared Tailwind color tokens. `tailwind:post-audit` compares those
  `--color-*` values against `tailwind.shared.cjs` so raw CSS variables cannot
  drift independently from the Tailwind design system.
- Tailwind class composition is centralized through `apps/web/lib/cn.ts`.
  `tailwind:post-audit` now blocks direct `clsx`/`tailwind-merge` imports
  outside that helper and catches manual `className` string concatenation or
  `.join(" ")` assembly. Use `cn()` or reviewed presentation constants in
  `apps/web/components/ui-classes.ts`.
- Tailwind-first runtime surface is now allowlisted by `tailwind:post-audit`:
  CSS imports are allowed only as `apps/web/app/layout.tsx -> ./globals.css`;
  `next/script` is allowed only in root layout for the reviewed Turnstile
  loader; raw `<script>` and `dangerouslySetInnerHTML` are allowed only for
  reviewed product JSON-LD on `apps/web/app/device/[slug]/page.tsx`.
- Client/server boundaries are guarded by `tailwind:post-audit`: files with
  `"use client"` must not import Node.js runtime modules, `next/server`,
  `next/headers`, Directus/site-content helpers or fallback data modules.
  Client components may read only `NEXT_PUBLIC_*` environment variables; load
  server data in server components/routes and pass serializable props down.
- RSC/data-fetching audit on 2026-07-01 split catalog card data from full
  product detail data. Catalog pages, homepage catalog preview, `/store`,
  related products and sitemap use `getPublishedDeviceCards()`, which fetches
  only card fields plus published device images. Full `getPublishedDevices()`
  remains for server-only detail workflows that genuinely need passport/trade
  data for every item.
- Directus read helpers that are used by App Router pages are wrapped in
  request-level `react/cache` memoization. This keeps `generateMetadata` and
  the matching page render from duplicating identical `getSitePage`,
  `getDeviceBySlug`, chrome or catalog-card reads during one RSC render pass
  while preserving `no-store` live Directus reads between requests.
- Catalog client filtering/sorting was deduplicated after the RSC audit:
  `CatalogGrid` and `CatalogPreviewSection` share
  `apps/web/components/CatalogClientControls.tsx` for filter parsing, filter
  chips, sort options, visible-device selection and card-list rendering. Keep
  future catalog filter behavior in that shared module so `/catalog`, `/store`
  and homepage catalog preview do not drift apart.
- Product images in catalog cards and device galleries render through
  `apps/web/components/ProductImage.tsx`, a shared `next/image` wrapper that
  normalizes local fallback paths and Directus asset URLs. Do not reintroduce
  raw product `<img>` tags; update `ProductImage` when product-media behavior
  changes.
- Inline styling is guarded by `tailwind:post-audit`: `style={...}`,
  `CSSProperties` and direct DOM style mutations are blocked by default. The
  only reviewed exception is `SiteLogo` using `logoSizeStyle(settings)` from
  `site-chrome-utils.ts` to expose Directus-managed logo dimensions as bounded
  CSS variables.
- Raw runtime color literals are guarded by `tailwind:post-audit`: component
  and app code must not introduce ad hoc `#hex`, `rgb/rgba` or `hsl/hsla`
  values. Use shared Tailwind tokens, `currentColor` or reviewed CSS variables;
  new brand-level colors should be added to `DESIGN.md` and
  `tailwind.shared.cjs` together.
- Oversized inline `className` literals are guarded by `tailwind:post-audit`.
  Utility bundles above the reviewed length threshold should become extracted
  components, `cn()` calls or named presentation constants in
  `apps/web/components/ui-classes.ts`.
- Repeated Tailwind arbitrary values were promoted to shared tokens on
  2026-07-01. Layout widths, custom letter spacing, 17px copy text, display
  line heights, repeated min-heights, product aspect ratio and custom grid
  columns now live in `tailwind.shared.cjs`. Prefer semantic utilities such as
  `max-w-page`, `max-w-shell`, `max-w-copy`, `tracking-label`, `text-copy`,
  `grid-cols-product` and `aspect-product` over new `[...]` classes.
- The arbitrary utility allowlist is intentionally narrow after the token pass:
  only Directus-managed logo CSS variables and the offscreen lead-form honeypot
  are allowed. Repeated new values should become shared Tailwind tokens or
  reviewed component constants instead of expanding the allowlist.
- First implementation package from the 2026-07-01 taste-skill + impeccable
  recommendations is in progress locally: public fallback/runtime copy no
  longer says "prototype" or exposes technical Directus loading language,
  header navigation now marks the active route with `aria-current`, and catalog
  sort plus lead forms have explicit labels/ARIA hooks. Verified with
  `npm run web:verify`, `npm run tailwind:post-audit`,
  `npm run web:format:check`, text search for removed prototype/Directus copy,
  and a local Playwright DOM check for `/catalog`, `/store` and
  `/device/iphone-13-pro`.
- Second safe implementation step from the same recommendations added a
  mobile-only product action bar on device pages. It links to the existing
  `ProductLeadForm` anchor and the existing Trade page, keeps the lead payload
  and Directus Studio schema unchanged, and is hidden on desktop. The action
  bar must appear only after mobile scroll; production visual smoke caught that
  an always-visible fixed bar occluded first-screen product specs. Verified
  with `npm run web:verify` plus local Playwright checks for mobile visibility,
  desktop hidden state and anchor scrolling on `/device/iphone-13-pro`.
- Release package for the first and second implementation steps was requested
  on 2026-07-01. Ship them together: code changes, this operating-memory update,
  `npm run web:verify`, GitHub push, Beget `git pull --ff-only`, Beget
  `npm run web:verify`, `pm2 restart isvoi-web`, then production smoke checks.
- The 2026-07-01 release was pushed and deployed to Beget. Production passed
  local `npm run web:verify`, Beget `npm run web:verify`, `npm run smoke:prod`,
  `npm run smoke:images` and `npm run smoke:visual`. The visual smoke initially
  caught the mobile product action bar overlapping first-screen specs; the
  follow-up fix made that bar appear only after scroll, then visual smoke passed
  on `/device/iphone-13-pro` mobile and the full default route set.
- Third local implementation step from the same recommendations started after
  the release: marketing `page.hero` sections now support a compact trust strip
  with optional Directus JSON fields `highlights`, `hero_highlights` or `facts`
  and slug-specific fallbacks for Store, Trade, Passport and Club. This keeps
  the Directus schema unchanged while making marketing pages less template-like.
  Verified locally with `npm run web:verify` and `SMOKE_BASE_URL=http://127.0.0.1:3101`
  `VISUAL_SMOKE_ROUTES=/store,/trade,/passport,/club npm run smoke:visual`.
- Fourth local implementation step softened repeated marketing section
  eyebrows: `MarketingSectionRenderer` now preserves editor wording without
  forcing uppercase/tracked labels in page heroes and section headers. The
  editor guide documents hero highlight JSON so Studio users can safely override
  the trust strip without schema changes. Re-run `npm run web:verify` and
  marketing route visual smoke before release.
- Fifth local implementation step converted marketing `steps` sections from
  another bordered-card grid into lightweight ordered timelines. The renderer
  still consumes the same Directus `content.steps` array, but presents steps
  with numbered pills and hairline connectors for clearer sequence rhythm.
- Sixth local implementation step adjusted marketing card grids so four-card
  sections use four desktop columns instead of a 3+1 orphan layout. This
  currently improves `store_offer` while preserving the same Directus
  `content.items/cards` shape and the existing three-column rhythm for
  three-card sections.
- Seventh local implementation step flattened marketing `page.cta` blocks:
  remove the broad `shadow-soft` from the bordered CTA container and use the
  shared Ice surface instead. This aligns the renderer with the Flat Retail Rule
  and avoids a generic border-plus-shadow promo-card pattern.
- Eighth local implementation step improved marketing `compare` sections on
  mobile: when the desktop column header row is hidden, bad/good cells now
  repeat compact labels from the Directus `comparison.bad_header` and
  `comparison.good_header` fields. The `comparison.rows` content shape and
  desktop layout stay unchanged.
- Ninth local implementation step flattened decorative marketing emphasis in
  `MarketingSectionRenderer`: `visual.band` captions now use a solid white
  hairline panel instead of blur plus a broad shadow, and featured Club level
  cards use contrast and border emphasis instead of `shadow-product`. This
  keeps Directus `visual` and `levels` content unchanged while aligning with
  the Flat Retail Rule.
- Tenth local implementation step hardened marketing FAQ rows:
  `MarketingFaqSection` still uses native `details/summary` and the same
  Directus `content.items` shape, but now replaces the hidden browser marker
  with an explicit chevron disclosure control and adds a visible keyboard focus
  state on the `summary` row.
- Follow-up `impeccable audit` after the `a628acb` release found no formal
  detector issues and confirmed clean git/deployed state, but identified the
  next frontend/design-safe step: flatten remaining homepage preview overlay
  panels that still use decorative blur plus broad soft/product shadows. Start
  with `heroPassportCardClass` in `apps/web/components/ui-classes.ts`,
  `StorePreviewSection`, `DiagnosticsCompareSection` and
  `PassportPreviewSection`, preserving existing Directus content shapes and
  aligning the homepage with the same Flat Retail Rule already applied to
  marketing pages.
- Eleventh local implementation step completed that homepage preview flattening
  pass: `heroPassportCardClass`, `StorePreviewSection` visual frames/captions
  and `DiagnosticsCompareSection` visual frames/captions now use hairline
  borders and solid white panels instead of `backdrop-blur` plus broad shadows,
  and `PassportPreviewSection` no longer uses `shadow-product` on its preview
  card. The existing homepage section keys and Directus `visual`, `passport`
  and feature content shapes stay unchanged.
- Twelfth local implementation step continued the Flat Retail pass across
  homepage panels: featured `ClubPreviewSection` tiers no longer use
  `shadow-product`, and `FinalCtaSection` no longer uses `shadow-soft` on the
  outer lead shell. Emphasis now comes from contrast, blue borders and content
  hierarchy while preserving existing Directus `levels`, proof and form content
  shapes.
- Thirteenth local implementation step softened repeated homepage orientation
  labels: homepage hero, path router, catalog, store, trade, passport,
  diagnostics, club and final CTA sections no longer force editor-provided
  eyebrows or valuation labels into uppercase/tracked text. True compact badges
  such as grades, tier badges and logo captions keep their badge styling.
- Fourteenth local implementation step centralized that homepage label styling
  through `homeSectionLabelClass` and `homeDarkSectionLabelClass` in
  `apps/web/components/ui-classes.ts`. This preserves the thirteenth-step
  visuals while keeping future homepage section labels from drifting across
  individual preview components.
- Fifteenth local implementation step started from the repeat Impeccable audit:
  shared `CTAButton` secondary/ghost links and the device back link now use the
  darker Link Blue on light Frost/Surface backgrounds, footer links and catalog
  sort controls keep 44px touch targets, marketing cards/facts/steps keep their
  desktop height on desktop but compact on mobile, and related device grids no
  longer reserve a full three-column row when only one or two related devices
  are available. Directus schemas and content shapes remain unchanged.
- Sixteenth local implementation step continued the same audit package:
  mobile footer navigation now uses native `details/summary` disclosure groups
  so the footer keeps 44px links without becoming a long mobile scroll, while
  desktop footer columns remain fully expanded. Sparse product related-device
  sections now pair one or two `DeviceCard` items with a calm catalog prompt
  instead of leaving empty desktop columns. Directus navigation and catalog data
  shapes remain unchanged.
- Seventeenth local implementation step closed the lead-form interaction-state
  drift from the repeat audit pass: `ProductLeadForm` and `FinalCtaSection`
  now share lead field/button presentation constants from
  `apps/web/components/ui-classes.ts`, product lead fields use the same
  48px input height, visible focus ring and tokenized success state as the
  homepage CTA, and both forms expose `aria-busy` during submission. The
  existing `/lead-intake` payloads, Turnstile handling and Directus `leads`
  schema remain unchanged.
- The seventeenth step was released as `5d2d5b4 Unify lead form interaction
  states` on 2026-07-04. Local and Beget `npm run web:verify` passed, then
  production passed `npm run smoke:prod`, `npm run smoke:images` and
  `npm run smoke:visual` after restarting PM2 `isvoi-web`.
- The 2026-07-04 ISVOI audit follow-up closed the two remaining storefront
  plan tails. `DeviceCard` now receives compact `trustFacts` built from existing
  device and Passport data, so catalog cards can show concrete facts such as
  battery, warranty, Face ID, repair/opening or water-check status instead of a
  generic `Passport` label. The Directus schema remains unchanged; card reads
  use only the compact passport fields needed for those facts.
- The same follow-up added `npm run smoke:performance` through
  `scripts/smoke_performance_playwright.mjs`. This gate measures desktop/mobile
  LCP on `/`, `/catalog` and `/store`, fails on near-viewport pending or broken
  images, and complements `smoke:images` rather than replacing it. Local and
  live runs on 2026-07-04 passed; live `/store` desktop LCP was 3712ms against
  the 4500ms budget, so no image `sizes`/`priority` change was needed.
- The repeat audit after `84b55f7` found production `site_settings` still
  contained prototype footer wording. Use
  `npm run directus:update-footer-copy-sql` to generate the idempotent SQL for
  `site_settings.footer_note`, `footer_legal` and `footer_copyright`, then run
  `npm run smoke:copy` against production to prove the public HTML is clean.
- The repeat-audit cleanup package was implemented on 2026-07-04:
  `npm run smoke:copy` now checks public HTML for prototype/concept/technical
  wording, `npm run directus:update-footer-copy-sql` generates the safe footer
  content update SQL, `/catalog` and `/store` use a balanced sparse catalog
  layout for 1-4 visible devices, and full catalog views include the calm
  "Не нашли свою модель?" selection CTA. Production footer copy was updated in
  Directus before release; after PM2 restart, verify with `npm run smoke:copy`
  plus the standard live smoke gates.
- The first live `smoke:copy` run after that release caught a remaining
  service-facing ProductLeadForm note on `/device/iphone-13-pro`. Keep lead
  form helper text public-reader friendly; do not mention storage systems or
  internal CMS names in serialized client component props.
- Next lead-form hardening step: the server-side `/lead-intake` honeypot field
  is `website`, and React forms must pass that field through their JSON submit
  path. `FinalCtaSection` and `ProductLeadForm` both include the hidden
  `website` field via `leadHoneypotClass`; `smoke:prod` checks the homepage and
  device lead forms for that hidden field so the anti-spam guard does not become
  decorative markup.
- Device detail page layout should read as a verified dossier, not a generic
  product card stack. The ambiguous "Что входит в карточку" block was removed:
  concrete condition, warranty/exit-price and Trade details now sit directly
  under the gallery in the left desktop column, while purchase controls and
  `ISVOI Passport` form the right column. Keep the mobile order as gallery,
  purchase action, condition, warranty/Trade, then Passport.
- Device provenance copy belongs in Directus `device_passports`, not React
  hardcode. Use `story_title`, `story_body` and `story_facts` for the public
  "История вещи" block; do not publish personal owner details without explicit
  consent. The page should keep `PassportSummary` focused on diagnostics, while
  condition trust facts, story, warranty duration and exit-price context sit in
  the main device-detail column. Apply `npm run directus:setup:catalog-structured-data`
  first when adding the fields to an environment, then use
  `npm run directus:update-device-stories-sql` to print the Studio-safe content
  fill SQL. Keep `directus:setup:public-permissions` in sync with `story_*`
  field reads, and use `npm run directus:update-device-public-copy-sql` if
  production device availability copy still contains prototype-era wording.
- Desktop device detail layout uses paired dossier rows rather than two
  independent columns. Keep the left column as gallery, condition, story and
  warranty/exit; keep the right column as purchase, Passport diagnostics and
  Trade. A small desktop-only offset on the condition card may be used to align
  the story block with Passport, but avoid large hardcoded spacing that would
  break with different product copy. Mobile should stay linear: purchase first,
  then condition/story/warranty, Trade and Passport.

## Studio Workflow Decisions

- Global brand/logo/header CTA are edited in `site_settings`, not in code.
- For logo variants, editors should leave `logo_caption` empty when the uploaded
  file already includes the descriptor, and use `logo_caption` when the uploaded
  file is only the main `I СВОИ` mark/name. Turn off `show_brand_name` when the
  image itself contains the brand name.
- Header/footer/mobile links are edited in `navigation_items`; header should
  stay compact, currently five primary links plus CTA.
- Marketing pages are edited through `site_pages` and owned `page_sections`.
  Editors should use existing safe sections and documented variants rather than
  creating arbitrary component data structures.
- FAQ is managed through `faq_items`, either linked by `page` or referenced by
  keys in a FAQ section.
- Editor-facing collections should keep bookmarks/presets for normal workflows:
  header menu, footer links, page sections, FAQ, catalog review, leads and
  import batches.
- Completed menu/header work points 1 and 2 before the 2026-06-28 hardening
  pass: homepage metadata uses Directus-managed content, and logo sizing plus
  optional logo caption are edited through `site_settings` in Studio. Keep
  future header/menu changes compatible with `site_settings` and
  `navigation_items` rather than baking labels, CTA text or logo presentation
  into code.
- Footer note/legal/copyright text is also Directus-managed via
  `site_settings`. Runtime fallbacks were cleaned in code, but production
  Studio values may still need a content update if they contain prototype or
  concept language. Do that through Studio or an idempotent content script; do
  not hardcode footer/legal text into React components.

## Catalog Decisions

- Commercial catalog status uses separate concepts:
  - Directus row `status` controls publication.
  - `stock_status` controls `available`, `reserved`, `sold`, `hidden`.
  - `content_status` controls editorial readiness.
- Product pages should show stock status, last update date, Passport details,
  Trade options, related devices and a lead form.
- Related devices are selected from visible devices, preferring actionable
  alternatives before sold/hidden items.
- Production catalog reads fail closed when Directus is unavailable or
  misconfigured. Bundled catalog fallback data is allowed by default only in
  development; in production it requires explicit `ALLOW_CATALOG_FALLBACK=true`
  and should be treated as an incident-mode exception.
- Large catalog updates should go through the import workflow:
  template -> media optimization -> dry run -> apply -> Directus QA.
- Non-developers should use the Studio `catalog_import_batches` operator screen
  and documented `docs/catalog-operator-guide.md` flow.
- Import scripts should use a dedicated importer/service token, not an admin
  token.
- Production legacy fallback snapshot on 2026-06-28: 4 visible devices,
  `legacy.any_fallback = 0`, including 0 for `listing_image`, missing card
  image, `gallery`, `passport` and `trade` fallback classes. Next reduction can
  start with media fallback removal.

## Lead Workflow Decisions

- Public product forms post to `/lead-intake`, not directly to Directus from the
  browser.
- Leads record source path, source URL, referrer, UTM fields, user agent,
  device id and current stock status context.
- Lead states are processed in Directus Studio; `lead_comments` should hold
  durable manager notes and follow-up history.
- Product lead behavior:
  - `available` creates a purchase/reservation-style lead.
  - `reserved` creates a waitlist lead.
  - `sold` creates a similar-device selection lead.
- Telegram notifications are intentionally deferred; the workflow must remain
  useful through the Studio table without Telegram.

## Media Decisions

- Product and editorial images that editors manage belong in Directus Files.
- New product photos should use `device_images`, with roles such as `card`,
  `main`, `screen`, `body` and `defect`.
- Uploading a file to `ISVOI Device Photos` is not enough to put it on the
  site. Product photos must be linked through `device_images.image`;
  `devices.listing_file` is only a fallback for the catalog card. Do not put
  product photos into `devices.gallery`, `devices.listing_image`,
  `page_sections.content`, `/assets/...`, `https://api.isvoi.ru/assets/...` or
  other external URL fields.
- Directus file folders are part of the operating model:
  - `ISVOI Device Photos`
  - `ISVOI Site Assets`
  - `ISVOI Editorial`
  - `ISVOI File Review`
  - `ISVOI Catalog Imports`
- Directus asset transforms should be used for delivery instead of committing
  multiple generated derivatives.
- Image optimization policy as of 2026-07-01: keep the current dual layer for
  the small catalog, where Directus produces transformed asset URLs and Next
  Image serves them through `/_next/image` with its cache. This is the stable
  deployed baseline and is covered by `smoke:prod` plus `smoke:images`.
- Strategic target for a larger catalog is Directus-first image delivery:
  Directus asset transforms own resize/crop/format/focal-point behavior, Next
  Image becomes layout/lazy-loading only with `unoptimized`, and
  `api.isvoi.ru/assets/*` should sit behind nginx proxy cache or a CDN before
  switching. Do not migrate to that target until image latency, CPU or cache
  pressure shows the current dual layer is becoming a bottleneck.
- `apps/web/public/assets/` remains only as public fallback/reference media for
  local builds and migration scripts.
- The old root `assets/` directory has been removed to avoid duplicate sources
  of truth.

## Security Decisions

- Directus API/Studio and the public site must stay behind HTTPS.
- Directus CORS is restricted to `https://isvoi.ru`,
  `https://www.isvoi.ru` and `https://api.isvoi.ru`.
- Directus production guardrails should stay enabled:
  - `MARKETPLACE_TRUST=sandbox`
  - `FILES_MAX_UPLOAD_SIZE=100mb`
  - `FILES_MIME_TYPE_ALLOW_LIST`
  - `IMPORT_IP_DENY_LIST`
- The public site sets baseline security headers in `apps/web/next.config.mjs`.
- `/lead-intake` uses honeypot plus a lightweight in-process rate limit.
  Nginx rate-limit config and opt-in Cloudflare Turnstile are available for
  production hardening. Turnstile is enforced only when `TURNSTILE_SECRET_KEY`
  is set; the browser widget is rendered only when
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set.
- As of 2026-06-28, Turnstile support is implemented as opt-in code and the
  nginx rate-limit snippet is documented in repo. Live Turnstile requires real
  Cloudflare keys in production env; live nginx rate limiting requires applying
  the snippet to `/etc/nginx` with root/sudo access.
- `/api/admin/catalog-import/run` accepts catalog import authorization only via
  `x-isvoi-import-secret` or bearer auth, never query-string secrets.
- `ALLOW_CATALOG_FALLBACK` should stay unset in production unless stale bundled
  catalog data is intentionally accepted during an incident.
- `npm audit --omit=dev` should have no high or critical vulnerabilities before
  deploy. Moderate advisories should be tracked and reduced when feasible.
- `next.config.mjs` image optimization remote patterns should stay restricted
  to `api.isvoi.ru`, not wildcard hosts.
- Directus system collections remain admin-only unless a narrowly scoped
  exception is documented and audited.

## SEO Decisions

- Canonical public URLs are extensionless routes, not legacy `.html` paths.
- Legacy `.html` URLs stay as permanent redirects in Next config.
- Current public routes are `/`, `/catalog`, `/store`, `/passport`, `/trade`,
  `/club`, `/device/[slug]` and POST-only `/lead-intake`.
- `robots.txt` and `sitemap.xml` are Next metadata routes.
- Device pages include Product JSON-LD.
- Page metadata should use canonical URLs and OpenGraph data.

## Documentation Map

- Product and visual design context:
  `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`
- Production launch and server snapshot:
  `docs/beget-vps-launch-checklist.md`
- Architecture:
  `docs/architecture-directus-next-python.md`
- Directus content model:
  `directus/schema/content-model.md`
- Catalog model and workflow:
  `directus/schema/collections.md`, `directus/catalog-workflow.md`,
  `docs/catalog-workflow.md`, `docs/catalog-operator-guide.md`
- Studio editor guides:
  `docs/site-content-editor-guide.md`, `docs/site-pages-workflow.md`,
  `docs/catalog-studio-editor-guide.md`,
  `docs/global-content-editor-guide.md`,
  `docs/leads-workflow-editor-guide.md`
- Security and guardrails:
  `docs/directus-public-permissions.md`,
  `docs/directus-admin-guardrails.md`
- Backups:
  `docs/directus-backup-restore.md`
- Schema snapshots and audits:
  `docs/directus-schema-snapshot-audit.md`

## Current Recommended Roadmap

1. Configure real production `isvoi-backups` rclone credentials, run a real
   off-server backup upload and run `npm run directus:restore-rehearsal`.
2. Apply the nginx `/lead-intake` rate-limit snippet on Beget and enable
   Turnstile keys when public traffic requires it.
3. Continue growing the catalog through the operator import workflow.
4. Keep reducing legacy fallback fields after Directus content reaches full
   production completeness.
5. Keep auditing for legacy fallback data and obsolete docs/scripts now that
   public routes no longer depend on legacy HTML/CSS/JS runtime files.
