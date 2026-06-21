# Catalog Studio Editor Guide

Use this guide for manual catalog work in Directus Studio.

## Main Workflow

Start from `Устройства` (`devices`).

1. Open a device.
2. Check publication fields: `status`, `stock_status`, `content_status`.
3. Fill model, price, condition, warranty and copy fields.
4. Open `Фото устройства`.
5. Add or update photo rows.
6. Publish only when the device has `content_status = ready` and the needed
   photo rows are `published / approved`.

`Фото устройств` (`device_images`) remains useful for bulk review, but day to
day editing should happen inside the device card.

## Photo Roles

Use one row with `role = card` for the catalog card image.

Use gallery roles for the product page:

- `main`: main product view
- `screen`: screen close-up
- `body`: body or side condition
- `defect`: visible defect
- `other`: additional image

Each photo should have:

- `status = published`
- `shot_status = approved`
- a Directus file from the `ISVOI Device Photos` folder
- clear `label` and `alt`

## Legacy Fields

Do not use these for new catalog content:

- `listing_image`
- `visual_class`
- `gallery`

They remain in the database only as compatibility fallback for old content.

## Saved Views

The catalog Studio setup creates editor bookmarks:

- `Нужны фото`
- `Нужен текст`
- `На проверке`
- `Готово к публикации`
- `Фото на проверке`
- `Опубликованные фото`

Use them as a daily checklist before publishing.

## Technical Setup

Apply Studio metadata with:

```bash
npm run directus:setup:catalog-studio
```
