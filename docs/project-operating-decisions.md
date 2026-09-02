# Project Operating Decisions

Last updated: 2026-09-02.

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
11. `docs/directus-content-patches.md`

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
- Club pilot site: `https://club.isvoi.ru/`
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

## Club Subdomain Pilot

- Club is a separate pilot landing on `https://club.isvoi.ru/`, not a main-site
  header item and not a personal account or online-payment product in v1.
- `apps/web/middleware.ts` is host-aware: `club.isvoi.ru/` renders the internal
  `/club` route, and non-Club paths on the subdomain redirect back to the main
  domain. Since 2026-07-26, production has `CLUB_SUBDOMAIN_ENABLED=1`, so
  `https://isvoi.ru/club` redirects to `https://club.isvoi.ru/`.
- Because production HSTS uses `includeSubDomains`, `club.isvoi.ru` must always
  stay covered by HTTPS. Current production state: DNS `A club.isvoi.ru ->
217.114.14.32`, nginx proxies the host to `127.0.0.1:3000`, the
  `/etc/letsencrypt/live/isvoi.ru/` certificate covers `club.isvoi.ru`, and
  Directus `CORS_ORIGIN` includes `https://club.isvoi.ru`.
- Directus remains the source of Club content: `site_pages.slug = club` owns SEO
  and FAQ copy; `club_page_settings` owns the hero, section and form copy;
  `club_plans`, `club_offers`, `club_process_items`, `club_rule_items` and
  `club_legal_documents` own the commercial, process and legal model.
  Setup/audit commands:
  `npm run directus:setup:club`, `npm run directus:audit-club` and aggregate
  `npm run directus:audit:prod`.
- Club starts in `publication_mode = pilot_noindex`. Indexing requires both
  `publication_mode = public_index` in Directus and
  `CLUB_INDEXING_ENABLED=1` in the web environment. Until then the page emits
  `noindex, nofollow`, `X-Robots-Tag`, a closed Club `robots.txt` and an empty
  Club sitemap. The production default is `CLUB_INDEXING_ENABLED=0`.
- The default v1 journey is hybrid: editor-selected, in-stock `club_offers`
  appear first, followed by a managed prompt for individual selection. A
  model/category is required when no published offer is selected. Offers can
  either contain an approved monthly amount or explicitly use manual
  calculation; the website additionally hides offers whose product is no
  longer published, available or in stock.
- The initial pilot offer set is seeded idempotently for `iphone-13-pro`,
  `iphone-14`, `ipad-air` and `macbook-air-m1` only when the corresponding
  product is published, available, in stock and does not already have a
  `club_offers` row. These start in manual-calculation mode; after seeding,
  editors own publication, ordering, tariff, term and card copy in Studio.
- Club leads post through `/lead-intake` with `kind=club`, structured
  `club_device_request`, optional `club_offer`/`club_plan`, term, budget,
  consent version and server timestamp. A separate explicit consent is
  mandatory. Telegram, scoring, recurring payments and account UX remain v2.
- `public_index` is a release decision, not an editorial shortcut:
  `directus:audit-club` must pass with a valid offer and published, versioned,
  legally reviewed policy, pilot terms and agreement. Legal review remains a
  manual responsibility outside Directus automation.
- Directus setup scripts update metadata and permissions through SQL. Restart
  the Directus container after applying them, wait for `/server/health`, then
  call the protected `/api/revalidate/site-content` endpoint before the live
  smoke, and run `directus:audit-api-policy`; PM2 restart alone does not clear
  persistent Next fetch-cache entries created before the SQL change. The API
  audit checks the real least-privilege token against the complete Club offer
  payload and catches stale permissions or a broken relation expansion.
- Studio exposes Club through one translated `I СВОИ Club` collection folder.
  Its six collections have Russian names and ordered operator-facing forms;
  tariffs, offers, processes, rules and legal documents use translated detail
  groups instead of flat technical field lists. `directus:audit-club` verifies
  the folder, translations and field grouping.
- Editor workflow: `docs/club-editor-guide.md`.

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
- The universal `/product/[slug]` route must keep the Directus-managed
  `DeviceStoryCard` for products with `product_type=device` and a non-empty
  `device_passports.story_body`. Render it in the main content column after
  characteristics and before Passport; never show it for accessories. The
  price, availability and lead form remain in the existing `lg:sticky`
  purchase aside.
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
- Header/footer links are edited in `navigation_items`, shown in Studio as
  `Меню сайта`; header stays compact at five primary links plus the CTA from
  `site_settings`.
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
  `Шапка сайта`, `Подменю каталога`, `Группы подвала`, `Ссылки подвала`, page
  sections, FAQ, catalog review, leads and import batches.
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

### Navigation UX And Ownership (2026-08-19)

- `navigation_items` is the literal source of visible menu labels. The former
  frontend `conversionNavigation()` mapping was removed: Studio no longer says
  `Store` while the site silently renders `Магазин в Северодвинске`.
- Canonical header: `Каталог` with `Все устройства`, `Техника`, `Аксессуары`;
  then `Магазин в Северодвинске`, `Как мы проверяем`, `Продать или обменять`,
  `Блог`. Club remains outside the main header.
- Canonical footer groups: `Покупка`, `Сервисы`, `I СВОИ`. Each destination
  appears once; contact data remains owned by `site_settings` and is not
  duplicated as fake navigation links.
- Studio collection is named `Меню сайта`. Administrator, Editor and Advanced
  Editor receive five scenario bookmarks: `Шапка сайта`, `Подменю каталога`,
  `Группы подвала`, `Ссылки подвала`, `Скрытые / архив`.
- `Короткий текст` is optional and overrides the header label when present.
  Canonical rows keep it empty. Page/custom/section fields use native field
  conditions; legacy `url` is readonly and hidden.
- Production location is `Северодвинск`. `site_settings.city` and homepage SEO
  must not drift to another city while Store and Club still target
  Северодвинск.
- Reproducible setup: `npm run directus:setup:navigation-ux`; production gate:
  `npm run directus:audit-navigation` and aggregate `directus:audit:prod`.
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
- Files governance cleanup on 2026-07-25: `blog_post_blocks.image`,
  `directus_settings.project_logo` and `directus_settings.public_favicon` are
  now included in the Directus Files used-file model. Production cleanup set
  focal points for the five blog/editorial raster images and
  `isvoi:site:favicon-gold`; `directus:audit-files` returned
  `files.orphan_isvoi_files.warning = 0` and
  `files.hero_editorial_missing_focal_point.warning = 0`. Do not delete the two
  favicon Directus files as orphan assets; they are used by Directus project
  branding even though the public web favicon is served from `/favicon.ico`.
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
- Exception as of 2026-07-25: blog article covers are LCP-critical editorial
  images and bypass the Next `/_next/image` optimizer. The article template
  renders a plain eager `<img>` with Directus responsive transforms
  (`640/828/1200w`), `fetchPriority="high"` and
  `data-component="BlogCoverImage"`. This avoids the cold Next optimizer path
  while keeping Directus Files as the source of truth.
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
  `https://www.isvoi.ru`, `https://api.isvoi.ru` and, once the Club host is
  published, `https://club.isvoi.ru`.
- Directus production guardrails should stay enabled:
  - `MARKETPLACE_TRUST=sandbox`
  - `FILES_MAX_UPLOAD_SIZE=100mb`
  - `FILES_MIME_TYPE_ALLOW_LIST`
  - `IMPORT_IP_DENY_LIST`
- The public site sets baseline security headers in `apps/web/next.config.mjs`.
- `/lead-intake` uses honeypot plus a lightweight in-process rate limit in
  Next.js. Since 2026-07-25, production nginx also rate-limits the exact
  `/lead-intake` location with `limit_req zone=isvoi_lead_intake burst=4
nodelay` and returns 429 when the edge limit is exceeded.
- Cloudflare Turnstile is implemented as opt-in code. It is enforced only when
  `TURNSTILE_SECRET_KEY` is set; the browser widget is rendered only when
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. As of 2026-07-25, production has no
  Turnstile keys yet, so the feature is ready but not active.
- Lead consent copy is editor-owned. Product-page variants
  `available/reserved/sold` read `lead_*_consent_note` from
  `device_page_settings`; the homepage final CTA reads
  `page_sections.content.form.consent_note`.
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
- Trade-in product and build decisions:
  `docs/trade-in-product-decisions.md`, `docs/trade-in-build-spec.md`
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
2. Keep `directus:audit:prod` blocker metrics green. As of 2026-07-25 the
   blocker metrics are `0`; Files governance warnings are also back to `0`.
3. Keep system UI labels, accessibility labels, 404 text and legal/trust copy as
   lower-priority decisions unless business copy needs frequent editor changes.

### Production Operations Priority

1. Configure real production `isvoi-backups` rclone credentials, run a real
   off-server backup upload and run `npm run directus:restore-rehearsal`.
2. Configure real Cloudflare Turnstile keys when public traffic or spam volume
   justifies it, then run a test lead through the widget path.
3. Add a full privacy/personal-data policy page and footer/legal link when the
   approved legal text is ready. Current lead forms already show managed
   short consent copy, but there is no dedicated `/privacy` route yet.
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

### Blog Growth And Editorial Rehearsal Completed (2026-07-19)

- A fresh local VPS backup was created before the content mutation at
  `/opt/isvoi/backups/directus/20260719T162305Z`; both archives passed checksum
  verification. Offsite upload and restore rehearsal remain deferred by the
  user and are not represented as completed resilience.
- The pilot article now has one `rich_text` block plus two real `image` blocks:
  `content` and `wide`, each with alt text and a caption. Version-aware Draft
  Preview passed on desktop and mobile. Private working media is served in
  Draft Mode only through `/api/draft/blog-asset/[id]`; the route verifies that
  the file belongs to the requested post/version. Disabling Draft Mode uses a
  non-prefetched link so Next.js cannot clear the preview cookie early.
- Two articles were created through `blog_post_blocks` with no legacy `body`:
  `kak-proverit-batareyu-iphone` and
  `kak-ponyat-kakie-detali-menyali-v-iphone`. Each version restored and promoted
  three O2M text blocks. Their covers and the pilot inline images were approved
  into `ISVOI Editorial` before publication.
- Directus 11.17.4 rejected O2M promotion under the field-restricted
  `ISVOI Editor` policy. A temporary passwordless QA identity used a user-bound,
  non-app, blog-only wildcard policy during compare/promote. Direct SQL policy
  changes required clearing only Redis `permissions:*` keys; restarting
  Directus alone did not clear that namespace. The temporary identity and six
  permission rows were deleted after rehearsal, nullable file/version audit
  references were cleared, and the old token returned `401`. The permanent
  Editor, Public and Preview policies retain zero wildcard fields.
- The active minute scheduling Flow published both articles at
  `2026-07-19T17:40:11.976Z` and immediate revalidation made both public URLs
  return 200. The pilot legacy `body` was then cleared. Production audit reports
  zero `published_legacy_body`, invalid blocks, private media and orphan blog
  junctions; the frontend legacy body fallback is removed.
- Blog navigation now marks nested routes active and category tabs expose
  `aria-current`. Related-device cards include image, grade, price, availability
  and trust facts. Related device and article-end CTA links carry blog UTM
  attribution. Organization authors emit `Organization`, listings emit
  `ItemList`, and articles show an update date only after a material delay.
- With three published posts, `/blog` and `buying-guide` render a complete
  editorial grid and articles show `Читайте также`. Both new articles are in
  RSS, sitemap and canonical output. Production `web:verify`, full Directus
  audits, API/ops/content audits, HTTP/SEO, image, copy and desktop/mobile visual
  smokes pass. Structured-image smoke now scrolls both lazy images into view and
  verifies non-zero intrinsic dimensions.
- The normal release performance smoke passes. The 2026-07-25 blog cover
  optimization moved the pilot article cover off the cold Next image optimizer
  path and added a strict targeted check:
  ```bash
  PERFORMANCE_SMOKE_ROUTES=/blog/chto-pokazyvaet-diagnostika-iphone PERFORMANCE_BLOG_ARTICLE_LCP_BUDGET_MS=2500 npm run smoke:performance
  ```
  If future cold runs regress, treat the next step as `api.isvoi.ru/assets/*`
  proxy cache/CDN hardening rather than a schema or Studio problem.

### Blog Studio Editing Verification (2026-07-19)

- A fresh local VPS backup was created before the permission changes at
  `/opt/isvoi/backups/directus/20260719T184337Z`; database and uploads checksums
  passed. Offsite upload remains deferred because `OFFSITE_BACKUP_DEST` is not
  configured by the current user decision.
- A real temporary `ISVOI Editor` Studio user exposed three production UX
  blockers. Mandatory first-login TFA could not write the user's own secret,
  alias layout groups were absent from the Editor field scope and the version
  review could not read blog revisions. These are now covered by the non-app,
  self-only `ISVOI Studio Self Security` policy, explicit `group_*` field
  access and blog-scoped `directus_revisions:read` respectively.
- Relational promotion is permanent and role-based. `ISVOI Blog Publisher` is
  bound only to `ISVOI Advanced Editor`; ordinary Editors create and edit
  posts, blocks and versions, while Advanced Editors review and promote O2M
  changes. The wildcard policy remains limited to `blog_posts` and
  `blog_post_blocks`; exact permission shape and unexpected bindings are
  enforced by the blog audit.
- Directus file-interface options now store the UUID of `ISVOI Blog`, not its
  display name. Cover and block file pickers open the intended folder without
  the former PostgreSQL UUID error. The audit checks all six blog media field
  options against the managed folder id.
- End-to-end Studio QA passed: first-login 2FA, create draft, edit title, create
  a `rich_text` block, create a Content Version, edit its O2M block, review one
  difference and promote it to Main. PostgreSQL confirmed the promoted block
  text and zero remaining test versions. The QA draft, temporary user and
  static token were removed; both user/post counts are zero and the old token
  returns `401`.
- Production `directus:audit-blog`, aggregate `directus:audit:prod`, API policy,
  ops/content audits and storefront smoke all pass. The repository, GitHub and
  `/opt/isvoi` implementation checkpoint before this memory-only update was
  `4b3450e`. When piping generated setup SQL, use
  `node scripts/<generator>.mjs`; plain `npm run ... > file.sql` also writes the
  npm banner and must not be fed to `psql`.

### Blog Next Step

1. Editorial cadence is operationalized in Studio: `blog_posts` has the
   `Редплан` bookmark for weekly draft/review/scheduled review, and `leads` has
   `Блог: заявки` plus `Блог: устройства` bookmarks for article-to-lead and
   article-to-device UTM monitoring. `directus:audit-leads` checks that blog
   UTM leads keep `utm_campaign`, `utm_content` and device relation integrity.
2. Keep the article cover cold path under observation with the strict 2500 ms
   targeted smoke after deploys that touch blog, image delivery, nginx or
   Directus cache behavior.
3. Open a second category only when three complete materials are ready. Keep
   search, newsletter, comments and pagination deferred until volume justifies
   them; pagination starts before the 25th article.
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

### Conversion V2 Production Rollout (2026-07-25)

- A fresh pre-migration VPS backup was created at
  `/opt/isvoi/backups/directus/20260725T182244Z`; both `postgres.sql.gz` and
  `uploads.tar.gz` passed checksum verification. Offsite upload remains
  deferred because `OFFSITE_BACKUP_DEST` is not configured.
- Production deployed the conversion-v2 content contract and storefront flow
  through commits `f4cdf3a`, `cc5a559`, `eb83e13`, `58ad6e8`, `b4b8c70` and
  `1871fa0`. The release keeps Directus as the public-copy source while the web
  application provides compatible section contracts and safe fallbacks.
- Six informational pages and twelve page sections were created as drafts or
  inactive records. Three explicitly labelled QA testimonials remain inactive.
  No test legal details, testimonials or invented device facts were published.
  Footer links to informational pages stay inactive until the corresponding
  page is published; a null `privacy_url` no longer falls back to `/privacy`.
- A real temporary Editor account verified the Directus Studio workflow
  end-to-end: the draft `about` page title was edited, saved, reread and restored;
  the inactive rich-text section opened with its publishing controls; and the
  expanded Site Settings fields were visible. The test exposed missing alias
  layout groups in the Editor field scope. The setup scripts and audit now
  enforce those groups. Directus permission changes required `FLUSHDB` on the
  dedicated Redis cache; restarting Directus alone retained stale effective
  permissions. The temporary user was deleted and no static QA token remains.
- The aggregate Directus audit passes, including Studio metadata, public/API
  policy, operations, content ownership, conversion copy, internal known links,
  repair-history consistency and unpublished social-proof checks. Four
  published devices still report the non-blocking
  `published_devices_missing_required_fields.warning`; those diagnostic facts
  must be completed from verified source data rather than test values.
- `web:verify`, protected site-content revalidation, HTTP/SEO, copy, internal
  link, image-latency, performance and desktop/mobile visual smokes pass on
  production. The sanitized production schema snapshot was regenerated; one
  sensitive preview query value is stored as `__REDACTED__`, and the raw
  temporary snapshot was removed.

### Conversion Consistency Rollout (2026-07-25)

- Before the follow-up mutation, a fresh VPS backup was created at
  `/opt/isvoi/backups/directus/20260725T192650Z`. PostgreSQL and uploads
  archives passed checksum verification. Offsite upload was skipped because
  `OFFSITE_BACKUP_DEST` is still not configured.
- Commits `4b39104`, `33bdf35` and `7870145` aligned Catalog, Store, Passport,
  Trade, Club, device cards and Blog with the conversion-v2 flow. Catalog no
  longer exposes the Club filter; Store no longer promotes Club; Trade CTAs
  target its own form; Club is explicitly a pilot; and all public update-value
  language states that the amount is preliminary and requires repeat
  diagnostics.
- The forward-only consistency migration also removed the remaining damaged
  consent placeholders from page and device forms, reconciled the iPhone 14
  repair story with its structured passport and applied explicit field lists
  to Editor and Importer permissions. The SQL audit now covers device-form
  consent copy so this encoding regression cannot pass silently.
- Directus production audit passes for schema, Studio metadata, Editor
  bookmarks/layout groups, permissions, public/API policy, content ownership,
  page sections, leads, files, Blog and conversion consistency. The same four
  test devices retain the non-blocking incomplete-diagnostics warning; their
  missing facts were not fabricated.
- Linux `web:verify` and production HTTP, copy, link, 14-route consistency,
  image-latency, performance and desktop/mobile visual smokes all pass.
  Protected content revalidation succeeded and PM2 reports `isvoi-web`
  online. The sanitized production schema snapshot was regenerated and its
  raw temporary source removed.

### Catalog V3 Production Rollout (2026-07-25)

- Универсальный каталог развёрнут как аддитивная forward-only миграция:
  `products` стал корневой сущностью для техники и аксессуаров, а старые
  `devices` сохранены для dual-read и отката.
- Созданы справочники брендов, категорий и моделей, отдельные детали техники и
  аксессуаров, общая галерея и точные связи совместимости. Passport, Trade и
  Leads получили связи с `products`; legacy-поля временно поддерживаются.
- Миграция перенесла пять устройств, 23 изображения, четыре Passport и 12
  Trade-строк. Четыре черновые QA-позиции покрывают новую технику, б/у технику
  другого бренда, универсальный и модельный аксессуар. Тестовые позиции не
  опубликованы.
- Четыре перенесённых опубликованных устройства не имеют подтверждённой даты
  диагностики. Аудит помечает это как переходное предупреждение; новые
  публикации с таким пробелом блокируются, а вымышленные даты не добавляются.
- Публичный каталог работает на `/catalog`, `/catalog/tech`,
  `/catalog/accessories`, страницах категорий и брендов. Карточка товара
  находится на `/product/{slug}`, старый `/device/{slug}` отвечает 301.
- Поиск, фильтры, сортировка и пагинация выполняются серверно и сохраняются в
  URL. Каталог рассчитан на 100–500 SKU без внешнего поискового движка.
- XLSX-контракт разделён на `products`, `images`, `compatibility`, `passports`
  и `trade_options`; dry-run тестового файла прошёл. Цена и остаток остаются
  данными Directus.
- Перед миграцией создан backup
  `/opt/isvoi/backups/directus/20260725T203144Z`; PostgreSQL и uploads прошли
  checksum. Offsite-копия по-прежнему не настроена.
- Aggregate Directus audit, schema/Studio/permissions/publication audits,
  `web:verify`, production HTTP/copy/link/structured-data, desktop/mobile
  visual и performance smokes прошли. Тестовая заявка сохранила `product`,
  `product_type` и `source_path`.
- Studio доступен только после пользовательской аутентификации. Сервисный токен
  намеренно не расширен до административного доступа к schema snapshot; это
  ограничение least privilege, а не ошибка каталога.

### Inventory And Avito Staging Rollout (2026-08-10)

- Перед миграцией создан и проверен локальный VPS backup
  `/opt/isvoi/backups/directus/20260810T185243Z`: `postgres.sql.gz` и
  `uploads.tar.gz` прошли SHA-256. Offsite upload по-прежнему отложен, поскольку
  `OFFSITE_BACKUP_DEST` не настроен.
- В production развёрнут приватный товарный контур: batches, складские строки,
  строки поступлений, issues, профили канальных затрат, объявления и read-only
  unit-экономика. Себестоимость и полные serial/IMEI недоступны Public,
  `ISVOI Editor` и `ISVOI Importer`; новая Studio-роль
  `ISVOI Inventory Manager` требует TFA. Headless `ISVOI Catalog Import`
  получил только явные поля и узкие replay-права на дочерние строки batch.
- Созданы Manual Flows для dry-run/apply и приватная файловая папка
  `ISVOI Inventory Imports`. Существующий защищённый catalog import secret/token
  переиспользуется как production fallback; отдельные inventory env keys
  остаются рекомендуемой ротацией, а значения секретов не коммитятся.
- Production batch `store-snapshot-2026-08-10`
  (`fed0d100-9aab-455e-be36-400ffd059f81`) загрузил 61 строку / 334 единицы
  текущего остатка и 41 строку / 65 единиц поступления. Dry-run подтвердил
  17 identity-конфликтов, 9 отсутствующих серийных устройств, два отсутствующих
  MacBook, 14 authenticity/replica blocker-сигналов и 9 неоднозначных вариантов.
- Apply создал только приватный staging: 61 `inventory_items`, 41
  `inventory_receipt_lines` и 51 issue. Повторный apply дал те же счётчики,
  доказав идемпотентность. `products_synced=0`, ни одна карточка не опубликована,
  полные identifiers в batch logs не обнаружены. Временные серверные копии XLSX
  удалены после загрузки в Directus storage; исходные книги в git не добавлялись.
- Avito foundation развёрнут с `AVITO_FEED_ENABLED=0`. Endpoint fail-closed,
  исключает неготовые/проданные позиции и не выводит финансовые/идентификационные
  поля. Включение запрещено до получения официального шаблона категории,
  подтверждения ставок расходов и QA трёх б/у смартфонов.
- `web:verify`, aggregate Directus audit, API/ops/security audits, HTTP, copy,
  image, visual и performance smokes прошли. Статья блога показала LCP 4036 ms
  desktop / 3456 ms mobile: в release budget, но остаётся performance-watch.
- Sanitized schema snapshot не регенерирован: сохранённые admin credentials
  вернули 401, а одноразовая Administrator identity без отдельного явного
  разрешения не создавалась. SQL schema contract и production audits зелёные;
  snapshot нужно обновить при следующем разрешённом admin maintenance.

Следующий товарный шаг: Inventory Manager исправляет и подтверждает три б/у
смартфона первой волны, добавляет Passport, диагностику и реальные фотографии;
после Studio QA pipeline создаёт только draft-карточки. Параллельно требуется
экспортировать официальный Avito-шаблон одной категории и подтвердить профиль
переменных расходов.

### Category And Avito Mapping Hardening (2026-08-10)

- Перед live-изменениями создан локальный VPS backup
  `/opt/isvoi/backups/directus/20260810T195937Z`; `postgres.sql.gz` и
  `uploads.tar.gz` прошли SHA-256. Offsite upload не выполнялся: он остаётся
  явно отложенным и не считается завершённой disaster-recovery защитой.
- Полная товарная выгрузка использует `Структура групп` как первичный источник
  категории. Проверены 61 строка и 14 уникальных путей, несопоставленных строк
  нет. Часы и браслеты остаются в `watches`, смарт-очки относятся к
  `smart-electronics`, а складская группа «Зарядные устройства» не делится на
  кабели и адаптеры без более точного источника.
- Активные, но пустые категории сохраняются в Directus для будущего
  ассортимента, однако публичные catalog controls и sitemap показывают только
  категории, в которых есть доступный публичный товар.
- Соответствие `products.product_type` и
  `product_categories.catalog_section` проверяется уже при сохранении draft.
  Остальные требования комплектности по-прежнему применяются только при
  публикации. SQL-аудит контролирует все товары, а API regression test
  подтверждает отказ без изменения черновика.
- Для Avito используется отдельная приватная коллекция
  `channel_category_mappings`. Одна категория сайта может иметь несколько
  mapping через стабильный `mapping_key`; это обязательно для широкого раздела
  `smart-electronics`. Конкретное объявление выбирает mapping явно.
- Внутренние slug и legacy `category_code` не экспортируются. Feed принимает
  только активный подтверждённый mapping той же категории и канала, объединяет
  его общие атрибуты с атрибутами объявления и остаётся выключенным через
  `AVITO_FEED_ENABLED=0` до официального шаблона, XML validation, подтверждения
  расходов и QA пилотных смартфонов.
- Production migration создала 13 стартовых Avito mapping, все с
  `is_confirmed=false`. Inventory audit сохранил исходные 61 item, 41 receipt и
  51 issue; активных некорректных объявлений, отсутствующих mapping и утечек
  identifiers нет. Aggregate Directus, schema, Catalog V3, Inventory и Club
  audits прошли.
- Production API rehearsal на `qa-galaxy-s24-case` подтвердил draft guard:
  конфликтующая категория отклонена, исходная категория не изменилась, обычное
  поле успешно обновилось и восстановилось. Directus 11.17.4 скрывает текст
  PostgreSQL exception и отвечает generic `500`; rehearsal принимает этот
  контракт только вместе с проверкой неизменности записи и отдельным SQL-аудитом
  наличия trigger.
- Повторный Catalog V3 setup должен сохранять более новые Club-поля в Lead
  Intake/Editor permissions и только публичный текст без упоминания Directus.
  Эти order-dependent regressions были найдены aggregate/copy smoke и исправлены
  в каноническом setup-скрипте.
- Прямой SQL обходит `CACHE_AUTO_PURGE`. После SQL-изменений cacheable content
  нужно очистить неперсистентный Redis cache перезапуском `cache` и `directus`,
  дождаться `/server/health`, затем вызвать защищённый site-content revalidation;
  если production build был создан до SQL, пересобрать Next и перезапустить PM2.
- Финальные HTTP/SEO, image, copy, redirect-aware link, Catalog V3 consistency,
  desktop/mobile visual и performance smokes прошли. LCP: homepage 2980/2480
  ms, catalog 2600/2356 ms, store 2528/2424 ms, blog 2260/2060 ms, pilot article
  4020/3436 ms desktop/mobile; статья остаётся performance-watch, но находится
  внутри действующего release budget.

### Inventory Receipt Movement Hardening (2026-08-13)

- Новые источники проверены локально без записи в Directus: snapshot содержит
  70 SKU / 340 единиц, поступления — 84 строки / 373 единицы. Текущая
  себестоимость магазина равна 1 622 076 ₽, плановая выручка — 2 084 274 ₽.
- Историческая строка поступления, отсутствующая в текущем snapshot, больше не
  считается blocker сама по себе. Pipeline различает `in_store`,
  `partial_central_office`, `central_office`,
  `central_office_inventory_conflict` и `exited_preload`; неявное выбытие
  остаётся warning для оператора.
- Каноническая миграция добавляет в `inventory_receipt_lines` поля
  `received_on`, `movement_status` и `central_office_quantity`, Studio presets
  для магазина/ЦО/выбывших/конфликтов, явные permissions и SQL-аудиты. IMEI в
  новой книге поступлений необязателен; дата и исходный комментарий сохраняются.
- Dry-run новых книг классифицировал 70 строк как связанные с магазином, одну
  как частично находящуюся в ЦО, две как только ЦО, десять как выбывшие до
  загрузки и одну как конфликт ЦО/остатка. Оценка количества в ЦО — 3 единицы.
- Серийная identity-проверка игнорирует только служебные токены вроде
  «мобильный телефон» и `5G`, сохраняя строгую проверку модели, памяти и цвета.
  Поэтому два ложных Samsung-конфликта сняты, один реальный цветовой конфликт
  iPhone 14 Pro Max остаётся blocker.
- После очистки ложных расхождений dry-run показывает 13 blockers: один
  identity-конфликт и 12 сигналов replica/authenticity. Replica не допускается
  автоматически; ручной допуск требует документированной проверки и
  однозначного публичного обозначения в карточке и канальном объявлении.
- Перед production-изменениями создан локальный VPS backup
  `/opt/isvoi/backups/directus/20260813T133422Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite upload не выполнялся, поскольку `OFFSITE_BACKUP_DEST` не
  настроен и этот этап остаётся отложенным.
- Production batch `store-snapshot-2026-08-13`
  (`8512e0b1-45c7-4331-8020-54fa29f4e17a`) получил обе исходные книги в
  приватной папке Directus Files. Dry-run подтвердил локальные показатели и
  отсутствие исчезнувших SKU; apply записал 70 `inventory_items`, 84
  `inventory_receipt_lines` и 28 issues. Статус batch —
  `applied_with_blocks`; `products_synced=0`, каталог и Avito не менялись.
- После прямой SQL-миграции недостаточно только перезапустить контейнеры:
  persisted Redis может вернуть старый permission cache. Для новых полей
  потребовались `redis-cli FLUSHALL`, restart Directus и ожидание health. Это
  очистка только кэша; PostgreSQL и uploads не затрагиваются.
- 41 историческая receipt-строка batch от 10 августа была создана до появления
  movement tracking. Каноническая идемпотентная миграция backfill-классифицирует
  старые строки без даты: связанные с inventory item как `in_store`, остальные
  как `exited_preload`. Исторические строки и их исходные суммы сохранены.
- После apply прошли 11 unit-тестов, Avito feed tests, полный `web:verify`,
  inventory audit и aggregate production Directus audit. Проверки подтвердили
  нулевое число некорректных movement status, отсутствие Public/Editor доступа
  к приватному товарному контуру и отсутствие identifiers в batch logs.

Следующий товарный шаг: Inventory Manager разбирает 13 blockers и 15 warnings
нового batch, начиная с цветового конфликта iPhone 14 Pro Max и одной строки
`central_office_inventory_conflict`. Допуск товара в Catalog V3 выполняется
только вручную с `review_override` и заметкой; результатом остаётся draft до
фотографий, Passport/диагностики и Studio QA.

### Inventory Snapshot And Unit Economics Refresh (2026-08-18)

- Полная выгрузка Evotor от 18 августа содержит 82 SKU / 358 единиц. Закупочная
  стоимость текущего остатка равна 1 733 726 ₽, розничная — 2 236 063 ₽,
  потенциальная валовая прибыль — 502 337 ₽, валовая маржа — 22,47%.
- Относительно snapshot от 13 августа добавлено 12 новых UUID / 20 единиц.
  Повторного использования старых UUID, кодов или штрихкодов не найдено.
- Поступление содержит 95 строк / 394 единицы: закупка 2 402 800 ₽, плановая
  выручка 3 006 973,93 ₽, валовая маржа 20,09%. Классификация движения:
  76 строк в магазине, одна частично в ЦО, две в ЦО, одна требует сверки ЦО и
  15 выбыли до загрузки.
- Каноническая книга пересчитана в
  `outputs/inventory-unit-economics-2026-08-11/ISVOI_unit_economics_2026-08-18.xlsx`.
  Добавлен отдельный лист новых товаров, контроль UUID/кодов/штрихкодов,
  целевая категория Directus и действие перед публикацией. Формулы пересчитаны
  Excel и проверены без ошибок.
- Pipeline относит электробритвы и триммеры из корневой Evotor-группы в
  `smart-electronics`. Две JBL Flip с низкой закупочной ценой получают
  `authenticity_review` и не могут быть автоматически допущены в каталог или
  Avito.
- Локальный и production dry-run нового snapshot валидны: 15 blockers,
  20 warnings, `missing_from_snapshot=0`. Перед apply создан и проверен VPS
  backup `/opt/isvoi/backups/directus/20260818T101515Z`; offsite upload не
  выполнялся, поскольку этот этап остаётся отложенным.
- Production batch `store-snapshot-2026-08-18`
  (`f5e60ed4-7a24-4720-abc2-6fc0d867fbd8`) хранит обе исходные книги в
  приватной папке Directus Files. Идемпотентный apply через защищённый route
  записал 82 `inventory_items`, 95 `inventory_receipt_lines` и 35 issues;
  статус — `applied_with_blocks`, `products_synced=0`, отсутствующие позиции
  не обнулялись.
- После apply прошли 13 unit-тестов inventory pipeline, Avito feed tests,
  полный frontend gate, inventory и aggregate Directus audits и production
  HTTP smoke. Public, Catalog V3 и Avito не получили новых товаров: ручной
  review остаётся обязательным.

### Native-First Directus Studio UX V2 (2026-08-19)

- Production и GitHub обновлены с базового `40b61b0` до реализации
  `4d6d138`. Перед миграцией создан проверенный backup
  `/opt/isvoi/backups/directus/20260819T135133Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy не выполнялся, потому что `OFFSITE_BACKUP_DEST` не
  настроен.
- `products` является единственной редакторской точкой каталога. `devices` и
  `device_images` физически сохранены для dual-read/rollback, скрыты из Content
  navigation и недоступны человеческим ролям. Admin и технические service
  policies сохраняют временный доступ до отдельного завершения legacy-периода.
- Content navigation сгруппирована по сценариям: `Сайт и контент`, `Каталог`,
  `Продажи`, `Блог`, существующий `I СВОИ Club`, `Импорт каталога` и
  `Склад и каналы`. Дочерние технические коллекции открываются из родительских
  карточек и скрыты из плоского меню.
- Форма `products` разделена на статус, основное, цену/наличие, описание, фото,
  данные техники/аксессуара, Passport/Trade и системные данные. Native field
  conditions показывают device/accessory groups по `product_type`; import/source
  fields readonly и отсутствуют в human update allowlists.
- Все доступные человеку коллекции и видимые поля получили `ru-RU` labels без
  fallback-значений. Club сохраняет открытыми только публикацию и первый экран;
  product template и технические группы свёрнуты.
- Editor работает только с draft-карточками; Advanced Editor публикует и ведёт
  бренды/категории/модели; Importer не создаёт, не обновляет и не удаляет
  `products`; Inventory Manager меняет только поля проверки/допуска и решения
  issues. TFA policies = 5, non-admin system permissions = 0, wildcard
  permissions = 0.
- Blog M2M переведён с `devices_id` на `products_id`; 3 существующие связи
  перенесены без расхождений. Старый столбец остаётся nullable для отката, а
  frontend временно выполняет primary Catalog V3 read с legacy query fallback.
- Studio получил очереди каталога и Inventory: фото/текст/Passport/цена,
  публикация, совместимость, открытые blockers/warnings, identity/authenticity,
  допуск в каталог, сверка места и Avito QA. Дубли FAQ/navigation и legacy
  device bookmarks удалены.
- Идемпотентный финальный generator —
  `npm run directus:setup:studio-ux-v2`; `--rollback` используется для безопасной
  production rehearsal. Старые setup-скрипты запускаются только перед ним, а
  `directus:audit-studio` проверяет groups, labels, conditions, bookmarks и
  permissions.
- После SQL удалены только 169 `permissions:*` и 12 Directus namespace cache
  keys; production `FLUSHALL` запрещён. Directus 11.17.4 и PM2 Next перезапущены,
  health/build прошли.
- Aggregate audit прошёл для schema, Studio, catalog, images, navigation,
  legacy fallback, page sections, leads, files, import, blog, Club,
  conversion-v2 и Inventory. Catalog V3 audit обновлён под native role model:
  Editor draft-only, Advanced Editor reference CRUD, Importer read-only.
- Полную визуальную проверку под каждым человеческим логином автоматизировать
  нельзя без их credentials. SQL metadata/permission contracts проверены;
  ручной acceptance остаётся коротким входом под Editor, Advanced Editor,
  Importer и Inventory Manager на desktop 1280/1440 px.

### Admin-Only Directus Insights (2026-08-19)

- Штатный Directus Insights используется как краткий управленческий обзор, а
  не как второй операторский интерфейс. Обработка товаров, заявок, блокеров и
  импортов остаётся в Content и role-scoped bookmarks.
- Единственный управляемый dashboard —
  `Руководитель · Операционный обзор`. Он содержит 10 native-панелей Directus
  11.17.4: новые и проблемные заявки, доступный каталог, складские блокеры,
  30-дневную динамику лидов, готовность каталога, кликабельные списки заявок и
  блокеров, 90-дневную структуру лидов и последние inventory imports.
- Dashboard остаётся admin-only. Editor, Advanced Editor, Importer и Inventory
  Manager не получают read/write permissions на `directus_dashboards` и
  `directus_panels`; guardrail `non-admin system permissions = 0` сохраняется.
- Auto Refresh по умолчанию выключен. При активном мониторинге допустим
  интервал 5 минут; dashboard намеренно ограничен десятью запросами.
- Финансовые KPI и blog cadence не входят в v1. Их нельзя показывать как
  управленческие показатели до подтверждения cost profiles/category mappings и
  накопления устойчивого editorial/conversion объёма.
- Воспроизводимый setup: `npm run directus:setup:insights`; targeted rollback:
  `npm run directus:setup:insights -- --rollback`; production gate:
  `npm run directus:audit-insights`, также включённый в
  `npm run directus:audit:prod`.
- Перед production apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260819T142635Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущен, потому что `OFFSITE_BACKUP_DEST` не настроен.
- Production rollout выполнен из feature-коммита `88b783d`: dashboard и 10
  панелей применены, Directus перезапущен и вернулся в `health=ok`. Отдельный и
  aggregate audits прошли; anonymous `/dashboards` и `/panels` возвращают 403,
  Studio `/admin/` — 200.
- При перенаправлении setup SQL в файл используйте
  `npm run --silent directus:setup:insights`. Обычный `npm run` печатает npm
  banner в stdout и загрязняет SQL; production apply использовал прямой
  `node scripts/setup_directus_insights_sql.mjs` после безопасного rollback
  rehearsal.
- Relation-фильтры native Insights должны соответствовать GraphQL-схеме:
  null-проверка ответственного задаётся как `assigned_to.id._null`, а не как
  `assigned_to._null`. Setup и exact-config audit используют один и тот же
  GraphQL-safe контракт.
- Native Insights использует фиксированную сетку по 18 px на unit, а не
  пропорциональные колонки. Dashboard закреплён на ширине 36 units: KPI по два
  в ряд, график и операторские списки получают достаточную высоту, а списки —
  полную ширину без внутренних горизонтальных скроллов.
- Координаты `directus_panels.position_x/position_y` являются 1-based: первая
  допустимая grid line — `1`. Значение `0` заставляет CSS Grid автоматически
  размещать панель и ломает порядок. Insights audit блокирует координаты ниже
  `1` и проверяет правую границу как `position_x + width - 1 <= 36`.

## 2026-08-20 — Мультигородской каталог и Белгород

- Основной SEO-контур остаётся на `isvoi.ru`; первый городской хаб опубликован
  по адресам `/belgorod` и `/belgorod/catalog`. Карточки товаров остаются
  каноническими на `/product/{slug}`. `/store` и `/stores/belgorod` отвечают 301
  на `/belgorod`.
- Созданы `store_locations`, `store_location_images` и `product_offers`.
  Девять текущих товаров получили белгородские предложения; legacy цена и
  остаток в `products` оставлены для dual-read и отката.
- В Studio опубликованы управляемые поля точки и предложения, пять bookmarks
  для Editor и Advanced Editor, русские labels и точные permissions. Техническая
  галерея магазина скрыта из основной навигации и редактируется из карточки точки.
- Выбор города хранится в cookie только после ручного действия. Город в URL имеет
  приоритет, IP используется лишь для подсказки, автоматического redirect нет.
- Перед apply выполнена успешная rehearsal с `ROLLBACK`. Backup
  `/opt/isvoi/backups/directus/20260820T121730Z` содержит PostgreSQL и uploads;
  оба архива прошли SHA-256. Offsite copy пропущен, потому что
  `OFFSITE_BACKUP_DEST` не настроен.
- Production rollout выполнен серией forward-only commits, итоговый web commit
  `dc75971`. Полный Directus audit, production build, HTTP/copy/link/visual smoke
  и regression-проверка store-specific offer на товарной странице прошли.
- `belgorod.isvoi.ru` пока не активирован: на момент выпуска DNS-имя не
  существует. После добавления A/AAAA-записи нужно расширить сертификат и
  `server_name`; middleware с allowlist и 301 уже готов.
- Проверенные адрес, часы, карта и юридические данные Белгорода не подменяются
  тестовыми значениями. До их заполнения Directus показывает честные fallback-
  формулировки, а не вымышленные контакты.

### Native-First Directus Studio UX V3 (2026-08-20)

- Первая волна повторного Studio-аудита остаётся metadata-only: бизнес-записи
  каталога, магазинов, заявок и Club не изменяются. Воспроизводимый generator —
  `npm run directus:setup:studio-ux-v3`; `--rollback` выполняет полную
  транзакционную репетицию без сохранения изменений.
- `Магазины и наличие` является канонической Studio-группой мультигородского
  workflow. `Магазины и города` отвечает за контакты, способы получения и
  контент городской страницы; `Предложения магазинов` — за локальную цену,
  остаток и доставку. Техническая галерея остаётся скрытой и открывается из
  карточки магазина.
- Формы магазинов и предложений разделены на короткие сценарные группы. Поля
  сроков доставки и платёжных методов показываются native field conditions
  только когда соответствующий способ включён; create presets безопасно
  создают черновики, а не опубликованные записи.
- Поля Club-заявки собраны в условную группу `Контекст Club`, видимую только
  при `kind = club`. Настройки Club разделены на сценарии завершения, Passport,
  тарифы, правила, участие и финальный CTA вместо одной длинной группы.
- Для Editor и Advanced Editor сохранена одинаковая компактная навигация по
  четырём частым очередям: товары — 8 bookmarks, заявки — 12, предложения — 6,
  магазины — 3. В заявках сохранены отдельные Club SLA и blog attribution
  views; пользовательские presets не удаляются, setup заменяет только
  role-scoped bookmarks этих коллекций.
- Допустимые значения `navigation_items` синхронизированы между UI и role
  permissions: `header`, `footer`, `club_header`, `club_footer`; устаревшие
  `mobile`, `utility` и роль `cta` не разрешаются через Editor API.
- `directus:audit-studio` теперь блокирует orphan group references, отсутствие
  location/form groups, незагруппированные поля магазина/предложения, mismatch
  навигационных permissions, потерю Club context, bookmark sprawl и отсутствие
  новых Club settings groups. Этот контракт входит в
  `npm run directus:audit:prod`.
- Следующие волны выполняются отдельно: сузить API update allowlists для
  вычисляемых/импортных полей, убрать dual ownership цены/остатка и городских
  контактов, затем провести ручной desktop acceptance под каждой человеческой
  ролью. Эти задачи нельзя смешивать с metadata-only релизом.
- Production rollout выполнен коммитами `87cbee0` и `fd90a37`. Перед apply
  создан и проверен backup
  `/opt/isvoi/backups/directus/20260820T132205Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущен из-за отсутствия `OFFSITE_BACKUP_DEST`.
- Первый aggregate gate обнаружил drift старых audits относительно нового
  compact bookmark-контракта. Исправление не ослабило операторский workflow:
  сохранены четыре отдельные Club SLA views и две blog attribution views,
  Catalog V3 и multicity audits переведены на актуальные названия/группы.
  После повторного идемпотентного apply прошли `directus:audit-studio`, полный
  `directus:audit:prod`, API policy, ops и content ownership; Directus
  `11.17.4` вернулся в `health=ok`.

## 2026-08-21 — Исходная миграция текстов главной

- Исходный утверждённый текст релиза хранится без изменений в
  `docs/source-copy/writing-block.md` как reference/seed. Его SHA-256:
  `d677114610f4cf170ddda0a3a0cf22d3b9ab242b4bf0feddd2381bef0bcc9aeb`.
- Исходное распределение строк по полям хранится в
  `apps/web/data/homepage-copy.json`. После запуска редакторская версия в
  production Directus является источником истины; JSON используется для
  fallback/seed и не должен автоматически перезаписывать Studio-правки.
- Главная состоит из девяти активных секций: Hero, главное отличие, каталог,
  Passport, принцип I СВОИ, магазин, Trade, FAQ и составной блок подбора с
  финальным экраном. `market_tension`, `path_router`, `club_preview`,
  `diagnostics_compare` и `social_proof` остаются неактивными.
- SQL полного сброса генерируется из reference JSON командой
  `npm run directus:update-homepage-copy-sql -- --confirm-copy-reset` и не
  является deploy-шагом. Безопасная репетиция доступна с `-- --rollback`.
  `directus:audit-homepage-copy` проверяет структуру и guardrails, но не
  побайтное равенство редакторского текста seed-файлу.
- Fallback главной читает тот же канонический JSON. Демонстрационные IMEI,
  суммы выкупа/доплаты, valuation Trade и подпись Store не показываются без
  явных данных Directus. Выбор сценария в финальной форме скрыт, но заявка
  сохраняет техническое значение `Найти устройство`.
- Перед production apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260821T141601Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущен, потому что `OFFSITE_BACKUP_DEST` не настроен.
- Production rollout выполнен цепочкой `656009d`, `41fa52f`, `dbab8c9`,
  `39e8fd6`, `dbb2c4c`. Точный homepage audit, Page Sections audit и полный
  `directus:audit:prod` прошли; API policy, ops, consent и content ownership
  остались зелёными.
- После SQL apply обязательна защищённая revalidation через
  `/api/revalidate/site-content`: первый visual smoke поймал старый SSG-слепок,
  собранный до изменения Directus. PM2 restart сам по себе не заменяет этот шаг.
- Вложенные `content.note` и `content.closing.body` проходят server-side
  `prepareSectionContentRichText` и передаются в client components безопасными
  React-нодами. `dangerouslySetInnerHTML` не используется; production HTML не
  содержит видимых экранированных `<p>`/`<strong>`.
- После revalidation прошли `smoke:copy`, `smoke:prod`, `smoke:images` и
  desktop/mobile `smoke:visual`. Скриншоты вручную проверены на порядок секций,
  переполнение, длинный Passport, четыре шага Store, две Trade-плашки, шесть FAQ
  и составной финальный блок.

### Визуальная архитектура главной (2026-08-21)

- Редакторский текст главной остаётся в Directus при визуальной доработке.
  Секционные компоненты отвечают только за композицию, адаптивность и
  поверхности; audit контролирует структуру и обязательные поля, но не
  возвращает текст к seed-версии.
- Повторяемая вводная часть секций собрана в `HomeSectionIntro`. Trust, Catalog,
  Passport, принцип I СВОИ, Store, Trade и FAQ используют центрированную
  презентационную композицию по образцу `/trade`: H2 ограничен `780px`, вводный
  текст — `660px`. Карточки, списки, Passport и другие рабочие элементы ниже
  сохраняют левостороннее выравнивание.
- Eyebrow расположен над центрированным H2. Каноническая секционная типографика:
  H2 `48px/600` на desktop и `30px/600` на mobile, вводный текст `16px/400`.
  Hero остаётся отдельной центрированной композицией, а Final CTA сохраняет
  split-сетку, связывающую текст подбора с формой.
- Основная последовательность поверхностей намеренно чередует White и Frost:
  Trust → Catalog → Passport → принцип I СВОИ → Store → Trade → FAQ → Final CTA.
  Это отделяет смысловые главы без декоративных теней и случайных вложенных
  карточек.
- Passport сохраняет рамку только у самого демонстрационного документа; список
  объяснений остаётся плоским. Финальная lead-форма является единственным
  функциональным card-контейнером, а заключительный брендовый текст расположен
  в той же секции после hairline-разделителя.
- На mobile главная показывает первые два товара и ведёт в полный каталог через
  CTA; desktop сохраняет четыре товарные карточки. Hero CTA располагаются в две
  равные колонки и сохраняют 44+ px touch target без переноса подписей.
- Обязательный gate для таких правок: Prettier, ESLint, TypeScript,
  Tailwind post-audit, content ownership audit, production build, bundle budget
  и ручной desktop/mobile viewport-check без горизонтального переполнения.

### Редактирование блоков главной в Studio (2026-08-21)

- Девять активных секций главной проверены по production metadata и permissions.
  Editor меняет основные тексты, CTA, порядок, видимость и связанные файлы;
  структурные массивы в `page_sections.content` остаются у Advanced Editor/Admin.
- FAQ главной используют категорию `home`. Она добавлена в варианты поля и
  validation прав Editor, а для редактора создано представление `Главная FAQ`.
  Регресс блокирует метрика `studio.faq.home_editability_missing` в
  `npm run directus:audit-studio` и агрегатном `directus:audit:prod`.
- `directus:audit-homepage-copy` разрешает редакторские изменения в Studio и
  проверяет состав секций, variants, обязательный copy, FAQ-связи и запрещённые
  legacy-формулировки. Seed JSON синхронизируется отдельно только при намеренном
  изменении аварийного fallback.
- Перед metadata apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260821T195505Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущен из-за отсутствия `OFFSITE_BACKUP_DEST`.
- После apply и перезапуска Directus прошли `directus:audit-studio`,
  `directus:audit-homepage-copy` и `directus:audit-page-sections`. Канонические
  тексты девяти секций и шести FAQ не изменились.
- Content ownership главной закрыт полностью: empty-state превью каталога
  хранится в `catalog_preview.content.emptyState.body`, а подписи отправки,
  успеха и ошибки формы — в `final_cta.content.form`. React-компоненты больше не
  содержат эти публичные строки; production Directus контролирует copy.
- Перед production apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260821T201124Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущен из-за отсутствия `OFFSITE_BACKUP_DEST`.
- SQL сначала прошёл production rehearsal с `ROLLBACK`, затем был применён.
  После apply прошли `directus:audit-homepage-copy`,
  `directus:audit-page-sections`, content ownership и полный `web:verify`.

### Hero с проверенной линейкой устройств (2026-08-21)

- Главная использует предоставленную композицию из трёх смартфонов в разных
  ракурсах. Исходный PNG без crop перекодирован в WebP `1672x941`, quality 86;
  critical-файл `apps/web/public/assets/critical-home-hero.webp` весит около
  39 KB.
- Directus остаётся владельцем изображения: сохранены relation и UUID файла
  `cd194999-a3b9-456a-a724-55ef798e10c5` в папке `ISVOI Site Assets`.
  Локальный WebP является только first-viewport performance override; при смене
  relation в Studio сайт автоматически вернётся к Directus asset URL.
- Alt-текст хранится в `home.hero.content.visual.image_alt` и контролируется
  page-section/content audits. Passport overlay остаётся выключенным: отдельная
  Passport-секция раскрывает проверку ниже по странице.
- `import_site_assets.mjs --replace-file` заменяет бинарник существующего
  Directus File через API, сохраняя UUID и не создавая orphan-файл. На
  production сервисный токен не имеет системных Files update-полей, поэтому
  скрипт использует локальный Docker/PostgreSQL fallback с проверкой upload-path
  и обновлением `filesize`, `width`, `height` и `modified_on`.
- Перед production apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260821T205329Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущен из-за отсутствия `OFFSITE_BACKUP_DEST`.
- Production обновлён до `3699472`: файл заменён с сохранением UUID, Directus
  хранит `critical-home-hero.webp` (`39214` bytes, `1672x941`), защищённая
  revalidation выполнена. `directus:audit-homepage-copy`,
  `directus:audit-files`, `smoke:prod`, `smoke:images` и desktop/mobile
  `smoke:visual` прошли; PM2 `isvoi-web` остался `online`.

### Редактирование завершающего бренд-блока главной (2026-08-22)

- Нижняя часть `home.final_cta` больше не принадлежит техническому
  `page_sections.content.closing`. Для неё добавлены editor-facing поля
  `closing_*`, собранные в условную группу `Завершающий бренд-блок`, которая
  показывается только у секции `final_cta`.
- Renderer сначала читает отдельные Directus-поля; legacy JSON остаётся только
  временным fallback для локальных данных. Production migration переносит
  существующие значения и удаляет ключ `closing` из JSON без изменения copy.
- Обычный Editor и Advanced Editor могут менять заголовок, WYSIWYG-текст,
  название/подпись бренда и обе CTA. Homepage-copy audit проверяет наличие
  полей и запрещённые формулировки, но не фиксирует редакторский текст побайтно.
- Реализация выкачена коммитами `4fabbc7` и `0f295b2`. Второй коммит сохраняет
  `page_sections` скрытой технической коллекцией: редактор открывает секции
  через `Страницы сайта`, а не через отдельный пункт верхнего меню Studio.
- Перед schema apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260822T153034Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущен из-за отсутствия `OFFSITE_BACKUP_DEST`.
- SQL-модель, перенос текста и permissions сначала прошли production rehearsal
  с `ROLLBACK`, затем были применены. Protected revalidation выполнена.
  `web:verify`, `directus:audit:prod`, `smoke:prod` и desktop/mobile
  `smoke:visual` прошли; публичный вид и copy главной не изменились.
- После первой пользовательской правки выяснилось, что Directus продолжал
  отдавать старую permission-схему из Redis: значения сохранялись в PostgreSQL,
  но server token получал `403` на явные `closing_*`, а `fields=*` молча их
  исключал. Удалены только 187 ключей `permissions:*`, затем Directus дождался
  health и была выполнена protected revalidation; `FLUSHALL` не использовался.
- Для предотвращения повтора добавлена команда
  `npm run directus:cache:permissions`. API policy audit теперь отдельно
  проверяет `service.homepage_closing` реальным `DIRECTUS_TOKEN`. Chromium
  подтвердил видимость отредактированного блока на desktop и mobile.
- Общий homepage-copy reset больше не является штатным deploy-шагом. Команда
  `directus:update-homepage-copy-sql` разрешает только `--rollback`; реальный
  reset требует явного `--confirm-copy-reset` и считается намеренным возвратом
  к seed/fallback-текстам. Production Directus является владельцем редакторских
  текстов главной.
- Homepage-copy audit больше не сравнивает редакторский copy побайтно с JSON.
  Он контролирует состав и variants секций, обязательные значения, FAQ-связи,
  отсутствие legacy `content.closing` и запрещённых формулировок.
- Public/service permissions для `device_passports` и `trade_options` обязаны
  поддерживать обе связи переходного периода: Catalog V3 через `product` и
  legacy через `device`. API policy проверяет `service.product_passport` и
  `service.product_trade`; permissions setup не должен возвращать фильтр только
  по legacy `device`.

### Безопасные точечные изменения контента Directus (2026-08-22)

- Production Directus остаётся источником истины для редакторского текста.
  Setup/seed/reset-скрипты не входят в обычный deploy и не применяются ради
  добавления одного поля или изменения одного блока.
- Для инженерных правок существующего контента добавлен
  `npm run directus:content-patch`. Декларативные patch-файлы хранятся в
  `directus/content-patches/`; полный runbook находится в
  `docs/directus-content-patches.md`.
- Workflow состоит из `--capture-lock`, preview с обязательным SQL `ROLLBACK`
  и отдельного `--apply --confirm <patch-id>`. Apply принимает только
  закоммиченный неизменённый файл из `origin/master` и только одну запись.
- Lock содержит SHA-256 всего production-row и доступную дату обновления.
  Перед apply состояние читается повторно, а тот же hash включается в атомарный
  `UPDATE`; параллельная Studio-правка приводит к отказу без перезаписи.
- Перед реальным `UPDATE` автоматически создаётся и проверяется свежий backup
  PostgreSQL/uploads. После изменения Directus перезапускается для сброса
  устаревшего data cache, выполняется protected site revalidation и повторная
  проверка всех заявленных путей.
- Инструмент запрещает Directus system collections, лиды, импорт, склад,
  чувствительные поля, идентификаторы, ownership и timestamps. Изменения
  вложенного JSON сохраняют все неуказанные ключи.
- Любое несовпадение snapshot считается сигналом повторно изучить Activity и
  актуальную запись, а не поводом автоматически обновить lock.
- Инструмент использует PostgreSQL, потому что site service token остаётся
  read-only, и не создаёт Studio revision от имени редактора. Аудит-следом
  инженерной правки служат patch-файл в Git, commit, путь проверенного backup и
  эта операционная запись; обычное редактирование по-прежнему выполняется в
  Studio.
- Интеграционный rehearsal выполнен на production-записи `home.final_cta`:
  показан точный diff поля `closing_headline`, SQL-транзакция завершилась
  `ROLLBACK`, а SHA-256 snapshot до и после остался
  `7bf8d24f66c154735f14c9144cf13f455870a8c0ffc656f1dccf0306638046c2`.
  Контент не изменялся, backup и revalidation для preview не запускались.

### Service-read Passport и Trade для Catalog V3 (2026-08-22)

- После очистки устаревшего permission cache обнаружилось, что production
  policy `ISVOI Public Read` для `device_passports` и `trade_options` разрешала
  только legacy relation `device`. Server-side Next не мог читать связанные с
  `products` Passport и Trade, поэтому `/product/iphone-13-pro` терял Passport,
  историю устройства и Trade offer.
- Перед изменением создан и проверен backup
  `/opt/isvoi/backups/directus/20260822T165232Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущен, потому что `OFFSITE_BACKUP_DEST` не настроен.
- После явного разрешения пользователя применён узкий SQL patch ровно к двум
  `read`-строкам. Поля теперь включают одновременно `product` и `device`.
  Product-ветка разрешает только `published`, `content_status=ready` и
  `stock_status != hidden`; Trade дополнительно требует `is_active=true`.
- Анонимный API не открывался, write/delete/system permissions не менялись.
  Rehearsal вернул `target_rows=2` и завершился `ROLLBACK`; apply также изменил
  ровно две строки и завершился `COMMIT`.
- Удалены только 104 Redis-ключа `permissions:*`, Directus перезапущен и
  вернулся в `health=ok`. Protected `site-content` revalidation выполнена.
- API policy подтвердил `403` для anonymous requests и `200` для
  `service.product_passport` / `service.product_trade`. Полный
  `directus:audit:prod` прошёл: public writes, non-admin wildcards и non-admin
  system permissions остаются `0`.
- Production Playwright smoke прошёл. `/product/iphone-13-pro` содержит один
  Passport-блок, один блок истории устройства, один Trade offer и lead form;
  legacy `/device/iphone-13-pro` сохраняет ожидаемый `301`.

### Матрица результата в домашнем CTA (2026-08-22)

- Четыре пункта «что покажем» в `home.final_cta` оформлены крупной плоской
  матрицей 2×2 с индексами `01–04`, усиленной типографикой и hairline-сеткой.
  Это заполняет левую колонку рядом с lead form без декоративных карточек и
  без новой icon dependency.
- Значения списка продолжают читаться из `page_sections.content.proof` и
  редактируются в Directus Studio; публичный copy в React не добавлялся.
- Расширенная композиция включается только для `source=home_final_cta`.
  Переиспользующий компонент `/trade` сохраняет компактный bullet-list.
- Локально прошли Prettier, ESLint, TypeScript, Tailwind и content ownership
  audits, production Next build, bundle budget и desktop/mobile visual smoke
  для `/` и `/trade`. На ширине `390px` горизонтального переполнения нет.

### Отдельный блок новой техники на главной (2026-08-22)

- Блок `8. Новая техника` из `docs/source-copy/writing-block.md` возвращён на
  главную отдельной управляемой секцией `home.new_tech` с variant `new.tech`.
  Он расположен между `store_preview` и `trade_preview`.
- Публичные eyebrow, заголовок, три абзаца и CTA взяты из исходника дословно.
  CTA ведёт на `/catalog/tech?condition=new`; альтернативный маркетинговый
  copy в React не добавляется.
- Визуально это спокойный editorial-мост: белый фон, верхний hairline,
  общая 12-колоночная сетка главной, заголовок слева, текст и CTA справа.
  Hero и соседние секции не меняются.
- После создания запись полностью редактируется через `Главная` →
  `Секции страницы`: обычные поля `Надзаголовок`, `Заголовок`, `Основной текст`
  и `Основная кнопка`. JSON для блока не требуется.
- Команда `npm run directus:setup:home-new-tech` по умолчанию генерирует
  транзакцию с `ROLLBACK`. Реальное применение требует
  `--apply --confirm-home-new-tech`; скрипт создаёт только отсутствующую
  секцию и меняет только технический порядок соседей. Существующий
  редакторский текст других блоков он не перезаписывает.
- Homepage-copy audit контролирует наличие, variant, порядок и активность
  десяти секций, но не сравнивает редакторский текст production Directus с
  seed JSON побайтно. Studio audit дополнительно требует вариант `new.tech`
  в штатном dropdown.
- Production rollout выполнен коммитами `5cb9b51` и `7d09d61`. Перед SQL
  создан и проверен backup
  `/opt/isvoi/backups/directus/20260822T172505Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущен из-за отсутствующего
  `OFFSITE_BACKUP_DEST`.
- Узкий SQL дважды прошёл rehearsal с `ROLLBACK`, затем создал ровно одну
  секцию и один dropdown choice. Повторное применение дало `INSERT 0 0`, что
  подтвердило идемпотентность. Общий homepage-copy reset не запускался.
- Directus после restart вернулся в `health=ok`; первый запрос через восемь
  секунд попал в ожидаемое окно прогрева `502`, повторный прошёл после полной
  готовности контейнера.
- Next.js собран из чистого generated `.next` при остановленном PM2, чтобы
  исключить смешивание старых и новых chunk hashes. Build завершился
  `status=0`, PM2 и публичный HTTPS вернулись в `200`, protected revalidation
  выполнена.
- `directus:audit:prod`, функциональный, image, copy и desktop/mobile visual
  smoke прошли. Production DOM подтвердил порядок Store → New Tech → Trade,
  CTA `/catalog/tech?condition=new`, отсутствие page errors и горизонтального
  overflow на 1366 и 390 px.

### Городские контакты и реквизиты в футере (2026-08-22)

- Источником истины для адреса, телефона, Telegram, email, часов работы,
  ссылки на карту и реквизитов продавца является конкретная запись
  `store_locations`, а не глобальная `site_settings`.
- В `store_locations` закреплены поля `legal_name`, `inn`, `ogrn` и
  `legal_address`. В Studio они собраны в группу `Реквизиты продавца`; адрес и
  контакты остаются в основной группе магазина.
- Футер читает выбранный город из `CityContext`. Для одного магазина допустим
  аварийный fallback на старые глобальные значения. Как только опубликовано
  несколько городов, fallback отключается, чтобы посетителю не показывались
  реквизиты или контакты другого магазина.
- При выбранном городе футер показывает адрес, явное действие
  `Открыть на карте`, ссылку на городской хаб, способы связи, часы работы и
  реквизиты продавца. Если город ещё не выбран и магазинов несколько, вместо
  случайного адреса показывается выбор города и ссылка `Все магазины`.
- Реквизиты выводятся как спокойная служебная строка внутри городского блока,
  а глобальная нижняя строка футера хранит только copyright, privacy и общий
  юридический текст бренда.
- Схема и Studio UX воспроизводятся командой
  `npm run directus:setup:location-footer`. По умолчанию она генерирует SQL с
  `ROLLBACK`; production apply требует явные флаги
  `--apply --confirm-location-footer`. Backfill заполняет только пустые поля
  Белгорода из текущих глобальных настроек и не перезаписывает ручные значения.
- `directus:audit-multicity` проверяет наличие полей, полноту опубликованных
  городов, HTTPS map URL и точные service/editor permissions. При росте сети
  новый город нельзя публиковать без адреса, телефона, часов, карты, продавца,
  ИНН и ОГРН/ОГРНИП.
- Production rollout выполнен коммитами `8e6eafe` и `56101f8`. Перед первой
  транзакцией создан и проверен backup
  `/opt/isvoi/backups/directus/20260822T181003Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущен из-за отсутствующего
  `OFFSITE_BACKUP_DEST`.
- Setup дважды прошёл rehearsal с `ROLLBACK`, затем применён с `COMMIT`.
  Production получил четыре юридических поля и пять Studio-полей вместе с
  группой. Backfill изменил только запись Белгорода и не перезаписывает
  непустые редакторские значения.
- Legacy `map_url` содержал полный Yandex iframe. Миграция идемпотентно
  извлекла его HTTPS `src`; Studio-подсказка теперь требует URL без iframe.
  `multicity.content.invalid_map_url` после исправления равен `0`.
- PostgreSQL permissions были корректны, но внешний Redis сохранял старый
  Directus permission cache после restart. Точечно удалены 106 ключей
  `permissions:*`; `FLUSHALL` и очистка data/image cache не выполнялись.
  После обновления cache service token читает `store_locations` с `200`, а
  anonymous API по-прежнему возвращает `403`.
- Protected site-content revalidation выполнена после восстановления
  service-read. Публичный HTML содержит одну ссылку `Открыть на карте`, данные
  продавца и не содержит iframe в `href`.
- Production прошёл `web:verify`, bundle budget, полный
  `directus:audit:prod`, functional/image/copy smoke и повторный desktop/mobile
  visual smoke главной. Production checkout завершил выкат на `56101f8`.

### Управление подписями городского футера (2026-08-22)

- Проверка production Studio уточнила фактический путь: группа называлась
  `Магазины и наличие`, а коллекция внутри — `Магазины и города`. Прежняя
  инструкция через `Склад и каналы` была неверной и удалена из операторского
  индекса.
- Для более понятной навигации каноническое имя группы меняется на
  `Магазины, адреса и наличие`. Данные конкретного города остаются в
  `store_locations`; глобальные UI-подписи городского блока переносятся в
  отдельную группу `Настройки сайта` → `Footer · контакты`.
- `site_settings` владеет общим eyebrow-шаблоном с `{city}`, названиями
  колонок, подписями ссылок и fallback-текстами. `store_locations` владеет
  адресом, телефоном, Telegram, email, часами, картой и реквизитами продавца,
  а также может точечно переопределить eyebrow одного города.
- URL городского хаба не является редакторским полем: он безопасно строится из
  slug города как `/{slug}`. URL карты редактируется в записи города, а видимые
  подписи обеих ссылок — в глобальных настройках.
- Setup и audits расширены идемпотентно; пустые новые поля получают текущие
  публичные подписи, а непустые редакторские значения не перезаписываются.
  Изменение применено к production Directus в release `c3b4e59`; подробности
  резервного копирования и проверки зафиксированы ниже.

### Контакты без отдельной дублирующей страницы (2026-08-22)

- Production-аудит выявил черновик `site_pages.slug=contacts` с двумя
  выключенными пустыми секциями и отдельный React-маршрут
  `/belgorod/contacts`. При этом общий footer уже показывает адрес, телефон,
  Telegram, email, часы, карту и реквизиты на каждой странице.
- Решено не публиковать contact-page без уникальной пользовательской пользы.
  Черновик `Контакты` остаётся выключенным legacy-заделом до появления схемы
  входа, парковки, фотографий ориентира, информации о доступности или записи на
  визит.
- В общем блоке остаётся прямая внешняя ссылка `Открыть на карте`. Вторая
  ссылка меняется на управляемый шаблон `Магазин в {city}` и ведёт на
  канонический городской хаб `/{slug}`.
- Старый `/{slug}/contacts` отвечает постоянным редиректом на `/{slug}`, а
  `/contacts` — на `/stores`. Оба URL исключены из sitemap и не создают SEO-дубль.
- Ранее подготовленный contacts-page setup удалён до применения. Единственный
  rehearsal завершился `ROLLBACK`; production Directus и ручные тексты
  черновика не менялись.

### Выкат управления городским футером (2026-08-22)

- Перед изменением Directus создан backup
  `/opt/isvoi/backups/directus/20260822T192134Z`; `postgres.sql.gz` и
  `uploads.tar.gz` прошли SHA-256. Offsite copy пропущен, поскольку
  `OFFSITE_BACKUP_DEST` не настроен.
- Release `c3b4e59` отправлен в `master` и применён на production. Directus
  получил 13 глобальных полей группы `Footer · контакты`, городское поле
  `footer_eyebrow` и новое название группы `Магазины, адреса и наличие`.
- Вторая footer-ссылка управляется полем `footer_store_label` с шаблоном
  `Магазин в {city}` и ведёт на `/{slug}`. Карта остаётся прямой внешней
  ссылкой. Черновик `Контакты` не публиковался и его ручные данные не менялись.
- После SQL удалены только 122 Redis-ключа `permissions:*`, Directus
  перезапущен и вернулся в `health=ok`; `FLUSHALL` не использовался. Protected
  site-content revalidation завершилась успешно.
- Advanced Editor получает поля `site_settings` через назначенную Editor
  policy, поэтому отдельные дублирующие строки permissions не создаются. Audit
  проверяет реальные строки Public Read + Editor read/update и сохраняет
  `non-admin wildcards = 0`.

### Фотография магазина в Белгороде (2026-08-23)

- Перед media mutation создан и проверен backup
  `/opt/isvoi/backups/directus/20260823T183124Z` с PostgreSQL и uploads.
- Предоставленный оригинал `Фото Белгород.png` преобразован в WebP без изменения
  композиции: `1679×937`, 304526 bytes. Production Directus File:
  `e842d842-e512-43c6-8bde-7190b5e3094f`, title
  `isvoi:site:belgorod:store-hero:2026-08-23`, папка `ISVOI Site Assets`.
- Новый file ID назначен `store_locations.hero_file` для `belgorod`, а также
  секциям `home.store_preview` и `store.store_location`. Focal point установлен
  в центр кадра `840×469`.
- Старый файл `95cbc9d4-532d-4c5c-9bba-e9492416c75f` после проверки нулевых
  ссылок удалён из `directus_files` и uploads; исходная версия остаётся в backup.
- Использован новый UUID, потому что Directus `format=auto` и Next Image держат
  трансформы по URL до 30 дней. Это исключает показ старого кадра без глобальной
  очистки кэшей.
- `import_site_assets.mjs` больше не управляет фотографией магазина из
  локального frontend asset. Каноническая точка редактирования:
  `Магазины, адреса и наличие` → `Магазины и города` → `Белгород` →
  `Страница города и SEO` → `Главная фотография`.

### Каноническая страница магазина и фото на `/belgorod` (2026-08-23)

- Публичным магазином является городской хаб `/belgorod`. Меню header/footer
  использует короткую подпись `Магазин` и управляемый custom URL `/belgorod`;
  воспроизводимые navigation setup/audit синхронизированы с этим решением.
- Legacy `site_pages.slug=store` переведён из `published` в `draft` безопасным
  content patch `2026-08-23-unpublish-legacy-store-page`. Перед применением
  создан backup `/opt/isvoi/backups/directus/20260823T192148Z`; optimistic lock
  и SQL rehearsal с `ROLLBACK` прошли. Все восемь секций сохранены без изменения
  текста.
- После отдельного rehearsal восемь legacy store-секций переведены в
  `is_active=false`. Перед этой мутацией создан и проверен backup
  `/opt/isvoi/backups/directus/20260823T192823Z`. Скрипт
  `directus:update:retire-legacy-store` проверяет draft-статус, точное число и
  фиксированные ID секций; production apply требует два явных флага.
- Middleware сохраняет постоянный redirect `/store` → `/belgorod`, а `store`
  удалён из статически генерируемых marketing params. Содержимое черновика
  можно переиспользовать позже, но для этого редактор должен осознанно включить
  только нужные секции и утвердить отдельный сценарий страницы.
- `store_locations.hero_file` теперь читается frontend вместе с остальными
  данными города и доставляется через Directus transform `width=1600`,
  `quality=84`, `format=auto`. На `/belgorod` фотография выводится отдельным
  адаптивным блоком перед локальным каталогом; локальный asset не используется.
- Каноническая точка редактирования `/belgorod`: `Магазины, адреса и наличие` →
  `Магазины и города` → `Белгород`. В группе `Страница города и SEO` доступны
  главная фотография, H1, описание, SEO title и meta description; поле фото
  видимо, не readonly и доступно Editor/Advanced Editor. Адрес, контакты,
  часы, карта и реквизиты остаются в соседних группах этой же записи.
- Release-код выложен коммитами `e79bb83` и `07be70c`. Production Next build и
  PM2 restart прошли; protected revalidation затронула store locations и
  product offers. Полный `directus:audit:prod`, copy smoke, functional smoke и
  desktop/mobile visual smoke прошли. Smoke подтверждает 301, один
  `CityStorePhoto`, восемь загруженных Directus images и порядок фото перед
  каталогом.

### Редактирование городской страницы в Directus (2026-08-23)

- Страница `/belgorod` остаётся привязана к записи `store_locations.slug=belgorod`.
  Канонический путь в Studio: `Магазины, адреса и наличие` → `Магазины и города`
  → `Белгород` → `Страница города и SEO`.
- Внутри `Страница города и SEO` добавлены четыре вложенные группы: `Первый
экран`, `Карточка контактов`, `Каталог города` и `SEO`. Редактор управляет
  eyebrow, текстами, подписями кнопок и пустым состоянием каталога; все новые
  поля имеют русские названия и подсказки, видимы и не readonly.
- URL кнопок намеренно не являются свободными текстовыми полями: каталог
  строится как `/{slug}/catalog`, карточка контактов использует якорь на этой же
  странице, а телефон, Telegram и карта берутся из структурированных контактов
  магазина. Это исключает битые и межгородские ссылки. В текстах разрешён токен
  `{city}`, который заменяется названием города текущей записи.
- Идемпотентный setup: `npm run directus:setup:city-page-copy`; production apply
  дополнительно требует `--apply --confirm-city-page-copy`. Audit `multicity`
  проверяет 17 полей, четыре Studio-группы, полноту опубликованных городов и
  точечные права Public Read, Editor и Advanced Editor.
- Release `3c54bd8` отправлен в `master` и применён на production. Перед SQL
  создан и проверен backup `/opt/isvoi/backups/directus/20260823T194619Z`;
  rehearsal прошёл с `ROLLBACK`, затем migration завершилась `COMMIT`.
  Точечно удалены 135 Redis-ключей `permissions:*`, Directus вернулся в
  `health=ok`, выполнена protected revalidation.
- Production Next build и PM2 restart прошли. Полный `directus:audit:prod`,
  functional smoke и copy smoke для `/store,/belgorod` зелёные; `/store`
  сохраняет постоянный redirect на канонический `/belgorod`.

### Терминология товарных карточек (2026-08-23)

- Для публичных карточек техники с пробегом используется формула из брендовой
  терминологии: `С пробегом · Проверено`. Формулировка `Б/у · проверено` в этом
  UI больше не используется; буквальное `б/у` остаётся допустимым только в FAQ
  и поясняющем тексте, где нужна предметная ясность.
- Локальный статус наличия строится в формате `{city} · В наличии`; пустое
  состояние симметрично показывает `{city} · Нет в наличии`. Центральная точка
  используется как фирменный разделитель, а название города приходит из
  `store_locations`, без хардкода Белгорода.
- Release `40b26e5` применён на production. Build и smoke `/catalog,/belgorod`
  прошли; production HTML содержит новые подписи и не содержит старую формулу.

### Городские фильтры и единая подстановка города (2026-08-23)

- Сетевой `/catalog` сохраняет фильтр `Наличие`. В `/{city}/catalog` тот же
  сценарий называется `Получение · {city}` и явно разделяет `{city} · В
наличии`, локальную бронь, `Доставка из другого города` и отсутствие
  предложения. Межгородская доставка допустима только для offer со статусом
  `available`; забронированный экземпляр другой точки не предлагается к
  доставке.
- В карточках и товарной панели отображается человекочитаемое
  `store_locations.city`; технический slug используется только в URL. При
  выбранном городе и отсутствии исполнимого offer показывается `{city} · Нет в
наличии`, а не сетевой fallback. Условие техники унифицировано как `С
пробегом · Проверено`; каталог, metadata и воспроизводимые setup-скрипты не
  используют `б/у` как публичное название состояния.
- `{city}` заменяется единым helper во всех редакторских текстовых полях
  `store_locations`: SEO, hero, contact labels/fallbacks, catalog copy и CTA.
  Городской `/catalog` читает eyebrow, H1, пояснение и empty state из записи
  города в Directus. Функциональные названия фильтров остаются системными,
  чтобы редактор не мог нарушить семантику статусов.
- Production Directus очищен двумя guarded content patches. Patch
  `2026-08-23-neutral-footer-brand-copy` сделал глобальный брендовый текст
  футера городонезависимым и заменил `б/у` на `техника с пробегом`; backup:
  `/opt/isvoi/backups/directus/20260823T204626Z`. Patch
  `2026-08-23-city-safe-belgorod-copy` заменил небезопасное `Сейчас в {city}`
  на `I СВОИ · {city}` и убрал жёсткие падежные конструкции из hero/catalog;
  backup: `/opt/isvoi/backups/directus/20260823T204744Z`. Оба patch прошли
  optimistic lock, rehearsal с `ROLLBACK`, post-apply verification и protected
  revalidation; другие ручные тексты не менялись.
- Финальный multicity audit обнаружил одно ранее незаполненное обязательное
  поле `hero_secondary_cta_label`. Оно добавлено отдельным guarded patch
  `2026-08-23-belgorod-secondary-cta` со значением `Адрес и контакты`; backup:
  `/opt/isvoi/backups/directus/20260823T205340Z`, commit `0e957b0`. После apply
  `directus:audit-multicity` полностью зелёный, включая полноту city-page copy,
  права, offers, revalidation и отсутствие старого города.
- Позднее дублирующая secondary CTA городского hero была осознанно убрана
  редактором. Поле остаётся доступным, но необязательным: при пустом значении
  кнопка не выводится. `directus:audit-multicity` синхронизирован с этим
  контрактом и продолжает требовать primary CTA и весь контактный copy.
- Код выложен коммитами `adaac87`, `df9aa41`, `cfa477e`; guarded content
  patches — `c1e60a6`. Production checkout синхронизирован с `c1e60a6`, PM2
  online. Functional smoke прошёл для сетевого каталога, городских tech и
  accessories, `condition=used`, `stock=available` и пустого
  `stock=delivery`; copy и desktop/mobile visual smoke зелёные. Smoke теперь
  падает при видимом `{city}`, retired city, техническом slug, `б/у` в
  каталоге, небезопасном `Сейчас в {city}` и при отсутствии явного empty state.

### Passport v2: факты, грейды и границы достоверности (2026-08-24)

- Страница `/passport` пересобрана по утверждённой текстовке из файла
  `I СВОИ Passport — новая текстовка.md`. Публичный fallback хранится в
  `apps/web/data/marketing-pages.json`; production-контент остаётся канонически
  редактируемым в `site_pages`, `page_sections` и `faq_items` Directus.
- Зафиксирован порядок 11 секций: hero, три принципа, шесть блоков Passport,
  грейды, ключевой смысл, живой пример, процесс, границы достоверности, Trade,
  FAQ и финальный CTA. Новые секции создаются setup-скриптом только при
  отсутствии строк; повторный запуск не перезаписывает редакторские изменения.
- Для грейдов выбран утверждённый заголовок «Что говорит грейд — и чего он не
  говорит». Грейд описывает внешний вид и визуально отделён от батареи и
  диагностики. В публичном блоке сохранены шкала A/A−/B/C, два контрпримера и
  формула `Грейд оценивает внешний вид. Он не заменяет диагностику.`
- Живой пример не хранит вымышленный товар: renderer берёт доступный экземпляр
  из каталога и подставляет его реальные цену, состояние и ссылки. Текстовая
  рамка примера управляется секцией `passport_live_example`.
- Существующие production-строки меняются только guarded content patches с
  optimistic lock. Пять новых секций и два отсутствующих FAQ добавляет
  идемпотентный `directus:setup:passport-v2`; все дальнейшие тексты редактор
  меняет в Studio без повторного запуска seed/setup.
- `directus:audit-passport-page` проверяет наличие и порядок секций, контракт
  грейдов, семь FAQ, терминологию `с пробегом` и рабочий якорь процесса. Audit
  включён в `directus:audit:prod`; общий page-sections contract разрешает
  управляемые hero highlights.
- Для существующей production-страницы применены 12 guarded content patches;
  перед добавлением новых секций создан backup
  `/opt/isvoi/backups/directus/20260824T130400Z`, последний patch-backup —
  `/opt/isvoi/backups/directus/20260824T131849Z`. Optimistic locks, SQL
  rehearsal с `ROLLBACK`, post-apply verification и protected revalidation
  прошли.
- Проверка content patches сравнивает JSON структурно через
  `isDeepStrictEqual`, а не через порядок ключей в `JSON.stringify`: PostgreSQL
  JSONB вправе менять порядок ключей без изменения данных. Исправление
  зафиксировано коммитом `cb6fea5` и покрыто тестом.
- Для `live.example` подписи CTA хранятся в секции, а URL намеренно формируется
  renderer из реально выбранного товара. Поэтому page-sections audit допускает
  label без сохранённого URL только для этого variant; для остальных секций
  прежний guardrail сохраняется.
- Release интерфейса и Directus-модели — `561c94a`. Production visual smoke
  desktop/mobile, functional smoke `/passport`, copy smoke, image smoke,
  `directus:audit-passport-page`, `directus:audit-page-sections`, полный
  `directus:audit:prod`, API policy, ops audit и content ownership прошли.
  Анонимный API остаётся fail-closed; Directus, Redis и PostgreSQL healthy.
- В editorial split-блоках Passport eyebrow занимает отдельную строку над
  двухколоночной сеткой. Заголовок слева и первый абзац справа начинаются на
  одной горизонтали; hero и мобильная последовательность этим правилом не
  затрагиваются.

### Trade v2: подготовка к безопасному rollout (2026-08-24)

- Страница `/trade` пересобрана по предоставленному файлу `## 1. Первый
экран.md`. Канонический fallback хранится в
  `apps/web/data/marketing-pages.json`; публичный production-контент после
  rollout остаётся в `site_pages` и шести `page_sections` Directus.
- Сохранён порядок: hero, три сценария, живой пример обновления, четыре шага,
  сравнение, форма предварительной оценки. Седьмой финальный блок использует
  существующие управляемые `closing_*` поля секции `final_cta`, поэтому второй
  lead workflow и новая коллекция не создаются.
- Специализированный `TradePageSection` использует реальные данные и фото
  доступного товара для цели обновления. Утверждённый ориентир `до 42 000 ₽`
  показывается только как предварительная оценка рядом с явным дисклеймером;
  при недоступном каталоге секция не исчезает, а показывает управляемый empty
  state и переход в каталог.
- Подготовлены семь guarded content patches: SEO-запись страницы и шесть
  существующих секций. Для всех captured production locks актуальны на момент
  подготовки; SQL rehearsal с `ROLLBACK` прошёл. Apply разрешён только после
  commit/push и production backup, чтобы не перезаписать более новые ручные
  изменения Studio.
- `directus:audit-trade-page` читает канонический JSON и проверяет точное
  структурное совпадение copy, порядок, CTA, сценарии, live example, steps,
  comparison, форму и closing. Дополнительно audit фиксирует редакторский путь:
  сохранённое представление `Trade`, доступ Editor к обычным полям секций,
  доступ Advanced Editor к `JSON-настройкам блока` и корректную metadata поля
  `content`. Он включён в `directus:audit:prod` и ожидаемо остаётся красным до
  применения patches.
- Канонический путь в Studio: `Сайт и контент` → `Страницы` → `Trade` →
  связанные блоки. Editor редактирует eyebrow, заголовок, WYSIWYG-текст, CTA,
  порядок, видимость и завершающий бренд-блок. Массивы трёх сценариев, живого
  примера, четырёх шагов, таблицы сравнения и параметры формы находятся в
  `Расширенные настройки` → `JSON-настройки блока` и намеренно доступны только
  Advanced Editor/Admin. Это сохраняет защиту структуры без хардкода copy в
  React.
- Локальный QA выполнялся с временной подстановкой fallback и реальными
  chrome-данными; временный переключатель удалён. Desktop/mobile visual smoke,
  Next build, typecheck, ESLint, Tailwind/content ownership audits и bundle
  budget прошли. До отдельного rollout production-контент не изменялся.
- Production rollout выполнен из `867dce9`. Семь guarded patches применились
  без snapshot-конфликтов; для каждой записи создан и проверен отдельный backup
  от `/opt/isvoi/backups/directus/20260824T151433Z` до
  `/opt/isvoi/backups/directus/20260824T152142Z`. Ни одна сторонняя Studio-правка
  не была перезаписана.
- Общий page-sections contract дополнен редакторским ключом `disclaimer`,
  используемым для явного предупреждения о предварительной Trade-оценке. После
  rollout прошли `directus:audit-trade-page`, `directus:audit-studio`,
  `directus:audit-page-sections`, API policy, ops audit, functional smoke и
  desktop/mobile visual smoke `/trade`.

### Trade-in: продуктовая база онлайн-оценщика (2026-08-29)

- Для следующей версии `/trade` принят online-first сценарий: пользователь
  получает предварительный диапазон до контакта, затем выбирает продажу,
  комиссию или обмен. Финальная сумма подтверждается диагностикой.
- Автоматический MVP ограничен смартфонами Apple и пятью пилотными моделями:
  iPhone 13 Pro, iPhone 14 Pro, iPhone 14 Pro Max, iPhone 16 Pro и iPhone 16
  Pro Max. Все остальные устройства переходят в ручную оценку без фиктивного
  диапазона.
- Бизнес-владелец pricing — роль Trade Desk Manager; публиковать versioned
  матрицу может `ISVOI Advanced Editor` или Administrator. Разработка владеет
  формулой и аудитом, но не назначает цены.
- Предварительный quote действует 7 календарных дней. Комиссия в MVP остаётся
  консультационным lead без автоматического fee/net/timeline.
- Upgrade использует только опубликованные, готовые и доступные
  `product_offers`. Диапазон доплаты вычисляется от обеих границ quote;
  отрицательная доплата публично не показывается.
- MVP принимает пожелание по дню и периоду визита, но не создаёт подтверждённый
  календарный слот. Системой учёта остаются `leads` и Directus Studio; клиенту
  отвечают вручную по выбранному телефону или Telegram. Автоматические
  Telegram/SMS и личный кабинет остаются вне MVP.
- Полная аргументация, формулы, launch inputs и последствия для UX/UI:
  `docs/trade-in-product-decisions.md`. Сборочный сценарий и API-направление:
  `docs/trade-in-build-spec.md`. Матрица 11 mobile-first макетов и связи
  прототипа: `docs/trade-in-figma-screen-matrix.md`.

### Inventory, Catalog UX и staged Catalog V3 (2026-08-24)

- Перед изменениями Directus создан и проверен локальный VPS backup
  `/opt/isvoi/backups/directus/20260824T165555Z`: checksum для
  `postgres.sql.gz` и `uploads.tar.gz` совпадает. Offsite upload по-прежнему
  отложен и в этом rollout не выполнялся.
- Studio UX v4 разделяет рабочий контур на `Склад и сверка`, `Карточки сайта`
  и `Avito и экономика`. Миграция меняет только группировку и inventory/Avito
  presets, сохраняя product presets Studio UX v3. Rehearsal с `ROLLBACK`, apply
  и `directus:audit-studio` прошли.
- Последний snapshot `store-snapshot-2026-08-18` повторно обработан: 82 строки,
  358 единиц, 14 blocker и 20 warning. Apply обновил 82 inventory items и 95
  строк текущего поступления; исчезнувших или деактивированных позиций нет.
  Старые партии архивированы, их открытые issues закрыты как исторические.
- `products_synced = 0` намеренно: ни одна складская строка ещё не получила
  ручной статус eligible. Открыты 14 blocker, 13 неподтверждённых Avito category
  mappings и 2 неподтверждённых cost profiles. Эти gates нельзя обходить
  автоматической публикацией.
- Публичный каталог больше не показывает фиксированную подпись `24 товара на
странице`. Счётчик строится по фактической выдаче; категории, бренды и типы с
  нулевым публичным остатком скрываются. Категории legacy-карточек нормализуются
  к таксономии Directus: `Смартфоны`, `Планшеты`, `Ноутбуки`.
- Catalog V3 считается запущенным только после появления хотя бы одного
  `published + ready` товара с положительным видимым остатком. До этого сайт
  сохраняет проверенный legacy fallback: production `/catalog` показывает 4
  карточки и `Найдено: 4`, а не пустой V3-result. После Studio QA и публикации
  первой согласованной V3-партии fallback отключится автоматически.
- Для скрытого Club-пилота синхронизирован жизненный цикл: footer-link зависит
  от published-статуса страницы, 5 секций draft-страницы неактивны, 4 оффера с
  draft-товарами переведены в `paused`. Контент и связи сохранены.
- Полный `directus:audit:prod`, functional/image/visual/performance/copy smoke
  прошли. Каталог проверен на desktop/mobile: 4 карточки, категории 2/1/1;
  LCP `/catalog` — 268 мс desktop и 328 мс mobile. После фактического запуска
  V3 release gates дополнительно включаются через
  `SMOKE_REQUIRE_BLOG_RELATED_DEVICE=1` и `SMOKE_REQUIRE_PRODUCT_OFFERS=1`.

### Catalog V3 cutover без legacy-прототипов (2026-08-24)

- Решение об автоматическом переключении источника отменено после production
  ревизии. Сайт теперь использует только явно выбранный server-side режим
  `CATALOG_SOURCE=legacy|v3`; список, фасеты, карточка товара и sitemap не могут
  независимо переключиться на другой источник. В production установлен
  `CATALOG_SOURCE=v3`, возврата к `devices` при пустой выдаче нет.
- История `directus_revisions` подтвердила, что `iphone-13-pro`, `iphone-14`,
  `macbook-air-m1` и `ipad-air` были созданы как «иллюстративные карточки
  прототипа». У них нет подтверждённых строк текущего склада, даты и исполнителя
  диагностики. Даты поступления и время редакторского изменения не считаются
  датой диагностики; фиктивные значения не вносились.
- Перед изменением создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260824T180442Z`. Offsite copy остаётся
  отложенной: backup-скрипт явно сообщил, что `OFFSITE_BACKUP_DEST` не задан.
- Транзакционной миграцией архивированы четыре legacy `devices`, четыре
  соответствующих `products`, четыре `product_offers`, четыре `club_offers` и
  по 20 связанных строк изображений в каждом медиаконтуре. Product stock
  установлен в `0/hidden`, content status — `review`; данные и связи сохранены
  для истории и не удалены.
- Catalog V3 audit теперь блокирует опубликованный товар без подтверждённой
  eligible-строки `inventory_items`, used-товар без даты или исполнителя
  диагностики, publish-ready draft с неполным контрактом, смешанную видимость
  legacy/V3 и опубликованный offer для неопубликованного товара.
- Публичный `/catalog` намеренно показывает `Найдено: 0` и управляемый empty
  state. Это корректнее, чем показывать draft-прототипы как товары в наличии.
  Smoke поддерживает явные release-ожидания
  `SMOKE_EXPECT_CATALOG_SOURCE=v3` и `SMOKE_EXPECT_EMPTY_CATALOG=1`.
- Release — `56273d8`. Production build, PM2 restart, Directus restart, полный
  `directus:audit:prod` и Playwright smoke прошли; переходные Catalog V3
  метрики равны нулю, `/` и `/catalog` отвечают `200`, Directus health — `ok`.
- Следующая публикационная партия должна строиться из фактического inventory:
  закрыть соответствующие blocker/issues, подтвердить authenticity и
  eligibility, связать `inventory_items.product`, добавить реальные фото и
  диагностику, затем опубликовать product и store offer одной проверяемой
  операцией. Только после появления реальной карточки включаются строгие gates
  `SMOKE_REQUIRE_PRODUCT_OFFERS=1` и blog-to-product relation.

### Склад: рабочий разбор блокеров в Studio (2026-08-24)

- Причиной визуально неактивных полей были `readonly=true` у родительских
  group-alias полей `inventory_items` и `inventory_import_issues`. Directus
  распространяет readonly-состояние группы на её дочерние поля. Общая Studio
  UX migration теперь исключает group aliases из массовой установки readonly,
  а отдельные Studio и inventory audits блокируют повторение дефекта.
- Поля snapshot остаются защищёнными: остаток, закупка и розница, идентификаторы,
  наименование, группа, штрих-код, автоматически рассчитанные статусы и текст
  проблемы исправляются в учётной системе или следующим импортом. Inventory
  Manager может менять только `authenticity_status`, `eligibility_status`,
  `review_override`, `review_note`, а в проблемах импорта — `resolved` и
  `resolution_note`.
- В `inventory_import_issues` добавлена read-only связь `inventory_item`.
  Миграция связала 85 исторических inventory issues с товарными строками;
  активных несвязанных inventory issues после apply — `0`. Presets открытых
  блокеров и предупреждений теперь начинают таблицу со связанного товара.
- Все 33 физические колонки `inventory_items` имеют Studio metadata, русские
  подписи, заметки и логическую группировку. На момент выпуска в production
  остаются 82 складские строки, 14 открытых блокеров, 13 неподтверждённых Avito
  category mappings и 2 неподтверждённых cost profiles; товарные решения и
  статусы этим rollout не менялись.
- Перед миграцией создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260824T182318Z`; checksum PostgreSQL и uploads
  прошёл. Offsite copy пропущена, потому что `OFFSITE_BACKUP_DEST` не задан.
  SQL rehearsal с `ROLLBACK` и production apply прошли, после чего был
  перезапущен только Directus для обновления metadata cache.
- Реальный API rehearsal временной identity роли `ISVOI Inventory Manager`
  подтвердил: operator notes редактируются, `quantity` и сгенерированный
  `message` отклоняются политикой, тестовые значения восстановлены. Временный
  пользователь удалён, его static token после cleanup вернул отказ.
- Release включает `c9b53b8` и `92f6849`. Второй commit устраняет ложное
  падение API-policy audit на корректно пустых `device_passports` и
  `trade_options` после Catalog V3 cutover; присутствующие записи по-прежнему
  проверяются на обязательные связи. `web:verify`, 20 inventory pipeline tests,
  полный `directus:audit:prod` и Playwright smoke прошли. До первой реальной
  публикации smoke запускается с `SMOKE_EXPECT_CATALOG_SOURCE=v3` и
  `SMOKE_EXPECT_EMPTY_CATALOG=1`.

### Catalog V3 и lifecycle складских проблем (2026-08-24)

- `Карточки сайта` — единственная редакторская точка входа Catalog V3;
  `Страницы сайта -> catalog` управляет только оболочкой и SEO. Для
  `device_passports.summary_rows` и `diagnostics_checklist` настроены
  структурированные Repeaters. Used-товар нельзя опубликовать без даты и
  исполнителя диагностики, грейда, кратких фактов и чек-листа; изменение или
  удаление Passport у уже опубликованного used-товара также блокируется.
- Все родительские группы Catalog V3 остаются интерактивными. Системные ID,
  import-поля и timestamps дочерних сущностей защищены от записи Editor, а
  точная совместимость аксессуаров доступна ему через
  `product_compatible_models`. Отдельные audit-метрики контролируют metadata,
  readonly-группы, Repeater contract, права и оба publication guard.
- Для `inventory_import_issues` добавлено представление
  `4 · Решённые проблемы`. При `resolved=true` поле `resolution_note`
  обязательно в Studio и проверяется PostgreSQL trigger; закрытие проблемы не
  меняет автоматически authenticity, eligibility или связь с карточкой сайта.
  Единственная проблема, ранее закрытая без пояснения, безопасно возвращена в
  открытые. В production снова 14 открытых блокеров и `0` закрытых без заметки.
- Повторный apply той же партии больше не удаляет документированные решения:
  они сохраняются по ключу `source_kind + code + source_id + row_number`,
  совпавшая issue обновляется без потери решения, а закрытая историческая issue
  не удаляется. Санитизированный suite расширен до 21 теста.
- Перед production-схемой создан и проверен backup
  `/opt/isvoi/backups/directus/20260824T190407Z`; checksum PostgreSQL и uploads
  прошёл. Offsite copy пропущена, поскольку `OFFSITE_BACKUP_DEST` не задан.
  Обе миграции прошли SQL rehearsal с `ROLLBACK`, затем production apply.
- Exact-role API rehearsal временных `ISVOI Editor` и
  `ISVOI Inventory Manager` подтвердил структурированное редактирование и
  восстановление Passport, запрет публикации обычным Editor, защиту source
  fields, запрет недокументированного закрытия и сохранение корректного
  решения. Тестовые значения восстановлены, обе identities удалены, оба
  static token после cleanup вернули `401`.
- Release включает `10e10c5`, `a49cedb` и `afbdf10`. Локальный и production
  `web:verify`, полный `directus:audit:prod`, PM2 restart, Directus health и
  Playwright smoke с `SMOKE_EXPECT_CATALOG_SOURCE=v3` и
  `SMOKE_EXPECT_EMPTY_CATALOG=1` прошли.

### Administrator: права и общие представления Studio (2026-08-24)

- Роль и policy `Administrator` сохраняют `app_access=true`,
  `admin_access=true` и обязательную TFA. Отдельные CRUD permissions для
  бизнес-коллекций администратору не создаются: полный доступ предоставляет
  admin policy, а audit проверяет её связь с ролью.
- Administrator получает общие role presets из `ISVOI Editor`,
  `ISVOI Advanced Editor`, `ISVOI Importer` и `ISVOI Inventory Manager`.
  Миграция зеркалирует 93 уникальных представления по ключу
  `collection + bookmark`, разрешает совпадения приоритетом более сильной
  операторской роли и не изменяет персональные bookmarks пользователей.
- В частности, в `Склад и сверка -> Проблемы сверки` администратору доступно
  представление `4 · Решённые проблемы`. Studio и inventory audits теперь
  блокируют потерю admin policy, пропуск общего представления и дублирование
  admin bookmarks.
- Перед apply создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260824T193136Z`; checksum PostgreSQL и uploads
  прошёл. Offsite copy пропущена, поскольку `OFFSITE_BACKUP_DEST` не задан.
  SQL rehearsal с `ROLLBACK` и production apply прошли без ошибок.
- Release `659cdc9` применён в `/opt/isvoi`. После перезапуска Directus полный
  `directus:audit:prod` прошёл: `studio.admin.access_missing=0`,
  `studio.admin.bookmarks_missing=0`,
  `studio.admin.bookmarks_duplicates=0` и
  `inventory.studio.resolved_preset_missing=0`; Directus health — `ok`.

### Passport: факты состояния и истории в Studio (2026-08-24)

- `device_passports.condition_notes` и `story_facts` хранили корректные
  массивы строк, но Studio metadata использовала пустой `list` без описания
  дочерних полей. Из-за этого существующие значения выглядели как неактивные
  пустые блоки.
- Оба поля переведены на нативный для `string[]` интерфейс `tags` с
  `cast-json`. Каждый факт вводится отдельным пунктом и подтверждается Enter;
  факты состояния должны быть наблюдаемыми, а факты истории — подтверждёнными
  и без персональных данных. Содержимое существующих паспортов не менялось.
- Canonical structured-data setup и Catalog Editor UX защищены от возврата к
  пустому `list`. Catalog V3 audit отдельно проверяет metadata обоих полей и
  валидность сохранённых массивов строк.
- Перед apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260824T194503Z`; checksum PostgreSQL и uploads
  прошёл. Offsite copy пропущена, поскольку `OFFSITE_BACKUP_DEST` не задан.
- Release `3a480a7` применён в `/opt/isvoi`. Exact-role rehearsal временной
  identity `ISVOI Editor` подтвердил редактирование и восстановление обоих
  списков, а также сохранение запрета публикации. Identity удалена, token после
  cleanup вернул `401`.
- После перезапуска Directus полный `directus:audit:prod` прошёл;
  `catalog_v3.studio.passport_string_lists_invalid=0` и
  `catalog_v3.data.passport_string_lists_invalid=0`, Directus health — `ok`.

### Marketing live examples на Catalog V3 (2026-08-24)

- `passport_live_example`, `trade_live_example`, `club_live_example` и
  curated-подборка Store больше не читают legacy `devices`. Маркетинговые
  страницы получают строгую выборку непосредственно из Catalog V3 `products`:
  `published + ready`, положительный остаток и не скрытый stock status.
- Для live example допускается только техника со статусом `available` или
  `reserved`; аксессуары, проданные, скрытые и нулевые позиции исключаются.
  При отсутствии подходящей опубликованной техники секция целиком скрывается
  без вымышленного товара и пустой рамки. После публикации первой подходящей
  V3-карточки пример появится автоматически на следующей актуализации страницы.
- Специализированная Club-страница теперь также рендерит управляемую Directus
  секцию `club_live_example`. Товарные свойства и ссылки используют контракт
  `ProductCardData` и маршрут `/product/<id>`; Store использует V3
  `ProductCard`, а не legacy `DeviceCard`.
- В `web:verify` добавлен регрессионный тест выбора маркетингового примера. Он
  проверяет исключение аксессуаров, hidden/sold и нулевого остатка, приоритет
  доступной техники и отсутствие `DeviceCardData`/`getPublishedDeviceCards` в
  затронутом marketing flow.
- Visual smoke учитывает источник каталога: при
  `SMOKE_EXPECT_CATALOG_SOURCE=v3` detail-page задаётся через
  `SMOKE_PRODUCT_PATH`, а при `SMOKE_EXPECT_EMPTY_CATALOG=1` не проверяется
  удалённый legacy route `/device/iphone-13-pro`.
- Перед deploy создан и проверен backup
  `/opt/isvoi/backups/directus/20260824T201134Z`; checksum PostgreSQL и uploads
  прошёл. Offsite copy пропущена, поскольку `OFFSITE_BACKUP_DEST` не задан.
- Release включает `3a3d9d8` и `1d7aceb`. Локальные lint, typecheck, build,
  content ownership, regression test и bundle budget прошли. Production build,
  PM2 restart, основной и visual Playwright smoke, `directus:audit-catalog-v3`
  и Directus health прошли; `/trade`, `/passport` и `/club` возвращают `200`,
  live example при текущем пустом V3-каталоге отсутствует.
- Следующий товарный шаг не требует frontend-изменений: закрыть inventory
  blockers для первой реальной техники, заполнить фото и Passport, затем
  опубликовать product и offer по действующему Catalog V3 workflow.

### Inventory snapshot 2026-08-26 и правило состояния (2026-08-27)

- Канонические источники обновления: полная выгрузка Evotor
  `20260731-D256-404B-8066-88053F217AAA-20260826-1821.xlsx` и книга
  поступлений `Поступление товара.xlsx` из `Передано в магазин`. Их SHA-256:
  `D1E219B776A004D2177412409FB87BDB325917CF488CF5477A7AFF201365107A` и
  `2C552A80B5C93A2566DA6405F8BD8F7641C7AA4B80DF51EEA1A5F97E237A433D`.
- Актуальная рабочая книга сохранена как
  `outputs/inventory-unit-economics-2026-08-11/ISVOI_unit_economics_2026-08-26.xlsx`.
  Текущий snapshot содержит 89 SKU / 360 единиц, себестоимость остатка
  2 180 298 руб., плановую выручку 2 751 600 руб. и валовую прибыль
  571 302 руб. Поступления содержат 95 строк / 394 единицы; 81 строка связана
  с текущим остатком, 3 строки относятся к ЦО, 15 выбыли до загрузки и одна
  требует ручной сверки движения. Формульная проверка и визуальный просмотр
  всех шести листов прошли, ошибок формул нет.
- Состояние Catalog V3 определяется структурой Evotor, а не наличием serial:
  `Группа = Телефоны` и `Структура групп = Телефоны` означают `used`;
  `Группа = Смартфоны` и ветка
  `Товары на продажу \\ Смартфоны` означают `new`. В production это даёт
  32 used SKU / 31 единицу и 4 new SKU / 30 единиц соответственно; ошибок
  классификации в текущем snapshot нет.
- Перед production import создан и проверен backup
  `/opt/isvoi/backups/directus/20260827T054232Z`; checksum PostgreSQL и uploads
  совпал. Offsite copy не выполнялась, поскольку offsite backup и restore
  rehearsal остаются отложенными.
- В Directus применена партия `store-snapshot-2026-08-26-final`, id
  `95054c73-55a8-4c8b-bd0b-72b569111fb0`: статус `applied_with_blocks`, запуск
  `success`, 89 строк / 360 единиц, 95 строк поступлений, 15 открытых blocker и
  23 warning. `products_synced = 0`: склад обновлён только в приватном staging,
  публикация карточек сайта и передача в Avito не выполнялись.
- Один SKU, исчезнувший из нового snapshot, сохранён активным до отдельного
  подтверждения `confirm_missing_deactivation`; общий inventory поэтому
  содержит 90 строк, хотя последняя партия содержит 89. Исторические строки
  поступлений и issues также не удаляются.
- iPhone 14 Pro Max 256 ГБ White Titanium с кодом `т38` и штрих-кодом
  `2000000001388` остаётся `blocked`: serial с окончанием `42VW` связан с Gold
  в поступлении и White Titanium в текущем остатке. До ручного решения
  identity blocker, подтверждения Passport/диагностики и фото product не
  создаётся.
- Импорт исправлен коммитами `2591061`, `1458182` и `f30a72a`: принимается
  кириллическое имя книги поступления, condition берётся из группы/структуры,
  а `missing_from_snapshot` связывается с сохранённой складской строкой.
  Коммит `cbc2277` ограничивает lead relation audit только товарными страницами
  и не требует искусственной связи для свободного запроса подбора.
- После повторного применения базовой inventory-схемы восстановлены metadata в
  порядке Studio UX v3, Catalog/Inventory UX v4, Inventory Workflow v5,
  Issue Lifecycle v6, Administrator Parity v7, Catalog Editor UX v6 и Passport
  Facts v7. Permission cache очищен, Directus перезапущен. Полный
  `directus:audit:prod` прошёл, включая admin bookmarks, решённые проблемы,
  доступность operator groups и Passport facts. Production smoke прошёл с
  `SMOKE_EXPECT_CATALOG_SOURCE=v3` и `SMOKE_EXPECT_EMPTY_CATALOG=1`; публичный
  каталог остаётся намеренно пустым до первой подтверждённой карточки.
- Следующий товарный шаг: разобрать 15 blockers, начиная с serial/color
  конфликта `т38`; затем выставить операторские authenticity/eligibility,
  связать inventory item с draft product, заполнить реальные фото, Passport и
  диагностику и только после QA публиковать product вместе с store offer.

### Ручная коррекция т19 и т38 (2026-08-27)

- Оператор подтвердил две ошибки учётного snapshot: позиция с артикулом `т19`
  была случайно удалена из кассы, а фактический цвет `т38` — Gold; у iPhone 14
  он подтверждён по цвету боковин. Исходная выгрузка Evotor 2026-08-26 не
  перезаписывалась.
- Создан отдельный исправленный snapshot
  `outputs/inventory-unit-economics-2026-08-11/store-snapshot-2026-08-27-corrected.xlsx`
  с SHA-256
  `537B5A85E0ED837F3CF28E38FD6D7408BCB3118072654F0618CEF69074107C67`.
  `т19` восстановлен с прежними UUID, кодом `т129454574`, штрих-кодом
  `2000000001197`, остатком 1 и прежними ценами; `т38` переименован в iPhone 14
  Pro Max 256 ГБ Gold без изменения UUID, штрих-кода и serial.
- Каноническая книга пересчитана как
  `outputs/inventory-unit-economics-2026-08-11/ISVOI_unit_economics_2026-08-27.xlsx`;
  её SHA-256 —
  `BF6F9E5D3222C730F3AC110028877438EB7290A56526843938530E9833C3594E`.
  Итог: 90 SKU / 361 единица, себестоимость 2 234 398 руб., плановая выручка
  2 813 700 руб., валовая прибыль 579 302 руб. С поступлениями связано 82 из
  95 строк, 14 строк выбыли до загрузки. Формулы и все шесть листов проверены;
  дубликатов UUID, кодов, штрих-кодов и serial нет.
- Перед production apply создан и проверен backup
  `/opt/isvoi/backups/directus/20260827T115040Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущена, поскольку `OFFSITE_BACKUP_DEST` не задан.
- В Directus применена партия `store-snapshot-2026-08-27-corrected`, id
  `5f0904cb-5c22-45f1-9bf2-43e8e42c2dfa`: 90 строк / 361 единица, 95 строк
  поступлений, 14 blocker и 21 warning, `missing_items=0`,
  `products_synced=0`. Предыдущая партия архивирована штатным pipeline.
- После apply `т19` и `т38` имеют `identity_status=matched`,
  `authenticity_status=pending`, `eligibility_status=pending`; открытых issues
  по обеим позициям нет. Serial в документации и отчётах показывается только
  маской с последними четырьмя символами.
- Pipeline больше не сохраняет недокументированный stale `blocked`, если
  автоматическая причина устранена: такая строка возвращается в `pending`.
  Ручной `blocked` с заполненной `review_note` сохраняется. Изменение покрыто
  25 тестами и выпущено коммитом `28e29af`.
- Полный `directus:audit:prod` и production smoke с
  `SMOKE_EXPECT_CATALOG_SOURCE=v3`, `SMOKE_EXPECT_EMPTY_CATALOG=1` прошли.
  Коррекция не публикует товары на сайте и не активирует Avito: следующий шаг
  для `т19` и `т38` — ручная проверка подлинности, Passport, диагностика и фото,
  после чего Inventory Manager отдельно переводит выбранную позицию в
  `eligible` и связывает её с draft product.

### Catalog V3: восемь iPhone, Passport и характеристики моделей (2026-08-27)

- Перед изменением production создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260827T124218Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy не выполнялась: offsite backup и restore rehearsal
  остаются отложенными по операционному решению.
- В Directus добавлены `device_diagnostic_reports` и
  `device_model_specifications`. Оригиналы диагностических сертификатов
  хранятся в закрытой папке `ISVOI Passport Originals`, а карточка сайта
  получает только обезличенную копию из `ISVOI Passport Public`. В публичной
  копии отсутствуют полный IMEI, полный serial, идентификаторы компонентов,
  номер стирания и QR-код; наружу выводятся только последние четыре цифры IMEI
  и пять символов serial. Public и Editor не имеют доступа к оригиналам.
- Для `iphone-14-pro`, `iphone-14-pro-max`, `iphone-16-pro` и
  `iphone-16-pro-max` заведено 28 нормализованных характеристик: экран, чип,
  камеры, разъём и зарядка, интерфейсы, IP-рейтинг, размеры и вес. Источник —
  официальные спецификации Apple:
  `support.apple.com/en-mide/111849`, `support.apple.com/en-us/111846`,
  `support.apple.com/en-us/121031`, `support.apple.com/en-us/121032`; дата
  сверки — 2026-08-27. Региональные SIM-возможности не показываются без
  подтверждённого model identifier. IP68 подписан как заводская характеристика
  модели, а не гарантия влагозащиты конкретного устройства с пробегом.
- Карточка Catalog V3 разделяет факты об экземпляре и справочные данные модели:
  текущий Passport-блок называется `О конкретном устройстве`, после него
  выводится `Технические характеристики модели`. Для сертификата доступны
  адаптивный просмотр и скачивание только публичной обезличенной копии.
- Восемь складских строк связаны с product, Passport, отчётом, 5–6 реальными
  WebP-фотографиями и предложением магазина `belgorod`. Для всех подтверждены
  гарантия `90 дней` и комплектность `Устройство, коробка, кабель`. Avito
  listing оставлен в `draft`; автоматическая передача в канал не включалась.
- После pilot QA `т39` опубликованы семь товаров: `т24`, `т25`, `т26`, `т28`,
  `т29`, `т30`, `т39`. Их product и offer имеют статусы `published + ready`,
  складские строки — `authenticity_status=verified` и
  `eligibility_status=eligible`; семь диагностических отчётов имеют статус
  `current`.
- Gold iPhone 14 Pro Max `т38` намеренно оставлен `draft + review`. Его
  складская строка имеет `eligibility_status=blocked`,
  `review_override=false`, причину `repeat_diagnostics_required` и
  операторскую заметку. Исходный отчёт сохранён как `superseded`: перед
  публикацией требуется повторная физическая проверка батареи и наушников,
  после которой новый отчёт становится `current`.
- После выпуска снова применён канонический batch
  `store-snapshot-2026-08-27-corrected` (`90` строк / `361` единица,
  `14` blocker / `21` warning, `products_synced=7`, `missing_items=0`).
  Временный release batch архивирован. Pipeline сохраняет документированный
  ручной `blocked`, поэтому повторный snapshot больше не снимает ограничение
  `т38` после исчезновения старой автоматической причины.
- Временная release identity и её изолированная policy удалены после apply;
  token отозван. Права публикации, relation allowlists и product publication
  guard проверены exact-role rehearsal. Reverse O2M-связи Passport и relation
  keys обновляются идемпотентно без перезаписи существующих идентификаторов.
- `web:verify`, полный `directus:audit:prod`, Catalog V3/inventory/API-policy/
  files audits, основной, image, visual, copy и performance smoke прошли.
  Каталог показывает семь позиций, pilot-карточка содержит фото, Passport,
  сертификат, характеристики, offer, lead form и JSON-LD. Mobile и desktop
  LCP остаются в release budget; файловый audit распознаёт V3-фото и оба типа
  Passport-файлов, `files.orphan_isvoi_files.warning=0`.
- Релизная цепочка изменений завершена коммитом `f614da1`. Следующий
  обязательный товарный шаг — повторно диагностировать `т38`, выпустить новую
  обезличенную публичную копию и только после QA перевести product и offer в
  `published + ready`.

### Catalog V3: обновление фотографий восьми устройств (2026-08-28)

- Итоговые фотографии из задачи Codex
  `01a043d0-8b4c-75b2-bf80-bb7bb869875c` применены ко всем восьми SKU:
  `т24`, `т25`, `т26`, `т28`, `т29`, `т30`, `т38`, `т39`. Bundle
  `product-photo-refresh-2026-08-28` содержит 42 выбранных WebP размером
  `2400x1800`: по 5–6 кадров на карточку. В него включена пересъёмка Deep
  Purple от 2026-08-28.
- Перед изменением создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260828T142614Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущена, поскольку offsite backup и restore
  rehearsal остаются отложенными.
- Для каждого product заменены `products.listing_file` и существующие строки
  `product_images` без изменения их id, sort, статуса публикации и роли. Создано
  42 новых Directus file id, обновлено 42 gallery-связи и 8 listing-связей.
  Семь карточек остались `published + ready`; `т38` сохранил
  `draft + review` и блокировку до повторной диагностики. Цены, остатки,
  Passport, предложения магазинов и Avito listings не менялись.
- Публичные filename/title строятся только из SKU, номера слота, batch и
  SHA-256; полный serial/IMEI в bundle, Directus filenames и URL отсутствует.
  Каждый server asset повторно скачан из Directus и побайтно сверен с SHA-256
  manifest. Формат и размеры также проверены после загрузки.
- Обработка фото удаляет только временные отпечатки, жирные следы, свободную
  пыль и дефекты фона. Реальные царапины, сколы, вмятины, потёртости покрытия,
  геометрия, цвет и идентичность устройства сохраняются. Общий alignment QA
  подтвердил центрирование и безопасную зону всех восьми listing/front кадров.
- Предыдущие 42 файла не удалены. После проверки отсутствия активных ссылок
  они перемещены из `ISVOI File Review` в управляемую папку
  `ISVOI Product Photo Archive` для rollback. Folder migration защищает архив,
  Blog, Inventory Imports и обе Passport-папки от ошибочного переноса в
  `ISVOI Device Photos`. File audit показывает `review_folder_count=0`,
  `orphan_isvoi_files.warning=0`, `product_photo_archive=42`.
- В repo добавлен идемпотентный workflow `directus:photos:bundle`,
  `directus:photos:refresh` и `directus:photos:archive`. Apply выполнялся через
  временную non-admin release identity; после выпуска identity и policy
  удалены, token возвращает `401`.
- Полный `directus:audit:prod`, API-policy, ops/content ownership, основной,
  image, visual и performance smoke прошли. Каталог по-прежнему показывает
  семь опубликованных устройств; visual smoke карточки `т39` прошёл на desktop
  и mobile, LCP каталога составил около 308 мс desktop / 220 мс mobile.
- Код workflow и guardrails выпущен через `5632785`. Рабочие исходники,
  QA-листы и bundle не коммитятся.

### Catalog V3: коррекция второго фото Deep Purple (2026-08-28)

- У `т39` (`Apple iPhone 14 Pro 256 ГБ Deep Purple`) во втором кадре
  «Экран и рамка» удалена заметная вертикальная граница фона справа. Геометрия,
  состояние устройства, экран, рамка, подставка, тени, кадрирование и размер
  `2400x1800` сохранены; изменена только крайняя правая полоса фона с мягким
  переходом.
- Перед заменой создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260828T145631Z`. Postgres и uploads прошли
  SHA-256; offsite copy пропущена согласно действующему отложенному решению.
- Обновление выполнено через `directus:photos:refresh` и временную non-admin
  release identity. Новый файл сверен по SHA-256 после загрузки; остальные 41
  файл bundle повторно проверены и переиспользованы. Статусы, цены, остатки,
  Passport, offers и порядок галереи не менялись.
- Предыдущая версия второго кадра после проверки отсутствия активных ссылок
  перемещена в `ISVOI Product Photo Archive`. Архиватор принимает как исходные
  `isvoi:release-v8:*`, так и ранее обновлённые
  `isvoi:product-photo-refresh-*` файлы, но по-прежнему отказывается работать
  с неизвестными title и связанными файлами.
- После apply временная identity и policy удалены, token возвращает `401`.
- Полный Directus audit, основной/image/visual smoke и отдельный desktop/mobile
  QA второго таба `Экран и рамка` прошли. Карточка `т39` укладывается в LCP
  budget: около `4264 ms` desktop и `2592 ms` mobile. Общий performance smoke
  отдельно выявил не связанную с фото регрессию `/store`: около `5772 ms`
  desktop при бюджете `4500 ms`; это следующий самостоятельный performance
  пункт.

### Catalog V3: новый Passport Deep Purple и брендирование выписок (2026-08-28)

- Для `т39` принят новый NSYS-отчёт от `2026-08-28`. Грейд изменён с `A` на
  `B`: причина — мелкие потертости и точечные следы использования на боковых
  гранях. Экран, задняя панель и стекло камеры отмечены без заметных дефектов;
  устройство полностью исправно, все функции протестированы. Батарея осталась
  `95% · 247 циклов`, FMIP/JAIL/MDM не обнаружены, компоненты отмечены как
  оригинальные.
- Карточка осталась `published + ready`. В `device_details` обновлены грейд и
  дата диагностики, в `device_passports` — краткий итог, три подтверждённые
  пометки состояния и строка грейда. Frontend выводит эти пометки отдельным
  блоком Passport, используя управляемый заголовок `condition_title` из
  `device_page_settings`.
- Новый исходный PDF хранится только в `ISVOI Passport Originals` с безопасным
  filename без полного IMEI/serial. Предыдущий отчёт сохранён как
  `superseded`, новый является единственным `current`. Публичная выписка
  показывает только хвост serial и последние четыре цифры IMEI; QR и номера
  компонентов в неё не переносятся.
- Все восемь публичных выписок пересобраны в размере `1400x1800`: слева
  размещён знак `NSYS Diagnostics`, справа — действующий боковой SVG-логотип
  I СВОИ и подпись «Проверенная техника для своих». Для грейда B выписка
  содержит отдельный блок с причинами состояния.
- Добавлен идемпотентный workflow `directus:certificates:refresh` и закрытая
  папка `ISVOI Passport Archive`. Семь заменённых публичных файлов перемещены
  в архив после проверки отсутствия связей; действующие и исторические отчёты
  не удалялись. File audit: `review_folder_count=0`,
  `orphan_isvoi_files.warning=0`, `passport_archive=7`.
- Перед изменением создан VPS backup
  `/opt/isvoi/backups/directus/20260828T152547Z`; PostgreSQL и uploads прошли
  SHA-256. Временная non-admin release identity удалена, token возвращает
  `401`. Полный Directus, Passport V8, files, API-policy и ops audits прошли.

### Passport: полный сертификат в магазине и боковой lockup (2026-08-28)

- В singleton `device_page_settings` добавлено управляемое поле
  `passport_certificate_store_note`. Значение production: «Полный паспорт
  (сертификат) устройства доступен в магазине». Текст выводится отдельной
  строкой под пояснением публичной выписки и редактируется в группе Passport
  коллекции «Шаблон товарной страницы».
- Все восемь публичных выписок повторно брендированы: справа используется
  горизонтальный lockup с золотой риской, словом «СВОИ» и подписью
  «ПРОВЕРЕННАЯ / ТЕХНИКА ДЛЯ / СВОИХ» в три строки. Размер листа остаётся
  `1400x1800`; закрытые оригиналы не заменялись и сверены по SHA-256.
- Workflow `directus:certificates:refresh` разрешает повторное брендирование
  публичной копии актуального отчёта без создания дубликата приватного PDF.
  Восемь предыдущих публичных PNG перемещены в `ISVOI Passport Archive`;
  `files.passport_archive=15`, orphan и review warnings равны нулю.
- Перед изменением создан VPS backup
  `/opt/isvoi/backups/directus/20260828T160147Z`; PostgreSQL и uploads прошли
  SHA-256. Временная release identity удалена, её token возвращает `401`.
  Schema, Passport V8, files и production smoke прошли.

### Passport: утверждённый боковой логотип из печатных макетов (2026-08-28)

- Источник логоблока — финальный пакет из задачи «Проработка макетов для
  ISVOI»: `ISVOI_FINAL_APPROVED_PRINT_PACKAGE_REV05_WITH_LIGHTBOX.zip`, мастер
  светового баннера `ISVOI_LIGHTBOX_200x30_MASTER.svg`. Для сертификатов
  сохранены утверждённые пропорции Bold-вордмарка, увеличенный отступ и
  трёхстрочный боковой дескриптор; цвет текста адаптирован для белого фона.
- В repo добавлен единый воспроизводимый ассет
  `assets/brand/isvoi-logo-side-descriptor-light.svg`. Генератор вставляет его
  как цельный знак и больше не набирает дескриптор отдельными SVG-строками.
- Все восемь публичных выписок пересобраны и заменены в production Directus.
  Закрытые оригиналы не менялись; прежние восемь PNG после проверки активных
  связей перенесены в `ISVOI Passport Archive`. Итоговый счётчик архива — 23,
  orphan и review warnings равны нулю.
- Перед apply создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260828T184307Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущена согласно действующему отложенному решению.
- Обновление выполнено временной non-admin release identity. После apply
  identity и policy удалены, token возвращает `401`. Passport V8 и files
  audits, отдельный desktop/mobile QA сертификата и полный production smoke
  прошли.

### Catalog V3: лупа и полноэкранный просмотр фотографий (2026-08-28)

- Галерея карточки товара получила desktop-лупу с увеличением `2.25x` и
  полноэкранный просмотрщик с масштабом `1-4x`, перемещением изображения,
  листанием фотографий, управлением колесом, двойным кликом и клавиатурой.
- На мобильных устройствах нажатие открывает полноэкранный просмотр;
  поддержаны pinch-to-zoom и перемещение. Диалог удерживает фокус, закрывается
  по `Escape` и возвращает фокус на исходную фотографию.
- Обычная галерея продолжает использовать Directus rendition `1200x900`.
  Отдельный `zoomSrc` размером до `2400x1800` запрашивается только при наведении
  или открытии просмотрщика, поэтому LCP основной фотографии не утяжеляется.
- Динамические transform/background-position вынесены в проверенный helper;
  Tailwind guard и Playwright smoke расширены проверкой открытия просмотрщика,
  параметров Directus rendition и изменения масштаба.
- Изменение затрагивает только frontend и публичное чтение существующих файлов:
  схема, контент и файлы Directus не меняются, отдельный VPS backup базы для
  этого релиза не требуется. До выката пройдены lint, typecheck, Tailwind audit,
  production build, bundle budget и desktop/mobile visual QA.

### Catalog V3: корректный масштаб и бесшовное переключение фото (2026-08-28)

- Исправлен расчёт desktop-лупы: размер фонового rendition теперь равен
  фактическому viewport галереи, умноженному на `2.25`, а позиция вычисляется в
  пикселях от точки указателя. Процентный расчёт от размера самой лупы удалён.
  При первом наведении используется уже декодированный browser `currentSrc`
  основной фотографии; после загрузки он бесшовно заменяется Directus
  rendition `2400x1800`, поэтому лупа не показывает пустой белый фон.
- Полноэкранный просмотр сохраняет предыдущий декодированный кадр до готовности
  следующего ракурса. Только после успешной загрузки обновляются viewer и
  активная фотография карточки; соседние базовые изображения предзагружаются,
  high-resolution слой подключается отдельно поверх базового.
- Для медленной сети добавлены явный статус загрузки и безопасное состояние
  ошибки без чёрного кадра. Быстрые повторные переключения отменяют устаревшие
  запросы логически и не могут заменить более новый выбранный ракурс.
- Постоянный Playwright smoke проверяет реальный коэффициент лупы, Directus
  rendition `2400x1800`, декодирование следующего изображения и сохранение
  рабочего viewer. Отдельный QA с задержкой ответа `1.2 с` прошёл на desktop;
  desktop/mobile visual QA, полный build и bundle budget также прошли.

### Catalog V3: первый факт для опубликованного грейда A (2026-08-28)

- Для всех пяти опубликованных товаров с точным `device_details.grade = 'A'`
  первым элементом `device_passports.condition_notes` установлено
  «Нет замечаний по корпусу.». Существующие факты о батарее, циклах и
  оригинальности компонентов сохранены следом в прежнем порядке.
- Архивные `iPhone 14` и `iPad Air` с грейдом A не менялись: обновление
  намеренно ограничено `products.status = 'published'` и не затрагивает
  `A−`, `B` или другие грейды.
- В repo добавлен идемпотентный SQL workflow
  `directus:update:grade-a-condition` с режимами `--rehearsal` и `--rollback`.
  Production rehearsal с `ROLLBACK` и apply подтвердили пять целевых Passport.
- Перед apply создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260828T202557Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущена согласно действующему отложенному решению.
  После apply Directus cache сброшен перезапуском, health вернулся в `ok`,
  мгновенная site-content revalidation и HTTP-проверка пяти карточек прошли.

### Catalog V3: очистка кадра «Состояние экрана» Space Black (2026-08-28)

- Для `т28` (`Apple iPhone 14 Pro Max 256 ГБ Space Black`) перепроверена
  привязка пятого слота галереи. На сайте использовался правильный кадр этого
  устройства, но в подготовленной версии на глянцевой боковине остались
  заметные отпечатки и жирные следы.
- В кадре удалены только временные загрязнения боковины и стекла. Геометрия,
  цвет Space Black, кнопка, антенная вставка, кромки и реальные следы состояния
  не должны ретушироваться. Итоговый WebP имеет размер `2400x1800` и SHA-256
  `b19a2750d75c23c41a9093cba446891fe753c9e570b8ccbb042061258cc0688e`.
- Bundle `product-photo-refresh-2026-08-28-space-black-screen-cleanup`
  повторно связал пять существующих слотов `т28`: первые четыре изображения
  побайтно не изменились, пятый получил новый файл. Пять предыдущих файлов
  сохранены в `ISVOI Product Photo Archive`; `files.product_photo_archive=48`,
  review и orphan warnings равны нулю.
- Перед apply создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260828T203801Z`; PostgreSQL и uploads прошли
  SHA-256. Offsite copy пропущена согласно действующему отложенному решению.
- Обновление выполнено временной non-admin release identity. После apply
  identity и policy удалены, token возвращает `401`. Catalog V3, Files и
  Passport V8 audits, production и image smoke прошли. Адресный Playwright QA
  подтвердил новый Directus file id в слоте `5 / 5` на desktop и mobile.

### Catalog V3: понятная ошибка категории в Directus Studio (2026-08-29)

- Для `products.items.create` и `products.items.update` установлен versioned
  Directus hook `directus-extension-isvoi-catalog-guards`. При несовпадении
  `product_type` и `product_categories.catalog_section` Studio получает HTTP
  `400`, код `CATEGORY_TYPE_MISMATCH` и сообщение «Категория не соответствует
  типу товара». SQL-триггер сохранён как fallback для прямых операций с БД.
- Проверенные production extensions хранятся в
  `infra/directus-beget/extensions-bundled` и монтируются в контейнер read-only.
  Hook собран без внешнего импорта `@directus/errors`: pnpm-layout образа
  Directus 11.17.4 не открывает этот пакет расширениям. Self-contained ошибка
  повторяет контракт Directus (`name=DirectusError`, `code`, `status`).
- Тест `directus:catalog-guard:test` проверяет регистрацию create/update
  фильтров, partial update, read-only mount и точный error contract; он включён
  в `web:verify` и `directus:audit:prod`. Production rehearsal под реальной
  ролью `ISVOI Editor` подтвердил понятный `400`, допустимое редактирование с
  восстановлением, запрет публикации `403` и редактирование Passport.
- Перед выкатом создан и проверен VPS backup
  `/opt/isvoi/backups/directus/20260828T210834Z`; PostgreSQL и uploads прошли
  SHA-256, offsite copy пропущена согласно действующему отложенному решению.
  Временная QA identity и policy удалены, token возвращает `401`. Directus
  health, полный production/Studio/Catalog V3 audit и smoke сайта прошли.

## 2026-08-30 · Trade-in consent evidence and privacy release

- The owner confirmed the Roskomnadzor notification and FNS/tax treatment. The approved Trade-in consent version is `trade-consent-v1-2026-08-30`.
- `/privacy` is the canonical published policy page; `/privacy#trade-in-consent` is a separate consent section linked from both the legacy Trade form and `TradeInWizard`.
- Every Trade-in lead must contain the server-selected consent version, server timestamp, source path, immutable text snapshot and SHA-256. Lead Intake and editors cannot silently fall back to a reduced Trade lead payload.
- Local PII fallback logging is retired. If Directus cannot persist a lead, `/lead-intake` returns `503 lead_storage_unavailable` with retry guidance and the client preserves entered data.
- Exchange targets remain dynamic: newly released cards are included only through published, ready products with a published available offer and positive stock. Trade legal migrations never publish or alter product cards, offers, photos or Passports.
- The Directus governance and legal-content migration was applied atomically after a successful rollback rehearsal. Pre-apply backup: `/opt/isvoi/backups/directus/20260830T175012Z`.
- Post-apply `trade-governance`, `trade-legal` and `trade-mvp` audits passed. The card compatibility audit found 17 eligible exchange cards, zero offers incorrectly excluded by product stock summaries and zero cards without a listing image.
- The migration did not publish pricing, change `trade_settings.status`, or enable `TRADE_WIZARD_ENABLED`; the public calculator remains off pending a separate release decision.
- The web release completed on production at `3baae5a`. The release chain also includes `bcce905` (reviewed content baseline), `077d9aa` (Trade-only client bundle isolation) and `b417c73` (exact Trade service runtime permissions and audit).
- The bundle fix reduced the Club route from 461.0 kB to 418.3 kB raw without raising budgets. Final production `web:verify`, HTTP smoke, copy smoke and the Trade QA v2 smoke passed.
- Direct SQL permission changes require `npm run directus:cache:permissions`; the final apply deleted only 19 `permissions:*` keys, restarted Directus and returned health `ok`. The final pre-apply backup is `/opt/isvoi/backups/directus/20260830T182244Z`.
- Trade QA v2 verified 19 configurations, 7 questions, 10 control calculations, phone validation, mandatory consent and idempotency. Test reference `QA-260830-861` has the approved consent version, server timestamp, full text snapshot, 64-character SHA-256 and `/trade/qa` source; no contact data is recorded in this memory.
- Consent validation must run before idempotency replay. After consent and version pass, an existing successful key is returned before volatile quote/stock revalidation, preserving the approved replay contract.
- The public calculator remains fail-closed: draft pricing and `TRADE_WIZARD_ENABLED=0` were not changed. The exchange audit still sees 17 eligible current cards, with zero product-summary exclusions and zero missing listing images.
- Post-release `npm audit --omit=dev` reports 4 high and 1 moderate vulnerable production packages in the Next/PostCSS/Sharp/Nanoid/Sanitize HTML dependency chain. Do not run an unreviewed forced audit fix; handle this as a separate dependency-hardening release with full regression and visual/performance gates before calculator launch.

## 2026-08-30 · Dependency hardening and current-card QA

- The dependency debt above is closed by `ce5290a`: Next.js `15.5.21`, Sanitize HTML `2.17.7`, PostCSS `8.5.26`, Nanoid `3.3.18`, Sharp `0.35.4`, plus patched dev-only Brace Expansion and JS-YAML lock entries. No `--force` or major framework upgrade was used.
- A clean `npm ci` and both full and `--omit=dev` audits return `0 vulnerabilities` on production. The remaining install output contains deprecation notices for the legacy ESLint 8 toolchain and an unapproved dev-only `unrs-resolver` postinstall; neither is a reported npm vulnerability, and the script is not to be approved without a separate supply-chain review.
- `4a7372d` fixes two stable link defects found by the release QA: when the Trade calculator is gated off, `#trade-calculator` falls back to the existing Trade `#final` form; legacy Club `/#final` and `/club#final` targets resolve to `#club-request` on `club.isvoi.ru`. Contract tests cover active and gated states.
- `7e1fd8b` removes retired demo product slugs from the public consistency audit. It discovers up to four current `/product/*` routes from the live Catalog V3 page and verifies the currently published cards instead of stale fallback devices.
- Production `web:verify`, bundle budget, route/copy/link/consistency, desktop/mobile visual and performance smokes passed. Performance LCP stayed between 244 ms and 668 ms across the checked routes, below the 4.5 s desktop and 6.5 s mobile budgets.
- Closed Trade-in QA still passes 19 configurations, 7 questions, 10 calculations, phone and consent validation. `trade-runtime`, `trade-governance` and `trade-legal` pass; 17 exchange cards remain eligible.
- Dependency hardening did not change Directus data, pricing publication or product records. `trade_settings.status=draft`, `TRADE_WIZARD_ENABLED=0` and public Trade config `503` remain mandatory until a separate enablement decision.

## 2026-08-30 · Trade-in catalog-complete pricing v3

- The former real-device gate was invalid because it used a five-model allowlist and an arbitrary `LIMIT 10`; it could include draft/blocked inventory and omit a public card. The replacement selects every published, content-ready used device with positive product stock, a published available offer, a positive linked inventory purchase price and a completed Passport.
- The public production catalog currently contains 17 eligible used-device cards across eight models: iPhone 14 Pro, 14 Pro Max, 15 Pro, 16 Pro, 16 Pro Max and Samsung Galaxy S22/S23/S24 Ultra. iPhone 13 Pro remains a supported buyback model without a current sale card.
- `trade-pricing-v3-draft` contains 24 configurations across nine models. It adds iPhone 15 Pro 256/512 GB and the three public Samsung Ultra 256 GB configurations. The v2 ceilings for iPhone 14 Pro 512 GB and iPhone 16 Pro Max 256/512 GB are reduced so quote max preserves the confirmed 15% contribution-margin floor.
- Inventory identity remains truthful. `matched` is accepted directly; `unmatched` or `not_applicable` is accepted only with `verified/not_required`, `eligible`, an explicit operator override, a review note and no block reason. White Titanium is therefore included through its documented operator review rather than falsifying the automatic identity result.
- iPhone 14 Pro Max Gold remains draft/blocked pending repeat diagnostics and is outside the public release gate.
- The owner-approved cost policy is preparation 1,500 RUB; warranty reserve 3% with 1,500 RUB minimum; markdown 5%; sales 2%; operations 1,000 RUB; USN Income reserve 6% without VAT; contribution floor 15% and target 18%. Contract printing and fiscal receipts remain external to ISVOI.
- The reproducible gate now passes 17/17 candidates, 8/8 public models, 17/17 diagnostics, identity, release readiness, gross headroom, cost inputs, contribution floor and Trade Desk approvals. Each approval validates quote max, not a lower discretionary offer.
- The v3 SQL rehearsal completed with `ROLLBACK`. This work does not itself publish pricing or enable the calculator; `trade_settings.status=draft`, public config `503` and `TRADE_WIZARD_ENABLED=0` remain the safe state until a separate enablement decision.
- Closed QA initially exposed a stale five-model server allowlist: Directus held 24 v3 configurations but the API returned 19. Supported slugs now live in `apps/web/lib/trade-supported-models.ts`, and the v3 unit test requires the server set to equal all pricing models so this drift cannot recur.
- Draft v3 was applied after backup `/opt/isvoi/backups/directus/20260830T193503Z`; releases `153a19e` and `33baaa1` are deployed. Directus v2/v3, MVP, Studio and legal audits pass. Final closed QA returns 24 configurations, 7 questions and 15 control calculations; public config remains fail-closed with `503`, `trade_settings.status=draft` and `TRADE_WIZARD_ENABLED=0`.

## 2026-08-30 · Trade-in v3 production launch

- The owner explicitly approved the separate publication and feature-flag decision. The final pre-launch gate passed 17/17 current cards, 8/8 represented models, diagnostics, identity, release readiness, gross headroom, cost inputs, contribution-margin floor and Trade Desk approval.
- `50f2f76` adds an exact, idempotent publication transaction. It refuses partial snapshots, a second published version, missing approvals, an inactive approver, an unpublished default store or any drift from the approved 24 configurations and 21 rules. Rehearsal completed with `ROLLBACK`.
- Production backup `/opt/isvoi/backups/directus/20260830T195900Z` was created immediately before apply. `trade-pricing-v3-draft`, all 24 configurations, all 21 rules and the singleton settings are now `published`; historical v1/v2 drafts are unchanged. Post-publication pricing, MVP, governance, legal, runtime and Studio audits passed.
- The application remained fail-closed after database publication: `TRADE_WIZARD_ENABLED=0` and public config `503` were verified before the UI switch. The env flag was then changed atomically to `1`; backup `/opt/isvoi/apps/web/.env.local.trade-wizard.20260830T200107Z.bak` was retained, the site was rebuilt, and PM2 restarted with the updated environment.
- Public config now reports `active=true`, v3, 24 configurations and 7 questions, and `/trade` renders the calculator. Production QA passed 15 deterministic calculations, phone validation, consent, lead idempotency, general route smoke, internal links, desktop/mobile visual smoke and performance smoke.
- Closed QA now follows the active snapshot whether it is draft or published while continuing to mark quotes, events and leads as test data. The QA and service-token setup scripts preserve the public feature flag instead of silently resetting it.
- Emergency rollback is feature-first: disable the flag with `scripts/configure_trade_public_env.sh`, rebuild and restart `isvoi-web`. This restores the legacy Trade page and fail-closed API without deleting or mutating the published pricing audit trail.

## 2026-08-30 · Titanium photo color refresh

- The approved photo corrections from task `01a043d0-8b4c-75b2-bf80-bb7bb869875c` are now live for Desert Titanium SKUs `т25`, `т14`, `т7` and White Titanium SKUs `т26`, `т37`, `т10`. This is a photo refresh, not a change of product identity or the color field.
- The source review covered 36 local images and corrected 28. The existing site uses five slots each for `т25` and `т26`, and six for each of the other four devices. All 34 existing slots were refreshed in their original order: 26 color-corrected images and eight byte-identical retained images. The two unused local views were not added to the catalog.
- The sanitized bundle is `outputs/product-photo-refresh-2026-08-30-titanium/photo-refresh.json`. Public filenames contain only SKU and slot, never full serials. All images remain `2400x1800` WebP. New Directus file IDs invalidate browser/image-cache references without changing the gallery contract.
- Before apply, every existing live photo matched the source review's previous SHA-256 and each SKU matched its linked inventory serial tail. After apply, all 34 anonymous Directus asset responses matched the approved output hashes. A database digest confirmed that prices, stock, grades, offers, Passport content and diagnostic reports did not change.
- Pre-apply backup: `/opt/isvoi/backups/directus/20260830T203118Z`; PostgreSQL and uploads passed SHA-256 checks. Offsite remains deferred.
- The attempted temporary combined-role creation was rejected before execution. The refresh instead used the already configured Catalog Import service with no new identity, token or permission grants. The existing token was held only in process memory and not written to disk or logs.
- The existing photo-refresh and archive workflows moved 34 unreferenced prior images into `ISVOI Product Photo Archive`; rollback files were not deleted. Files audit reports zero review entries, duplicate ISVOI titles and orphan warnings; the product photo archive now contains 82 files.
- Catalog V3, files and schema audits passed. Targeted browser QA decoded every gallery slot on desktop and mobile (68 checks), confirmed all six current listing images in `/catalog`, and found no horizontal overflow. Screenshots and results are in `output/playwright/titanium-refresh-2026-08-30`. No application build, PM2 restart, pricing publication or Avito activation was needed.

## 2026-08-31 · Trade page UX structure (local implementation, not deployed)

- Implemented the approved Figma structure from file `cINpBQkJ5tuqHcD8jw3Ceo`, page `04 · Trade page · UX structure`, section `30:175`. The calculator has a permanent CMS-controlled H2, while wizard steps use H3. The existing site style and shell are retained.
- The short hero leads to the calculator; the subsequent order is scenarios, post-quote process, exchange formula, collapsible comparison and manual help. Existing T01–T11 Figma nodes and the production feature flag were not edited.
- Same-page Trade actions preserve wizard state and history. Initial mount does not force focus/scroll; explicit step navigation respects reduced motion. Session restoration is hydration-safe. Read-only category/Apple fields are replaced by model groups derived from the published configuration.
- Seven narrow `page_sections` content patches are prepared under `directus/content-patches/2026-08-31-*-ux.patch.json`. Each is scoped to the Trade page ID plus section_key; fresh snapshot locks, rehearsal, commit and approved apply remain release prerequisites. CMS values take priority over fallback, so deploying code alone does not publish all new copy/order.
- Legacy illustrative `valuation.amount` is no longer rendered; the managed formula is not a user quote. Commission CTA preselects commission in the manual help form, preserving the existing manual_evaluation intake contract and selected intent in the manager message. Legal consent/version handling is unchanged.
- Local desktop/mobile fixture smoke passed no-autoscroll, CMS heading/order, Apple/Samsung selection, anchor focus, preserved state, browser back/forward, reload, manual evaluation, commission preselection, comparison and inactive-settings fallback. No production quote or lead was submitted. Screenshots are in `output/playwright/trade-layout/`.
- The local dependency directory was synchronized using `npm ci --ignore-scripts` against the unchanged lockfile. Windows Node 24.19 verification uses `NODE_OPTIONS=--no-experimental-strip-types` for Next/Tailwind loader compatibility; this is not a production environment change. Git-ignored generated photo manifests are now also excluded from Prettier; photo files and manifest data were not edited.
- Release instructions and verification boundaries: `docs/trade-in-page-layout.md`. Existing photo-refresh operating notes and unrelated workspace files are preserved. No push, Directus apply, deploy, pricing publication, product/card activation or permission change was performed.
- Final `web:verify` passed with Next 15.5.21, including all listed audits/tests, formatting, lint, typecheck, production build and unchanged bundle limits (total client JS: 904.2 kB raw / 289.3 kB gzip / 249.8 kB Brotli). Model grouping runs in server components; the public API contract is unchanged. The final desktop/mobile smoke also passed a loopback-only manual submission, confirmation rendering, contact/free-text storage exclusion and post-submission reload; its test server exited cleanly.

## 2026-08-31 · Trade page UX production release

- Release `5bcbbea` was committed, pushed to `origin/master`, pulled into `/opt/isvoi`, built with Next 15.5.21 / Node 24.18.0 and activated by restarting `isvoi-web`. The previous local-only status above is superseded by this release. `TRADE_WIZARD_ENABLED` remains enabled; pricing v3 was not republished or modified.
- All seven `2026-08-31-*-ux.patch.json` patches were applied through the normal locked content runner. Individual previews and a combined seven-patch rehearsal with Trade/page-contract/leads audits passed and rolled back first. Each apply had a verified PostgreSQL/uploads backup; first `/opt/isvoi/backups/directus/20260830T213915Z`, last `/opt/isvoi/backups/directus/20260830T214125Z`. Full patch-to-backup mapping is in `docs/trade-in-page-layout.md`; offsite remains deferred.
- Preflight identified outdated generic consent expectations. The Trade page/leads audits now require the already-approved checkbox label, version and consent URL; other forms retain their previous checks. No legal text or consent evidence was changed. The page content audit recognizes the new `details_label`, `formula` and `intent` keys.
- Full production `directus:audit:prod` and server `web:verify` passed. Bundle budgets were unchanged: total client JS 898.1 kB raw / 286.0 kB gzip / 246.9 kB Brotli. Studio/basic-editor and Advanced Editor controls/permissions passed their audits; no roles or permissions were altered.
- Production desktop/mobile layout QA passed heading/order, no initial autoscroll, anchor focus/state retention, brand selection, history/reload, manual/commission branches, phone filtering, unchecked consent and comparison. Targeted public UI QA blocked quotes/leads/events. General storefront smoke, internal links and visual checks of Trade/catalog/home passed; catalog still exposes 17 devices.
- Closed Trade QA passed 24 configurations, 7 questions and 15 control cases, creating 11 `is_test` quotes. Idempotent test lead replay returned `QA-260830-861`; read-only verification confirmed test status and consent version/timestamp/hash without exposing contact data.
- Performance smoke passed: Trade LCP 3424 ms desktop / 2420 ms mobile. These are lab samples, not field p75/INP evidence; physical mobile keyboard remains untested. Screenshots are in `output/playwright/trade-layout-production-2026-08-31/` and `output/playwright/visual-smoke/`.
- Before/after hashes matched for products, offers, photos, inventory, Trade settings, pricing versions/configs/rules, other page sections and permissions. Unrelated photo-cleanup scripts, hero references and pre-existing photo-refresh notes were preserved outside this release commit.

## 2026-08-31 · Trade navigation implementation (local; bundle gate now closed)

- The two existing Figma files remain in the ISVOI project; mobile file `cINpBQkJ5tuqHcD8jw3Ceo`, page `05 · Trade navigation · Back & reset`, node `36:174`. Interactive desktop Figma checks confirmed forward navigation, contact return to sale vs exchange, reset cancel/confirm, expiry refresh and new evaluation after submission. This turn made no Figma content/permission changes.
- Local `TradeInWizard` now separates Back, targeted Edit and confirmed Start over. Quote input fingerprints invalidate changed estimates; unchanged active quotes are reused. Model changes require condition confirmation. Run-scoped history rejects stale pre-reset entries; completed leads cannot be resubmitted through Back. Reset clears only calculator-local state, never server quotes/leads or other site storage.
- Stable run-based idempotency survives unfinished-session restore and retries. In-flight quote/catalog responses are cancelled/ignored on navigation/reset; lead submission locks editing/reset until a response. Expiry and unavailable stock have recovery paths. Exchange stock is fetched again after reload; contact/free text/consent remain memory-only.
- Native confirmation dialog has initial safe focus, Tab trap, Escape cancellation and trigger-focus return. Shared lead intake now mounts/removes Turnstile with the actual form element and ignores stale callbacks, retaining compatibility with other lead forms.
- Added `web:test:trade-navigation` to `web:verify` and expanded loopback-only layout smoke. Twenty unit cases and mobile/desktop navigation, stock, retry, storage, anti-spam lifecycle, consent and legacy-layout cases pass; 320 px dialog checked visually. Turnstile is a local test double, not a real challenge. No production test leads were created.
- Initial lint/type checking and production build passed, but bundle budgets failed (914.7 kB total raw vs 905, and 466.1 kB largest-route raw vs 460; compressed total limits also exceeded). The subsequent optimization below closes that blocker without relaxing limits.
- Details, Figma path, tested flows and evidence boundaries: `docs/trade-in-navigation-spec.md`. This work is not committed/pushed/deployed. Production feature flag, prices, legal content, products/photos, Directus schema and permissions were not changed. Existing unrelated photo notes and workspace changes are preserved.

### Client bundle optimization and final local QA

- Client components now use `lib/cn-client.ts` (clsx); `lib/cn.ts` and its full Tailwind conflict map stay server-side. Mutually exclusive error colors are explicit. `RichText` and centered intro defaults use two reviewed CSS component primitives, retaining utility overrides. No dependency versions, lockfile, bundle audit thresholds or env-overrides changed.
- Total emitted client JS decreased from **914.7 / 291.8 / 252.1 kB** raw/gzip/Brotli to **889.5 / 284.5 / 245.7 kB**, under unchanged **905 / 290 / 250** budgets. Largest route decreased **466.1 → 439.0 kB raw**, under 460. All bundle budgets pass on the local production build.
- `web:test:client-classes` guards the 31-module client graph and tests 26 compositions / 73 variants; it is part of `web:verify`. `web:smoke:client-styles` checks six CSS/default/override comparisons at 320/390/1280 px. Explicit checks retain the project’s 17 px `text-copy` with its color and Tailwind 3 focus outline, both previously misclassified by the generic merger.
- Navigation smoke, 20 navigation units, existing calculation/pricing/QA-session/phone/consent/layout tests, runtime/catalog-guard/legacy/Tailwind/content-ownership audits, format check, lint, typecheck and build pass. The content baseline adds only 16 reviewed navigation/system strings and removes 2 retired wizard strings; no CMS copy was replaced. The Tailwind audit retains centralized helpers and narrowly allows the two reviewed CSS primitives.
- Before/after screenshots are under `output/playwright/trade-layout-before-bundle/` and `output/playwright/trade-layout/`. Checks use loopback CMS/API fixtures and a Turnstile test double, not real production leads or physical-device accessibility testing. Local navigation is ready for a separately authorized push/deploy followed by production smoke; the live v3 calculator and catalog were not changed here.

### Production release · 2026-08-31

- The user's explicit `выкат` authorized the full release. `33fbbc9` is pushed to GitHub master and deployed at `/opt/isvoi`; full production `web:verify` passed before PM2 `isvoi-web` restart. This supersedes the local-only status above.
- Pre-release database/uploads backup `/opt/isvoi/backups/directus/20260831T190700Z` passed checksums and archive validation. Offsite remains unconfigured/deferred. Previous compiled app is retained at `/opt/isvoi/backups/web/20260831T190700Z-trade-navigation/next`; prior source commit is `661ce74`.
- Server bundle budgets pass unchanged: total **885.4 / 282.0 / 243.7 kB** raw/gzip/Brotli and largest route **439.4 kB raw**. Runtime remains Node 24.18.0, npm 11.16.0. No dependency, lockfile or env changes; before/after `.env.local` and lockfile hashes match.
- Public navigation smoke passed on mobile/desktop with zero quote/lead writes and intercepted events: back preserves model/memory/answers, reset has safe focus/Escape, a new run rejects old history, reload does not retain free text/consent. New reusable runner: `scripts/smoke_trade_navigation_live.mjs`.
- Closed `is_test` QA passed 24 configs, seven questions and 15 control cases, plus phone validation, consent and idempotent lead replay. General route/copy/visual smokes passed, with 17 catalog device links. Lab LCP for `/trade` was 440 ms desktop / 320 ms mobile; across home/catalog/store/trade it ranged 180–516 ms, not field p75 evidence.
- Read-only Directus runtime/governance/legal/v3 audits pass, health is `ok`, and production git status is clean. Feature flag stays enabled, pricing v3 and all products/photos remain unchanged. Unrelated local photo scripts/assets and pre-existing photo-refresh notes were explicitly excluded from staging.
- Live screenshots are in `output/playwright/trade-navigation-production/` on server and locally; complete route screenshots remain in server `output/playwright/visual-smoke/`. Real-device keyboard, VoiceOver/NVDA and real Turnstile challenge were not certified by automation. Release detail: `docs/trade-in-navigation-spec.md`.

## 2026-08-31 · Trade exchange completeness fix (local, not deployed)

- Follow-up inspection found all 17 catalog cards covered by the device/memory picker, but exchange was hard-capped at 12 offers. Do not confuse eight catalog models / nine buyback models with the 17 physical devices.
- Exchange now returns 12-item cursor pages with additive `total`/`nextCursor`, stable local/price/offer-ID ordering and a quote/store-scoped cursor. Wizard load-more preserves selection, deduplicates cards, focuses appended results and retries without discarding loaded items. Refresh starts a new view; late responses after navigation/reset are ignored.
- Submission validates the exact product/offer through an uncached Directus lookup, not membership in the first page. Product publication/readiness, stock, offer/store status and fulfillment permissions remain gates. Expired quotes stop before catalog fetch; CMS errors are retryable, not false empty states. No pricing, schema, permission, photo, flag or live data changes.
- `web:test:trade-exchange` is in `web:verify`: 10 pure/contract case groups. `web:smoke:trade-layout` now covers the real API against an isolated loopback CMS (17 cards, second-page lead, replay, sold/unpublished stock, expiry, outage/empty) and mobile/desktop pagination/retry/selection/focus/reset regression. Test writes stay in fixture memory; no production leads.
- Local build budgets pass unchanged: **893.3 / 285.8 / 246.8 kB** raw/gzip/Brotli; largest route **441.4 kB raw**. Only four reviewed system labels were added to the content baseline. Screenshots: `output/playwright/trade-layout/exchange-{mobile,desktop}-all-17.png`.
- User requested implementation, not another push/deploy. Production stays at `757a497` / application `33fbbc9` until a separately authorized release. Next release QA must exhaust the exchange cursor chain rather than only checking its first page. Detail: `docs/trade-in-navigation-spec.md`.

### Exchange production release · 2026-08-31

- The subsequent explicit `выкат` authorized the complete release. Application `6973086` was pushed, fast-forwarded on production, passed the full server `web:verify` and activated through PM2. QA-only follow-ups `d2c23d2` and `aca6e2f` are also on the server, without another application restart. This supersedes the local-only state above.
- Verified database/uploads backup: `/opt/isvoi/backups/directus/20260831T194230Z`; prior compiled app: `/opt/isvoi/backups/web/20260831T194230Z-trade-exchange/next`; prior checkout `757a497`. Offsite remains deferred. Production bundle passes unchanged limits at **887.3 / 282.5 / 244.1 kB** raw/gzip/Brotli, largest route **441.3 kB raw**.
- General route/copy/desktop/mobile visual and performance checks passed; catalog still has 17 device links. Trade lab LCP is **520 ms desktop / 256 ms mobile**, range **180–532 ms** across home/catalog/trade, not field p75. Public navigation passed mobile/desktop with zero quote/lead writes.
- Directus runtime/v3/legal/governance audits passed; health is `ok`. Environment and lockfile hashes match the pre-release values, PM2 is stable and the production checkout is clean. Pricing, flag, stock/cards/photos, schema and permissions were not changed.
- Extended production exchange QA passed **17 unique offers, two pages (12+5)** on mobile 390×844 and desktop 1280×900. Selection survives append and back from contact; the last-page device is accepted. Test lead and idempotent replay return `QA-260831-539`; read-only SQL confirms one row, `is_test=true` on lead/quote, consent version/timestamp/hash/source, and no duplicate. No customer contacts were extracted. Screenshots: `output/playwright/trade-exchange-production/{mobile,desktop}-all-offers.png`, server and local.
- Initial full QA passed 15 controls and legacy phone/consent/idempotency checks, then encountered an unclassified HTML response. An immediate repeated control suite hit the application's confirmed 20-quotes/15-minute limit. Resume now runs one control quote, not all 15, respects normal expiry on 429, and spaces the extra test lead/replay requests. The resumed gate passed after natural expiry. Never bypass/reset production anti-spam or change source IP to force a test through.
- Additional read-only audits `trade-studio`, `catalog-v3`, `multicity` and `leads` passed. The current device/memory selector covers every public catalog model/configuration; the defect fixed here was the exchange list's first-page cap, not a missing physical-device row in the model selector.
- Release detail and remaining automated-QA boundaries: `docs/trade-in-navigation-spec.md`. Unrelated photo notes, assets, cleanup scripts and local tool directories remain excluded from this release.

## 2026-08-31 · Deep audit implementation follow-up (local)

- The follow-up implementation starts from the deep-audit recommendations: production remained on `c90db23` before local edits, while the workspace carried the uncommitted Titanium photo-refresh operating-memory entry and local tool artifacts.
- `/store` LCP work is code-only and keeps Directus Studio as the source of truth. `store_locations.hero_file` still owns the city hero image; the app now requests a smaller `1200` / `quality=80` transform and marks only the city photo as high-priority. Product cards below the store photo no longer receive early image priority on the city hub.
- Do not add new Directus asset IDs to `critical-images.ts` for this fix. The stale store/logo asset-id overrides were removed; store hero and uploaded logo updates must continue to work when an editor replaces the image in Studio, without a code change. The documented homepage hero override remains intentionally scoped to `home.hero`.
- Repo hygiene: local `.codex/`, `.codex-audit/`, `.pnpm-store/` and temporary checked-lineup hero references are ignored. Ad hoc photo-cleanup scripts were moved under ignored `work/product-photo-cleanup-tools/` and remain local work products unless promoted through a separate release decision.
- The blog-preview smoke now authenticates through the `x-isvoi-preview-secret` request header and keeps the secret out of the URL. The `/api/draft/blog` route remains backward-compatible with the existing query-secret Directus Studio preview URL until a separate Studio preview migration is approved.
- Bundle headroom remains a follow-up track, not a dependency bump. A trial server-side dynamic import of the Trade section did not change the Next 15 App Router client output, so it was not retained. Next 16, React 19 and Tailwind 4 are still separate compatibility work, not quick maintenance changes.
- Read-only production inspection showed that the two unconfirmed
  `channel_cost_profiles` rows are the intentional starter rows `site` and
  `avito`, with zero rates pending Inventory Manager approval. The 13
  unconfirmed Avito category mappings are also intentionally empty and explicitly
  say to fill them strictly from the official Avito template. Do not bulk-flip
  `is_confirmed=true` or invent `external_category`/`template_version` values to
  satisfy the audit counter; this remains an operations/Avito-pilot task, not a
  technical data-cleanup task.
- Bundle headroom remains a follow-up track. The current safe Store LCP release
  should not simplify the managed homepage catalog preview or risk the live
  Trade-in calculator. A durable 20-30 kB Brotli reduction likely needs a
  dedicated split of Trade wizard/client catalog code plus full Trade, lead and
  visual QA.
- Operational follow-ups remain: complete real Inventory Manager confirmation
  for Avito cost profiles/category mappings and design a durable critical-media
  strategy beyond manual asset-id maps.

### Store LCP production release · 2026-09-01

- Release `251cc16` was committed, pushed to GitHub master and fast-forwarded on
  Beget. The previous compiled app was saved at
  `/opt/isvoi/backups/web/20260831T205601-store-lcp/next`; the latest verified
  Directus PostgreSQL/uploads backup before release remains
  `/opt/isvoi/backups/directus/20260831T194230Z`.
- Beget `web:verify` passed before restarting `isvoi-web`. Server bundle
  budgets passed unchanged: total client JS **887.1 / 282.4 / 244.0 kB**
  raw/gzip/Brotli and largest route **441.2 / 132.1 / 112.2 kB**. PM2 is online
  on `251cc16`; production checkout is clean.
- Production smoke after deploy passed: functional, images, performance,
  visual, internal links, public copy and public content consistency. `/store`
  performance passed the current smoke budget with desktop LCP **3444 ms** and
  mobile LCP **2548 ms**. A targeted desktop trace measured the store visual as
  the LCP image at **3832 ms**, with the hero image resource starting at
  **2453 ms** and the first product-card image starting later at **3749 ms**.
- `smoke:blog-preview` now keeps `BLOG_PREVIEW_SECRET` out of query strings, but
  the full production smoke was not executed because the server env currently
  has the secret only, without a stable `BLOG_PREVIEW_POST_ID` and
  `BLOG_PREVIEW_VERSION`. Add those non-secret fixture values before treating
  blog preview smoke as a normal release gate.
- The initial `/store` HTML contains the expected image preload and
  `fetchPriority="high"` for the Directus-backed store hero. Product cards below
  the store visual remain lazy. This confirms the implemented fix removed
  product-card competition but does not yet put desktop `/store` consistently in
  the 2500 ms green target.
- The next `/store` LCP step should not reintroduce manual Directus asset-id
  maps or remove Studio ownership of `store_locations.hero_file`. To target
  sub-2500 ms, use a durable CMS/asset pipeline: pre-generate/cache a critical
  1200 px derivative for the current Studio hero, serve it directly or warm the
  Next optimizer/CDN path, and revalidate it when the Studio image changes. A
  visual alternative is to move the city photo into the first viewport only if a
  design pass approves the layout change.
- The 2 unconfirmed cost profiles and 13 unconfirmed Avito mappings were
  inspected read-only on production and intentionally left unconfirmed. Their
  notes require real Inventory Manager/official Avito template confirmation, so
  they are not safe for automated technical closure.

## 2026-09-01 · Managed third-party integrations (local, not deployed)

- The local implementation adds Directus-managed `site_integrations` and the
  `integration_consent_settings` singleton. The first seeded integration is a
  disabled `draft` Yandex Metrika template with no counter ID. No real analytics
  or chat vendor was configured, and no production schema, policy, content or
  application process was changed.
- Anonymous Directus access remains closed. `ISVOI Public Read` receives only
  explicit read fields and published integrations. `ISVOI Editor` can manage
  the Yandex template and non-executable fields; custom URL/bootstrap/cleanup
  fields are restricted to Administrator and `ISVOI Advanced Editor`. Apply the
  idempotent integration setup before the existing public/technical permission
  and site-content revalidation setup, then run the new read-only audit.
- The root layout fetches integrations server-side, but third-party code is not
  emitted or requested before the relevant consent. The client manager checks
  exact hostnames plus include/exclude path prefixes on every App Router change.
  Exclusions win. Invalid/unknown published rows fail closed with a server
  warning. Custom integrations accept one HTTPS script URL and/or trusted
  JavaScript, never arbitrary HTML; page-scoped custom code requires cleanup.
- Consent is versioned and stored without personal data in
  `isvoi_integrations_consent_v1` for 180 days by default. Production writes use
  `.isvoi.ru`, `Secure`, `SameSite=Lax` and `Path=/`; localhost omits Domain and
  Secure only for isolated QA. Necessary cannot be disabled. Revoking a granted
  category reloads the page after saving so previously active vendor code is
  stopped deterministically.
- The Metrika adapter initializes with SPA `defer`, sends one `hit` per allowed
  route and calls `destruct` on deactivation. It deliberately has no `noscript`
  pixel. The footer settings control is absent when no optional integrations
  exist, preserving current public behavior when the registry is empty.
- Added contract coverage for normalization, cookie version/expiry, targeting,
  unsafe custom URLs and incomplete custom configurations. The isolated
  loopback Playwright smoke covers no pre-consent requests, rejection, category
  isolation, focus wrapping/Escape/labels, non-blocking main content, one SPA hit
  per route, custom cleanup and consent revocation. No production requests or
  leads are involved.
- Local format, lint, typecheck, the complete `web:verify` unit/contract set,
  production build and unchanged bundle limits pass. Final client output is
  **902.4 / 289.0 / 249.7 kB** raw/gzip/Brotli; largest route is
  **443.7 / 133.6 / 113.5 kB**. The content baseline adds only the reviewed
  Directus fallback consent copy. Production remains at release `251cc16` until
  a separately authorized schema/application rollout with backup, Directus
  restart/cache handling, revalidation, API/permission audits and post-release
  browser verification.

### Production release · 2026-09-01

- The subsequent explicit `выкат` authorized the complete release. Feature
  commit `1328833` and permission follow-up `ec8ea70` are pushed to
  `origin/master` and fast-forwarded on production. PM2 `isvoi-web` is online on
  the new build; Directus health is `ok`.
- Verified Directus backup:
  `/opt/isvoi/backups/directus/20260901T142236Z`. PostgreSQL, uploads, SHA256,
  gzip and tar checks passed. Offsite remains unconfigured. The previous Next
  build is retained at
  `/opt/isvoi/backups/web/20260901T142236Z-site-integrations/next`.
- The idempotent integration schema, Studio metadata, public/service/editor
  permissions and site-content revalidation Flow were applied before the web
  restart. Permission cache cleanup removed only `permissions:*`, restarted
  Directus and passed health. Protected site-content revalidation then returned
  `ok` with the new `directus:site-integrations` tag.
- Production contains exactly one integration row:
  `draft:yandex_metrika:<empty>`. There are zero published integrations, so no
  analytics/chat request or consent banner is active. Consent settings are
  `integrations-consent-v1` with 180-day retention. A real counter remains a
  separate editorial/legal activation.
- The first full Directus audit exposed one pre-existing ordering hazard:
  rerunning the generic technical-permissions allowlist removed the Trade QA
  `leads.is_test` read field. Follow-up `ec8ea70` permanently preserves that
  field. The permission cache was cleared again; the targeted Trade audit and
  the complete `directus:audit:prod` subsequently passed.
- Server `web:verify` passed before PM2 restart. Bundle totals are
  **896.4 / 285.8 / 246.8 kB** raw/gzip/Brotli; largest route is
  **443.6 / 133.5 / 113.4 kB**, within unchanged budgets. Functional, images,
  public copy, internal links, content consistency, desktop/mobile visual and
  performance smokes all passed. Catalog remains at 17 product links; measured
  LCP across sampled routes was 188–328 ms, a lab result rather than field p75.
- The normal API schema snapshot export returned the expected 403 because the
  least-privilege production service token cannot read Directus schema
  metadata. No token was elevated and no temporary administrator identity was
  created. The live schema is instead verified by the complete SQL, Studio,
  permission and API audits; refresh the committed API snapshot only in a
  separately controlled admin-token session.
- The first revalidation request landed during the PM2 startup window and
  returned 502; a bounded readiness check succeeded and the idempotent retry
  returned `ok`. No rollback was needed. Concurrent local Yandex Business feed
  work was excluded from all release commits and production.

## 2026-09-01 · Yandex Business product feed production release

- Release `016466e` adds the public YML endpoint
  `https://isvoi.ru/integrations/yandex-business/feed.yml`. Production uses
  `YANDEX_BUSINESS_FEED_ENABLED=1`; the endpoint stays fail-closed when the
  flag is absent, Directus is unavailable, no eligible offers remain, or the
  feed exceeds 10,000 offers / 15 MB.
- The initial automated scope deliberately matches the XLSX accepted by Yandex
  Business on 2026-09-01: published/ready used smartphones, positive product
  stock, a published available Belgorod offer with positive stock and price,
  and a public listing image. Accepted category IDs remain `101` (`iPhone с
  пробегом`) and `102` (`Samsung Galaxy с пробегом`). Other brands/categories
  require a separate checked Yandex rollout instead of automatic inclusion.
- The feed contains stable product IDs, current offer prices, public Directus
  image transforms and product URLs with `utm_source=yandex_business`. It never
  includes purchase cost, margin, full serial/IMEI, private inventory notes or
  private diagnostic certificates. It returns `X-Robots-Tag: noindex,
  nofollow` and uses a five-minute shared cache.
- Live comparison against the accepted XLSX snapshot passed for all 17 offers:
  two categories, 17 unique IDs, no missing/extra rows, and no price, product
  URL or image URL differences. All 17 product pages and JPEG image URLs
  returned HTTP 200. Only after this comparison may the Yandex Business source
  be switched from the uploaded XLSX to the feed URL; a new price list replaces
  the previous one.
- Local and Beget `web:verify` passed with the feed contract test included in
  the normal gate. Production build, bundle budgets, general storefront smoke,
  PM2 restart and Directus health passed. The production checkout was clean on
  `016466e` after activation.
- Verified pre-release Directus backup:
  `/opt/isvoi/backups/directus/20260901T143939Z`. Previous compiled web build:
  `/opt/isvoi/backups/web/20260901T144127Z-yandex-business-feed/next`. Offsite
  copy remained skipped because `OFFSITE_BACKUP_DEST` is still not configured.
  No Directus schema, catalog rows, prices, stock, permissions or media were
  changed by this release. Detailed operator notes: `docs/yandex-business-feed.md`.

## 2026-09-01 · Metrika consent copy and template activation

- The production consent singleton now explains that necessary cookies support
  the site and that Yandex Metrika is enabled only with analytics consent. The
  same approved copy is kept in the Next.js fallback, Directus setup seed and
  reviewed content-ownership baseline.
- The seeded Metrika record has been editorially promoted to `published`. It is
  a valid `analytics` / `after_interactive` integration, applies site-wide and
  excludes `/trade/qa`. The real counter ID remains private and is never
  recorded in Git or operational output.
- The integration audit now requires the stable managed Metrika record instead
  of requiring that record to remain `draft` forever. Published rows are still
  checked independently for a numeric counter ID, supported provider/category,
  targeting arrays and safe load strategy. The targeted production audit passes.
- Production backup: `/opt/isvoi/backups/directus/20260901T150919Z`. Previous
  compiled web build: `/opt/isvoi/backups/web/20260901T151500Z-metrika-consent-copy/next`.
  Full server `web:verify`, bundle budgets and the warmed production storefront
  smoke passed; the first immediate smoke after PM2 restart hit a cold-cache
  metadata race and passed unchanged after readiness/cache warm-up.

## 2026-09-02 · Yandex SEO and IndexNow (local implementation)

- Following the read-only Yandex audit, local changes give `/stores` and
  `/{city}/delivery` self-canonical metadata, stop publishing missing coordinates
  as `0,0`, remove synthetic Sitemap `lastmod` values, and compose product SEO
  descriptions from the full title and existing public device facts. Directus
  remains the source of business copy, coordinates, product data and policies.
- IndexNow is server-only and disabled by default. The existing authenticated
  site-content revalidation handler adds a durable dirty marker after cache
  invalidation. A single-host worker/timer compares public content fingerprints,
  including hourly reconciliation for imports/SQL changes that bypass Flows.
  Only changes since the explicit baseline are submitted; first initialization
  does not bulk-submit existing pages. No schema or permissions are expanded.
- Persistent state is `/opt/isvoi/var/indexnow` (outside build output). Keep it
  across deploys; the normal Directus backup includes `indexnow-state.json`
  when initialized, without locks or keys. Key endpoint `/indexnow-key.txt` is disabled
  until env activation. Retry/backoff, key verification, CMS-health checks,
  two-pass deletion confirmation and mass-removal/size guards are mandatory.
- Club pilot, empty accessory categories and internal pages retain their
  indexing exclusions. Metrika consent, counter settings and cookies are not
  changed. Payment/return/warranty copy is not fabricated or auto-published.
- `web:test:seo-indexnow` is included in `web:verify`. Operator instructions,
  activation, limits and rollback: `docs/yandex-indexing.md`. This entry records
  local implementation only, not a production release. Installation of the
  systemd timer, env activation, push/deploy and Webmaster account changes
  require a separately authorized release/account action.
- Verification: unit/contract suites, lint, typecheck and production build pass.
  The first bundle gate caught a 0.1 kB Brotli overage; moving the key response
  into existing middleware removed the extra app/client entry without raising
  budgets. Final measured client output: **902.8 / 289.3 / 249.9 kB**
  raw/gzip/Brotli; largest route **443.7 / 133.6 / 113.5 kB**.
- The compiled-app HTTP smoke uses a disposable copy of `.next` and loopback
  CMS, never the working build's ISR cache. It verifies metadata, null/valid
  coordinates, Sitemap, key GET/HEAD/405 and host separation, unauthorized
  revalidation and durable authenticated signals. Worker tests mock all HTTP;
  a separate read-only production scan found stable fingerprints on both reads
  of all 35 URLs, with zero IndexNow submissions. Backup script syntax passes;
  Linux timer installation/execution remains a release-time check.
- `npm ci --ignore-scripts` restored local dependencies from the unchanged
  lockfile. `npm audit --omit=dev` reports zero vulnerabilities. The full audit
  currently reports one existing high-severity build dependency (`browserslist`,
  GHSA-c83g-rgw3-j3cx / GHSA-73wf-gq98-2v4g); no unrelated dependency upgrade was
  folded into this SEO change. Parallel Studio workspace scripts are outside
  the scope of this implementation and must not be staged with it blindly.
