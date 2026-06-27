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

## Cron

Recommended daily cron for the `deploy` user:

```cron
17 2 * * * cd /opt/isvoi && bash scripts/backup_beget_directus.sh >> /opt/isvoi/backups/directus/backup.log 2>&1
```

Copy backups off the VPS regularly. A local VPS archive is useful for fast
rollback, but it is not enough for disaster recovery.

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
