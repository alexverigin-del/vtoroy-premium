# Project Operating Decisions

Last updated: 2026-07-06.

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
Set-Location C:\Users\1\Documents\ISVOI
git fetch --all --prune
git pull --ff-only origin master
git status --short
git log -6 --oneline
git status -sb
git ls-remote origin master
ssh -i C:\Users\1\.ssh\isvoi_beget_ed25519 deploy@217.114.14.32 "cd /opt/isvoi && git log -1 --oneline && git status --short"
```

New chat rules:

- Use `C:\Users\1\Documents\ISVOI` as the primary local workspace. The older
  Codex export/work path should not be treated as the default working copy.
- If the current Codex cwd is
  `C:\Users\1\Documents\Codex\2026-06-17\files-mentioned-by-the-user-isvoi` or
  `work\github-vtoroy-premium`, treat it as a temporary/export copy unless the
  user explicitly selects it. First fast-forward `C:\Users\1\Documents\ISVOI`
  and continue from there.
- After any deploy that was prepared from another local copy, fast-forward
  `C:\Users\1\Documents\ISVOI` before planning the next change. On 2026-07-06
  `work\github-vtoroy-premium`, GitHub and Beget were already on `7708552`,
  while `C:\Users\1\Documents\ISVOI` was still on `b1a584c`; this must be
  treated as a sync failure to correct before more implementation work.
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
  - `выкат` means the full release routine: update operating memory when the
    change creates a durable project rule, commit, push to GitHub, deploy on
    Beget, then run the relevant live smoke checks.
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
- The host Next.js runtime is Node `24.18.0` LTS with npm `11.16.0` and
  `pm2@7.0.1`. Repo installs are strict to the Node 24/npm 11 lines; Node 26
  Current is not a production target until it reaches LTS and passes a separate
  compatibility review. Directus keeps its image-managed runtime and is not
  coupled to the host Node version.
- Directus image is pinned to `directus/directus:11.17.4` in
  `infra/directus-beget/docker-compose.yml`.
- PostgreSQL is `postgres:16-alpine`; Redis is `redis:7-alpine`.
- Directus is bound to `127.0.0.1:8055` and exposed through nginx.
- Certbot uses the project email recorded in
  `docs/beget-vps-launch-checklist.md`; certificate renewal should stay
  automated and periodically dry-run checked.

Keep the full production snapshot in
`docs/beget-vps-launch-checklist.md` current when infrastructure changes.

The Node 24 migration completed on 2026-07-18 in release `d358c32`:

- Production moved from EOL Node `20.20.2` / npm `10.8.2` to Node `24.18.0`
  LTS / npm `11.16.0`; PM2 stayed pinned at `7.0.1` to isolate the runtime
  change. The Directus container remained on its image-managed Node runtime.
- Rollback config, the PM2 dump and the exact Node 20 package are stored
  outside git under `/root/isvoi-node24-migration-20260718`.
- The persistence rehearsal exposed an existing standalone PM2 daemon while
  `pm2-deploy.service` was only enabled, not active. Starting systemd over that
  daemon caused a PID ownership/protocol failure. Saving the process list,
  stopping the standalone daemon and then starting the service restored the
  app from the dump; the unit is now both enabled and active.
- Strict production `npm ci`, `web:verify`, functional, image, copy, full
  desktop/mobile visual and performance smokes passed. Directus health stayed
  `ok`; no schema, content, secret or container changes were part of the
  migration.

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

`web:verify` is the local pre-deploy web gate. It starts with `runtime:audit`,
which requires Node `>=24.18.0 <25`, then runs `legacy:audit`,
`tailwind:post-audit`, Tailwind-aware format check, ESLint, TypeScript, the
production build and `bundle:budget`. `smoke:prod` is the live post-deploy gate
against `https://isvoi.ru` unless `SMOKE_BASE_URL` is overridden.
`smoke:visual` is the Playwright visual smoke gate for desktop/mobile route
screenshots and catches horizontal overflow, clipped text and suspicious visible
element overlap. Navigation waits for the browser `load` event; do not use
`networkidle` for this production smoke because lazy Next/Directus image traffic
can keep a valid mobile page active past the navigation timeout.
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
npm run directus:audit-studio
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
- `Administrator`, `ISVOI Editor`, `ISVOI Advanced Editor` and
  `ISVOI Importer` are the human/operator Studio roles. Admin users require
  2FA.
- `page_sections.content` / `JSON-настройки блока` is technically editable in
  Studio, but only the `ISVOI Advanced Editor` policy can update it. Keep the
  ordinary `ISVOI Editor` limited to safe section fields, and run
  `directus:audit:prod` after JSON edits because this field controls structured
  React section rendering.
- Headless/service policies include public read, lead intake and catalog import
  policies. They should not have Studio app access.
- `ISVOI Lead Intake` is create-only on `leads`.
- `ISVOI Catalog Import` is for batch import automation and should remain
  scoped to import/media/catalog collections.
- Catalog import Manual Flow buttons call the Next.js webhook with
  `x-isvoi-import-secret` or bearer auth only. Do not put
  `CATALOG_IMPORT_WEBHOOK_SECRET` in query strings because Flow request URLs can
  be logged.
- Managed site content uses the active non-blocking event Action Flow
  `ISVOI: обновить кэш контента сайта`. Create, update and delete events for
  `site_settings`, `site_pages`, `page_sections`, `navigation_items`,
  `faq_items` and `device_page_settings` call
  `/api/revalidate/site-content` with `x-isvoi-revalidate-secret`. The Next.js
  route invalidates the six collection-specific data tags and the root layout
  path. Keep the five-minute fetch/ISR TTL as a failure fallback, not as the
  normal editor propagation path. The secret is server-only, at least 32
  characters, and must never be placed in a URL or printed by audits.
- The cache invalidation release on 2026-07-16 was deployed from `f43e58e`.
  Backup `20260716T140132Z` passed SHA256 checks for PostgreSQL and uploads;
  off-server copy was skipped because `OFFSITE_BACKUP_DEST` is still unset.
  Production verified one active event Flow/operation, webhook responses
  `401` without authorization and `200` with the server secret, zero missing
  revalidation flows in `directus:audit:prod`, and green functional, image,
  visual, performance and copy smokes. A no-op Studio-equivalent PATCH could
  not be automated because least-privilege service tokens correctly returned
  `403` and the original bootstrap admin password is no longer valid; no role,
  token or user permissions were widened for the test.
- On 2026-07-18 the site-content invalidation release was expanded and deployed
  through `137a9c8` (`9da14e0`, `19bc53f`, `137a9c8`). All six managed
  collections now have collection-specific Next.js data tags, while the active
  Directus Action Flow handles `items.create`, `items.update` and
  `items.delete`. The production endpoint returned `401` without the secret and
  `200` with it. After restarting Directus to register the metadata-written
  event hooks, real API create/update/delete rehearsals produced three internal
  webhook responses with status `200`; temporary records were deleted and the
  temporary static token returned `401` after cleanup. Backup
  `20260718T200617Z` passed SHA256 checks for PostgreSQL and uploads; the
  off-server copy was skipped because `OFFSITE_BACKUP_DEST` remains unset.
- The same rehearsal exposed malformed `faq_items` field validation metadata:
  operator-only filters such as `{"_regex":"..."}` caused Directus 11 to
  recurse in `generateJoi` and return `500` on FAQ create/update. The canonical
  setup now stores field-scoped filters, and
  `studio.faq.invalid_validation_shape` blocks recurrence. The FAQ setup also
  uses an explicit read-field list instead of `*`; production
  `permissions.non_admin_wildcards` is back to `0`. A final FAQ rehearsal passed
  with create `200`, update `200`, delete `204`, followed by three webhook
  responses `200`. `web:verify`, `directus:audit:prod`, functional, image,
  visual, performance and copy smokes all passed. The 2026-07-18 performance
  sample measured desktop home LCP at `3388 ms`, below the `4500 ms` release
  budget but still above the `2500 ms` product target.
- Directus `page_sections.body` is rich-text HTML and must never be rendered as
  a plain React string or passed through `dangerouslySetInnerHTML`. Release
  `98daf95` on 2026-07-16 added a server-only allowlist sanitizer and parser,
  then renders a typed safe node tree through the shared `RichText` component
  across home, catalog, Store, Trade, Passport, Club and CTA sections. Allowed
  formatting is limited to paragraphs, line breaks, emphasis, lists and safe
  links. Production `web:verify`, functional/image/copy/full visual smokes and
  an explicit browser DOM check passed; the live home hero now contains a real
  child `P` element and no visible literal `<p>` or `&nbsp;` text. The parser
  stays server-only so route JS remains within the existing bundle budgets.
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
- `site_pages` and `page_sections` own managed marketing/catalog pages. The
  `/catalog` route uses `site_pages.slug = catalog` and a `catalog.grid`
  section (`catalog_page_live`) for SEO, hero copy, filter/sort labels, empty
  state and CTA.
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
- Header navigation type was increased from 12px to 14px on 2026-07-16 in
  release `ff6464c`, while keeping 500 weight, the compact header height and
  44px link hit areas. `DESIGN.md` and `.impeccable/design.json` carry the same
  rule. Production functional/visual smoke passed, and browser checks confirmed
  14px links with no overflow on desktop and in the open mobile menu.
- Public brand hero H1 headings use a shared `36px mobile / 48px small / 60px
desktop` scale as of release `9def1df` on 2026-07-16. Catalog and product H1
  headings stay denser at `36px / 48px`; this preserves page hierarchy without
  the previous 72px desktop and 48px mobile marketing headings. Production
  checks confirmed the current Directus home headline at 60px/3 lines desktop,
  all main mobile H1 headings at 36px, no horizontal overflow, and green
  functional plus full visual smoke.
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
  the 4500ms budget.
- The 2026-07-05 SEO/structure release `bfd349c Improve storefront SEO
structure` closed the repeat Impeccable audit tails for semantic heading
  order, structured data and `/store` LCP comfort. Device pages now put the
  purchase/H1 block first in DOM after the back link, while CSS grid placement
  keeps the desktop visual layout as left dossier details and right purchase /
  Passport / Trade. Marketing pages pass `priority` only to the first
  near-viewport `visual.band` image. Production `smoke:performance` after
  deploy reported `/store` desktop LCP at 2792-2924ms, below the ~3200ms comfort
  target and the 4500ms budget.
- The 2026-07-05 LCP optimization release spans `c6f1416 Optimize LCP image
delivery`, `dc4dbcb Cache public pages for faster LCP`, `f2967a3 Serve
critical hero images locally` and `5450195 Prioritize critical chrome
assets`. Public storefront pages now use 5-minute ISR for Directus-backed
  content, the first hero images on `/` and `/store` use local critical WebP
  overrides for the current Directus asset ids, and the current header/footer
  logo has a tiny local critical override. These overrides are intentionally
  asset-id scoped: if editors replace the image or logo in Directus Studio, the
  site falls back to the new Directus asset after revalidation. Keep
  `site_settings.logo_width`, `site_settings.logo_height` and
  `site_settings.logo_caption` as the source of truth for menu/logo
  presentation; the local logo override must not remove editor control of logo
  size or caption.
- After that LCP release, production `smoke:prod`, `smoke:images`,
  `smoke:copy`, `smoke:visual` and the normal 4500ms-budget
  `smoke:performance` passed. A strict 2500ms desktop LCP smoke still failed
  on `/` from the Codex runner at about 3100ms, while server-side curl showed
  Beget/Next serving `/`, `/store` and the critical static assets with
  millisecond-level TTFB. Treat the remaining 2500ms gap as a network/CDN or
  first-viewport composition question, not a Directus schema issue.
- The 2026-07-06 audit-v1 positioning release was deployed as `e72f103
Strengthen ISVOI audit v1 positioning`. It added the homepage
  `market_tension` and `circle_rules` proof sections, changed global/header CTA
  copy to concrete actions, reframed "цена выхода" as "ориентир выхода", and
  introduced `scripts/update_directus_audit_v1_copy_sql.mjs` plus
  `npm run directus:update-audit-v1-copy-sql` for production Directus content
  sync. Deployment followed the full routine: Directus backup
  `/opt/isvoi/backups/directus/20260706T143708Z`, GitHub push, Beget
  `git pull --ff-only`, Beget `npm run web:verify`, Directus SQL apply, PM2
  restart and live `smoke:prod`, `smoke:images`, `smoke:performance`,
  `smoke:visual` and `smoke:copy`. Production desktop home LCP was 4244ms
  against the 4500ms budget, so it passed but should stay watched.
- Structured data is centralized in `apps/web/lib/structured-data.ts`.
  `app/layout.tsx` emits global `Organization` and `WebSite` JSON-LD;
  `/catalog`, marketing routes and device pages emit `BreadcrumbList`;
  `/catalog` emits `ItemList`; device pages keep their existing Product
  JSON-LD. `smoke:prod` now parses every `application/ld+json` script, checks
  expected schema types, verifies canonical/title/description/OG metadata and
  fails when any `H2` appears before the first `H1`.
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
  `I СВОИ Passport` form the right column. Keep the mobile order as gallery,
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
- `/catalog` and `/store` have different commercial jobs. Keep `/catalog` as
  the clean transactional vitrine with filters, sorting, sparse-grid balance and
  the "Не нашли свою модель?" CTA. Keep `/store` as the decision page: entry
  scenarios, a short choosing guide, proof/trust context and only a curated
  device preview before the final lead action. Do not reinsert the full
  filterable `CatalogGrid` into `/store`.
- Page-level commercial eyebrows use the brand-zone pattern `I СВОИ · ...`.
  Keep `/catalog` as `I СВОИ · Каталог`; keep marketing page heroes as
  `I СВОИ · Store`, `I СВОИ · Passport`, `I СВОИ · Trade` and
  `I СВОИ · Club`. Render these labels with the shared
  `brandZoneEyebrowClass` text treatment, not as pill/breadcrumb badges. Avoid
  reverting these labels to service breadcrumbs such as `Главная / Store`.
- Public-facing site copy uses the brand spelling `I СВОИ`. This includes UI
  labels, SEO/OG metadata, JSON-LD fallbacks, Directus public content seeds,
  FAQ/device story copy and footer text. Keep `ISVOI` only for stable technical
  identifiers such as repository/workspace names, Directus roles, policies,
  file folders, Studio/project branding, shell scripts and runbooks. When live
  CMS copy may still contain old public `ISVOI` wording, use
  `npm run directus:update-public-brand-copy-sql` and apply the generated SQL
  on Beget before or during deploy.
- Short marketing fact lists should not be expanded into large empty cards.
  `passport_explainer` is the reference compact pattern: one shared bordered
  surface, compact numbered rows and internal dividers. Use this treatment when
  each item is only a title plus one short line; reserve large cards for product
  entities, choices, pricing, CTAs or richer fact groups.
- `club_rating` follows the same density rule for reputation factors: one
  shared bordered surface with compact columns and internal dividers, not three
  oversized cards for short text. Use this as the reference pattern for
  reputation or condition-factor groups.
- `store_offer` follows the same compact service-map rule: render the four
  Store zones in one shared bordered surface with internal dividers, two columns
  on tablet and four columns on desktop. Do not expand short zone descriptions
  back into four oversized standalone cards.
- `trade_paths` follows the compact scenario-map rule: render the three Trade
  routes in one shared bordered surface with internal dividers and inline CTAs,
  not as three oversized cards when each route is only a short scenario
  description.
- Marketing FAQ sections follow the compact accordion-surface rule: keep native
  `details/summary`, but render short question lists inside one shared bordered
  surface with internal dividers instead of separate rounded cards for each
  question.
- Homepage preview blocks should not repeat "three/four cards for the sake of
  a grid" when each item is only a short fact. `StorePreviewSection` steps,
  `TradePreviewSection` choices and `PassportPreviewSection` features use one
  shared compact surface with internal dividers while preserving the same
  Directus `steps`, `choices` and `features` content shapes.
- Homepage `catalog_preview` is a vitrine preview, not the full catalog. When it
  shows exactly four devices, use the explicit `CatalogDeviceList`
  `layout="four-up"` mode so desktop reads as one curated line. Keep the
  balanced sparse 1-4 item layout for `/catalog` and `/store`, where avoiding a
  loose commercial grid is more important than a single preview row.
- Homepage `catalog_preview` toolbar should use the same wide `max-w-shell`
  rhythm as `/catalog` so filters read as a full-width control surface. Keep the
  heading and four-up device preview in their narrower `max-w-page` rhythm.
- Homepage `trust` is a four-fact strip under the hero visual when editors
  enable it. Keep the desktop layout as four equal columns so the fourth fact
  does not drop into a lonely second row; mobile may stay a single readable
  column.
- Passport, Trade and Club marketing pages should include one live fragment
  from current catalog data when devices are available. These examples should
  reuse existing device/card fields and disappear when the catalog is empty
  rather than publishing fake demo data.
- Legal/trust links near lead forms and footer remain intentionally deferred
  until the privacy/personal-data consent text is approved. Do not add
  placeholder consent UI or invented legal copy.

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
- `docs/directus-editor-operations-index.md` is the single first-read guide for
  non-developer Studio work. Keep it aligned with the detailed catalog, page,
  global content, lead, import and Files guides whenever Studio workflows
  change.
- FAQ is managed through `faq_items`, either linked by `page` or referenced by
  keys in a FAQ section.
- Editor-facing collections should keep bookmarks/presets for normal workflows:
  header menu, footer links, page sections, FAQ, catalog review, leads and
  import batches.
- `npm run directus:audit-studio` is the editor-workflow audit. It checks
  collection UX metadata, field notes, required bookmarks, page-section JSON
  guardrails, import batch readiness, destructive editor permissions, Files
  governance and lead source context. Run it with the other Directus audits
  before and after Studio-related production changes.
- As of 2026-07-08, production `directus:audit-studio` has zero blockers:
  collection UX metadata, field notes, bookmarks, page-section local assets,
  destructive editor permissions, Files folders, device image alt/label and
  open lead source context are clean. The demo operator batch
  `29016ca3-a815-406c-b492-f2d8f0b93f5c` was created and imported
  successfully as a `draft` / `hidden` service device, so
  `import_batches.demo_or_real_batches.warning = 0`. Files governance was also
  cleaned on 2026-07-08: 7 unreferenced `isvoi:editorial:archive:*` files were
  removed, raster Site Assets / Editorial images received focal points, and
  `files.orphan_isvoi_files.warning = 0` plus
  `files.hero_editorial_missing_focal_point.warning = 0`.
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
- Lead Studio bookmarks include `Новые заявки`, `В работе`,
  `Без ответственного`, `Просрочены`, `Без источника` and `Закрытые заявки`.
  Keep these views in `directus:audit-studio` so managers can process leads
  without Telegram.
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
- File Review cleanup on 2026-07-08: production `ISVOI File Review` was cleared
  from 8 files to 0. `favicon.svg` was moved back to `ISVOI Site Assets`
  because it is used by `site_settings.logo_file`; seven unused generated site
  visual variants were moved to `ISVOI Editorial` with
  `isvoi,editorial,archive` tags instead of being deleted. The durable cleanup
  script now treats `site_settings.logo_file` as a used site asset so favicon
  does not regress into File Review on future runs.
- Favicon release on 2026-07-15: the public site serves the supplied multi-size
  gold ICO from `/favicon.ico`. Directus stores its embedded 256px PNG as
  `isvoi:site:favicon-gold` and uses it only for
  `directus_settings.public_favicon`; `directus_settings.project_logo` and
  `site_settings.logo_file` remain linked to the existing
  `isvoi:site:favicon` SVG. `import_site_assets.mjs --only-title` limits the
  operation to one deterministic asset and retains the established Beget-local
  Files fallback when the least-privilege token cannot return system file
  fields. Before the write, backup `20260715T152444Z` passed SHA256 checks for
  PostgreSQL and uploads; off-server copy was skipped because
  `OFFSITE_BACKUP_DEST` remains unset. Release head `f1bfe44` passed production
  `web:verify`, `smoke:prod`, `smoke:images`, `smoke:visual`,
  `smoke:performance` and `smoke:copy`.
- Local asset cleanup on 2026-07-08: the only production
  `page_sections.content` value pointing to `/assets/...` was
  `home.hero.content.visual.image_src`. It was removed because `home.hero`
  already has a managed `page_sections.image` Directus Files relation. The
  durable audit-v1 copy script no longer reseeds that local `image_src`.
- Direct asset URL cleanup on 2026-07-08: the three production
  `page_sections.content` values pointing to `https://api.isvoi.ru/assets/...`
  were removed from `home.diagnostics_compare`,
  `home.store_preview` and `store.store_location`. Editorial section images
  now use `page_sections.image`; `store.store_location` is linked to the
  existing `store-real-premium-hero.webp` Directus file through that relation.
  The web fallback JSON and content-model examples no longer seed direct asset
  URLs inside section JSON.
- Page section image JSON cleanup on 2026-07-08: production
  `page_sections.content` has no `image_src` / `imageSrc` keys. React renderers
  no longer read editorial image URLs from section JSON; they use
  `page_sections.image` and only keep local static images as code-level local
  fallback for development/migration. `import_site_assets.mjs` now wires
  homepage editorial images through `page_sections.image` only.
- Directus asset transforms should be used for delivery instead of committing
  multiple generated derivatives.
- Image optimization policy as of 2026-07-01: keep the current dual layer for
  the small catalog, where Directus produces transformed asset URLs and Next
  Image serves them through `/_next/image` with its cache. This is the stable
  deployed baseline and is covered by `smoke:prod` plus `smoke:images`.
- Exception as of 2026-07-05: LCP-critical local WebP overrides may live in
  `apps/web/public/assets/` only for current, explicitly mapped Directus asset
  ids in `apps/web/lib/critical-images.ts`. This is a performance bridge for
  first-viewport hero/chrome assets, not a general media workflow. New editorial
  and product media still belongs in Directus Files; replacing an asset in
  Directus should safely bypass the old local override.
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
- JSON-LD scripts should be emitted through `apps/web/lib/structured-data.ts`
  and serialized with `jsonLdScript()` to keep raw script usage reviewed and
  auditable.
- Public pages include global `Organization` and `WebSite` JSON-LD from the root
  layout. `/catalog`, marketing pages and device pages include
  `BreadcrumbList`; `/catalog` also includes `ItemList`; device pages include
  Product JSON-LD.
- Page metadata should use canonical URLs and OpenGraph title, description and
  image data. `smoke:prod` enforces these fields on the public route set.

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
  `docs/directus-editor-operations-index.md`,
  `docs/blog-editor-guide.md`,
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

### Content Editing Priority

`/catalog` is now managed through `site_pages.slug = catalog` and the
`catalog_page_live` / `catalog.grid` section. Do not keep it in the “next
content ownership” queue.

`/device/[slug]` now uses `device_page_settings` as the shared product page
template singleton. It controls breadcrumbs/back link, section labels,
warranty/passport/Trade copy, related-device prompt copy, mobile CTA labels and
product lead form copy. Lead form variants are structured fields for
`available`, `reserved` and `sold`: `kind`, manager-facing `scenario`, title,
contact/comment placeholders, submit/submitting labels, status note, idle note,
success note and error note. Per-device data remains in `devices`,
`device_images`, `device_passports` and `trade_options`.

`directus:audit-content-ownership` is now the repo-level guardrail for the
content ownership boundary. It scans React/Next code for Russian strings and
compares them with `scripts/content_ownership_baseline.json`; new strings must
either move to Directus or be intentionally reviewed by updating the baseline.
It also checks JSON files for direct asset URLs and legacy `image_src/imageSrc`
keys. The audit is included in `web:verify`.

`directus:audit:prod` is now the operational Directus gate. It executes the SQL
audit generators against production instead of only printing SQL, then runs API
policy, ops and content-ownership checks. Anonymous content API reads are
intentionally fail-closed (`403` for editable collections); the public site reads
Directus server-side through the least-privilege service token. The SQL
generators remain available as `directus:audit-*:sql` scripts for manual
inspection.

Next content-editing priorities:

1. Keep media hygiene at zero: `studio.files.review_folder_count = 0`,
   `studio.page_sections.content.local_assets = 0`,
   `studio.page_sections.content.direct_asset_urls.warning = 0` and
   `studio.page_sections.content.image_src_keys = 0`. New editorial section
   images should use `page_sections.image` / Directus Files relations; nested
   JSON image URLs are no longer part of the content model.
2. Keep `directus:audit:prod` blocker metrics green. As of 2026-07-18 the
   blocker metrics are `0`; the remaining non-blocking Files warnings are two
   orphan ISVOI files and one hero/editorial raster without a focal point.
3. Keep system UI labels, accessibility labels, 404 text and legal/trust copy as
   lower-priority decisions unless business copy needs frequent editor changes.

### Production Operations Priority

1. Configure real production `isvoi-backups` rclone credentials, run a real
   off-server backup upload and run `npm run directus:restore-rehearsal`.
2. Apply the nginx `/lead-intake` rate-limit snippet on Beget and enable
   Turnstile keys when public traffic requires it.
3. Prepare approved privacy/personal-data consent text, add legal/trust links
   near lead forms and footer, and include those routes in copy/visual smoke
   checks before release. Do not publish placeholder consent UI.
4. Continue growing the catalog through the operator import workflow. The first
   safe demo batch is already proven; the next catalog step is a small real
   stock batch with the same workbook + ZIP process.
5. Keep reducing legacy fallback fields after Directus content reaches full
   production completeness.
6. Keep auditing for legacy fallback data and obsolete docs/scripts now that
   public routes no longer depend on legacy HTML/CSS/JS runtime files.

## Blog Implementation State (2026-07-19)

- The user explicitly deferred offsite backup credentials and restore rehearsal
  work to move to the blog implementation. This does not cancel the resilience
  requirement; it moves it out of the active implementation step. Do not claim
  that offsite backup or restore rehearsal is complete.
- Blog Phase 1–3 was committed, pushed and deployed to production on
  2026-07-19. The web rollout started at `93f06b7`; the reproducible pilot seed
  followed at `18c7860`. Navigation remained unchanged during the gated rollout
  and was activated only after the editorial QA described below.
- The structured Directus model is generated by
  `scripts/setup_directus_blog_sql.mjs` and includes `blog_posts`,
  `blog_authors`, `blog_categories`, `blog_tags`, `blog_posts_tags` and
  `blog_posts_devices`. Media belongs in `ISVOI Blog`; article-device links use
  the real `devices` relation rather than pasted URLs.
- Editorial states are `draft`, `review`, `scheduled`, `published` and
  `archived`. Public reads require `status=published` and
  `published_at <= $NOW`. The web mapper also fails closed for incomplete
  published rows.
- `blog_posts` uses Directus Content Versioning. Live Preview is configured by
  `directus:setup:blog-preview` using a runtime-only `BLOG_PREVIEW_SECRET`.
  Next.js Draft Mode reads drafts through a dedicated headless read-only policy
  and token named `ISVOI Blog Preview` / `DIRECTUS_PREVIEW_TOKEN`; never use an
  Administrator or Editor token for this route.
- The nginx example disables access logging for `/api/draft/blog` because the
  Directus Live Preview handshake carries its one-purpose secret in the query
  string. The secret and generated temporary SQL must not be retained in logs
  or committed. Production Live Preview was enabled on 2026-07-19 using root
  only for the nginx system change. The previous vhost is preserved at
  `/etc/nginx/sites-available/isvoi.bak-20260719T114150Z`; `nginx -t` passed and
  the service reload stayed active. The exact `/api/draft/blog` location has
  `access_log off`, and post-test inspection found no preview request in nginx
  access logs.
- Scheduled publication is generated by
  `scripts/setup_directus_blog_scheduling_sql.mjs`. Its Directus CRON Flow runs
  every minute, uses native `item-update` with `$full`, updates only complete
  due rows and emits the normal update event. A database trigger fills
  `published_at`; the existing site-content event Flow now includes all six blog
  collections and immediately invalidates blog cache tags.
- The web routes are `/blog`, `/blog/category/[slug]`, `/blog/[slug]` and
  `/blog/rss.xml`. Sitemap includes indexable posts and only categories that
  have indexable posts. Article pages emit `BlogPosting` and breadcrumb JSON-LD.
  There are intentionally no comments, arbitrary page-builder blocks, search or
  newsletter subsystem in the MVP.
- `site_pages.slug=blog` plus `page_sections.variant=blog.index` owns the blog
  SEO title, meta description, H1 and intro. Fixed system/accessibility labels
  remain reviewed code copy in `scripts/content_ownership_baseline.json`.
- Local verification completed on 2026-07-19: SQL generators pass Node syntax
  checks, `npm run web:verify` passes including build and bundle budget, and
  local Playwright visual smoke passes `/blog` on desktop and mobile. The empty
  state is complete.

### Blog Production Rollout (2026-07-19)

- Before schema mutation, local VPS backup
  `/opt/isvoi/backups/directus/20260719T111641Z` was created and both
  `postgres.sql.gz` and `uploads.tar.gz` passed `sha256sum -c`. Offsite upload
  was explicitly skipped because the user deferred offsite backup work.
- `directus:setup:blog`, `directus:setup:blog-scheduling`, the expanded
  `directus:setup:site-content-revalidation` and final admin guardrails were
  applied successfully. Directus was restarted and returned health 200. The
  post-rollout production schema was exported through the Directus container
  CLI to `directus/schema/snapshots/current.json`; it contains all six blog
  collections and no secret, token or password values.
- Production Next.js build passed, PM2 `isvoi-web` is online, and `/blog`, RSS,
  sitemap, home, catalog, device, robots and Directus health returned 200.
  The existing Playwright production smoke also passed all storefront routes.
- The idempotent `directus:seed:blog-pilot` command created category
  `buying-guide`, author `isvoi-editorial`, tag `diagnostics` and complete draft
  `chto-pokazyvaet-diagnostika-iphone`, linked to `iphone-13-pro`. At this
  checkpoint the pilot was `draft`, `no_index=true`, had zero published rows
  and returned 404 publicly; the later launch state supersedes this checkpoint.
- Schema, catalog, image, navigation, legacy, leads, files, import, Studio,
  page-section and blog production audits pass, including
  `blog.studio.preview_url_missing=0` and zero preview writes. This was the
  pre-launch gate before the completed version, scheduling and revalidation QA.

### Blog Live Preview Activation (2026-07-19)

- `364f36b` added an idempotent headless identity generator and server env
  configurator. Production now has one active passwordless, role-less service
  user attached only to `ISVOI Blog Preview`; its policy has no Studio access
  and read-only least-privilege permissions.
- `DIRECTUS_PREVIEW_TOKEN` and `BLOG_PREVIEW_SECRET` are configured only in the
  production `.env.local`. Their values were never printed or committed.
  Directus `blog_posts.preview_url` is active.
- Reverse-proxy testing exposed an internal `https://localhost:3000` redirect.
  Commits `6fbf2c7` and `8b851e1` changed both preview enable and disable routes
  to the canonical `siteUrl()` origin, avoiding trust in the proxied request
  origin.
- End-to-end production verification passed: a valid preview request opened the
  pilot draft with 200 and its expected title, the same slug without Draft Mode
  returned 404, disabling Draft Mode returned to `/blog` with 200, and the
  draft returned 404 again using the updated cookie jar.
- The production schema snapshot was regenerated after activation. Because
  Directus embeds the preview secret in collection metadata, the tracked
  `current.json` is processed by `directus:schema:sanitize`; exactly one query
  value was replaced with `__REDACTED__`, and the raw snapshot was deleted.
- The complete SQL aggregate, anonymous API policy and storefront Playwright
  smoke passed after activation. Live Preview is no longer a rollout blocker.

### Blog Editorial QA And Public Launch (2026-07-19)

- A fresh local VPS backup was created before launch at
  `/opt/isvoi/backups/directus/20260719T132219Z`; both archives passed
  `sha256sum -c`. `OFFSITE_BACKUP_DEST` remains unset by explicit user decision,
  so offsite upload and restore rehearsal are still incomplete.
- Version-aware Preview now passes the Directus version id from `{{$version}}`
  through the Draft Mode route and reads the item with `?version=`. Directus
  11.17.4 required a separate non-app `ISVOI Blog Version Workflow` policy;
  PostgreSQL constraint `isvoi_directus_versions_blog_only` limits version rows
  to `blog_posts`. Version key `editorial-qa-2026-07-19` (name
  `Editorial QA before publication`) passed create, save, compare,
  unchanged-main and Next.js preview checks.
- Editor upload QA exposed Directus system-field merging in the app-access
  policy. `ISVOI Editor Media Workflow` now owns scoped `directus_files:create`
  for managed ISVOI roots; the app policy no longer owns that action. Upload
  through a real temporary `ISVOI Editor` identity created file
  `bc8276c1-4c94-420c-b427-dd46c67e10a0`; all temporary QA users were removed.
- `ISVOI Blog` is a private working folder. Before publication, an approved
  cover must be moved to a public managed folder, normally `ISVOI Editorial`.
  The pilot cover was approved there through the Editor API. Audit
  `blog.content.published_private_cover` blocks published posts whose covers
  remain in a private/unmanaged folder.
- The pilot was scheduled by an Editor for `2026-07-19T13:39:26Z`; the minute
  CRON Flow changed it to `published` and the database trigger set
  `published_at` at the scheduled instant. A scheduled `item-update` did not
  fan out into the separate event Flow, so
  `directus:setup:site-content-revalidation` now explicitly chains
  `isvoi_revalidate_after_blog_schedule` after publication. The blog audit
  verifies both the request operation and its `resolve` edge.
- The project service policy is the canonical published/active row boundary.
  The web no longer repeats Directus filters for `blog_posts.status` or category
  `is_active`, because Directus 11 can reject user filters that duplicate the
  policy field. Frontend mapping still fails closed for incomplete posts.
- The pilot `chto-pokazyvaet-diagnostika-iphone` is public and indexable. Blog
  index, category `buying-guide`, article, RSS and sitemap all return 200 and
  include the article. The approved cover is also the managed Blog page OG
  image; index, category and article emit social image metadata.
- `directus:setup:blog-navigation` idempotently activates one `Блог` link in
  the header and one under footer group `Клуб`. Navigation audit requires both
  managed page links; the production header has six active non-CTA links.
- Release gates now include Blog index, category and pilot article. Full
  `web:verify`, `directus:audit:prod`, API/ops/content audits, production smoke,
  image latency, copy, desktop/mobile visual and performance smokes pass. Blog
  LCP observed during the launch check: index 1952 ms desktop / 2176 ms mobile;
  article 2412 ms desktop / 2332 ms mobile.
- The sanitized production schema snapshot was regenerated after the launch;
  one preview query value was replaced with `__REDACTED__` and no raw snapshot
  was retained. Final launch production commit before this memory update was
  `ea7157c`.

### Structured Blog Blocks Prepared (2026-07-19)

- The repo now models article content as ordered `blog_post_blocks` O2M rows.
  Supported block types are `rich_text` and `image`; image blocks require an
  alt text and preserve their source aspect ratio at `content` (760 px) or
  `wide` (1120 px) width.
- `scripts/setup_directus_blog_sql.mjs` creates the collection, Studio fields,
  relations and scoped editor/public/preview permissions idempotently. It also
  migrates each existing non-empty `blog_posts.body` into one text block while
  retaining `body` as a hidden compatibility fallback.
- The frontend reads, sanitizes and renders ordered blocks. Existing articles
  remain renderable before migration through the legacy body fallback. The
  scheduler requires a valid text block and rejects incomplete image blocks;
  block create/update/delete events are included in immediate cache invalidation.
- Blog/schema audits now cover block schema, permissions, completeness,
  approved public media folders and orphan relations. Editor documentation
  distinguishes private work-in-progress media in `ISVOI Blog` from approved
  public assets in `ISVOI Editorial`.
- Local `web:verify`, JavaScript syntax checks for all changed SQL generators
  and SQL generation completed successfully. The implementation was still
  awaiting production rollout when this preparation entry was written; the
  completed rollout is recorded below.

### Structured Blog Blocks Production Rollout (2026-07-19)

- A fresh pre-migration VPS backup was created at
  `/opt/isvoi/backups/directus/20260719T151115Z`; both `postgres.sql.gz` and
  `uploads.tar.gz` passed checksum verification. Offsite upload and restore
  rehearsal remain deferred by the user.
- Production deployed `36fb5a5` (`Add structured blog content blocks`) in
  schema-first order. The idempotent blog setup migrated the existing article
  body into one ordered `rich_text` block, then scheduling and immediate
  site-content revalidation Flows were reapplied. Directus was restarted and
  `/server/health` returned healthy.
- The aggregate production Directus audit passed, including block schema,
  relations, editor/public/preview permissions and content completeness. The
  production API returns the pilot article with one `rich_text` block. The two
  existing informational file warnings (orphan ISVOI files and missing hero
  focal points) remain unchanged and do not fail the audit.
- Visual QA found that the article cover image had a zero-height layout box.
  Root cause was a duplicate `aspectRatio` key in `tailwind.shared.cjs`; commit
  `2593c31` merged the blog and product aspect-ratio tokens. The Playwright
  production smoke now asserts a visible cover area and observed 1056 x 660 px
  on desktop.
- `web:verify`, production build, HTTP smoke and desktop/mobile visual and
  performance smokes pass. Observed blog LCP after the fix: index 2244 ms
  desktop / 1972 ms mobile; article 2536 ms desktop / 2416 ms mobile.
- The sanitized production schema snapshot was regenerated with all structured
  block metadata. Exactly one sensitive preview query value is stored as
  `__REDACTED__`; no raw snapshot was retained.

### Blog Navigation And Brand-Zone Standards (2026-07-19)

- Blog listing and category pages use the shared commercial eyebrow pattern
  `I СВОИ · Блог` with `brandZoneEyebrowClass`. Do not reverse it to
  `Блог I СВОИ` or treat this brand-zone label as a breadcrumb. Commit
  `5392c79` deployed the correction; local `web:verify`, production build,
  full smoke and targeted desktop/mobile visual smoke passed.
- Public detail pages use one compact back-navigation link above the content:
  `← Каталог` for a device and `← Блог` for an article. The shared visual class
  is `detailBackLinkClass`; do not present a single back link as a breadcrumb
  landmark.
- Full hierarchy remains in `BreadcrumbList` JSON-LD. For an article it is
  `Главная -> Блог -> Статья`, so search semantics are retained without adding
  a long, wrapping path before the mobile H1.
- Commit `4503b17` deployed the standard to production. Local `web:verify`, the
  production build, the full HTTP/SEO smoke and targeted desktop/mobile visual
  smoke passed. The article smoke now requires exactly one `Навигация по блогу`
  landmark with a `← Блог` link to `/blog`; the cover remained visible at
  1056 x 660 px on desktop.

### Blog Next Step

1. In Directus Studio, add one real structured `image` block to the pilot
   article, including alt text, caption and both width modes; verify it in Live
   Preview before publishing the revision.
2. Create the second real article through the same draft -> version QA -> media
   approval -> scheduled flow, using `ISVOI Blog` for work-in-progress media and
   `ISVOI Editorial` for approved public covers and article images.
3. Establish an editorial cadence and owner, then measure article-to-catalog and
   article-to-lead transitions before adding search, newsletter or comments.
4. Keep offsite backup and restore rehearsal visibly deferred; do not treat the
   local VPS backup as equivalent resilience.

### Blog Rollout Order

1. Before production mutation, take a fresh local VPS backup. Offsite upload is
   deferred by the user, so record that limitation explicitly in the deploy
   report.
2. Commit/push and deploy the repo, set `DIRECTUS_PREVIEW_TOKEN` and
   `BLOG_PREVIEW_SECRET` server-side, and apply the no-query-log nginx location.
3. Apply `directus:setup:blog`, `directus:setup:blog-scheduling`,
   `directus:setup:blog-preview` and the updated
   `directus:setup:site-content-revalidation` SQL in that order. Restart Directus
   if metadata/permission/Flow cache is stale.
4. Run `directus:audit-blog`, save a schema snapshot and run the normal
   `directus:audit:prod` gates. The blog audit is already the final item in its
   aggregate order, so production audit intentionally fails until all blog
   setup scripts have been applied.
5. Create one category, one author and one complete article in `draft`; verify
   Live Preview, version history, scheduled publication and immediate cache
   invalidation before using real editorial content.
6. Run production HTTP, SEO, RSS, sitemap, desktop/mobile visual and copy smoke.
   Add `Блог` to Directus header/footer navigation only after those checks pass.
