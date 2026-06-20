# Directus collections — ISVOI

Proposed schema, derived from the current static prototype data
(`data/devices.json`) and the planned admin workflow. This is the **spec** the
Directus collections should be modeled on; create them in Directus Studio or via
a snapshot/migration. The shared TypeScript contract lives in
`packages/shared/src/device.ts` and should be kept in sync.

Field types use Directus terminology. `M2O` = many-to-one, `O2M` = one-to-many,
`M2M` = many-to-many.

> **MVP divergence (current implementation).** The seed script
> `scripts/seed_directus.py` and the Next.js fetcher (`apps/web/lib/directus.ts`)
> currently use a **single `devices` collection**: scalar fields as snake_case
> columns, and `tags` / `gallery` / `passport` / `trade` as **JSON columns**.
> `listing_image` is a plain string path (no file relation) so the MVP needs no
> binary uploads. The relational sub-collections below (`device_gallery`,
> `device_passports`, `trade_options`) remain the documented future target for
> richer per-row admin editing; promote the JSON fields to them when that UX is
> needed.

---

## `devices` (main catalog)

| Field             | Type            | Notes                                              |
| ----------------- | --------------- | -------------------------------------------------- |
| `id`              | string (PK)     | Slug, e.g. `iphone-13-pro`. Used in URLs.          |
| `status`          | string (enum)   | `draft` / `published` / `archived`. Gate public.   |
| `stock_status`    | string (enum)   | `in_stock`, `reserved`, `sold`, `service`, `hidden`. |
| `content_status`  | string (enum)   | `needs_content`, `needs_photo`, `review`, `ready`. |
| `sort`            | integer         | Manual ordering.                                   |
| `category`        | string (enum)   | `iphone` / `ipad` / `macbook` / …                  |
| `tags`            | JSON / M2M tags | e.g. `["iphone","club"]`.                          |
| `title`           | string          | Display title.                                     |
| `model`           | string          |                                                    |
| `specs`           | string          | e.g. `256 GB`.                                      |
| `storage`         | string          |                                                    |
| `color`           | string          |                                                    |
| `serial`          | string          | Masked IMEI/SN for display (e.g. `IMEI ···4821`).  |
| `price`           | integer         | RUB.                                                |
| `price_text`      | string          | Pre-formatted, e.g. `59 900 ₽`.                     |
| `grade`           | string          | `A−`, `A`, `B+`, …                                  |
| `battery`         | string          | `89%` or `214 циклов`.                              |
| `battery_text`    | string          |                                                    |
| `warranty`        | string          | e.g. `90 дней`.                                     |
| `exit`            | string          | Exit-price headline, e.g. `до 42 000 ₽`.            |
| `availability`    | text            |                                                    |
| `short_description` | text          | Catalog card subtitle.                              |
| `headline`        | string          | Product page H1.                                    |
| `listing_file`    | M2O -> directus_files | Catalog thumbnail managed in Directus Files.  |
| `listing_image`   | string          | Legacy catalog thumbnail path fallback.        |
| `listing_alt`     | string          | Alt text.                                           |
| `cta_label`       | string          | e.g. `Смотреть паспорт`.                            |
| `gallery`         | O2M → `device_gallery` | Ordered images.                             |
| `passport`        | O2M (1) → `device_passports` | One passport per device.              |
| `trade_options`   | O2M → `trade_options` | Trade-in estimates.                          |

## `device_gallery`

| Field      | Type                 | Notes                       |
| ---------- | -------------------- | --------------------------- |
| `id`       | uuid (PK)            |                             |
| `device`   | M2O → `devices`      |                             |
| `image`    | M2O → directus_files |                             |
| `label`    | string               | `Общий вид` / `Экран` / …   |
| `alt`      | string               |                             |
| `sort`     | integer              |                             |

## `device_passports` (the "ISVOI Passport")

One row per device.

| Field               | Type             | Notes                                            |
| ------------------- | ---------------- | ------------------------------------------------ |
| `id`                | uuid (PK)        |                                                  |
| `device`            | M2O → `devices`  | Unique.                                          |
| `repair`            | string           | e.g. `не вскрывался`.                            |
| `water`             | string           | e.g. `следов нет`.                               |
| `summary_rows`      | JSON             | `[{label,value,state}]` — state ∈ ok/warn/bad.   |
| `diagnostics_status`| string           | e.g. `пройдена`.                                 |
| `diagnostics_checklist` | JSON         | `[{text,state}]`.                                |
| `condition_grade_text` | string        | e.g. `грейд A−`.                                 |
| `condition_note`    | text             |                                                  |
| `condition_notes`   | JSON             | `string[]`.                                      |
| `defect_photo`      | M2O → directus_files |                                              |
| `defect_photo_alt`  | string           |                                                  |
| `warranty_duration` | string           |                                                  |
| `warranty_covered`  | text             |                                                  |
| `warranty_not_covered` | text          |                                                  |
| `exit_headline`     | string           |                                                  |
| `exit_buy_today`    | string           |                                                  |
| `exit_trade_in_estimate` | string      |                                                  |
| `exit_condition`    | string           |                                                  |
| `exit_note`         | text             |                                                  |

> The `summary_rows`, `diagnostics_checklist` and `condition_notes` JSON fields
> mirror the nested arrays in the prototype. They can be promoted to proper
> related collections later if the admin needs per-row editing UX.

## `trade_options`

| Field      | Type             | Notes                            |
| ---------- | ---------------- | -------------------------------- |
| `id`       | uuid (PK)        |                                  |
| `device`   | M2O → `devices`  |                                  |
| `value`    | integer          | Estimated trade-in value, RUB.   |
| `label`    | string           | e.g. `iPhone 12 · 26 000 ₽`.     |
| `sort`     | integer          |                                  |

## `leads` (site lead workflow)

Captures product reservations, selection requests, Trade, Upgrade and Club
leads. The public site writes through the Next.js `/lead-intake` route using a
create-only Directus token; Public must not have write access.

| Field          | Type             | Notes                                                       |
| -------------- | ---------------- | ----------------------------------------------------------- |
| `id`           | uuid (PK)        |                                                             |
| `created_at`   | timestamp        | Auto.                                                       |
| `updated_at`   | timestamp        | Auto via trigger.                                           |
| `status`       | string enum      | `new`, `in_progress`, `contacted`, `won`, `lost`, `archived`. |
| `priority`     | string enum      | `normal`, `high`.                                           |
| `kind`         | string enum      | `selection`, `purchase`, `trade`, `upgrade`, `club`, `support`. |
| `scenario`     | string           | Selected user scenario / CTA intent.                        |
| `name`         | string           | Optional.                                                   |
| `contact`      | string           | Phone / Telegram / email. Required.                         |
| `device`       | string           | Human-readable device title.                                |
| `device_id`    | M2O → `devices`  | Optional product-card relation.                             |
| `message`      | text             | User comment.                                               |
| `source_path`  | string           | Page path where the lead was created.                       |
| `source_url`   | text             | Full URL, including query.                                  |
| `page_title`   | string           | Browser page title.                                         |
| `referrer`     | text             | Browser referrer.                                           |
| `utm_*`        | string           | UTM source/medium/campaign/content/term.                    |
| `user_agent`   | text             | Request user-agent for debugging, not for public display.   |

Run `npm run directus:setup:leads` and pipe it into the production Postgres
container to create/update this schema and Directus Studio metadata.

---

## Roles & permissions

- **Administrator** — full access (staff using Directus Studio).
- **Editor** — CRUD on `devices`, `device_gallery`, `device_passports`,
  `trade_options`; read/update on `leads`. No user/role management.
- **Public (read token)** — read-only on `devices` (and related) **where
  `status = published`** only. Used by the Next.js site. Create a dedicated
  static token or a least-privilege service account; never expose the admin token.
- **Lead intake (create-only)** — a narrow role/token allowing `create` on
  `leads` from the public site form, with no read access.

## Keeping types in sync

When the schema changes:
1. Update this file.
2. Update `packages/shared/src/device.ts` to match.
3. (Optional) generate Directus SDK types and reconcile.

## Current image migration path

For device thumbnails, prefer `devices.listing_file` as a Directus Files M2O
relation to `directus_files`.
Keep `devices.listing_image` as a legacy fallback for repo-hosted paths such as
`assets/catalog-iphone-13-pro.webp`.

Use `device_images` for managed per-device media:

| Field    | Type                 | Notes                                      |
| -------- | -------------------- | ------------------------------------------ |
| `id`     | uuid (PK)            |                                            |
| `status` | string               | `draft` / `published` / `archived`.         |
| `sort`   | integer              | Manual order inside the device gallery.    |
| `device` | M2O -> `devices`     | Parent device.                             |
| `role`   | string               | `card`, `main`, `screen`, `body`, `defect`, `other`. |
| `shot_status` | string          | `needs_review`, `approved`, `rejected`.    |
| `image`  | M2O -> directus_files | Actual uploaded image.                     |
| `label`  | string               | Caption shown under gallery image.         |
| `alt`    | text                 | Image alt text.                            |
| `source_path` | text            | Original import path/name.                 |
| `import_batch` | string         | Batch label for media import.              |
| `created_at` | timestamp        | Auto.                                      |
| `updated_at` | timestamp        | Auto via trigger.                          |

The site reads `device_images` first. If no rows are published for a device, it
falls back to the legacy `devices.gallery` JSON field. Each legacy JSON item may
point to a file with any of these keys: `src`, `file`, `file_id`, or `image`.

Directus file ids are served through the `/assets/{id}` endpoint with transform
query parameters. Catalog cards use a 720x540 cover transform, detail gallery
images use 1200x900 cover, and passport defect photos use 900x675 cover. The
`format=auto` option lets Directus negotiate WebP/AVIF-capable output where the
client supports it, while preserving the legacy repo-hosted paths unchanged.

## Large catalog setup

Run `npm run directus:setup:catalog` and pipe it into the production Postgres
container to add the large-catalog operational layer:

- editor-facing Studio notes, display templates and enum choices;
- `stock_status` separate from public `status`;
- `content_status` for editorial/photo QA;
- `source_system`, `source_id`, `import_batch`, `imported_at` for idempotent imports;
- indexes for public catalog reads, inventory filtering and batch review;
- FK-backed relations for `devices.listing_file`, `device_images.device`,
  and `device_images.image`.

The day-to-day process is documented in
[`directus/catalog-workflow.md`](../catalog-workflow.md).
