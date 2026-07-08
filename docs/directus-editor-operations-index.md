# ISVOI Directus: editor operations index

This is the first page to open before changing content in Directus Studio.

Studio URL:

```text
https://api.isvoi.ru/admin/
```

## Catalog

Use `Устройства` (`devices`) as the main entry point.

- Start with bookmarks: `Нужны фото`, `Нужен текст`, `На проверке`,
  `Готово к публикации`.
- Product photos are added through `Фото устройства` (`device_images`), not by
  pasting URLs into JSON or legacy fields.
- Keep `status`, `stock_status` and `content_status` separate: publication,
  availability and editorial readiness are different decisions.

Detailed guide: `docs/catalog-studio-editor-guide.md`.

## Catalog Page Copy

Use `Страницы сайта` (`site_pages`) -> `catalog` for the public `/catalog`
page wrapper.

- SEO title, meta description and social image live on the `catalog` page row.
- Hero label, headline, intro text, filter/sort labels, empty state and CTA
  live in the `catalog_page_live` section.
- Device cards themselves still come from `devices`, `device_images`,
  `device_passports` and `trade_options`.

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
- Product-specific facts, price, photos, Passport rows and Trade values still
  live in `devices`, `device_images`, `device_passports` and `trade_options`.

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
- Telegram is intentionally deferred; the Studio table must remain enough for
  everyday processing.

Detailed guide: `docs/leads-workflow-editor-guide.md`.

## Catalog Imports

Use `Импорт каталога` (`catalog_import_batches`) for bulk catalog updates.

- Upload `stock.xlsx` and the photo ZIP.
- Run the check Flow first.
- Run the import Flow only after a successful check.
- New products should normally enter as `draft` and be reviewed in Studio before
  publication.

Detailed guide: `docs/catalog-operator-guide.md`.

## Files

Use Directus Files folders as the source of truth.

- `ISVOI Device Photos`: product photos linked through `device_images`.
- `ISVOI Site Assets`: page, logo and social images.
- `ISVOI Editorial`: future editorial/guides assets.
- `ISVOI Catalog Imports`: import workbooks and ZIP archives.
- `ISVOI File Review`: files that need sorting or deletion after review.

Detailed guide: `docs/directus-files-cleanup.md`.

## Health Check For Developers

Before and after Studio-related releases, generate and run the SQL audits:

```bash
npm run directus:audit-schema
npm run directus:audit-navigation
npm run directus:audit-catalog
npm run directus:audit-images
npm run directus:audit-studio
npm run directus:audit-legacy-fallback
```

The audits print SQL. On production, pipe the generated SQL into the Directus
PostgreSQL container from `/opt/isvoi/infra/directus-beget`.
