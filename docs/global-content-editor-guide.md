# Global Content Editor Guide

This guide covers Directus Studio sections that affect the whole public site:
site settings, navigation and FAQ.

## Site Settings

Open `Настройки сайта`.

Use it for:

- brand name and tagline;
- logo image, rendered logo size, and optional caption under the logo;
- city and public contacts;
- address or visit note;
- footer text and legal note;
- default social image;
- emergency maintenance flag.

There should be only one settings row. Do not create additional rows.

Logo workflow:

- Upload the logo image in `Логотип`.
- Use `Высота логотипа, px` and optionally `Ширина логотипа, px` to tune how it appears in the header.
- If the uploaded image already contains both lines, for example `I СВОИ` and `Проверенная техника для своих`, leave `Подпись под логотипом` empty.
- If the uploaded image is only `I СВОИ`, put any second line in `Подпись под логотипом`.
- Turn off `Показывать название` when the image itself already contains the brand name.

After saving the settings row, the active Directus event Flow invalidates the
public Next.js data and page caches. The next public request should therefore
show the new settings immediately. The five-minute ISR window remains a fallback
if the webhook is temporarily unavailable.

## Navigation

Open `Навигация`.

Use bookmarks:

- `Шапка`
- `Footer`

For temporary changes, turn off `Показывать` instead of deleting the row. Use
`Новая вкладка` only for external links.

Allowed locations:

- `header`
- `footer`

## FAQ

Open `FAQ`.

Use bookmarks:

- `Все активные FAQ`
- `Общие FAQ`
- `Каталог FAQ`
- `Store FAQ`
- `Trade FAQ`
- `Passport FAQ`
- `Club FAQ`
- `Скрытые FAQ`

Each FAQ item needs a stable `Ключ`, question, answer, category and order.
Most day-to-day work happens in two groups:

- `Вопрос и ответ`: public question and answer text.
- `Показ на сайте`: page, category, order and visibility.

The `Служебное` group is intentionally closed. Change `Ключ` only when you
understand which page section uses that key in `faqKeys` / `faq_keys`.

Editors can create and update FAQ, but should hide old questions with
`Показывать на сайте` instead of deleting them.

The baseline FAQ set is seeded from the repository:

```bash
npm run directus:seed:faq
```

The seed is idempotent: it updates known keys and inserts missing ones, but does
not delete editor-created questions. Page FAQ sections can either list explicit
`faqKeys`/`faq_keys` in `page_sections.content` or automatically use active FAQ
items attached to the same page/category.
Categories used by the site:

- `general`
- `store`
- `trade`
- `passport`
- `club`
- `catalog`

If a question should disappear temporarily, turn off `Показывать`.

## Technical Setup

Apply Studio metadata with:

```bash
npm run directus:setup:global-content
npm run directus:setup:faq-editor
npm run directus:setup:site-settings-revalidation
```
