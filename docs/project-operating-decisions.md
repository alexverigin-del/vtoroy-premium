# Project Operating Decisions

Last updated: 2026-06-30.

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
```

`web:verify` is the local pre-deploy web gate. It runs `legacy:audit`,
`tailwind:post-audit`, Tailwind-aware format check, ESLint, TypeScript and the
production build. `smoke:prod` is the live post-deploy gate against
`https://isvoi.ru` unless `SMOKE_BASE_URL` is overridden.

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
    `interactions.js`, risky dynamic Tailwind class patterns and unapproved
    `@apply` expansion. It also warns about long className literals that may
    deserve component extraction.
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
- Inline styling is guarded by `tailwind:post-audit`: `style={...}`,
  `CSSProperties` and direct DOM style mutations are blocked by default. The
  only reviewed exception is `SiteLogo` using `logoSizeStyle(settings)` from
  `site-chrome-utils.ts` to expose Directus-managed logo dimensions as bounded
  CSS variables.

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
- Directus file folders are part of the operating model:
  - `ISVOI Device Photos`
  - `ISVOI Site Assets`
  - `ISVOI Editorial`
  - `ISVOI File Review`
  - `ISVOI Catalog Imports`
- Directus asset transforms should be used for delivery instead of committing
  multiple generated derivatives.
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
