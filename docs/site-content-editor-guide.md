# Site Content Editor Guide

This guide is for Directus Studio editors who manage non-product pages:
home, catalog, store, trade, passport and club.

## Where To Edit

Start from `Страницы сайта` (`site_pages`), not from raw section rows.

1. Open the page, for example `home`, `catalog` or `store`.
2. Edit SEO fields if needed: title, meta description, social image.
3. Open `Секции страницы`.
4. Edit the needed section text, button labels, links and main image.
5. Publish changes by keeping the page status `published` and the section
   toggle `Показывать на сайте` enabled.

`Секции страниц` (`page_sections`) is still visible for bulk review, sorting and
troubleshooting, but the normal editor workflow is page-first.

For `/catalog`, edit the page row `catalog` and the section
`catalog_page_live`. This controls SEO, hero copy, filter/sort labels, empty
state and CTA. Product cards are not edited here; they come from the catalog
collections (`devices`, `device_images`, `device_passports`, `trade_options`).

## Non-Product Images

Use Directus Files for editorial/site images.

- Product photos: `ISVOI Device Photos`, managed through `device_images`.
- Site/editorial images: `ISVOI Site Assets`.
- Future articles/guides: `ISVOI Editorial`.

For page sections, use the field `Главное изображение блока`. It stores a real
relation to `directus_files`; the React page layer turns it into an optimized
Directus asset URL with resize and `format=auto`.

Do not add `image_src`, `imageSrc`, `/assets/...`, `api.isvoi.ru/assets/...` or
other image URLs inside `JSON-настройки блока`. If a section needs an editorial
image, attach it through `Главное изображение блока`.

## JSON Field

`JSON-настройки блока` is an advanced field for structured parts of a block:
cards, steps, comparison rows, FAQ keys and similar repeatable content.

For Store, Trade, Passport and Club hero sections, the JSON field may include a
compact trust strip under the main actions. Use one of these keys:
`highlights`, `hero_highlights` or `facts`. Each item may contain:

```json
{
  "label": "Проверка",
  "value": "при вас",
  "text": "Состояние устройства фиксируется открыто до решения."
}
```

Keep hero facts short: two or three items are enough. If the field is empty, the
site uses safe page-specific defaults.

For ordinary edits, use regular fields:

- `Заголовок`
- `Подзаголовок`
- `Основной текст`
- `Главная кнопка`
- `Главное изображение блока`

Do not change `Ключ блока` or `Тип блока` without a developer review. Those
fields are connected to the React page layer.

## Technical Setup

Apply the Studio metadata and relations with:

```bash
npm run directus:setup:site-content
npm run directus:setup:catalog-page
```

On production this script should be piped into the Directus PostgreSQL database
the same way as the other `directus:setup:*` scripts.
