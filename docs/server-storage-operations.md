# Server storage operations

The production checkout is `/opt/isvoi`. Runtime data, backups and secrets must
remain outside Git tracking even while legacy deployment paths are being
consolidated.

## Retention

- Directus backups use `scripts/prune_directus_backups.mjs` after a verified
  backup. The default policy keeps recent, daily, weekly and monthly recovery
  points.
- Keep no more than two verified compiled web rollback builds. Store them below
  `/opt/isvoi/backups/web` and name them with a leading UTC timestamp.
- Keep only the current and one previous immutable application release after the
  site moves to a `current -> releases/<commit>` deployment layout. Until that
  migration, PM2 runs the checked-out application from `/opt/isvoi`.
- `isvoi-storage-maintenance.timer` removes only `/tmp/isvoi-*` entries older
  than seven days. The script is a dry run unless `--apply` is passed.
- npm and Playwright caches are not removed by the timer. npm cache cleanup is a
  manual maintenance action; the Playwright browser cache is required by live
  smoke checks.

Install host maintenance files as root:

```bash
cd /opt/isvoi
bash scripts/install_storage_maintenance_on_host.sh
```

Preview temporary-file cleanup:

```bash
/usr/local/sbin/isvoi-prune-temp
```

## Log bounds

Docker Compose limits each Directus-stack container to three 10 MB JSON log
files. Journald is bounded to 200 MB on persistent storage and 64 MB at runtime,
with 2 GB reserved for other filesystem users.

After changing Compose logging options, create a verified Directus backup,
validate `docker compose config`, recreate the stack, and verify PostgreSQL
health plus `https://api.isvoi.ru/server/health`.

## Layout target

The safe migration target is:

```text
/opt/isvoi/current -> /opt/isvoi/releases/<commit>
/opt/isvoi/releases/<commit>
/var/lib/isvoi/directus-uploads
/var/lib/isvoi/private-communications
/var/backups/isvoi
/etc/isvoi
```

Move to this layout as a dedicated web release. Do not move the active checkout,
Directus bind mounts or PM2 working directory during routine storage cleanup.
