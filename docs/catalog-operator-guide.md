# ISVOI: инструкция оператора по загрузке партии каталога

Эта инструкция для человека, который не работает с кодом. Оператор готовит
Excel и фотографии, запускает проверку, затем запускает импорт.

## 1. Подготовить папку партии

Создайте папку с понятным именем, например:

```text
2026-06-stock
```

Внутри должна быть такая структура:

```text
2026-06-stock
  stock.xlsx
  incoming
    iphone-15-pro-001
      card.jpg
      main.jpg
      screen.jpg
      body.jpg
      defect.jpg
```

`stock.xlsx` должен быть заполнен по шаблону импорта. Пути к фото в Excel
указывайте относительно папки `incoming` или будущей папки `optimized`, например:

```text
iphone-15-pro-001/card.jpg
iphone-15-pro-001/main.jpg
iphone-15-pro-001/screen.jpg
```

Если фотографии уже оптимизированы заранее, можно вместо `incoming` положить
папку `optimized`.

## 2. Запустить проверку

### Вариант А: через Directus Studio

Откройте:

```text
https://api.isvoi.ru/admin/
```

Создайте запись в коллекции `catalog_import_batches`:

- `batch_name`: короткое имя партии, например `2026-06-stock`;
- `workbook`: Excel-файл `stock.xlsx`;
- `photos_archive`: ZIP-архив с фотографиями;
- `default_status`: обычно `draft`.

Сохраните запись. На странице записи используйте Flow-кнопку:

```text
ISVOI: проверить партию каталога
```

Она выполнит проверку без импорта. Результат будет записан в поля
`last_run_status`, `last_run_at`, `last_run_log`.

Если ошибок нет, нажмите вторую Flow-кнопку:

```text
ISVOI: импортировать партию каталога
```

После импорта проверьте товары в `devices` и фотографии в `device_images`.

Важно: товарные фото на сайте должны появляться только через `device_images`
или fallback-поле `devices.listing_file`. Не вставляйте фото вручную в
`devices.gallery`, `devices.listing_image`, JSON-поля, `/assets/...`,
`https://api.isvoi.ru/assets/...` или внешние URL.

Операторский экран настроен так, чтобы случайно не сломать состояние партии:

- файлы партии загружайте в папку `ISVOI Catalog Imports`;
- `status`, `last_run_mode`, `last_run_status`, `last_run_at` и `last_run_log`
  заполняются автоматически;
- оператор редактирует только `batch_name`, `workbook`, `photos_archive`,
  `default_status` и `note`;
- для ежедневной работы используйте bookmarks `Новые партии`, `В работе`,
  `Проверены к импорту`, `Ошибки`, `Импортировано`.

### Вариант Б: через операторский скрипт

Откройте PowerShell в папке проекта и выполните:

```powershell
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock"
```

Или запустите файл:

```text
scripts\operator_catalog_import.cmd
```

Скрипт спросит путь к папке партии. В режиме проверки он:

- загрузит папку партии на сервер;
- обновит код на Beget;
- оптимизирует фото из `incoming` в `optimized`;
- проверит Excel;
- проверит наличие фотографий;
- не запишет товары в Directus.

Если проверка завершилась с ошибкой, исправьте Excel или файлы и запустите
проверку ещё раз.

## 3. Запустить импорт

Когда проверка прошла без ошибок:

```powershell
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock" -Apply
```

Скрипт попросит ввести `IMPORT`. Это защита от случайного запуска.

В режиме импорта он:

- повторно делает dry-run;
- создаёт или обновляет товары в Directus;
- загружает фото в `ISVOI Device Photos`;
- создаёт строки `device_images`;
- запускает audit изображений;
- запускает audit коммерческой готовности каталога.

По умолчанию новые товары создаются в статусе `draft`. Это безопасно: после
импорта редактор проверяет карточки в Directus Studio и публикует только готовые.

## 4. Проверить в Directus Studio

Откройте:

```text
https://api.isvoi.ru/admin/
```

Проверьте:

- `devices`: цена, описание, статус наличия, `content_status`;
- `device_images`: есть `card`, `main`, дополнительные фото;
- `directus_files`: фото лежат в `ISVOI Device Photos`.
- В `devices.gallery`, `devices.listing_image` и JSON-полях нет вручную
  вставленных ссылок на товарные фото.

Когда карточка готова:

```text
content_status = ready
status = published
```

## Частые ошибки

- Нет `stock.xlsx`: переименуйте основной Excel-файл в `stock.xlsx`.
- Несколько `.xlsx` в папке: оставьте один файл или назовите основной `stock.xlsx`.
- Нет папки `incoming` или `optimized`: добавьте одну из них.
- В Excel указан путь к фото, которого нет в папке: исправьте путь или добавьте файл.
- Товар не появился на сайте: проверьте `status = published` и `content_status = ready`.

## Полезные параметры

Проверка без повторной загрузки папки на сервер:

```powershell
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock" -SkipUpload
```

Импорт с заменой уже привязанных media rows:

```powershell
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock" -Apply -ReplaceMedia
```

Импорт сразу в published используйте только для полностью проверенной партии:

```powershell
.\scripts\operator_catalog_import.ps1 -BatchFolder "C:\Imports\2026-06-stock" -Apply -DefaultStatus published
```
