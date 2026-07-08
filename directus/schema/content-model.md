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

| Field               | Type                 | Notes                                                                                                      |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                | integer (PK)         | Always 1 (singleton).                                                                                      |
| `brand_name`        | string               | `ISVOI`.                                                                                                   |
| `tagline`           | string               | `Хорошие вещи проходят через своих.`                                                                       |
| `city`              | string               | `Северодвинск`.                                                                                            |
| `logo_file`         | M2O → directus_files | Header/footer logo from `ISVOI Site Assets`.                                                               |
| `logo_alt`          | string               | Accessible alt text for the logo.                                                                          |
| `logo_href`         | string               | Usually `/`.                                                                                               |
| `logo_width`        | integer              | Optional rendered logo width in px. Leave empty to keep image proportions.                                 |
| `logo_height`       | integer              | Rendered logo height in px. Default header height is `22`.                                                 |
| `logo_caption`      | string               | Optional text shown under the logo image. Leave empty when the uploaded logo already includes the caption. |
| `show_brand_name`   | boolean              | Show text next to the logo.                                                                                |
| `header_cta_label`  | string               | Right-side header CTA label.                                                                               |
| `header_cta_url`    | string               | Right-side header CTA URL.                                                                                 |
| `phone`             | string               |                                                                                                            |
| `telegram`          | string               | `@handle` or URL.                                                                                          |
| `email`             | string               |                                                                                                            |
| `address`           | text                 |                                                                                                            |
| `default_og_image`  | M2O → directus_files | Social share fallback.                                                                                     |
| `footer_note`       | text                 | Long disclaimer above footer columns.                                                                      |
| `footer_brand_text` | text                 | Short brand text next to the logo.                                                                         |
| `footer_legal`      | text                 | `© 2025 ISVOI. …`                                                                                          |
| `footer_copyright`  | string               | First line in footer legal row.                                                                            |
| `maintenance_mode`  | boolean              | Optional kill-switch for the public site.                                                                  |

## `device_page_settings` (singleton)

Shared product detail page copy. Product facts still come from `devices`,
`device_images`, `device_passports` and `trade_options`; this singleton controls
the page template around those facts.

| Field group      | Notes                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Navigation       | Breadcrumb labels/hrefs and the visible back link.                     |
| Status and price | Grade prefix, updated-date prefix, stock labels and price note.        |
| Sections         | Condition, story, warranty, exit-price and warranty fallback labels.   |
| Trade            | Trade section title, value prefix and CTA label/href.                  |
| Passport         | Passport widget eyebrow, title, body, diagnostics and verified labels. |
| Related devices  | Related block heading, CTA and prompt card copy/cues.                  |
| Mobile CTA       | Sticky mobile action labels and ARIA label.                            |
| Lead form        | Product lead copy for `available`, `reserved` and `sold` states.       |

The Lead form groups are structured fields, not JSON. Each stock-state variant
controls `kind`, manager-facing `scenario`, title, contact/comment
placeholders, submit/submitting labels, status note, idle note, success note and
error note. The public form still posts only to `/lead-intake`; Directus owns
copy, not submission logic.

## `navigation_items`

Header / footer links. Self-referencing for optional dropdowns.

| Field            | Type                     | Notes                                                |
| ---------------- | ------------------------ | ---------------------------------------------------- |
| `id`             | uuid (PK)                |                                                      |
| `label`          | string                   | `Каталог`, `Store`, …                                |
| `label_short`    | string                   | Optional compact/mobile label.                       |
| `aria_label`     | string                   | Optional accessibility label.                        |
| `link_type`      | enum                     | `page` / `section` / `external` / `custom`.          |
| `page`           | M2O → `site_pages`       | Preferred for managed pages.                         |
| `section_anchor` | string                   | Anchor without `#`, e.g. `final`.                    |
| `custom_url`     | string                   | Manual URL, e.g. `/catalog` or `/store#diagnostics`. |
| `url`            | string                   | Legacy fallback URL.                                 |
| `location`       | string (enum)            | `header` / `footer` / `mobile` / `utility`.          |
| `item_role`      | enum                     | `link` / `cta` / `group`.                            |
| `icon`           | string                   | Optional future UI icon key.                         |
| `parent`         | M2O → `navigation_items` | For nested menus (optional).                         |
| `sort`           | integer                  | Order within `location`.                             |
| `is_active`      | boolean                  | Hide without deleting.                               |
| `open_in_new`    | boolean                  | `target="_blank"`.                                   |

Recommended header: `Каталог` → `/catalog`, `Store` → `/store`,
`Passport` → `/passport`, `Trade` → `/trade`, `Club` → `/club`, with the CTA
controlled by `site_settings.header_cta_*`. Footer URLs should be absolute
(`/store#diagnostics`, `/#final`) rather than route-local anchors (`#final`).

## `site_pages`

One row per template-backed page. SEO + which page owns which sections.

| Field              | Type                  | Notes                                                               |
| ------------------ | --------------------- | ------------------------------------------------------------------- |
| `id`               | uuid (PK)             |                                                                     |
| `slug`             | string (unique)       | `home`, `catalog`, `store`, `trade`, `club`, `passport`, `product`. |
| `template`         | string (enum)         | Code template key (see "Pages & sections" below).                   |
| `status`           | string (enum)         | `draft` / `published` / `archived`.                                 |
| `title`            | string                | `<title>` / H1 fallback.                                            |
| `meta_description` | text                  | SEO.                                                                |
| `og_image`         | M2O → directus_files  | Per-page social image (falls back to `site_settings`).              |
| `sections`         | O2M → `page_sections` | Ordered sections owned by this page.                                |

> `product` is a **template**, not a single page — individual products come from
> the `devices` collection. Shared product-template copy is controlled by
> `device_page_settings`, not by per-device records.

## `page_sections`

Structured content blocks. **Not** free-form HTML. A section is identified by a
stable `section_key`, rendered by a fixed component chosen via `variant`.

| Field                 | Type                 | Notes                                                         |
| --------------------- | -------------------- | ------------------------------------------------------------- |
| `id`                  | uuid (PK)            |                                                               |
| `page`                | M2O → `site_pages`   | Owning page.                                                  |
| `section_key`         | string               | Stable id, e.g. `hero`, `trust`, `store_preview` (see table). |
| `variant`             | string (enum)        | Layout variant the component supports (e.g. `hero.split`).    |
| `eyebrow`             | string               | Small kicker above the headline.                              |
| `headline`            | string               |                                                               |
| `subheadline`         | string               |                                                               |
| `body`                | text                 | Rich text / markdown for the paragraph.                       |
| `primary_cta_label`   | string               |                                                               |
| `primary_cta_url`     | string               |                                                               |
| `secondary_cta_label` | string               |                                                               |
| `secondary_cta_url`   | string               |                                                               |
| `image`               | M2O → directus_files | Section image (e.g. hero photo).                              |
| `sort_order`          | integer              | Order within the page.                                        |
| `is_active`           | boolean              | Hide without deleting.                                        |
| `content`             | JSON                 | Section-specific typed data (see per-section shapes below).   |

For section imagery, use the `image` M2O relation to Directus Files. Do not put
`image_src`, `imageSrc`, `/assets/...` or `https://api.isvoi.ru/assets/...`
values into `content` JSON. JSON image keys are legacy data and are flagged by
the Studio audit.

### `content` JSON shapes (per `section_key`)

The component for each `section_key` reads a known shape from `content`. Editors
edit JSON behind a typed interface (Directus JSON field with a schema hint).

- `trust` → `{ "items": [{ "title": string, "text": string }] }`
- `path_router` → `{ "cards": [{ "title": string, "text": string, "url": string }] }`
- `faq` → `{ "faq_keys": string[] }` (references `faq_items.key`) **or** leave
  empty and attach `faq_items` by `page`.
- `trade_calculator_intro` → `{ "note": string, "disclaimer": string }`
- `catalog_preview` → `{ "limit": number, "filter": string, "filters": [{ "label": string, "value": string }], "statusFilters": [{ "label": string, "value": string }], "sortOptions": [{ "label": string, "value": string }] }`
- `catalog_page_live` → `{ "headingTag": "h1", "filters": [{ "label": string, "value": string }], "statusFilters": [{ "label": string, "value": string }], "filterAriaLabel": string, "statusFilterLabel": string, "sortLabel": string, "sortAriaLabel": string, "sortOptions": [{ "label": string, "value": string }], "emptyState": { "headline": string, "body": string, "ctaLabel": string, "ctaUrl": string } }`
- `store_preview` → `{ "visual": { "image_alt": string, "caption_title": string, "caption_text": string }, "steps": [{ "title": string, "text": string }] }` plus `page_sections.image`.
- `passport_preview` → `{ "features": [{ "title": string, "text": string, "icon": "device" | "shield" | "clock" | "chart" }], "passport": { "device": string, "sub": string, "grade": string, "grade_label": string, "rows": [{ "label": string, "value": string, "state": "ok" | "warn" | "bad" }], "exit_label": string, "exit_value": string, "warranty": string, "warranty_strong": string } }`
- `trade_preview` → `{ "choices": [{ "title": string, "text": string, "icon": "money" | "chart" | "swap" }], "valuation": { "heading": string, "from_device": string, "from_note": string, "to_device": string, "to_note": string, "label": string, "amount": string } }`
- `club_preview` → `{ "levels": [{ "badge": string, "name": string, "tag": string, "features": string[], "featured": boolean }] }`
- `diagnostics_compare` → `{ "diagnostics": { "image_alt": string, "note_label": string, "note_text": string }, "comparison": { "aria_label": string, "label_header": string, "bad_header": string, "good_header": string, "rows": [{ "label": string, "bad": string, "good": string }] } }` plus `page_sections.image`.
- `final_cta` → `{ "proof": string[], "form": { "scenario_label": string, "scenario_aria_label": string, "scenario_options": string[], "device_label": string, "device_placeholder": string, "contact_label": string, "contact_placeholder": string, "submit_label": string, "note": string }, "footer_note": string }`
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

| Field   | Type            | Notes                              |
| ------- | --------------- | ---------------------------------- |
| `id`    | uuid (PK)       |                                    |
| `key`   | string (unique) | `get-selection`, `evaluate`.       |
| `label` | string          |                                    |
| `url`   | string          |                                    |
| `style` | string (enum)   | `primary` / `secondary` / `ghost`. |

---

## Pages & sections (which sections exist where)

Templates are fixed in code; this is the canonical mapping editors work within.

| Page slug  | Template   | `section_key`s (in order)                                                                                                                                   |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home`     | `home`     | `hero`, `trust`, `path_router`, `catalog_preview`, `passport_preview`, `store_preview`, `trade_preview`, `club_preview`, `diagnostics_compare`, `final_cta` |
| `catalog`  | `catalog`  | `catalog_page_live` (`catalog.grid`; SEO, hero copy, filter/sort labels, empty state and CTA are page-managed; device cards are data-driven from `devices`) |
| `store`    | `store`    | `store_hero`, `store_offer`, `store_location`, `final_cta`                                                                                                  |
| `trade`    | `trade`    | `trade_hero`, `trade_calculator_intro`, `trade_steps`, `faq`, `final_cta`                                                                                   |
| `club`     | `club`     | `club_hero`, `club_levels`, `club_rating`, `faq`, `final_cta`                                                                                               |
| `passport` | `passport` | `passport_hero`, `passport_explainer`, `passport_disclaimer`, `faq`                                                                                         |
| `product`  | `product`  | shared copy from `device_page_settings`; per-device data from `devices`                                                                                     |

---

## Example records

### `site_pages` — homepage

```json
{
  "slug": "home",
  "template": "home",
  "status": "published",
  "title": "ISVOI — клуб разумного владения. Хорошие вещи проходят через своих.",
  "meta_description": "ISVOI — клуб разумного владения. Хорошие вещи проходят через своих: с ISVOI Passport, гарантией и понятной ценой выхода."
}
```

### `page_sections` — homepage hero

```json
{
  "page": "<home page id>",
  "section_key": "hero",
  "variant": "hero.split",
  "eyebrow": "ISVOI · Северодвинск · Store / Trade / Club",
  "headline": "Хорошие вещи проходят через своих.",
  "body": "ISVOI — клуб разумного владения. Вещь идёт дальше через своих, с ISVOI Passport, гарантией и понятной ценой выхода. Подберём 3 проверенных варианта под ваш бюджет и сценарий владения.",
  "primary_cta_label": "Войти в круг",
  "primary_cta_url": "#final",
  "secondary_cta_label": "Оценить свою вещь",
  "secondary_cta_url": "/trade",
  "image": "<hero file id>",
  "sort_order": 1,
  "is_active": true,
  "content": {}
}
```

Hero renderer also accepts optional `content.assurance`, `content.visual`, and
`content.passport` to control the first-screen assurance chips, hero image, and
floating Passport card from Directus.

### `page_sections` — homepage store preview

```json
{
  "page": "<home page id>",
  "section_key": "store_preview",
  "variant": "store.steps",
  "eyebrow": "ISVOI Store",
  "headline": "Доверенная витрина. Не случайный рынок.",
  "body": "Store — место, где вещи проходят дальше через своих. Открытая проверка, Passport на каждую вещь и понятная цена выхода. Здесь спокойно, потому что за вещь отвечают.",
  "primary_cta_label": "Как проходит визит в Store",
  "primary_cta_url": "/store",
  "secondary_cta_label": "Смотреть вещи в кругу",
  "secondary_cta_url": "/catalog",
  "sort_order": 6,
  "is_active": true,
  "content": {
    "visual": {
      "image_alt": "Интерьер премиального бутика: дерево, каменная стойка и графитовые полки с устройствами",
      "caption_title": "Store как точка доверия.",
      "caption_text": "Чистая витрина, видимая ответственность и спокойная консультация без давления."
    },
    "steps": [
      {
        "title": "Выбираете",
        "text": "Подбираем вещь под задачу и бюджет. Каждая — с Passport и грейдом."
      },
      {
        "title": "Проверяете",
        "text": "Открытая проверка при вас. Сначала история и состояние — потом решение."
      },
      {
        "title": "Забираете",
        "text": "Получаете Passport, чек и письменную гарантию на 90 дней."
      },
      {
        "title": "Передаёте дальше",
        "text": "Захотели обновиться — знаете цену выхода заранее. Вещь идёт дальше через своих."
      }
    ]
  }
}
```

### `page_sections` — homepage passport preview

```json
{
  "page": "<home page id>",
  "section_key": "passport_preview",
  "variant": "passport.split",
  "eyebrow": "ISVOI Passport",
  "headline": "У каждой вещи есть понятная история.",
  "body": "Не «как новая», а честно проверенная. Passport — документ, в котором простым языком сказано всё, что важно знать о вещи до того, как она перейдёт к вам.",
  "primary_cta_label": "Как работает Passport",
  "primary_cta_url": "/passport",
  "secondary_cta_label": "Смотреть Store",
  "secondary_cta_url": "/catalog",
  "sort_order": 5,
  "is_active": true,
  "content": {
    "features": [
      {
        "title": "Состояние и грейд",
        "text": "Батарея, корпус, экран — оценка по прозрачной шкале A / B / C.",
        "icon": "device"
      },
      {
        "title": "История и проверка",
        "text": "Ремонт, вскрытие, влага, Face ID — зафиксировано по результатам диагностики.",
        "icon": "shield"
      },
      {
        "title": "Гарантия 90 дней",
        "text": "Письменная гарантия, а не «верьте на слово».",
        "icon": "clock"
      },
      {
        "title": "Цена выхода",
        "text": "Сколько вещь будет стоить, когда пойдёт дальше через своих — известно заранее.",
        "icon": "chart"
      }
    ],
    "passport": {
      "device": "iPhone 13 Pro",
      "sub": "256 GB · Графитовый · IMEI ···4821",
      "grade": "A−",
      "grade_label": "Грейд",
      "rows": [
        { "label": "Батарея", "value": "89%", "state": "ok" },
        { "label": "Ремонт", "value": "не вскрывался", "state": "ok" },
        { "label": "Face ID", "value": "работает", "state": "ok" },
        { "label": "Влага", "value": "следов нет", "state": "ok" },
        { "label": "Экран / корпус", "value": "микроцарапины", "state": "ok" }
      ],
      "exit_label": "Цена выхода через 6 мес",
      "exit_value": "до 42 000 ₽",
      "warranty": "Гарантия",
      "warranty_strong": "90 дней"
    }
  }
}
```

### `page_sections` — homepage trade preview

```json
{
  "page": "<home page id>",
  "section_key": "trade_preview",
  "variant": "trade.choices",
  "eyebrow": "ISVOI Trade",
  "headline": "Передайте вещь дальше. Через своих.",
  "body": "Без объявлений. Без торга. Без незнакомцев. Ваша вещь не теряется — она идёт дальше внутри круга. После честной оценки — три понятных пути.",
  "primary_cta_label": "Рассчитать обновление",
  "primary_cta_url": "/trade",
  "secondary_cta_label": "Оценить свою вещь",
  "secondary_cta_url": "/#final",
  "sort_order": 7,
  "is_active": true,
  "content": {
    "choices": [
      {
        "title": "Получить деньги сейчас",
        "text": "Спокойный выкуп по честной оценке. Деньги в день обращения, без ожидания случайного покупателя.",
        "icon": "money"
      },
      {
        "title": "Передать дальше через комиссию",
        "text": "Мы проводим вещь дальше за вас — с Passport и проверкой. Вы получаете больше, круг получает проверенную вещь.",
        "icon": "chart"
      },
      {
        "title": "Обновиться на следующую",
        "text": "Передаёте текущую вещь в зачёт и доплачиваете разницу. Обновление без продажи и хлопот.",
        "icon": "swap"
      }
    ],
    "valuation": {
      "heading": "Пример оценки и перехода",
      "from_device": "iPhone 12",
      "from_note": "ваш, грейд B · 128 GB",
      "to_device": "iPhone 13 Pro / 14 Pro",
      "to_note": "проверенный, с Passport",
      "label": "Доплата при переходе — от",
      "amount": "19 900 ₽"
    }
  }
}
```

### `page_sections` — homepage club preview

```json
{
  "page": "<home page id>",
  "section_key": "club_preview",
  "variant": "club.levels",
  "eyebrow": "ISVOI Club",
  "headline": "Владеть ценным проще среди своих.",
  "body": "Не про дешевизну, а про круг: ранний доступ к вещам, рекомендации, понятный путь обновления. Пользуйтесь, обновляйтесь, выкупайте или передавайте дальше — на ваших условиях, среди своих.",
  "primary_cta_label": "Как работает Club",
  "primary_cta_url": "/club",
  "secondary_cta_label": "Узнать условия",
  "secondary_cta_url": "/#final",
  "sort_order": 8,
  "is_active": true,
  "content": {
    "levels": [
      {
        "badge": "Care",
        "name": "Care",
        "tag": "Спокойное владение с защитой и приоритетным сервисом.",
        "features": [
          "Продлённая гарантия",
          "Приоритетная диагностика",
          "Зафиксированная цена выкупа"
        ],
        "featured": false
      },
      {
        "badge": "Популярный",
        "name": "Upgrade",
        "tag": "Плановое обновление на следующую вещь без потери в цене.",
        "features": [
          "Всё из уровня Care",
          "Обновление по известной цене выхода",
          "Ранний доступ к новым лотам в кругу"
        ],
        "featured": true
      },
      {
        "badge": "Flex",
        "name": "Flex",
        "tag": "Максимум гибкости: пользуйтесь, выкупайте или возвращайте.",
        "features": [
          "Всё из уровня Upgrade",
          "Право возврата устройства",
          "Выкуп в собственность в любой момент"
        ],
        "featured": false
      }
    ]
  }
}
```

### `page_sections` — homepage diagnostics compare

```json
{
  "page": "<home page id>",
  "section_key": "diagnostics_compare",
  "variant": "diagnostics.compare",
  "eyebrow": "Открытая проверка",
  "headline": "Мы не просим верить. Мы показываем.",
  "body": "Сначала проверка и история вещи. Потом решение. Сравните, как вещь переходит на случайном рынке — и как через своих в ISVOI.",
  "sort_order": 9,
  "is_active": true,
  "content": {
    "diagnostics": {
      "image_alt": "Открытая диагностика смартфона на чистом белом столе в премиальной сервисной зоне",
      "note_label": "Открытая проверка",
      "note_text": "Состояние видно до решения о покупке."
    },
    "comparison": {
      "aria_label": "Сравнение случайного рынка и круга ISVOI",
      "label_header": "Что вы получаете",
      "bad_header": "Случайный рынок",
      "good_header": "Круг ISVOI",
      "rows": [
        { "label": "История вещи", "bad": "неизвестна", "good": "ISVOI Passport" },
        { "label": "Через кого вещь", "bad": "через незнакомца", "good": "через своих" },
        { "label": "Цена", "bad": "только сегодня", "good": "цена выхода известна" },
        { "label": "Состояние", "bad": "вера на слово", "good": "проверка при вас" }
      ]
    }
  }
}
```

### `page_sections` — homepage final CTA

```json
{
  "page": "<home page id>",
  "section_key": "final_cta",
  "variant": "final.form",
  "eyebrow": "Следующий шаг",
  "headline": "Войдите в круг ISVOI.",
  "body": "Оставьте сценарий — найти вещь, передать свою дальше или войти в Club. В ответ вы получите понятные варианты: история, состояние, Passport и цена выхода.",
  "sort_order": 10,
  "is_active": true,
  "content": {
    "proof": ["варианты под задачу", "без агрессивных продаж", "сначала проверка — потом решение"],
    "form": {
      "scenario_label": "Что хотите сделать?",
      "scenario_aria_label": "Сценарий обращения",
      "scenario_options": [
        "Найти вещь в кругу",
        "Передать свою вещь дальше",
        "Обновиться на следующую",
        "Узнать про Club"
      ],
      "device_label": "Какая вещь интересна?",
      "device_placeholder": "Например, iPhone 13 Pro или MacBook Air",
      "contact_label": "Контакт для ответа",
      "contact_placeholder": "Телефон или Telegram",
      "submit_label": "Войти в круг",
      "note": "Прототип формы: в реальном запуске здесь будет отправка заявки в CRM или мессенджер."
    },
    "footer_note": "Северодвинск. Мы здесь. Нас можно найти. Мы отвечаем за то, что проходит через своих."
  }
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
  "question": "Что такое ISVOI Passport?",
  "answer": "Это стандарт доверия круга: состояние, история, гарантия и цена выхода вещи простым языком.",
  "category": "passport",
  "sort": 1,
  "is_active": true
}
```

---

## Permissions

- **Administrator** — full access.
- **Editor** — CRUD on `site_settings`, `navigation_items`, `site_pages`,
  `page_sections`, `device_page_settings`, `faq_items`, `cta_links`. No
  user/role management.
- **Public (read token)** — read-only, and only "live" content:
  - `site_pages` where `status = published`
  - `page_sections` / `faq_items` / `navigation_items` where `is_active = true`
  - `site_settings` (the singleton)
  - `device_page_settings` (the singleton)
  - `cta_links` (all)
    Used by the Next.js site via a least-privilege static token. Never expose the
    admin token.

## Keeping types in sync

When these collections change:

1. Update this file.
2. Update `packages/shared/src/content.ts` to match.
3. Update the mapping in `apps/web/lib/directus.ts`.
