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
cd /opt/isvoi
npm run directus:setup:public-permissions > /tmp/isvoi_public_permissions.sql

cd infra/directus-beget
set -a && . ./.env && set +a
docker compose exec -T database psql \
  -U "$DB_USER" \
  -d "$DB_DATABASE" \
  -v ON_ERROR_STOP=1 \
  < /tmp/isvoi_public_permissions.sql
```

## Что открыто без токена

- `directus_files`: только файлы из папок `ISVOI Device Photos`, `ISVOI Site Assets`, `ISVOI Editorial`.

Anonymous Public не должен читать `devices`, `device_images`, `site_pages`,
`page_sections`, `site_settings`, `device_page_settings`, `navigation_items` и
`faq_items` напрямую через `/items/*`.

## Что читает Next.js service token

- `devices`: только `status=published`, `content_status=ready`, `stock_status != hidden`.
- `device_images`: только `status=published`, `shot_status=approved`, и только для публичных устройств.
- `site_pages`: только `status=published`.
- `page_sections`: только `is_active=true` и только для опубликованных страниц.
- `navigation_items`: только `is_active=true`.
- `faq_items`: только `is_active=true`.
- `site_settings`: только публичные поля бренда, контактов и footer.
- `device_page_settings`: публичные подписи шаблона товарной страницы.
- `directus_files`: только файлы из папок `ISVOI Device Photos`, `ISVOI Site Assets`, `ISVOI Editorial`.

## Что закрыто

- Внутренние поля каталога: `admin_note`, `source_system`, `source_id`, `import_batch`, `imported_at`, `created_at`.
- Внутренние поля фото: `source_path`, `import_batch`, `created_at`.
- Любые файлы вне разрешённых папок.
- Anonymous `/items/*` для контента.
- Запись в `directus_files` и любые system collections.

## Проверка после применения

1. Запустить `npm run directus:audit-api-policy`.
2. Открыть сайт и каталог: `https://isvoi.ru/catalog`.
3. Открыть карточку с фото: `https://isvoi.ru/device/iphone-13-pro/index.html`.
4. Проверить Directus Studio: `https://api.isvoi.ru/admin/`.
5. Проверить, что anonymous `/items/devices` возвращает `403`.
6. Проверить, что anonymous `/assets/{file-id}?width=32&height=32&fit=cover&format=auto` возвращает изображение.

## Technical Role Field Allowlists

After broad Studio setup scripts, run:

```bash
npm run directus:setup:technical-permissions
```

This keeps `Administrator` unrestricted, but replaces `fields='*'` for
`ISVOI Editor`, `ISVOI Importer` and `ISVOI Catalog Import` with explicit field
allowlists. Run it last after `directus:setup:editor`,
`directus:setup:catalog-import-*`, `directus:setup:file-folders` and similar
setup scripts that may recreate wider permissions.

## Admin Guardrails

After public permissions and technical field allowlists, run the final admin
guardrail pass:

```bash
npm run directus:setup:admin-guardrails
```

It keeps only `Administrator` as an admin policy, keeps service policies
headless, requires TFA for Studio policies, removes accidental non-admin access
to high-risk Directus system collections, and keeps lead intake create-only.
See `docs/directus-admin-guardrails.md`.
