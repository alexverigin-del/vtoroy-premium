# Avito: выкат расширения до шести объявлений

## Область

Сохраняются т11/т29/т12. Добавляются только т13/т14/т27 с существующими
канальными ID. т20 — отдельное устройство, но в эту партию не входит.
Для т14: Color=`золотистый`, батарея `99%`, `259` циклов. Даты диагностики
остаются августовскими. Цены, остатки, товары, офферы, фото и mapping не меняются.

Проверенный владельцем накопительный XML:
`ISVOI_Avito_SIX_AD_REVIEW_2026-10-07_COLOR_FIXED.xml`, SHA-256:
`b9f05e2aa9669b0ba0e300cb6c629f058ad938d6addaa5484d38058c8e23c285`.
Подтверждение формата не равно разрешению публикации или проверке модерации.

## Подготовка

1. Снять свежий санитизированный snapshot через
   `scripts/export_avito_catalog_snapshot.py`. Полные serial/IMEI остаются на VPS.
2. Повторить `check_avito_catalog_public.run` для выбранных шести товаров:
   страницы, сертификаты, 36 JPEG с SHA-256. Проверить неизменность живого трёхстрочного
   фида относительно исходного захвата и отдельно цены/остатки/диагностику.
3. Собрать локальный plan; копии и source JSON не коммитить:

```bash
python scripts/prepare_avito_expansion_release.py \
  --xml /private/review/validated-six-ad.xml \
  --snapshot /private/review/catalog-snapshot.json \
  --manifest /private/review/six-ad-color-fixed-manifest.json \
  --existing-feed /private/review/existing-live-feed.xml \
  --public-preflight /private/review/public-preflight.json \
  --output /private/review/release-plan.json
```

4. Выполнить unit-тесты и SQL-тест в отдельном PostgreSQL fixture:

```bash
npm run directus:avito:test
npm run directus:avito:test-release
npm run directus:avito:test-release-sql
```

SQL-тест использует только уже установленный `postgres:16-alpine`, создаёт
синтетическую БД с `--network none`, без портов и production-томов, затем удаляет
только собственный контейнер. Он НЕ восстанавливает production dump и НЕ
обращается к production-БД или Avito. В окружении без Docker/image SQL-тест
нужно запустить на согласованном хосте, а не объявлять успешным.

5. Создать свежий VPS backup БД/uploads. При закрытом infra `.env` использовать
   уже имеющийся runner `python3 scripts/run_catalog_gallery_curation.py --backup-only`.
   Он не активирует gallery/operator identity в этом режиме и не читает env.
   Имя папки сохраняет суффикс `-gallery`; это полный Directus backup, не только фото.
   Проверить SHA256SUMS, gzip и tar. Перед реальным apply backup должен быть
   моложе суток; сегодняшняя подготовительная копия не заменяет новый backup
   после ожидания 72 часов.
6. Разместить plan/XML/operator-зависимости только в закрытой backup-папке VPS.
   Default CLI выполняет dry-run с rollback транзакции, без бизнес-изменений:

```bash
python3 /private/operator/activate_avito_expansion.py \
  --plan /private/operator/release-plan.json --xml /private/operator/validated-six-ad.xml
```

Оператор исполняется на VPS `/opt/isvoi`; пример `/private/operator` обозначает
закрытую папку внутри `/opt/isvoi/backups/directus`. Snapshot не старше часа.
Локальные stage/review файлы не заменяют Git deploy приложения.

## Условия Live Release

- Отдельное разрешение владельца на выкат И расширение подключённой
  автозагрузки. Дополнительные расходы без одобрения не допускаются.
- 72 часа без рассинхронизации с подтверждением владельца либо его явное
  разрешение не ждать. Прошедшие тесты и слова о формате XML этого не заменяют.
- Свежие source/public checks, план не старше часа, backup моложе суток.
- Git commit/push/deploy только по отдельной команде. Выполнить `web:verify`,
  build на Beget, PM2 restart и smoke; убедиться в поддержке шести ID. Сначала
  оставить `AVITO_FEED_ALLOWED_IDS` на прежних трёх значениях. Оператор проверяет
  source cap и свежесть BUILD_ID относительно кода маршрута/генератора.
- Сохранить исходную конфигурацию и receipt на VPS. Полные env/token не
  экспортировать и не коммитить. Проверить три новых объявления и стоимость
  размещения в кабинете до возможного списания; при дополнительных расходах остановиться.

Authorization JSON: `source=owner_release_authorization`, `authorized=true`,
`scope=six_ad_live_feed_expansion`, точные `xml_sha256` и `allowed_ids` (все шесть),
`no_unapproved_extra_costs=true`. Создавать его только из явной команды владельца.

Stability JSON: `source=owner_confirmation`, тот же XML hash. Вариант
`kind=observed_72h` требует `observed_since`, `confirmed_at` с часовыми поясами,
`no_sync_issues=true` и реально прошедшие 72 часа. Альтернатива
`kind=explicit_72h_waiver`, `waived=true` — только при явном отказе владельца
от ожидания. Не подставлять время или такое согласие автоматически.

## Активация И Переключение

После выполнения всех условий:

```bash
python3 /private/operator/activate_avito_expansion.py \
  --plan /private/operator/release-plan.json --xml /private/operator/validated-six-ad.xml \
  --backup-dir /opt/isvoi/backups/directus/VERIFIED_FRESH_BACKUP \
  --authorization /private/operator/authorization.json \
  --stability /private/operator/stability.json --confirm-publication --apply
```

Оператор меняет только три новые `product_channel_listings` одной транзакцией;
повторная активация идемпотентна. Существующий mapping НЕ пересоздаётся. Полные
before/after channel records для отката остаются в приватном VPS receipt.
Перед активацией он повторно сверяет SHA-256 всех 36 JPEG без токена, в том
числе при сохранении UUID файла. Plan нельзя считать свежим только потому,
что image URL не изменился. При ретуши предпочтителен новый Directus File
с сохранением прежнего для отката, как в gallery workflow.
CAS, полный source snapshot, private-identifier checks, locks и инварианты
защищают существующие объявления, ассортимент, остатки, цены и фото, в том
числе от неожиданных побочных DB-триггеров. Изменённые поля: статус, заголовок,
описание, category mapping, attrs; `updated_at` обновляется как служебное поле.

Сам оператор НЕ меняет env, НЕ рестартует PM2 и НЕ вызывает Avito. Пока allowlist
содержит прежние три ID, новые строки не попадают в подключённый фид. Затем
отдельным контролируемым шагом расширить allowlist до ШЕСТИ существующих ID,
сохранив первые три, restart и проверить HTTP/XML: шесть объявлений, ровно те же
36 JPEG, цены, описания и соответствия. Этот шаг уже запускает публикацию через
действующую автозагрузку, даже без ручного API upload.

PM2 может хранить прежнюю allowlist отдельно от `.env.local`: обычный restart
не гарантирует её обновления. Передайте только согласованное значение
`AVITO_FEED_ALLOWED_IDS` процессу `pm2 restart isvoi-web --update-env`, проверьте
фактический фид и затем выполните `pm2 save`. Не передавайте полный env в чат,
логи или Git. При откате обновить нужно и файл, и runtime PM2; после проверки
сохранить PM2-конфигурацию. Другие процессы не рестартовать.

Проверочный файл форматирован, серверный XML компактен и может иметь другой
порядок именованных полей. Сравнивайте объявления по `Id`, поля по имени,
отклоняя дубли. Игнорируйте только отступы контейнеров; значения текста и
порядок `Images/Image` должны совпадать точно. Не заменяйте содержательную
проверку простым сравнением количества или байтового SHA двух сериализаций.

После загрузки проверить отчёт по каждому ID, числовые Avito IDs, модерацию,
фото/порядок, цвета, цену, контакт и расходы. Старое неактивное объявление
8312555394 не активировать и не связывать по одной модели/цене.

## Откат

Сначала вернуть allowlist на прежние три ID и рестартовать приложение. Создать
новый backup, если исходный старше суток. Потребуется отдельная команда
владельца на откат: authorization scope=`rollback_new_avito_batch`, точные
XML hash/IDs и отсутствие неразрешённых расходов. Ожидание 72 часов не требуется
для аварийного отката. Исходный receipt должен оставаться в protected backup root.

```bash
python3 /private/operator/activate_avito_expansion.py \
  --plan /private/operator/release-plan.json --xml /private/operator/validated-six-ad.xml \
  --backup-dir /opt/isvoi/backups/directus/VERIFIED_FRESH_BACKUP \
  --receipt /opt/isvoi/backups/directus/ORIGINAL_BACKUP/avito-expansion-receipt.json \
  --authorization /private/operator/rollback-authorization.json \
  --confirm-publication --rollback
```

Откат возвращает только три новые строки к исходным пустым draft-полям;
mapping и первая тройка остаются. Не перезаписывает заметки/другие не принадлежащие
оператору поля. При редакторском изменении owned-полей после выката останавливается;
не форсировать. Продукты/офферы/остатки не откатываются, полный DB dump в production
не восстанавливать для такого отката. Удаление строки из фида НЕ доказывает
автоматического снятия объявления в Avito: отдельно проверить кабинет/отчёт.
