# Catalog V3: универсальные товары

Catalog V3 объединяет новую и б/у технику разных производителей и новые
аксессуары в одной корневой коллекции `products`.

## Контракт

- `products` — публикация, SKU, тип, состояние, бренд, категория, цена, остаток,
  гарантия, изображение и режим продажи.
- `product_brands`, `product_categories`, `device_models` — управляемые
  справочники.
- `device_details`, `accessory_details` — типоспецифичные данные.
- `product_images` — общая галерея.
- `product_compatible_models` — точная совместимость аксессуаров.
- Passport, Trade и Leads связаны с `products`; прежние связи с `devices`
  временно сохранены.

Миграция `catalog_v3` аддитивна, идемпотентна и forward-only. Frontend
использует dual-read: сначала `products`, затем `devices`.

## Публичные маршруты

- `/catalog`, `/catalog/tech`, `/catalog/accessories`
- `/catalog/category/{slug}`, `/catalog/brand/{slug}`
- `/product/{slug}`
- `/device/{slug}` — 301 на новый URL

Поиск, фильтры, сортировка и страница хранятся в URL. Размер страницы — 24
товара. Внешний поисковый движок для диапазона 100–500 SKU не используется.

## Тестовые данные

Миграция создаёт четыре черновые QA-позиции:

- новая техника Samsung;
- б/у Samsung с Passport;
- универсальный USB-C аксессуар;
- модельный аксессуар для Galaxy S24.

QA-позиции не публикуются и не подменяют подтверждённые коммерческие данные.
Перенесённые legacy-устройства сохраняют исходные факты. У четырёх таких
позиций отсутствует подтверждённая дата диагностики; это отмечается переходным
предупреждением аудита и не заполняется вымышленной датой.

## Эксплуатация

Основные команды:

```bash
npm run directus:setup:catalog-v3
npm run directus:audit-catalog-v3
npm run directus:audit:prod
bash scripts/run_beget_catalog_v3_editability_test.sh
npm run catalog:v3:template
npm run catalog:v3:import -- --file path/to/catalog.xlsx --dry-run
```

Перед production-изменением создаётся backup PostgreSQL и uploads. Старые
коллекции нельзя удалять, пока dual-read не отключён отдельным релизом.

Сервисные токены не получают права администратора Studio. Проверка
редактируемости состоит из аудита metadata/relations/presets/permissions и
обратимого изменения черновой QA-позиции через разрешённый API-контур.
