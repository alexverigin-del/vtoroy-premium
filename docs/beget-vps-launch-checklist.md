# Beget VPS launch checklist — ISVOI

A practical, copy-paste runbook for standing up the full ISVOI stack on a
fresh **Ubuntu** Beget VPS:

```
Public Site (Next.js) ──> Directus API ──> PostgreSQL
Admin                 ──> Directus Studio (same origin as the API)
Python jobs           <──> Directus API / PostgreSQL <──> Storage <──> Telegram / Excel / Reports
```

Directus serves **both** the REST/GraphQL API and the Studio admin UI from the
same origin, so the "api" and "admin" surfaces share **one** subdomain
(`api.your-domain.ru`). The public Next.js site lives on the root domain.

> Conventions in this doc:
> - Replace `your-domain.ru` with your real domain and `youruser` with your
>   Linux login everywhere.
> - `$` lines run as a normal sudo-capable user; `#`-prefixed notes are comments.
> - Runtime data, uploads and every `.env` are gitignored — they never enter the repo.

---

## Current ISVOI production snapshot (2026-06-18)

This repo is currently deployed on the Beget VPS below. Keep this section in
sync when changing the live infrastructure.

| Item | Current value |
| ---- | ------------- |
| VPS IP | `217.114.14.32` |
| SSH deploy user | `deploy@217.114.14.32` |
| SSH key | `C:\Users\1\.ssh\isvoi_beget_ed25519` |
| Server checkout | `/opt/isvoi` |
| Public site | `https://isvoi.ru/` and `https://www.isvoi.ru/` |
| Directus API | `https://api.isvoi.ru/` |
| Directus Studio | `https://api.isvoi.ru/admin/` |
| Next.js process | PM2 app `isvoi-web` |
| Directus stack | `/opt/isvoi/infra/directus-beget` |
| Directus container | `directus-beget-directus-1` |
| PostgreSQL container | `directus-beget-database-1` |
| Nginx site config | `/etc/nginx/sites-available/isvoi` |
| Certbot certificate | `/etc/letsencrypt/live/isvoi.ru/fullchain.pem` |

Live routing notes:

- `isvoi.ru` / `www.isvoi.ru` proxy to Next.js on `127.0.0.1:3000`.
- `api.isvoi.ru` proxies to Directus on `127.0.0.1:8055`.
- `http://api.isvoi.ru/admin` redirects to `https://api.isvoi.ru/admin/`.
- The trailing slash on `/admin/` matters because Directus Studio serves
  relative assets from `./assets/...`.
- Nginx gzip is enabled for the Directus API host. This is required in practice
  because Directus Studio ships a large `v-form-*.js` asset; without gzip it can
  stay pending in the browser and the Studio remains on `Loading...`.
- Next reads editable content from Directus with a server-only read token in
  `DIRECTUS_TOKEN`. Do not expose this token through `NEXT_PUBLIC_*`.

Current production env expectations:

```bash
# /opt/isvoi/infra/directus-beget/.env
PUBLIC_URL=https://api.isvoi.ru
CORS_ORIGIN=https://isvoi.ru,https://www.isvoi.ru,https://api.isvoi.ru,http://isvoi.ru,http://api.isvoi.ru

# /opt/isvoi/apps/web/.env.local
DIRECTUS_URL=http://127.0.0.1:8055
NEXT_PUBLIC_DIRECTUS_URL=https://api.isvoi.ru
DIRECTUS_TOKEN=<public-read static token, server-only>
```

Useful production checks:

```bash
curl -I https://isvoi.ru/
curl -I https://api.isvoi.ru/admin/
curl -I -H "Accept-Encoding: gzip" \
  https://api.isvoi.ru/admin/assets/v-form-DeyhrAq5.js

ssh -i C:\Users\1\.ssh\isvoi_beget_ed25519 deploy@217.114.14.32 \
  "cd /opt/isvoi && pm2 status isvoi-web"

ssh -i C:\Users\1\.ssh\isvoi_beget_ed25519 deploy@217.114.14.32 \
  "cd /opt/isvoi/infra/directus-beget && docker compose ps"
```

Certbot was registered with `email = solexin@yandex.ru` in
`/etc/letsencrypt/cli.ini`. `certbot.timer` is enabled for automatic renewal.

---

## 0. Prerequisites & assumptions

- A Beget VPS running **Ubuntu 22.04/24.04** with root or sudo access.
- A registered domain whose DNS you control.
- The GitHub repo URL for this project.
- SSH key access to the VPS (password login is fine but keys are recommended).
- Local tools on your laptop: `ssh`, `git`, and a way to generate secrets
  (`openssl`).

Resource guidance: Directus + Postgres + Redis + Next.js fit comfortably in
**2 vCPU / 4 GB RAM**. 2 GB works for a light catalog but leaves little
headroom for image processing jobs.

---

## 1. DNS records

Point these records at the VPS public IP (`A` records; add `AAAA` if you have IPv6).

| Record | Host                | Type | Value (example)   | Purpose                          |
| ------ | ------------------- | ---- | ----------------- | -------------------------------- |
| root   | `your-domain.ru`    | A    | `203.0.113.10`    | Public Next.js site              |
| www    | `www.your-domain.ru`| A    | `203.0.113.10`    | Redirects to root (optional)     |
| api    | `api.your-domain.ru`| A    | `203.0.113.10`    | Directus API **and** Studio admin|

There is no separate `admin` record: the Directus Studio admin UI is served at
`https://api.your-domain.ru/admin` on the same origin as the API.

Verify propagation before issuing certificates:

```bash
dig +short your-domain.ru
dig +short api.your-domain.ru
```

---

## 2. Server access & system update

```bash
ssh youruser@your-domain.ru          # or ssh youruser@<vps-ip>

sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl gnupg git ufw
```

Optional but recommended firewall (see §13 for the full policy):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
sudo ufw status
```

---

## 3. Install Docker + Compose plugin

```bash
# Docker's official apt repository
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (log out/in afterwards for it to take effect)
sudo usermod -aG docker "$USER"

docker --version
docker compose version
```

---

## 4. Install Nginx + Certbot

```bash
sudo apt -y install nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

---

## 5. Install Node.js + npm (for the Next.js site)

```bash
# Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node --version    # expect v20.x
npm --version
```

A process manager keeps `next start` alive across reboots/crashes:

```bash
sudo npm install -g pm2
```

---

## 6. Install Python venv (for the back-office jobs)

```bash
sudo apt -y install python3 python3-venv python3-pip
```

The virtualenv itself is created in §10.

---

## 7. Clone the GitHub repo

```bash
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
cd /var/www
git clone https://github.com/<owner>/<repo>.git vtoroy-premium-landing
cd vtoroy-premium-landing
```

---

## 8. Configure env files

Generate strong secrets up front:

```bash
openssl rand -hex 32   # use for SECRET
openssl rand -hex 24   # use for DB_PASSWORD (or any strong password manager value)
```

**Backend — `infra/directus-beget/.env`:**

```bash
cd /var/www/vtoroy-premium-landing/infra/directus-beget
cp .env.example .env
nano .env
# Fill: SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, DB_PASSWORD
#       PUBLIC_URL=https://api.your-domain.ru
#       CORS_ORIGIN=https://your-domain.ru,https://api.your-domain.ru
```

**Python jobs — `scripts/.env`:**

```bash
cd /var/www/vtoroy-premium-landing/scripts
cp .env.example .env
nano .env
# Fill: DIRECTUS_URL=https://api.your-domain.ru
#       DIRECTUS_TOKEN=<Editor-role static token, created in §11>
#       TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (if you want lead alerts)
```

**Public site — `apps/web/.env.local`:**

```bash
cd /var/www/vtoroy-premium-landing/apps/web
cp .env.example .env.local
nano .env.local
# Set: DIRECTUS_URL=http://127.0.0.1:8055   # on the same VPS
#      NEXT_PUBLIC_DIRECTUS_URL=https://api.your-domain.ru
#      (optional) DIRECTUS_TOKEN=<public read token>
```

Every `.env*` is gitignored; only `*.env.example` templates are committed. See
each template's inline comments for what every variable means.

---

## 9. Start Directus + PostgreSQL (+ Redis) with Docker Compose

```bash
cd /var/www/vtoroy-premium-landing/infra/directus-beget
docker compose up -d
docker compose ps           # database healthy, directus + cache running
docker compose logs -f directus    # watch first-run bootstrap, then Ctrl-C
```

Directus is published on `127.0.0.1:8055` only — it is reachable from the host
(and nginx) but not directly from the internet. Quick local check:

```bash
curl -fsS http://127.0.0.1:8055/server/health    # {"status":"ok"}
```

---

## 10. Create the Python virtualenv & install deps

```bash
cd /var/www/vtoroy-premium-landing
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r scripts/requirements.txt
```

---

## 11. Create the Directus admin & a service token

1. Browse to `https://api.your-domain.ru/admin/` (after §12–13 give you TLS) or,
   before TLS, tunnel locally: `ssh -L 8055:127.0.0.1:8055 youruser@your-domain.ru`
   then open `http://localhost:8055/admin`.
2. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `infra/directus-beget/.env`,
   then **change the admin password** immediately (Settings → your user).
3. Create a least-privilege **Editor** role (CRUD on `devices` etc., no user/role
   management) and a user assigned to it. Open that user → **Token** → generate a
   static token. Put it in `scripts/.env` as `DIRECTUS_TOKEN` (never the admin token).
4. For the public site, create a read-only role limited to
   `status = published` (or enable anonymous read on `devices`), and — if you
   want a token — put it in `apps/web/.env.local` as `DIRECTUS_TOKEN`.

See `directus/schema/collections.md` for the full roles/permissions spec.

---

## 12. Seed the catalog devices

With the Python venv active and `scripts/.env` filled:

```bash
cd /var/www/vtoroy-premium-landing
source .venv/bin/activate

# Dry run first — prints payloads, makes NO network calls:
python scripts/seed_directus.py --dry-run

# Real run — auto-creates the `devices` collection (idempotent) and upserts
# the devices from data/devices.json:
python scripts/seed_directus.py
```

Re-running is safe: the script checks-before-create at collection, field and row
level, so it never duplicates data. Override the source file with
`--file /path/to/devices.json` if needed.

---

## 13. Run the Next.js site

**Dev smoke test (optional, quick sanity):**

```bash
cd /var/www/vtoroy-premium-landing/apps/web
npm install
npm run dev        # http://127.0.0.1:3000 — Ctrl-C when done
```

**Production build + start under pm2 (recommended):**

```bash
cd /var/www/vtoroy-premium-landing/apps/web
npm install
npm run build
pm2 start "npm run start" --name isvoi-web --cwd /var/www/vtoroy-premium-landing/apps/web
pm2 save
pm2 startup        # run the printed command once to enable boot persistence
```

`next start` listens on `127.0.0.1:3000`; nginx proxies to it (next step).

> If you are not ready to cut over to Next.js yet, you can keep serving the
> existing static root site instead — see the TRANSITION OPTION block in
> `nginx/public-site.conf.example`.

---

## 14. Nginx reverse proxy

Copy the vhost examples and edit the domain placeholders:

```bash
cd /var/www/vtoroy-premium-landing/infra/directus-beget
sudo cp nginx/public-site.conf.example /etc/nginx/sites-available/isvoi-public.conf
sudo cp nginx/api-admin.conf.example   /etc/nginx/sites-available/isvoi-api.conf

sudo nano /etc/nginx/sites-available/isvoi-public.conf   # set your-domain.ru
sudo nano /etc/nginx/sites-available/isvoi-api.conf      # set api.your-domain.ru

sudo ln -s /etc/nginx/sites-available/isvoi-public.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/isvoi-api.conf    /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx
```

- `isvoi-public.conf` → proxies `your-domain.ru` to the Next.js app on `:3000`.
- `isvoi-api.conf` → proxies `api.your-domain.ru` (API **and** `/admin/`) to
  Directus on `:8055`, with WebSocket upgrade headers and a larger
  `client_max_body_size` for uploads.
- It also redirects `/admin` to `/admin/`, enables gzip for large Studio
  assets, and enables proxy buffering for smoother delivery through nginx.

> The example vhosts reference `ssl_certificate` paths that do not exist yet.
> `nginx -t` will fail until §15 issues the certs. If you prefer, issue certs
> first against plain HTTP vhosts, then enable the TLS server blocks — or run
> `certbot --nginx` (below), which edits the configs for you.

---

## 15. Issue SSL certificates (Let's Encrypt)

The simplest path uses the certbot nginx plugin, which both obtains the certs
and wires them into your vhosts:

```bash
sudo certbot --nginx \
  -d your-domain.ru -d www.your-domain.ru \
  -d api.your-domain.ru

sudo nginx -t && sudo systemctl reload nginx
```

Auto-renewal is installed by the certbot package; verify with:

```bash
sudo certbot renew --dry-run
```

After certs exist, make sure `PUBLIC_URL` / `CORS_ORIGIN` in
`infra/directus-beget/.env` use the real `https://` URLs, then:

```bash
cd /var/www/vtoroy-premium-landing/infra/directus-beget
docker compose up -d directus      # recreates Directus with the new env
```

---

## 16. Smoke tests

```bash
# Directus API + Studio over TLS
curl -fsS https://api.your-domain.ru/server/health        # {"status":"ok"}
curl -fsS "https://api.your-domain.ru/items/devices?filter[status][_eq]=published&limit=1"

# Public site
curl -fsSI https://your-domain.ru/                        # HTTP/2 200
```

Then in a browser:

- `https://your-domain.ru/` — home renders, catalog shows seeded devices.
- `https://your-domain.ru/catalog` and a device page (e.g. `/device/iphone-13-pro`).
- `https://api.your-domain.ru/admin` — Studio login works.
- Submit a lead form and confirm a row appears in Directus `leads` (and a
  Telegram alert if configured).

---

## 17. Rollback basics

- **Next.js bad deploy:** `pm2 logs isvoi-web` to inspect; revert the checkout
  (`git checkout <previous-sha> -- apps/web` or `git reset --hard <sha>`),
  `npm run build`, `pm2 restart isvoi-web`. To fall back to the static site,
  switch `isvoi-public.conf` to the TRANSITION OPTION block and reload nginx.
- **Directus bad config/upgrade:** `docker compose logs directus`; pin the image
  back (e.g. `directus/directus:11.x.y`) in `docker-compose.yml`, then
  `docker compose up -d`. Data persists in `./data/postgres` and `./uploads`.
- **Full stop:** `docker compose down` (keeps volumes) — never `down -v` unless
  you intend to delete the database and uploads.

---

## 18. Backups

**PostgreSQL (logical dump):**

```bash
cd /var/www/vtoroy-premium-landing/infra/directus-beget
# Reads DB_USER/DB_DATABASE from the running container's env via .env:
docker compose exec -T database \
  pg_dump -U "$(grep ^DB_USER .env | cut -d= -f2)" \
          "$(grep ^DB_DATABASE .env | cut -d= -f2)" \
  | gzip > ~/backups/isvoi-db-$(date +%F).sql.gz
```

**Directus uploads (file library):**

```bash
tar czf ~/backups/isvoi-uploads-$(date +%F).tar.gz \
  -C /var/www/vtoroy-premium-landing/infra/directus-beget uploads
```

Automate both with a daily cron entry and copy the archives off the VPS
(e.g. to Beget storage or S3). Test a restore at least once:

```bash
gunzip -c isvoi-db-YYYY-MM-DD.sql.gz \
  | docker compose exec -T database psql -U <DB_USER> <DB_DATABASE>
```

---

## 19. Production readiness checklist

- [ ] **Strong `SECRET`** — 32+ random bytes (`openssl rand -hex 32`), unique per env.
- [ ] **Strong `DB_PASSWORD`** — long & random; never the example value.
- [ ] **Admin password rotated** after first Studio login.
- [ ] **Restricted Directus public permissions** — public/anonymous role reads
      only `devices` (and relations) where `status = published`; lead intake is
      a narrow create-only role. No public access to system collections.
- [ ] **No admin token in the frontend or jobs** — use least-privilege Editor /
      read tokens only. The admin token never leaves the Studio.
- [ ] **Backups scheduled** (Postgres dump + uploads tarball) and restore tested.
- [ ] **Firewall** — only `22` (SSH), `80`, `443` open; Directus stays on
      `127.0.0.1:8055`, Postgres/Redis are not published to the internet.
- [ ] **TLS auto-renewal** verified (`certbot renew --dry-run`).
- [ ] **`PUBLIC_URL` / `CORS_ORIGIN`** set to real `https://` URLs; CORS origin
      is the exact public domain, not `*`.
- [ ] **Process persistence** — `pm2 save` + `pm2 startup` so the site survives reboot.

---

## Related docs

- `infra/directus-beget/README.md` — backend quick start & security notes.
- `docs/architecture-directus-next-python.md` — target architecture & migration plan.
- `docs/directus-catalog-mvp.md` — catalog MVP seed + live-read details.
- `directus/schema/collections.md` — collections, roles & permissions spec.
