# Directus content model — editable site texts & content

Companion to [`collections.md`](./collections.md) (which covers the catalog:
`devices`, `device_passports`, `trade_options`, `leads`). This file specifies the
collections that make **website copy** editable in Directus Studio.

Design principle: **structured CMS, not a page builder.** Templates are fixed in
code (Next.js). Editors fill in a bounded set of fields per section. They cannot
invent arbitrary layouts — they choose a section's `variant` and edit its text,
CTAs, image, and a small typed `content` JSON for section-specific data.

Field types use Directus terms. `M2O` = many-to-one, `O2M` = one-to-many.

---

## `site_settings` (singleton)

Global, site-wide values. Configure as a **singleton** in Directus.

| Field                | Type                 | Notes                                  |
| -------------------- | -------------------- | -------------------------------------- |
| `id`                 | integer (PK)         | Always 1 (singleton).                  |
| `brand_name`         | string               | `Второй Премиум`.                      |
| `tagline`            | string               | `Не новый. Проверенный.`               |
| `city`               | string               | `Северодвинск`.                        |
| `phone`              | string               |                                        |
| `telegram`           | string               | `@handle` or URL.                      |
| `email`              | string               |                                        |
| `address`            | text                 |                                        |
| `default_og_image`   | M2O → directus_files | Social share fallback.                 |
| `footer_legal`       | text                 | `© 2025 Второй Премиум. …`             |
| `maintenance_mode`   | boolean              | Optional kill-switch for the public site. |

## `navigation_items`

Header / footer links. Self-referencing for optional dropdowns.

| Field        | Type                    | Notes                                       |
| ------------ | ----------------------- | ------------------------------------------- |
| `id`         | uuid (PK)               |                                             |
| `label`      | string                  | `Каталог`, `Store`, …                       |
| `url`        | string                  | Internal path (`/catalog`) or absolute URL. |
| `location`   | string (enum)           | `header` / `footer` / `mobile`.             |
| `parent`     | M2O → `navigation_items`| For nested menus (optional).                |
| `sort`       | integer                 | Order within `location`.                    |
| `is_active`  | boolean                 | Hide without deleting.                      |
| `open_in_new`| boolean                 | `target="_blank"`.                          |

## `site_pages`

One row per template-backed page. SEO + which page owns which sections.

| Field             | Type                 | Notes                                                        |
| ----------------- | -------------------- | ------------------------------------------------------------ |
| `id`              | uuid (PK)            |                                                              |
| `slug`            | string (unique)      | `home`, `catalog`, `store`, `trade`, `club`, `passport`, `product`. |
| `template`        | string (enum)        | Code template key (see "Pages & sections" below).            |
| `status`          | string (enum)        | `draft` / `published` / `archived`.                          |
| `title`           | string               | `<title>` / H1 fallback.                                     |
| `meta_description`| text                 | SEO.                                                         |
| `og_image`        | M2O → directus_files | Per-page social image (falls back to `site_settings`).       |
| `sections`        | O2M → `page_sections`| Ordered sections owned by this page.                         |

> `product` is a **template**, not a single page — individual products come from
> the `devices` collection. The `product` row in `site_pages` holds shared
> product-template copy (e.g. the passport disclaimer, section labels).

## `page_sections`

Structured content blocks. **Not** free-form HTML. A section is identified by a
stable `section_key`, rendered by a fixed component chosen via `variant`.

| Field                | Type                  | Notes                                                        |
| -------------------- | --------------------- | ------------------------------------------------------------ |
| `id`                 | uuid (PK)             |                                                              |
| `page`               | M2O → `site_pages`    | Owning page.                                                 |
| `section_key`        | string                | Stable id, e.g. `hero`, `trust`, `store_preview` (see table).|
| `variant`            | string (enum)         | Layout variant the component supports (e.g. `hero.split`).   |
| `eyebrow`            | string                | Small kicker above the headline.                             |
| `headline`           | string                |                                                              |
| `subheadline`        | string                |                                                              |
| `body`               | text                  | Rich text / markdown for the paragraph.                      |
| `primary_cta_label`  | string                |                                                              |
| `primary_cta_url`    | string                |                                                              |
| `secondary_cta_label`| string                |                                                              |
| `secondary_cta_url`  | string                |                                                              |
| `image`              | M2O → directus_files  | Section image (e.g. hero photo).                             |
| `sort_order`         | integer               | Order within the page.                                       |
| `is_active`          | boolean               | Hide without deleting.                                       |
| `content`            | JSON                  | Section-specific typed data (see per-section shapes below).  |

### `content` JSON shapes (per `section_key`)

The component for each `section_key` reads a known shape from `content`. Editors
edit JSON behind a typed interface (Directus JSON field with a schema hint).

- `trust` → `{ "items": [{ "title": string, "text": string }] }`
- `path_router` → `{ "cards": [{ "title": string, "text": string, "url": string }] }`
- `faq` → `{ "faq_keys": string[] }` (references `faq_items.key`) **or** leave
  empty and attach `faq_items` by `page`.
- `trade_calculator_intro` → `{ "note": string, "disclaimer": string }`
- `catalog_preview` / `store_preview` → `{ "limit": number, "filter": string }`
- `passport_disclaimer` → `{ "text": string }`
- everything else → `{}` (uses only the flat text/CTA fields).

## `faq_items`

Reusable Q&A, attachable to any page (e.g. Passport, Trade).

| Field       | Type               | Notes                                       |
| ----------- | ------------------ | ------------------------------------------- |
| `id`        | uuid (PK)          |                                             |
| `key`       | string (unique)    | Stable reference id, e.g. `passport-what`.  |
| `question`  | string             |                                             |
| `answer`    | text               | Rich text / markdown.                       |
| `page`      | M2O → `site_pages` | Optional owning page (for simple grouping). |
| `category`  | string (enum)      | `passport` / `trade` / `club` / `general`.  |
| `sort`      | integer            |                                             |
| `is_active` | boolean            |                                             |

## `cta_links` (optional, reusable buttons)

Use only if the same CTA repeats across many sections and should be edited once.
Otherwise the inline `*_cta_*` fields on `page_sections` are enough — prefer not
to overbuild.

| Field      | Type            | Notes                          |
| ---------- | --------------- | ------------------------------ |
| `id`       | uuid (PK)       |                                |
| `key`      | string (unique) | `get-selection`, `evaluate`.   |
| `label`    | string          |                                |
| `url`      | string          |                                |
| `style`    | string (enum)   | `primary` / `secondary` / `ghost`. |

---

## Pages & sections (which sections exist where)

Templates are fixed in code; this is the canonical mapping editors work within.

| Page slug  | Template      | `section_key`s (in order)                                                        |
| ---------- | ------------- | -------------------------------------------------------------------------------- |
| `home`     | `home`        | `hero`, `trust`, `path_router`, `catalog_preview`, `store_preview`, `passport_preview`, `trade_preview`, `club_preview`, `diagnostics_compare`, `final_cta` |
| `catalog`  | `catalog`     | `catalog_hero`, `catalog_grid` (grid is data-driven from `devices`)              |
| `store`    | `store`       | `store_hero`, `store_offer`, `store_location`, `final_cta`                       |
| `trade`    | `trade`       | `trade_hero`, `trade_calculator_intro`, `trade_steps`, `faq`, `final_cta`        |
| `club`     | `club`        | `club_hero`, `club_levels`, `club_rating`, `faq`, `final_cta`                    |
| `passport` | `passport`    | `passport_hero`, `passport_explainer`, `passport_disclaimer`, `faq`              |
| `product`  | `product`     | shared copy: `passport_disclaimer`, section labels (per-device data from `devices`) |

---

## Example records

### `site_pages` — homepage
```json
{
  "slug": "home",
  "template": "home",
  "status": "published",
  "title": "Второй Премиум — Не новый. Проверенный.",
  "meta_description": "Премиальная техника Apple с Паспортом Премиума, гарантией и понятной ценой выхода."
}
```

### `page_sections` — homepage hero
```json
{
  "page": "<home page id>",
  "section_key": "hero",
  "variant": "hero.split",
  "eyebrow": "Северодвинск · Store / Trade / Club",
  "headline": "Не новый. Проверенный.",
  "body": "Премиальная техника с Паспортом Премиума, гарантией и понятной ценой выхода. Подберём 3 проверенных варианта под ваш бюджет и сценарий владения.",
  "primary_cta_label": "Получить подборку",
  "primary_cta_url": "#final",
  "secondary_cta_label": "Оценить своё устройство",
  "secondary_cta_url": "/trade",
  "image": "<hero file id>",
  "sort_order": 1,
  "is_active": true,
  "content": {}
}
```

### `page_sections` — homepage store preview
```json
{
  "page": "<home page id>",
  "section_key": "store_preview",
  "variant": "preview.card",
  "eyebrow": "Store",
  "headline": "Витрина проверенного премиума",
  "body": "Открытая диагностика, Паспорт Премиума на каждое устройство.",
  "primary_cta_label": "Перейти в Store",
  "primary_cta_url": "/store",
  "sort_order": 5,
  "is_active": true,
  "content": { "limit": 4, "filter": "all" }
}
```

### `page_sections` — trade calculator intro
```json
{
  "page": "<trade page id>",
  "section_key": "trade_calculator_intro",
  "variant": "calculator.intro",
  "eyebrow": "Trade",
  "headline": "Оцените выход вашего устройства",
  "body": "Выберите устройство и состояние — покажем ориентир по выкупу и апгрейду.",
  "sort_order": 2,
  "is_active": true,
  "content": {
    "note": "Оценка после открытой диагностики.",
    "disclaimer": "Финальная сумма зависит от состояния, комплектации и спроса."
  }
}
```

### `faq_items` — passport
```json
{
  "key": "passport-what",
  "question": "Что такое Паспорт Премиума?",
  "answer": "Это стандарт доверия: состояние, история, гарантия и цена выхода устройства простым языком.",
  "category": "passport",
  "sort": 1,
  "is_active": true
}
```

---

## Permissions

- **Administrator** — full access.
- **Editor** — CRUD on `site_settings`, `navigation_items`, `site_pages`,
  `page_sections`, `faq_items`, `cta_links`. No user/role management.
- **Public (read token)** — read-only, and only "live" content:
  - `site_pages` where `status = published`
  - `page_sections` / `faq_items` / `navigation_items` where `is_active = true`
  - `site_settings` (the singleton)
  - `cta_links` (all)
  Used by the Next.js site via a least-privilege static token. Never expose the
  admin token.

## Keeping types in sync

When these collections change:
1. Update this file.
2. Update `packages/shared/src/content.ts` to match.
3. Update the mapping in `apps/web/lib/directus.ts`.
