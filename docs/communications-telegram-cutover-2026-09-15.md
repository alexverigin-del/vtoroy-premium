# Telegram: production cutover 15 сентября 2026

Переключение согласовано владельцем и выполнено через `scripts/cutover_telegram_communications_on_host.sh apply`. Первый запуск завершился на проверке резервирования до остановки legacy PM2: health-command ожидал защищённое окружение systemd. Вызов исправлен, syntax/preflight повторены; рабочий Telegram не прерывался этим запуском. Повторный запуск завершился успешно.

| Контроль | Фактическое состояние |
|---|---|
| Production commit | `a63f731` |
| Время cutover | `2026-09-15T14:44:13Z` |
| Последняя проверенная внешняя копия до переключения | `1c853b0e-2d48-476f-a375-dce98955cf36`, менее 17 минут |
| Последовательность legacy change journal | `217` |
| Финальная миграция | `data_ready=true`, старых незавершённых отправок нет |
| Directus | `ISVOI_TELEGRAM_USE_COMMUNICATIONS=true`, `/server/ping=pong` |
| Telegram | Подключение включено; receive/process/send/media активны; polling lease активен |
| Legacy Telegram | PM2 `isvoi-telegram` остановлен |
| MAX | process/send/media остались активными |
| Исходящие риски после запуска | 0 `uncertain` outbox и 0 `uncertain` operations |
| Маркетинг Telegram | Выключен |

Системная проверка выполнена сразу после переключения. Тогда новых входящих и исходящих сообщений ещё не было. Живой тест `/start` и нового сообщения, проверка ответа и закрытие пилота должны быть записаны отдельно по фактическим квитанциям. При появлении новой рабочей записи возможен только fix-forward; ручной `rollback-before-ingress` проверяет новую работу после остановки receiver.

Локальный набор `communications:test`: 35 успешных контрактов. Production запуск полного тестового набора не выполнялся; проверены Bash syntax, два контракта сценария, миграционный runner без записи, `preflight` и read-only состояние после cutover.
