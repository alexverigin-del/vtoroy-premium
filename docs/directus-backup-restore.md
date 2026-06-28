# Directus Backup And Restore

Production Directus data has two parts and both must be backed up:

- PostgreSQL data from the `database` container;
- Directus Files from `infra/directus-beget/uploads`.

## Create Backup

On the Beget VPS:

```bash
cd /opt/isvoi
bash scripts/backup_beget_directus.sh
```

The script writes timestamped archives to:

```text
/opt/isvoi/backups/directus/YYYYMMDDTHHMMSSZ/
```

Each backup contains:

- `postgres.sql.gz`
- `uploads.tar.gz`
- `SHA256SUMS`
- `RESTORE.md`

The script verifies gzip, tar and sha256 checksums before it exits.

## Off-Server Copy

Backups should be copied outside the VPS. The backup script supports an optional
`rclone` remote so the same verified backup can be sent to Beget storage,
S3-compatible storage or another configured remote.

`rclone` is installed for the `deploy` user at `/home/deploy/bin/rclone`.
Configure the remote for that same user on the Beget VPS, then keep the remote
name/path in that user's environment or crontab, not in git:

```bash
OFFSITE_BACKUP_DEST=isvoi-backups:directus \
  bash scripts/backup_beget_directus.sh
```

The script uploads the timestamped backup directory and runs:

```bash
rclone check "$TARGET_DIR" "$OFFSITE_TARGET" --one-way --size-only
```

Use a dry run when changing the remote path:

```bash
OFFSITE_BACKUP_DEST=isvoi-backups:directus \
OFFSITE_BACKUP_DRY_RUN=1 \
  bash scripts/backup_beget_directus.sh
```

## Cron

Recommended daily cron for the `deploy` user:

```cron
17 2 * * * cd /opt/isvoi && bash scripts/backup_beget_directus.sh >> /opt/isvoi/backups/directus/backup.log 2>&1
```

Recommended daily cron after the off-server remote is configured:

```cron
17 2 * * * cd /opt/isvoi && PATH=/home/deploy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin OFFSITE_BACKUP_DEST=isvoi-backups:directus bash scripts/backup_beget_directus.sh >> /opt/isvoi/backups/directus/backup.log 2>&1
```

A local VPS archive is useful for fast rollback, but it is not enough for
disaster recovery.

## Verify Backup

```bash
cd /opt/isvoi/backups/directus/YYYYMMDDTHHMMSSZ
sha256sum -c SHA256SUMS
gzip -t postgres.sql.gz
tar -tzf uploads.tar.gz >/dev/null
```

## Restore Rehearsal

Do restore rehearsals on a separate host or temporary stack first. The database
restore command below overwrites the target database state.

```bash
cd /opt/isvoi/infra/directus-beget
set -a
. ./.env
set +a

gunzip -c /path/to/postgres.sql.gz \
  | docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE"

tar -C /opt/isvoi/infra/directus-beget -xzf /path/to/uploads.tar.gz
```

After a restore rehearsal:

```bash
docker compose restart directus
curl -fsS https://api.isvoi.ru/server/health
cd /opt/isvoi && npm run smoke:prod
```

Run a restore rehearsal after backup logic changes and at least quarterly once
the off-server copy is configured. Record the backup stamp, rehearsal host,
commands used and result in the project ops notes or the relevant maintenance
issue.
