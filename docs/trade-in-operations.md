# Trade-in MVP: настройка и выпуск

Актуальный дизайн: https://www.figma.com/design/cINpBQkJ5tuqHcD8jw3Ceo  
После переноса в проект ISVOI замените ссылку здесь и в `trade-in-figma-screen-matrix.md`.

## 1. Схема и сервисный доступ

1. Выполнить текущие catalog, multicity и leads audits.
2. Проверить миграцию без фиксации: `node scripts/setup_directus_trade_mvp_sql.mjs --rehearse`.
3. Сделать backup PostgreSQL и применить SQL из `directus:setup:trade-mvp` штатным способом проекта.
4. Выполнить `directus:audit:trade-mvp` и экспортировать новый schema snapshot.
5. Создать отдельного service user с политикой `ISVOI Trade Service`; его статический token сохранить только в `DIRECTUS_TRADE_TOKEN`.

Публичная роль не должна иметь разрешений на коллекции `trade_*` и `leads`.

## 2. Заполнение реальных цен

Подготовленный draft: `trade-mvp-2026-08-29-draft`. Методика, публичные ориентиры и стартовые диапазоны зафиксированы в `trade-in-pricing-benchmark-2026-08-29.md`. Seed добавляет 19 конфигураций и 21 правило идемпотентно, не публикуя их. Для отсутствующей в каталоге пилотной модели он безопасно создаёт `iPhone 13 Pro` под брендом Apple.

1. Создать draft в `trade_pricing_versions`.
2. Добавить конфигурации памяти в `trade_device_configs` только для:
   - iPhone 13 Pro;
   - iPhone 14 Pro;
   - iPhone 14 Pro Max;
   - iPhone 16 Pro;
   - iPhone 16 Pro Max.
3. Заполнить реальные `base_min` и `base_max`. Демонстрационные цены публиковать нельзя.
4. Для каждого вопроса создать три правила `yes/no/unknown` с одной версией цен:
   - `powers_on` — «Включается и загружается?»;
   - `display_works` — «Экран и сенсор работают?»;
   - `hardware_works` — «Камеры, кнопки и разъёмы работают?»;
   - `has_damage` — «Есть трещины, сколы или сильные царапины?»;
   - `was_repaired` — «Был ремонт или замена деталей?»;
   - `battery_risk` — «Аккумулятор вздут, греется или повреждён?»;
   - `account_removed` — «Устройство отвязано от аккаунта?».
5. Для `battery_risk=yes` установить `safety_stop=true`. Для ответов, где автоматическая цена ненадёжна, установить `manual_evaluation=true`.
6. Опубликовать все конфигурации и правила, затем одну pricing version. Ограничение базы не даст опубликовать две версии одновременно.
7. В singleton `trade_settings` выбрать версию, Белгород и срок 7 дней. Статус пока оставить `draft`.

## 3. Контроль и включение

До публикации пройти сценарий в закрытом QA-контуре по инструкции `trade-in-qa.md`. QA использует draft-версию, отдельную подписанную сессию и помечает оценки, события и заявки как тестовые. Само включение QA не меняет `trade_settings.status` и не включает `TRADE_WIZARD_ENABLED`.

- Выполнить минимум десять ручных расчётов: разные модели, память, хорошее состояние, повреждения, неизвестный ремонт, safety-stop и ручная оценка.
- Сверить серверные min/max с таблицей Trade Desk, срок до 23:59 МСК и объясняющие факторы.
- Проверить обмен: локальный остаток Белгорода, межгород, нулевой каталог и исчезновение товара перед отправкой.
- Проверить повторную отправку одной заявки: должен вернуться тот же `reference_code`.
- Утвердить предупреждение об аккумуляторе и юридический disclaimer.
- Назначить владельца pricing среди `ISVOI Advanced Editor`.
- Установить `trade_settings.status=published`, затем `TRADE_WIZARD_ENABLED=1` и перезапустить web-приложение.

Rollback: снять `TRADE_WIZARD_ENABLED` или перевести `trade_settings` в `paused`. Существующая страница Trade остаётся доступной без калькулятора.

## Состояние production на 29 августа 2026

- Аддитивная миграция схемы применена после успешного rollback-rehearsal.
- Backup перед миграцией схемы: `/opt/isvoi/backups/directus/20260829T152005Z`. Свежий backup перед загрузкой draft-цен: `/opt/isvoi/backups/directus/20260829T161229Z`. В обоих PostgreSQL и uploads прошли проверку контрольных сумм.
- Offsite-копирование не выполнялось: `OFFSITE_BACKUP_DEST` на сервере не настроен.
- Production checkout обновлён до `8ec2244`. Создана отдельная headless-учётка `trade-service@service.isvoi` только с политикой `ISVOI Trade Service`; token хранится только в `DIRECTUS_TRADE_TOKEN` server env и не выводился в логи.
- Загружена draft-версия `trade-mvp-2026-08-29-draft`: 19 конфигураций и 21 правило. Добавлена активная модель `iPhone 13 Pro`; `trade_settings` оставлен в `draft`, опубликованных версий, конфигураций и правил нет.
- `TRADE_WIZARD_ENABLED=0`; после перечитывания env калькулятор не отображается, config и quote работают fail-closed с `503`.
- Десять детерминированных контрольных расчётов `web:test:trade-pricing-v1` прошли на production checkout.
- Production smoke прошёл; `/api/trade/config` сообщает `active: false`, quote возвращает `pricing_unavailable`, публичный доступ к `trade_settings` закрыт с `403`.
- Post-migration audits `trade-mvp`, `trade-page`, `leads`, `catalog-v3` и `multicity` прошли без блокеров; после загрузки draft повторный `trade-mvp` audit и полный production smoke также прошли.
- Актуальный очищенный schema snapshot сохранён в `directus/schema/snapshots/current.json`.
