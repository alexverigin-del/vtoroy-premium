# Directus + PostgreSQL on a Beget VPS

Infrastructure foundation for the future Второй Премиум backend. This is
**scaffolding** — nothing here is wired into the live static site.

## What this provides

- **PostgreSQL 16** — the database.
- **Directus 11** — headless CMS + REST/GraphQL API + Studio admin UI.
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
   `docker compose up -d` again.
5. Run the Next.js site (`npm run web:build && npm run web:start`) behind the
   public vhost, or keep serving the static site during the transition (see the
   commented block in `public-site.conf.example`).

## Security notes

- `.env` is gitignored; only `.env.example` (placeholders) is committed.
- Directus is published on `127.0.0.1:8055` so it is only reachable through nginx.
- Rotate `ADMIN_PASSWORD` after first login; consider creating a separate,
  least-privilege role for the public site's read token (see
  `../../directus/schema/collections.md`).
