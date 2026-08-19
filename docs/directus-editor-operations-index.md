# ISVOI Directus: editor operations index

This is the first page to open before changing content in Directus Studio.

Studio URL:

```text
https://api.isvoi.ru/admin/
```

## Catalog

Use `Каталог` -> `Товары` (`products`) as the only editor-facing catalog entry
point.

- Start with bookmarks: `Нужны фото`, `Нужен текст`,
  `Нужен Passport или диагностика`, `Нет цены или остатка`,
  `Готово к проверке` and `Опубликовано`.
- Product photos are added in the `Фото` group through the related
  `product_images` rows. Do not paste URLs into JSON or legacy fields.
- `Тип товара` controls the form: device fields are shown for equipment;
  accessory details and compatibility are shown for accessories.
- Keep `status`, `stock_status` and `content_status` separate: publication,
  availability and editorial readiness are different decisions.
- `devices` and `device_images` are rollback-only legacy collections. Human
  roles do not have access to them; administrators and service policies retain
  temporary access during the dual-read period.

Detailed guide: `docs/catalog-studio-editor-guide.md`.

## Catalog Page Copy

Use `Страницы сайта` (`site_pages`) -> `catalog` for the public `/catalog`
page wrapper.

- SEO title, meta description and social image live on the `catalog` page row.
- Hero label, headline, intro text, filter/sort labels, empty state and CTA
  live in the `catalog_page_live` section.
- Product cards come from `products`, `product_images`, `device_passports` and
  `trade_options`.

Run the setup/audit path after moving this workflow between environments:

```bash
npm run directus:setup:catalog-page
npm run directus:audit-studio
```

## Product Page Template

Use `Шаблон товарной страницы` (`device_page_settings`) for copy that is shared
by all `/device/...` pages.

- Breadcrumbs/back link, stock labels, updated-date prefix and the price note
  live here.
- Warranty, Passport, Trade, related-device and mobile sticky CTA labels live
  here.
- Product lead form copy lives here too: use the three groups `Форма заявки: В
наличии`, `Форма заявки: Бронь` and `Форма заявки: Продано` for title,
  placeholders, submit/success/error/status texts and manager-facing scenario.
- Product-specific facts, price, photos, Passport rows and Trade values live in
  `products`, `product_images`, `device_passports` and `trade_options`.

Run the setup/audit path after moving this workflow between environments:

```bash
npm run directus:setup:device-page-settings
npm run directus:setup:technical-permissions
npm run directus:audit-studio
```

## Pages And Sections

Use `Страницы сайта` (`site_pages`) first.

- Open the page, then edit its owned `Секции страницы`.
- Do not change `Ключ блока`, `Тип блока` or JSON settings without a developer
  review.
- For images, use `Главное изображение блока`; it points to Directus Files and
  lets the site optimize the asset.

Detailed guides: `docs/site-content-editor-guide.md` and
`docs/site-pages-workflow.md`.

## Menu, CTA And Logo

Use global content collections.

- Header/footer/mobile links: `Навигация` (`navigation_items`).
- Brand name, logo, logo caption, header CTA and footer text:
  `Настройки сайта` (`site_settings`).
- For temporary menu changes, turn off `Показывать` instead of deleting rows.

Detailed guide: `docs/global-content-editor-guide.md`.

## FAQ

Use `FAQ` (`faq_items`).

- Start with bookmarks by page/category.
- Hide old questions with `Показывать на сайте = false`; do not delete them
  during normal editing.
- Keep `Ключ` stable if a page section references a fixed FAQ list.

Detailed guide: `docs/global-content-editor-guide.md`.

## Leads

Use `Заявки` (`leads`).

- Start from `Новые заявки`.
- Move active work to `В работе` or `Ждем ответа`.
- Keep manager notes in `Заметка менеджера` or `История обработки`.
- Для атрибуции блога проверяйте `Блог: заявки` после CTA в статье и
  `Блог: устройства` после переходов из статьи в карточки устройств. Оба
  представления опираются на `utm_source=blog`, `utm_campaign=<slug статьи>` и
  `utm_content`.
- Telegram is intentionally deferred; the Studio table must remain enough for
  everyday processing.

Detailed guide: `docs/leads-workflow-editor-guide.md`.

## Blog

Use `Блог · Материалы` (`blog_posts`) as the main editorial entry point.

- New materials start in `draft`; move them through `review` before publication.
- `ISVOI Editor` creates, edits, compares and previews versions;
  `ISVOI Advanced Editor` promotes the approved relational version and schedules
  publication. First Studio login requires 2FA setup.
- Build article content in ordered `Блоки статьи`: rich-text blocks and image
  blocks with required alt text, optional caption and `content`/`wide` width.
- Keep one primary category, a responsible author and a small set of useful tags.
- Раз в неделю открывайте `Редплан`: черновики, материалы на проверке и
  запланированные публикации должны иметь понятный следующий шаг, автора и
  публикационный замысел.
- Upload work-in-progress media to `ISVOI Blog`; move approved public covers and
  article images to `ISVOI Editorial` before publication.
- Related catalog items are selected through `Связанные товары`; the relation
  points to `products`. Do not paste product URLs into structured fields.
- After publication, verify the article, category, RSS and sitemap; blog routes,
  navigation and immediate cache invalidation are already active in production.

Detailed guide: `docs/blog-editor-guide.md`.

## Club

Open the `I СВОИ Club` folder in the Content module. Its collections are
ordered as one operator workflow:

- `Настройки страницы` (`club_page_settings`) for publication mode, hero,
  section headings, form labels and consent links.
- `Предложения устройств` (`club_offers`) for approved catalog offers.
- `Тарифы` (`club_plans`) for measurable Base/Care differences.
- `Процесс и сценарии` (`club_process_items`) for cycle, Passport and participation
  steps.
- `Правила` (`club_rule_items`) for customer-facing rules.
- `Юридические документы` (`club_legal_documents`) for versioned legal
  materials.
- `Заявки` (`leads`) with the saved `Club: ...` views for processing requests.

Item forms use Russian expandable groups. Start with the open content groups;
use `Расширенные настройки` only when a stable key must be changed.

Keep `publication_mode = pilot_noindex` until the legal package and at least
one commercial offer pass `npm run directus:audit-club`. Only an administrator
may move the page toward indexing.

Detailed guide: `docs/club-editor-guide.md`.

## Catalog Imports

Use `Импорт каталога` (`catalog_import_batches`) for bulk catalog updates.

- Upload `stock.xlsx` and the photo ZIP.
- Run the check Flow first.
- Run the import Flow only after a successful check.
- New products should normally enter as `draft` and be reviewed in Studio before
  publication.

Detailed guide: `docs/catalog-operator-guide.md`.

## Inventory And Avito

Use `Товарные snapshot` (`inventory_import_batches`) for the private stock and
receipt workflow. This area is available only to administrators and
`ISVOI Inventory Manager`.

- Upload the complete stock XLSX and optional receipt XLSX, then run the check
  Flow before apply.
- Start with `Открытые блокеры`, `Открытые предупреждения`,
  `Конфликт идентичности`, `Требует проверки происхождения` and
  `Требует сверки места` instead of scanning all rows.
- Resolve identity and authenticity blockers in `Проблемы импорта`; never copy
  full serial/IMEI or purchase prices into public copy.
- Review receipt movement through `Сейчас в магазине`, `Центральный офис`,
  `Выбыло до загрузки` and `Требует сверки места`. Historical exits are
  warnings, not current-stock blockers.
- A product reaches Catalog V3 only after an explicit documented eligibility
  override and still starts as `draft / needs_photo`.
- Keep Avito listings in `draft` until the official category template and the
  three-item pilot have passed QA.

Detailed guide: `docs/inventory-avito-workflow.md`.

## Files

Use Directus Files folders as the source of truth.

- `ISVOI Device Photos`: product photos linked through `device_images`.
- `ISVOI Site Assets`: page, logo and social images.
- `ISVOI Editorial`: approved public blog/editorial assets.
- `ISVOI Blog`: private work-in-progress covers, illustrations and portraits.
- `ISVOI Catalog Imports`: import workbooks and ZIP archives.
- `ISVOI Inventory Imports`: private full stock and receipt workbooks.
- `ISVOI File Review`: files that need sorting or deletion after review.

Detailed guide: `docs/directus-files-cleanup.md`.

## Insights For The Project Owner

Open `Insights` -> `Руководитель · Операционный обзор` as an administrator.
The dashboard is a read-only operational summary and does not replace Content
bookmarks:

- the first two rows show new/attention-required leads, published available
  products and unresolved inventory blockers;
- the middle rows show the 30-day lead trend and catalog readiness alongside
  the 90-day lead mix;
- full-width lists below show active leads, unresolved blockers and recent
  inventory imports without horizontal scrolling.

Only the administrator can see this dashboard. Editor, Advanced Editor,
Importer and Inventory Manager receive no permissions for
`directus_dashboards` or `directus_panels`. Keep automatic refresh disabled by
default; use a five-minute interval only while actively monitoring operations.

Reproduce or remove the managed dashboard with:

```bash
npm run directus:setup:insights
npm run directus:setup:insights -- --rollback
npm run directus:audit-insights
```

## Health Check For Developers

Before and after Studio-related releases, generate and run the SQL audits:

```bash
npm run directus:audit-schema
npm run directus:audit-navigation
npm run directus:audit-catalog
npm run directus:audit-images
npm run directus:audit-studio
npm run directus:audit-legacy-fallback
npm run directus:audit-blog
npm run directus:audit-inventory
npm run directus:audit-insights
```

These commands execute their SQL checks against production and return a
non-zero exit code for blocker metrics. Use `npm run directus:audit:prod` as
the aggregate release gate.

The native Studio layout is reproduced by the idempotent final migration:

```bash
npm run directus:setup:studio-ux-v2
```

Run it after older schema/setup scripts. It owns workflow groups, Russian
labels, field conditions, role-scoped bookmarks and human permission
allowlists. `--rollback` can be passed directly to the generator for a safe
production transaction rehearsal.

## Role Boundaries

- `ISVOI Editor`: creates and edits draft products and content; cannot publish
  Catalog V3 records.
- `ISVOI Advanced Editor`: reviews and publishes; can maintain catalog
  dictionaries.
- `ISVOI Importer`: runs catalog batches and reads results; cannot manually
  write or delete `products`.
- `ISVOI Inventory Manager`: changes only review/admission fields and issue
  resolutions. Computed import fields remain readonly.
- Service policies perform imports and synchronization; Admin retains full Data
  Model access. All human Studio policies keep TFA enabled.
