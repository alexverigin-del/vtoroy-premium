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
| `listing_image`   | M2O → directus_files | Catalog thumbnail.                            |
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

## `leads` (form submissions — new, not in static prototype)

Captures "Получить подборку" / "Оценить устройство" / trade requests.

| Field        | Type            | Notes                                  |
| ------------ | --------------- | -------------------------------------- |
| `id`         | uuid (PK)       |                                        |
| `created_at` | timestamp       | Auto.                                  |
| `kind`       | string (enum)   | `selection` / `trade` / `club` / …     |
| `name`       | string          |                                        |
| `contact`    | string          | Phone / Telegram / email.              |
| `message`    | text            |                                        |
| `device`     | M2O → `devices` | Optional, if lead is about one device. |
| `source`     | string          | Page / campaign.                       |
| `status`     | string (enum)   | `new` / `in_progress` / `closed`.      |

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
