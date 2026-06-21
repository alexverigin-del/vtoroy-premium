# Site Content Editor Guide

This guide is for Directus Studio editors who manage non-product pages:
home, store, trade, passport and club.

## Where To Edit

Start from `Страницы сайта` (`site_pages`), not from raw section rows.

1. Open the page, for example `home` or `store`.
2. Edit SEO fields if needed: title, meta description, social image.
3. Open `Секции страницы`.
4. Edit the needed section text, button labels, links and main image.
5. Publish changes by keeping the page status `published` and the section
   toggle `Показывать на сайте` enabled.

`Секции страниц` (`page_sections`) is still visible for bulk review, sorting and
troubleshooting, but the normal editor workflow is page-first.

## Non-Product Images

Use Directus Files for editorial/site images.

- Product photos: `ISVOI Device Photos`, managed through `device_images`.
- Site/editorial images: `ISVOI Site Assets`.
- Future articles/guides: `ISVOI Editorial`.

For page sections, use the field `Главное изображение блока`. It stores a real
relation to `directus_files`; the Next renderer turns it into an optimized
Directus asset URL with resize and `format=auto`.

Avoid adding `/assets/...` paths into JSON. If a complex block still needs a
nested image URL inside `JSON-настройки блока`, use a Directus asset URL.

## JSON Field

`JSON-настройки блока` is an advanced field for structured parts of a block:
cards, steps, comparison rows, FAQ keys and similar repeatable content.

For ordinary edits, use regular fields:

- `Заголовок`
- `Подзаголовок`
- `Основной текст`
- `Главная кнопка`
- `Главное изображение блока`

Do not change `Ключ блока` or `Тип блока` without a developer review. Those
fields are connected to the Next renderer.

## Technical Setup

Apply the Studio metadata and relations with:

```bash
npm run directus:setup:site-content
```

On production this script should be piped into the Directus PostgreSQL database
the same way as the other `directus:setup:*` scripts.
