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
- ставит центрированный focal point для raster-изображений из `ISVOI Site Assets` и `ISVOI Editorial`, если focal point ещё не задан;
- помечает используемые файлы тегами `isvoi,device,used` или `isvoi,site,used`.

После проверки папки `ISVOI File Review` можно отдельно принять решение: оставить как архив, переиспользовать файл в контенте или удалить вручную.

Production-норма после уборки 2026-07-08: `files.orphan_isvoi_files.warning = 0`
и `files.hero_editorial_missing_focal_point.warning = 0`. SVG вроде favicon не
требуют focal point и исключены из focal-аудита.

## Памятка для редактора

- Товарные фото загружайте в `ISVOI Device Photos`, но помните: загрузка файла
  сама по себе не добавляет фото на сайт. Привязывайте товарные фото через
  `device_images.image`; `devices.listing_file` используйте только как fallback
  для карточки каталога.
- Не вставляйте товарные фото в `devices.gallery`, `devices.listing_image`,
  JSON-поля секций, `/assets/...`, `https://api.isvoi.ru/assets/...` или
  внешние URL. Такие вставки обходят редакторский workflow, роли кадров,
  оптимизацию и аудиты.
- Изображения страниц и секций держите в `ISVOI Site Assets`.
- Редакционные/контентные изображения держите в `ISVOI Editorial`.
- Спорные, лишние или неиспользуемые файлы переносите в `ISVOI File Review`, а не удаляйте сразу.
- В `title` используйте устойчивое рабочее имя: `isvoi:{device_id}:{role}:xlsx`, `isvoi:site:{section}` или `isvoi:editorial:{topic}`.
- В `description` коротко пишите, что изображено и где используется файл.
- Для важных обрезок задавайте focal point, чтобы Directus корректнее делал `fit=cover`-трансформации.
