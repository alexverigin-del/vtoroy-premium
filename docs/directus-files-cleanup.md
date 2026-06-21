# Directus Files cleanup

Файлы в Directus разделены по рабочим папкам:

- `ISVOI Device Photos` - товарные фото из `devices.listing_file` и `device_images.image`.
- `ISVOI Site Assets` - изображения, реально привязанные к страницам и секциям сайта.
- `ISVOI Editorial` - нетоварные редакционные изображения.
- `ISVOI File Review` - неиспользуемые или спорные файлы для ручной проверки.

Команда безопасной уборки:

```bash
npm run directus:setup:files-cleanup
```

Она не удаляет файлы физически. Скрипт только:

- возвращает используемые файлы в правильные папки;
- переносит неиспользуемые `isvoi:site:*` файлы из публичной папки в `ISVOI File Review`;
- добавляет editor bookmarks в Files: `Product Photos`, `Site Assets`, `Editorial`, `Review Unused`, `Unsorted`;
- помечает используемые файлы тегами `isvoi,device,used` или `isvoi,site,used`.

После проверки папки `ISVOI File Review` можно отдельно принять решение: оставить как архив, переиспользовать файл в контенте или удалить вручную.

