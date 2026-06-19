# ISVOI catalog workflow

This workflow is the source of truth before large-scale catalog filling. It keeps
device data, product photos, Directus Files, and the Next.js storefront aligned.

## Data model

Use these Directus collections for product inventory:

- `devices` stores the device card/passport/trade data.
- `device_images` stores all product media rows.
- `directus_files` stores uploaded files and metadata.

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
python scripts/optimize_images.py --src ./incoming --out ./optimized --max 2400 --quality 88
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

## Import order

For every catalog batch:

1. Prepare or update the source spreadsheet.
2. Convert the spreadsheet to the catalog JSON shape or update `data/devices.json`.
3. Seed/update Directus device rows.
4. Upload/link media into Directus Files.
5. Check `/catalog` and 2-3 device pages.

Commands:

```bash
npm run directus:seed
npm run directus:import:xlsx -- --file stock.xlsx --dry-run
npm run directus:import:xlsx -- --file stock.xlsx
npm run directus:media -- --dry-run
npm run directus:media
```

Use `--replace` only when intentionally overwriting existing media links:

```bash
npm run directus:media -- --replace
```

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
isvoi:{device_id}:{role}:{index}
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

## Pre-fill checklist

Before adding hundreds of rows:

- `device_images` exists and is visible in Directus Studio.
- Public read policy can read published `device_images` and `directus_files`.
- `/catalog` shows Directus URLs for filled card images.
- `/device/{slug}` shows Directus URLs for filled gallery rows.
- Legacy `.html` routes redirect to live Next routes.
- `npm run directus:media -- --dry-run` completes cleanly for the batch.
