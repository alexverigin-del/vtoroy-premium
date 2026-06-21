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
- добавляет Studio-памятки для коллекции Files и ключевых полей: `folder`, `title`, `description`, `tags`, размеры, тип и focal point;
- помечает используемые файлы тегами `isvoi,device,used` или `isvoi,site,used`.

После проверки папки `ISVOI File Review` можно отдельно принять решение: оставить как архив, переиспользовать файл в контенте или удалить вручную.

## Памятка для редактора

- Товарные фото загружайте в `ISVOI Device Photos` и связывайте через `device_images` или `devices.listing_file`.
- Изображения страниц и секций держите в `ISVOI Site Assets`.
- Редакционные/контентные изображения держите в `ISVOI Editorial`.
- Спорные, лишние или неиспользуемые файлы переносите в `ISVOI File Review`, а не удаляйте сразу.
- В `title` используйте устойчивое рабочее имя: `isvoi:{device_id}:{role}:xlsx`, `isvoi:site:{section}` или `isvoi:editorial:{topic}`.
- В `description` коротко пишите, что изображено и где используется файл.
- Для важных обрезок задавайте focal point, чтобы Directus корректнее делал `fit=cover`-трансформации.
