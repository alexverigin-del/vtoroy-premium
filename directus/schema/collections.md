# Directus collections — ISVOI

Proposed schema, derived from the current static prototype data
(`data/devices.json`) and the planned admin workflow. This is the **spec** the
Directus collections should be modeled on; create them in Directus Studio or via
a snapshot/migration. The shared TypeScript contract lives in
`packages/shared/src/device.ts` and should be kept in sync.

Field types use Directus terminology. `M2O` = many-to-one, `O2M` = one-to-many,
`M2M` = many-to-many.

> **Current implementation.** The catalog still keeps legacy JSON fields in
> `devices` for fallback compatibility, but commercial editing is moving to
> structured Directus collections. Product photos are read from `device_images`,
> the product Passport is read from `device_passports`, and Trade/Upgrade offers
> are read from `trade_options`. The Next.js renderer reads structured rows
> first and falls back to `devices.gallery`, `devices.passport` and
> `devices.trade` only when the structured rows are missing.

---

## `devices` (main catalog)

| Field             | Type            | Notes                                              |
| ----------------- | --------------- | -------------------------------------------------- |
| `id`              | string (PK)     | Slug, e.g. `iphone-13-pro`. Used in URLs.          |
| `status`          | string (enum)   | `draft` / `published` / `archived`. Gate public.   |
| `stock_status`    | string (enum)   | `available`, `reserved`, `sold`, `hidden`. Legacy `in_stock` is normalized to `available`. |
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
| `gallery`         | JSON legacy fallback | New product media lives in `device_images`. |
| `passport_record` | O2M (1) -> `device_passports` | Structured Passport editor.          |
| `passport`        | JSON legacy fallback | Read-only in Studio; kept during migration. |
| `trade`           | JSON legacy fallback | Read-only in Studio; kept during migration. |
| `trade_options`   | O2M -> `trade_options` | Trade-in estimates.                          |

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
| `status`       | string enum      | `new`, `in_progress`, `waiting_client`, `contacted`, `won`, `lost`, `archived`. |
| `priority`     | string enum      | `normal`, `high`.                                           |
| `assigned_to`  | M2O → `directus_users` | Responsible manager.                                  |
| `contact_channel` | string enum   | `unknown`, `phone`, `telegram`, `whatsapp`, `email`.         |
| `next_action_at` | timestamp      | When the manager should return to the lead.                  |
| `last_contacted_at` | timestamp   | Last contact attempt / conversation.                         |
| `manager_note` | text             | Current short internal note.                                 |
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

## `lead_comments` (lead processing history)

One lead can have many manager comments. Use this for call notes, agreements,
follow-up reminders and issues. Keep the mutable `leads.manager_note` short;
put history here.

| Field            | Type                  | Notes                                      |
| ---------------- | --------------------- | ------------------------------------------ |
| `id`             | uuid (PK)             |                                            |
| `lead`           | M2O → `leads`          | Required parent lead.                      |
| `created_at`     | timestamp             | Auto.                                      |
| `updated_at`     | timestamp             | Auto via trigger.                          |
| `created_by`     | M2O → `directus_users` | Optional author reference.                 |
| `comment`        | text                  | Required working note.                     |
| `outcome`        | string enum           | `call`, `message`, `agreement`, `follow_up`, `issue`. |
| `next_action_at` | timestamp             | Follow-up date from this comment.          |

Run `npm run directus:setup:leads` and pipe it into the production Postgres
container to create/update this schema, Directus Studio metadata and the
`Обработка заявок` table preset for the `ISVOI Editor` role.

---

## Roles & permissions

- **Administrator** — full access for schema, users, roles, policies and
  system settings. Keep this for maintenance, not for frontend/server tokens.
- **ISVOI Editor** — manual catalog/photo/lead work in Studio. Can create and
  update `devices`, manage `device_images`, upload/update file metadata, and
  read/update `leads`. Cannot delete `devices` or manage roles/policies.
- **ISVOI Importer** — dedicated role for import scripts and batch media sync.
  Can create/update imported `devices`, manage imported `device_images`, and
  upload/update files. Use it for service users, not day-to-day human editing.
- **Public (read token)** — read-only on `devices` (and related) **where
  `status = published`** only. Used by the Next.js site. Create a dedicated
  static token or a least-privilege service account; never expose the admin token.
- **Lead intake (create-only)** — a narrow role/token allowing `create` on
  `leads` from the public site form, with no read access.

Run `npm run directus:setup:editor` after catalog/leads setup to apply Studio
field groups, required flags, hints, display templates and the
`ISVOI Editor` / `ISVOI Importer` role policies.

## Keeping types in sync

When the schema changes:
1. Update this file.
2. Update `packages/shared/src/device.ts` to match.
3. (Optional) generate Directus SDK types and reconcile.

## Current image migration path

For device thumbnails, prefer `devices.listing_file` as a Directus Files M2O
relation to `directus_files`.
Keep `devices.listing_image` as a legacy fallback for repo-hosted paths such as
`/assets/catalog-iphone-13-pro.webp`.

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
