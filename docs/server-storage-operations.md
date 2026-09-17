# Server storage operations

The production checkout is `/opt/isvoi`. Runtime data, backups and secrets must
remain outside Git tracking even while legacy deployment paths are being
consolidated.

## Retention

- Directus backups use `scripts/prune_directus_backups.mjs` after a verified
  backup. The default policy keeps recent, daily, weekly and monthly recovery
  points.
- Communications backups keep six hours of externally verified snapshots on
  the production disk for fast restore. Their full immutable history remains in
  S3; incomplete and unverified local snapshots are never pruned automatically.
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

## Production maintenance record: 2026-09-14

Release `d6e84f93e7d1797e94552516412cc3dc78ce6e5b` installed the host maintenance
timer, journald limits and Docker log rotation. The operation reduced root disk
usage from 17 GB (43%) to 11 GB (29%) and inode use from 8% to 6%.

The retained rollback assets are:

- `backups/web/20260911T135338Z-product-sticky-4743592`;
- `backups/web/20260911T141249Z-product-full-sticky-d18a9d9`;
- `var/releases/c35ae75`.

The pre-change Directus backup is
`backups/directus/20260914T185307Z`; its PostgreSQL dump, uploads archive and
IndexNow state passed SHA-256 and archive validation. The cleanup manifest is
`var/storage-cleanup-20260914T185306Z.txt` on the production host.

The audit also found that `infra/directus-beget/.env` had become root-owned and
the 2026-09-14 nightly backup could not read it. Ownership was restored to
`deploy:deploy` with mode `0600`, a fresh backup succeeded under the same deploy
identity as cron, and the existing 02:17 UTC schedule was retained.

## Production maintenance record: 2026-09-17

The 30-minute communications backup was retaining 48 hours of full local media
bundles even though every completed snapshot had already passed S3 readback.
Ninety-nine local staging directories consumed 13 GB. Local retention is now
six hours and pruning uses the `comm_backups.external_verified` receipt rather
than directory age alone; incomplete and unverified snapshots remain untouched.

The verified cleanup reduced root filesystem use from 26 GB (69%) to 15 GB
(39%). Thirteen recent local communications recovery points use 1.7 GB, while
the immutable S3 history contains 145 verified snapshots. Four audited dangling
anonymous Docker volumes and empty directories from the failed legacy nightly
Directus job were removed. That redundant cron entry was retired; its historical
Directus daily/weekly/monthly recovery points remain under the standard
retention policy. The final backup and backup-health services succeeded, web and
Directus returned HTTP 200, and all seven Telegram/MAX workers remained active.

Cleanup manifest: `/opt/isvoi/var/storage-cleanup-20260917T141136Z.txt`.
