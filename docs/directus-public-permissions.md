# Directus public permissions

Публичный API ISVOI разделён на два контура:

- `$t:public_label` - встроенная anonymous Public policy Directus. Она нужна только для чтения публичных asset-файлов браузером.
- `ISVOI Public Read` - сервисная read-only policy для Next.js. Через неё сайт читает опубликованный контент и каталог.

Обе политики настраиваются одним idempotent-скриптом:

```bash
npm run directus:setup:public-permissions
```

На production SQL применяется через PostgreSQL контейнер Directus:

```bash
npm run directus:setup:public-permissions \
  | docker compose -f infra/directus-beget/docker-compose.yml exec -T database sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
```

## Что открыто без токена

- `directus_files`: только файлы из папок `ISVOI Device Photos`, `ISVOI Site Assets`, `ISVOI Editorial`.

Anonymous Public не должен читать `devices`, `device_images`, `site_pages`, `page_sections`, `site_settings`, `navigation_items` и `faq_items` напрямую через `/items/*`.

## Что читает Next.js service token

- `devices`: только `status=published`, `content_status=ready`, `stock_status != hidden`.
- `device_images`: только `status=published`, `shot_status=approved`, и только для публичных устройств.
- `site_pages`: только `status=published`.
- `page_sections`: только `is_active=true` и только для опубликованных страниц.
- `navigation_items`: только `is_active=true`.
- `faq_items`: только `is_active=true`.
- `site_settings`: только публичные поля бренда, контактов и footer.
- `directus_files`: только файлы из папок `ISVOI Device Photos`, `ISVOI Site Assets`, `ISVOI Editorial`.

## Что закрыто

- Внутренние поля каталога: `admin_note`, `source_system`, `source_id`, `import_batch`, `imported_at`, `created_at`.
- Внутренние поля фото: `source_path`, `import_batch`, `created_at`.
- Любые файлы вне разрешённых папок.
- Anonymous `/items/*` для контента.
- Запись в `directus_files` и любые system collections.

## Проверка после применения

1. Открыть сайт и каталог: `https://isvoi.ru/catalog`.
2. Открыть карточку с фото: `https://isvoi.ru/device/iphone-13-pro/index.html`.
3. Проверить Directus Studio: `https://api.isvoi.ru/admin/`.
4. Проверить, что anonymous `/items/devices` возвращает `403`.
5. Проверить, что anonymous `/assets/{file-id}?width=32&height=32&fit=cover&format=auto` возвращает изображение.
