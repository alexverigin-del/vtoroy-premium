# Project Operating Decisions

Last updated: 2026-06-27.

This document records the working agreements and production decisions for the
ISVOI site so future changes can continue from the repository, not from chat
memory alone.

## New Chat Handoff

When starting work in a new Codex chat, read this file first, then use the
documentation map near the end of this file for deeper context. The minimum
startup reading order is:

1. `README.md`
2. `docs/beget-vps-launch-checklist.md`
3. `docs/architecture-directus-next-python.md`
4. `directus/schema/content-model.md`
5. `directus/schema/collections.md`
6. `docs/catalog-workflow.md`
7. `docs/catalog-operator-guide.md`
8. `docs/directus-backup-restore.md`

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

## Shell And Remote Execution

- Use simple local PowerShell commands for local file/git inspection.
- Avoid long inline chains like PowerShell -> SSH -> bash -> SQL. For complex
  remote work, use a heredoc/runner script passed to SSH or a committed script.
- Prefer `rg` for repository search.
- Use `apply_patch` for text edits. Use shell deletion only for binary files or
  other cases where patch tooling cannot safely read the file, after verifying
  target paths.

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
npm run web:build
npm run typecheck --workspace @vtoroy/web
npm run lint --workspace @vtoroy/web
npm run smoke:prod
```

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
```

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
- Restore rehearsal instructions live in `docs/directus-backup-restore.md`.

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
- Studio should be editor-friendly: field groups, notes, display templates,
  presets and safe roles matter as much as table structure.
- Keep schema/metadata setup scripts idempotent so they can be reapplied.
- After schema/permission changes, account for Directus/Redis cache. Restart
  Directus or flush cache when API/Studio metadata appears stale.

## Content Model Decisions

- `site_settings` owns brand, logo, global contacts and header CTA.
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

## Studio Workflow Decisions

- Global brand/logo/header CTA are edited in `site_settings`, not in code.
- Header/footer/mobile links are edited in `navigation_items`; header should
  stay compact, currently five primary links plus CTA.
- Marketing pages are edited through `site_pages` and owned `page_sections`.
  Editors should use existing safe sections and documented variants rather than
  creating arbitrary renderer structures.
- FAQ is managed through `faq_items`, either linked by `page` or referenced by
  keys in a FAQ section.
- Editor-facing collections should keep bookmarks/presets for normal workflows:
  header menu, footer links, page sections, FAQ, catalog review, leads and
  import batches.

## Catalog Decisions

- Commercial catalog status uses separate concepts:
  - Directus row `status` controls publication.
  - `stock_status` controls `available`, `reserved`, `sold`, `hidden`.
  - `content_status` controls editorial readiness.
- Product pages should show stock status, last update date, Passport details,
  Trade options, related devices and a lead form.
- Related devices are selected from visible devices, preferring actionable
  alternatives before sold/hidden items.
- Large catalog updates should go through the import workflow:
  template -> media optimization -> dry run -> apply -> Directus QA.
- Non-developers should use the Studio `catalog_import_batches` operator screen
  and documented `docs/catalog-operator-guide.md` flow.
- Import scripts should use a dedicated importer/service token, not an admin
  token.

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
  A durable edge/proxy rate limit or Turnstile can be added later if traffic
  grows.
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

1. Continue growing the catalog through the operator import workflow.
2. Add stronger lead protection when real traffic starts: nginx rate limit,
   Turnstile or another anti-spam layer.
3. Add off-server backup copy, for example Beget storage or S3-compatible
   storage, and periodically test restore rehearsals.
4. Keep reducing legacy fallback fields after Directus content reaches full
   production completeness.
