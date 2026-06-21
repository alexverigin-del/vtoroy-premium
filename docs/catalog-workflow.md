# ISVOI catalog workflow

This workflow is the source of truth before large-scale catalog filling. It keeps
device data, product photos, Directus Files, and the Next.js storefront aligned.

## Data model

Use these Directus collections for product inventory:

- `devices` stores the device card/passport/trade data.
- `device_images` stores all product media rows.
- `directus_files` stores uploaded files and metadata.

Directus Files folders:

| Folder | Use |
| --- | --- |
| `ISVOI Device Photos` | Product photos used by `device_images` and `devices.listing_file`. |
| `ISVOI Site Assets` | Non-product site images for hero, store, diagnostics and page sections. |
| `ISVOI Editorial` | Future editorial/blog/guide images. |

`devices.listing_file` remains the preferred catalog card image. It is also
mirrored as a `device_images` row with `role = card`. The storefront reads
`device_images` first and falls back to legacy `devices.gallery` JSON only when
no published gallery rows exist.

Image roles:

| Role | Use |
| --- | --- |
| `card` | Catalog card image. One per device. |
| `main` | Primary image on the device page. |
| `screen` | Screen condition shot. |
| `body` | Body/casing condition shot. |
| `defect` | Defect/imperfection close-up. |
| `other` | Extra view when none of the above fits. |

## Image preparation

Raw photos should be stored outside the repo, then optimized before upload:

```bash
pip install -r scripts/requirements.txt
python scripts/optimize_images.py --src ./incoming --out ./optimized --max 2400 --quality 88
```

On Beget the Python jobs use the project virtual environment:

```bash
cd /opt/isvoi
. .venv/bin/activate
```

The script:

- applies EXIF orientation;
- keeps aspect ratio;
- limits the largest side;
- exports WebP.

Directus still performs delivery transforms at request time, so uploaded files
can stay high quality. The site requests:

- card images: `720x540`, `fit=cover`, `quality=82`, `format=auto`;
- gallery images: `1200x900`, `fit=cover`, `quality=86`, `format=auto`;
- passport defect images: `900x675`, `fit=cover`, `quality=84`, `format=auto`.

`format=auto` lets Directus serve WebP/AVIF-capable output when supported by the
client, with fallback for older clients.

## Unified Excel import

For large batches, keep device fields and media links in the same `.xlsx` file.
One row is one device. The `id` column is required and must match the public
slug. Device fields may use either Directus snake_case names (`price_text`) or
catalog camelCase aliases (`priceText`).

Media columns:

| Column | Use |
| --- | --- |
| `image_card` | Catalog card image. Also updates `devices.listing_file`. |
| `image_main` | Primary gallery image on the device page. |
| `image_screen` | Screen condition shot. |
| `image_body` | Body/casing condition shot. |
| `image_defect` | Defect/imperfection close-up. |
| `image_other` | Additional image. |
| `image_{role}_alt` | Optional alt text for a role. |
| `image_{role}_label` | Optional gallery/passport label for a role. |

Image paths may be absolute, or relative to `--assets-root`:

```bash
npm run directus:import:xlsx -- --file stock.xlsx --assets-root ./optimized --dry-run
npm run directus:import:xlsx -- --file stock.xlsx --assets-root ./optimized
```

The importer uploads missing files to Directus Files, creates or updates
`device_images`, and links `image_card` to `devices.listing_file`. Re-running the
same file is idempotent because uploaded files get deterministic titles:

```text
isvoi:{device_id}:{role}:xlsx
```

Useful flags:

```bash
npm run directus:import:xlsx -- --file stock.xlsx --skip-media
npm run directus:import:xlsx -- --file stock.xlsx --replace-media
```

Use `--skip-media` when only device text/specs should change. Use
`--replace-media` only when intentionally overwriting existing media links.

## Import order

For every production catalog batch:

1. Create a batch folder outside the repo, for example `/opt/isvoi/imports/2026-06-stock`.
2. Put the source workbook in that folder.
3. Put raw photos in `incoming/`.
4. Optimize source photos into `optimized/`.
5. Run the batch runner without `--apply`.
6. Fix workbook/photo issues until dry-run is clean.
7. Run the same command with `--apply`.
8. Check `/catalog` and 2-3 device pages.

Commands:

```bash
cd /opt/isvoi
. .venv/bin/activate
python scripts/optimize_images.py \
  --src /opt/isvoi/imports/2026-06-stock/incoming \
  --out /opt/isvoi/imports/2026-06-stock/optimized \
  --max 2400 \
  --quality 88

bash scripts/run_catalog_import_batch.sh \
  --file /opt/isvoi/imports/2026-06-stock/stock.xlsx \
  --assets-root /opt/isvoi/imports/2026-06-stock/optimized \
  --batch 2026-06-stock

bash scripts/run_catalog_import_batch.sh \
  --file /opt/isvoi/imports/2026-06-stock/stock.xlsx \
  --assets-root /opt/isvoi/imports/2026-06-stock/optimized \
  --batch 2026-06-stock \
  --apply
```

The batch runner always performs a dry-run first. In apply mode it then imports
the workbook, uploads product files to `ISVOI Device Photos`, links
`device_images`, and runs image/catalog audits.

Use `--default-status published` only for rows that have already passed content
and photo QA. The safer default is `draft`.

For non-developers, use the operator wrapper instead of raw SSH commands:

```powershell
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock"
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock" -Apply
```

See `docs/catalog-operator-guide.md`.

The preferred Studio-first workflow is `catalog_import_batches`: create a batch
record, attach `stock.xlsx` and a ZIP with photos, then use the Directus Manual
Flow buttons:

- `ISVOI: проверить партию каталога`
- `ISVOI: импортировать партию каталога`

The Studio operator screen is configured separately from the webhook buttons:

```bash
npm run directus:setup:catalog-import-operator-screen
```

It adds the `ISVOI Catalog Imports` files folder, operator bookmarks, and safe
editor permissions so status/log fields are written only by automation.

The older JSON media importer remains available for maintenance scripts:

```bash
npm run directus:media -- --dry-run
npm run directus:media -- --replace
```

## Finish image migration

Production images should resolve through Directus Files, not bundled
`assets/...` paths stored in Directus content. Use this sequence after uploading
or replacing product/site media:

```bash
node scripts/setup_directus_file_folders_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
npm run directus:media
npm run directus:site-assets -- --replace
node scripts/normalize_directus_device_image_refs_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
npm run directus:normalize-images -- --dry-run
```

Then audit the database:

```bash
node scripts/audit_directus_image_refs_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
```

Expected result for migrated content:

- `devices.listing_image.local = 0`
- `devices.gallery.local = 0`
- `devices.passport.local = 0`
- `page_sections.content.local = 0`
- `devices.with_listing_file` matches the number of product rows with a card
  image
- `device_images.with_file` matches the number of approved product image rows

## File naming convention

For bulk import, keep source image paths stable and predictable:

```text
assets/catalog-{slug}.webp
assets/device-{slug}-main.webp
assets/device-{slug}-screen.webp
assets/device-{slug}-body.webp
assets/device-{slug}-defect.webp
```

The importer creates deterministic Directus file titles:

```text
isvoi:{device_id}:{role}:xlsx
```

This makes repeated imports idempotent and avoids duplicate file uploads.

## Directus Studio workflow

For manual edits:

1. Upload files to the `ISVOI Device Photos` folder.
2. Open `device_images`.
3. Create or update rows for the device and role.
4. Set `status = published`.
5. Fill `label` and `alt`.

Avoid editing `devices.gallery` for new content. It is legacy fallback only.

## Production QA gates

Treat these audit checks as blockers before publishing a batch:

- `devices.visible.missing_required_copy` must be `0`.
- `devices.visible.not_ready` must be `0` for devices intended to be live.
- `devices.visible.no_listing_file` must be `0`.
- `devices.visible.no_card_image` must be `0`.
- `devices.visible.no_gallery_image` should be `0` for commercial product pages.
- `device_images.without_file` must be `0`.
- `device_images.orphan_device` must be `0`.
- image legacy checks from `directus:audit-images` must all be `0`.

Run catalog audit manually when needed:

```bash
node scripts/audit_directus_catalog_sql.mjs \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
```

## Pre-fill checklist

Before adding hundreds of rows:

- `device_images` exists and is visible in Directus Studio.
- Public read policy can read published `device_images` and `directus_files`.
- `ISVOI Device Photos`, `ISVOI Site Assets` and `ISVOI Editorial` folders exist.
- `/catalog` shows Directus URLs for filled card images.
- `/device/{slug}` shows Directus URLs for filled gallery rows.
- Legacy `.html` routes redirect to live Next routes.
- `bash scripts/run_catalog_import_batch.sh --file stock.xlsx --assets-root ./optimized --batch test` completes cleanly for the batch.
