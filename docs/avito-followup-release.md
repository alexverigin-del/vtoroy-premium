# Avito: расширение до девяти объявлений

Контракт этой партии сохраняет все шесть текущих ID и добавляет только т9,
т24 и т26. Склад, товары, цены, остатки, фотографии и mapping не изменяются.
Точный XML SHA-256:
`77bdc8705f26d2555d4fb8db0fa956da7dde1b2acb9fb6ab91e0e4625e407e4f`.
Его проверка в валидаторе подтверждена владельцем. Исходный шестистрочный фид:
`ced267b8c8d192ab174b4ec1473b21feb3e2083a3691952e963c8e239cd608d1`.

## Проверки

`prepare_avito_followup_release.py` закрепляет девять конкретных ID, SKU,
канальных записей, дат диагностики, цен и батарей. У т9 шесть фото, у т24
и т26 по пять; всего 52 JPEG. Не заменять фотографии-заглушки ради количества.
Approval содержит хеши точного текста; смена даже одного символа XML требует
новой проверки, а не изменения константы для обхода guard.

```bash
python scripts/prepare_avito_followup_release.py \
  --xml /private/review/approved.xml \
  --snapshot /private/review/catalog-snapshot.json \
  --validator /private/review/owner-validator-confirmation.json \
  --copy-approval /private/review/copy-approval.json \
  --existing-feed /private/review/existing-six-ad.xml \
  --public-preflight /private/review/public-preflight.json \
  --output /private/review/release-plan.json
python -m unittest discover -s scripts -p test_avito_followup_release.py
python scripts/test_avito_expansion_sql.py --followup
node --test scripts/test_avito_feed.mjs
npm run web:verify
```

SQL fixture использует отдельный `postgres:16-alpine --network none`, без
production-томов и базы. Проверяет откат, идемпотентность, конкурентные правки
и побочные триггеры. Для VPS использовать Python проекта с установленными
зависимостями, а не произвольно выбранный системный интерпретатор.

## Выкат

1. Свежий source/public preflight: девять страниц, девять сертификатов и 52
   JPEG с хешами. План не старше часа. Перед записью полный проверенный VPS
   backup базы и uploads моложе суток; закрытый infra env не раскрывать.
2. Получить разрешение именно на выкат и запуск подключённой автозагрузки.
   Authorization: `scope=nine_ad_live_feed_expansion`, точные hash/девять ID,
   `no_unapproved_extra_costs=true`. Дополнительные платные услуги не включать.
   Отдельно подтвердить 72 часа стабильности либо явный отказ от ожидания.
   Подтверждение прошлой партии не наследуется.
3. Разместить оператор и plan/XML только в приватной backup-папке. Провести
   dry-run и транзакционный rehearsal с ROLLBACK. Репозиторий приложения
   доставляется через Git, не через эту приватную копию инструментов.
4. Выкатить код с лимитом девять, оставив прежние шесть значений allowlist.
   Сначала build, рестарт только `isvoi-web`, smoke и неизменность живого фида.
5. Запустить оператор `activate_avito_followup.py` с plan/XML, backup,
   authorization/stability и `--apply --confirm-publication`. Он проверяет
   backup, свежую сборку, все 52 JPEG, source, private identifiers и инварианты;
   одной транзакцией меняет только три канальные записи. Receipt сохраняется
   в backup как `avito-nine-ad-receipt.json`, не в публичном артефакте.
6. После проверки применённых записей расширить allowlist до девяти согласованных
   ID. Обновить только этот ключ в env и PM2 через `--update-env`, проверить
   публичный фид, затем `pm2 save`. Остальные сервисы не рестартовать.

Сравнивать XML по ID и именам полей с точным текстом и порядком изображений:
форматированный файл и компактный runtime XML имеют разные байтовые хеши.
Проверить no-store/noindex, сайт и Directus health. Статус `active` в канальной
записи означает включение в фид, а не подтверждённую модерацию Avito.
Отчёт загрузки, модерация и фактические расходы проверяются отдельно в кабинете.
Существующее отклонение т13 не исправляется заменой ID или новым дублем.

## Откат

Сначала вернуть allowlist и runtime PM2 к шести исходным ID, проверить фид и
сохранить PM2. После разрешения на откат выполнить `activate_avito_followup.py`
с `--rollback --confirm-publication`, свежим backup, исходным receipt из
protected backup root и authorization scope `rollback_new_avito_batch`.
Ожидание 72 часов для отката не требуется.

Возвращаются только поля трёх новых записей в исходный draft. Заметки и другие
не принадлежащие оператору поля не перезаписываются. Если owned-поля изменились,
оператор останавливается. Не восстанавливать всю рабочую БД ради этого отката.
Удаление записи из фида не доказывает снятие объявления: проверить отчёт Avito.
Исторический `activate_avito_expansion.py` без follow-up-контракта остаётся
закреплён за прежней шестистрочной партией; не использовать его для этой.
