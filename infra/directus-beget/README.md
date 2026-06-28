# Directus + PostgreSQL on a Beget VPS

Infrastructure foundation for the ISVOI backend. The current production VPS
uses this stack for Directus, PostgreSQL, Redis, and the `api.isvoi.ru` Studio
and API surface.

> **Full launch runbook:** for an end-to-end, copy-paste VPS deployment
> (DNS → Docker → seed → Next.js → nginx → TLS → backups → production
> checklist), see [`docs/beget-vps-launch-checklist.md`](../../docs/beget-vps-launch-checklist.md).
> This README is the backend-only quick start.

## What this provides

- **PostgreSQL 16** — the database.
- **Directus 11.17.4** — headless CMS + REST/GraphQL API + Studio admin UI.
- **Redis 7** (optional) — caching / rate limiting.
- **nginx** vhost examples for the public site and the api/admin subdomain.

```
Public Site (Next.js)  ──>  Directus API  ──>  PostgreSQL
Admin                  ──>  Directus Studio (served by Directus)
Python jobs            <──> Directus API / PostgreSQL <──> Storage
```

## Local / VPS quick start

```bash
cd infra/directus-beget

# 1. Create your env file from the example and fill in real secrets.
cp .env.example .env
#    Generate secrets: openssl rand -hex 32
#    Edit .env: SECRET, ADMIN_*, DB_PASSWORD, PUBLIC_URL, CORS_ORIGIN

# 2. Start the stack.
docker compose up -d

# 3. Directus is now on http://127.0.0.1:8055 (Studio at the same URL).
#    Log in with ADMIN_EMAIL / ADMIN_PASSWORD, then change the password.
```

Persistent data lives in host directories (gitignored):
`./data/postgres`, `./uploads`, `./extensions`.

## Going to production on Beget

1. Point DNS: `your-domain.ru` and `api.your-domain.ru` at the VPS.
2. Install nginx + certbot; issue TLS certs for both names.
3. Copy the vhost examples and replace the domain placeholders:
   ```bash
   cp nginx/public-site.conf.example /etc/nginx/sites-available/vtoroy-public.conf
   cp nginx/api-admin.conf.example  /etc/nginx/sites-available/vtoroy-api.conf
   # edit domains/cert paths, then enable + reload nginx
   ```
4. Set `PUBLIC_URL` and `CORS_ORIGIN` in `.env` to the real https URLs and
   `docker compose up -d directus` again so the container is recreated with the
   new environment.
5. Run the Next.js site (`npm run web:build && npm run web:start`) behind the
   public vhost, or keep serving the static site during the transition (see the
   commented block in `public-site.conf.example`).

Current production values for ISVOI are documented in
`../../docs/beget-vps-launch-checklist.md`. In brief:

- Public site: `https://isvoi.ru/`
- Directus API: `https://api.isvoi.ru/`
- Directus Studio: `https://api.isvoi.ru/admin/`
- Directus is proxied through nginx from `127.0.0.1:8055`.
- Directus Docker image is pinned to `directus/directus:11.17.4`; upgrade it
  intentionally after reading the release notes and running smoke tests.
- Redis cache is enabled with `CACHE_TTL=5m`, `CACHE_AUTO_PURGE=true`, and
  `CACHE_NAMESPACE=isvoi-directus-`.
- The nginx API vhost should keep gzip, proxy buffering, and the
  `/admin -> /admin/` redirect enabled.

## Security notes

- `.env` is gitignored; only `.env.example` (placeholders) is committed.
- Directus is published on `127.0.0.1:8055` so it is only reachable through nginx.
- Rotate `ADMIN_PASSWORD` after first login; consider creating a separate,
  least-privilege role for the public site's read token (see
  `../../directus/schema/collections.md`).
- Keep `DIRECTUS_TOKEN` server-only in the Next.js environment. Do not expose it
  through `NEXT_PUBLIC_*`.

## Backups

Use the repo script for repeatable PostgreSQL + Directus Files backups:

```bash
cd /opt/isvoi
bash scripts/backup_beget_directus.sh
```

Recommended deploy-user cron:

```cron
17 2 * * * cd /opt/isvoi && bash scripts/backup_beget_directus.sh >> /opt/isvoi/backups/directus/backup.log 2>&1
```

After configuring an `rclone` remote for off-server storage, set
`OFFSITE_BACKUP_DEST` for the deploy user or in the cron entry:

```cron
17 2 * * * cd /opt/isvoi && PATH=/home/deploy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin OFFSITE_BACKUP_DEST=isvoi-backups:directus bash scripts/backup_beget_directus.sh >> /opt/isvoi/backups/directus/backup.log 2>&1
```

Restore and verification notes live in
[`docs/directus-backup-restore.md`](../../docs/directus-backup-restore.md).

The off-server restore rehearsal is automated:

```bash
cd /opt/isvoi
PATH=/home/deploy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  npm run directus:restore-rehearsal
```
