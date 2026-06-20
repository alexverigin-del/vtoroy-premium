# Directus catalog workflow

This workflow keeps a large ISVOI catalog manageable without turning Directus
into a pile of almost-identical product cards.

## Canonical collections

- `devices` is the product/inventory row. The public site reads rows where
  `status = published`.
- `device_images` owns product photos. The site reads published rows first and
  falls back to legacy JSON only when no managed photos exist.
- `directus_files` stores the actual image binaries. Product rows should refer
  to files by relation, not by bundled `/assets/...` paths.

## Device statuses

Use three separate concepts instead of overloading one field:

- `status`: public visibility. Use `draft`, `published`, `archived`.
- `stock_status`: operational state. Use `available`, `reserved`, `sold`,
  `hidden`. Legacy imports with `in_stock` are normalized to `available`.
- `content_status`: editorial readiness. Use `needs_content`, `needs_photo`,
  `review`, `ready`.

Recommended publishing rule:

1. Import or create a device as `status = draft`.
2. Fill required product fields and set `content_status = ready`.
3. Add at least one `device_images` row with `role = card`,
   `status = published`, `shot_status = approved`.
4. Set `stock_status = available`.
5. Publish with `status = published`.

Public storefront rule:

- `available`, `reserved` and `sold` can be shown publicly with a visible
  status badge.
- `hidden` is never rendered in the public catalog or product route.
- Related-device blocks prefer `available` / `reserved` rows and use sold rows
  only as a fallback when no live alternatives exist.

Product lead rule:

- `available`: product form creates a `purchase` lead with scenario
  `Забронировать устройство`.
- `reserved`: product form creates a `purchase` lead with scenario
  `Встать в лист ожидания по брони`.
- `sold`: product form creates a `selection` lead with scenario
  `Подобрать похожее устройство`.
- The current stock status is copied into the lead message so managers can see
  what the user saw at submit time.

## Import keys

For large batches, every imported row should carry:

- `source_system`: `xlsx`, `crm`, `supplier`, or `manual`.
- `source_id`: stable external identifier from that source.
- `import_batch`: human-readable batch label, for example `2026-06-stock`.
- `imported_at`: timestamp when the row was last imported.

The database has a unique index on `(source_system, source_id)` when
`source_id` is present, so repeated imports can be made idempotent without
creating duplicate product rows.

## Image roles

Use `device_images.role` consistently:

- `card`: catalog tile / listing thumbnail. One strong crop.
- `main`: main product page image.
- `screen`: display close-up.
- `body`: body/frame/back view.
- `defect`: visible defect or nuance.
- `other`: supporting detail.

Use `shot_status` to keep photo QA separate from public visibility:

- `needs_review`: uploaded but not approved.
- `approved`: usable on the site.
- `rejected`: should be replaced.

## Repeatable setup

Run this after creating/updating the Directus catalog schema:

```bash
npm run directus:setup:catalog \
  | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
```

Then restart Directus or flush cache so Studio/API sees new schema metadata.

Run the editor setup after `directus:setup:catalog` and
`directus:setup:leads`:

```bash
npm run directus:setup:editor \
  | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
```

This organizes Directus Studio for day-to-day catalog work:

- `devices` is split into editor-facing groups: publication, identity, price,
  media, copy, structured JSON and import/audit.
- Key fields are marked required in Studio: slug, public status, stock status,
  content status, category, title, price and price text.
- Field notes explain what is public, what is legacy fallback, and what should
  normally be changed only by imports.
- Collection display templates make relations readable in Studio lists:
  `devices` shows title, price and stock status; `device_images` shows parent
  device, role and label; `leads` shows kind, contact and processing status.
- The existing `Administrator` role remains the admin role. `ISVOI Editor` is
  for manual catalog/photo/lead work. `ISVOI Importer` is for batch imports and
  media sync.

On Beget, Python dependencies are installed in `/opt/isvoi/.venv`; either
activate that venv or run scripts as `.venv/bin/python scripts/...`.

## Studio roles

Use three operating roles:

- `Administrator`: full Directus administration, schema changes, users, roles
  and server settings.
- `ISVOI Editor`: manual catalog editing. Can create/update `devices` without
  deleting them, manage `device_images`, upload/update files, and process
  `leads`.
- `ISVOI Importer`: import automation. Can create/update imported device rows,
  replace imported media rows and upload files, but should not be used for
  normal manual editing or user management.

Recommended account split:

- Human editors get `ISVOI Editor`.
- Import scripts use a dedicated service user with `ISVOI Importer`.
- Admin accounts are kept for maintenance only and should not be used in
  frontend/server tokens.

## Lead processing

Use the `leads` collection as the working queue until Telegram automation is
enabled.

Recommended flow:

1. Open the `Обработка заявок` preset in `leads`.
2. Assign `assigned_to`, check `kind`, `device_id`, `source_path` and UTM.
3. Move `status` from `new` to `in_progress`.
4. Set `contact_channel`, `last_contacted_at` and, if needed,
   `next_action_at`.
5. Keep the current short context in `manager_note`.
6. Add durable call/message history in `lead_comments`.
7. Finish with `won`, `lost` or `archived`; use `waiting_client` when the next
   move is on the client side.

The public site can only create lead rows through the lead-intake policy. Manual
processing stays in the `ISVOI Editor` role.

## Import workflow

1. Generate the import template:

```bash
npm run directus:catalog:template -- --out catalog_import_template.xlsx
```

2. Prepare an `.xlsx` file with one row per device.
3. Include stable `id`; optionally include `source_system`, `source_id`,
   `import_batch`, `stock_status`, `content_status`.
4. Use `image_card`, `image_main`, `image_screen`, `image_body`,
   `image_defect`, `image_other` columns for local image paths.
   For multiple photos with the same role, use numbered columns such as
   `image_main_2`, `image_main_2_label`, `image_main_2_alt`.
5. Dry-run first:

```bash
python scripts/import_devices_from_excel.py \
  --file stock.xlsx \
  --assets-root ./photos \
  --import-batch 2026-06-stock \
  --dry-run
```

6. Import:

```bash
python scripts/import_devices_from_excel.py \
  --file stock.xlsx \
  --assets-root ./photos \
  --import-batch 2026-06-stock
```

7. In Studio, filter `content_status != ready` or `shot_status != approved`
   to finish editorial/photo QA before publishing.

By default, imported device rows are created as `status = draft`. This is
intentional: publish only after checking the card text, price, Passport and
photo roles in Studio. Use `--default-status published` only for trusted,
already-reviewed batches.

Repeated imports are idempotent:

- if `id` exists, the row is updated by `id`;
- otherwise, if `source_system + source_id` matches an existing row, that row is
  updated;
- if neither can identify an existing row, `id` is required to create a new
  public slug.
