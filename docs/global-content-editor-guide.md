# Global Content Editor Guide

This guide covers Directus Studio sections that affect the whole public site:
site settings, navigation and FAQ.

## Site Settings

Open `Настройки сайта`.

Use it for:

- brand name and tagline;
- city and public contacts;
- address or visit note;
- footer text and legal note;
- default social image;
- emergency maintenance flag.

There should be only one settings row. Do not create additional rows.

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

- `Активные FAQ`
- `Скрытые FAQ`

Each FAQ item needs a stable `Ключ`, question, answer, category and order.
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
```
