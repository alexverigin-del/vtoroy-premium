# Локальное окружение коммуникаций

Предпочтительное место разработки и испытаний — Docker Desktop на Windows с WSL 2. Рабочий сервер используется для выкладки только после приёмки. Локальные учётные записи, база, файлы и секреты не связаны с production.

Проверено 10 сентября 2026: Windows 11 Pro build 26200, 16 ГБ RAM, работающий гипервизор, около 324 ГБ свободного места. Установлены Docker Desktop 4.90.0 (Engine 29.7.2) и WSL 2.7.13. Исправлена неполная per-user установка, из-за которой запускатель не находил регистрацию backend; рабочая установка размещена в `C:\Program Files\Docker\Docker`. Docker Engine и `docker-desktop` в WSL 2 работают. Нативный контракт PostgreSQL 16 + Directus 11.17.4 выполнен успешно.

## Установка

1. Штатная точка запуска на этом компьютере — ярлык **ISVOI Docker** на рабочем столе либо команда `npm run communications:local:start`. Защитный сценарий предотвращает двойной backend, а при подтверждённой ошибке останавливает WSL, сохраняет оба временных socket-каталога и запускает Docker один раз. Прямой ярлык Docker Desktop обходит эту проверку и на Windows 11 build 26200 может снова получить занятый сокет.
2. Проверить `wsl --version`, `docker desktop status` и `docker version`. Минимальная версия WSL по документации Docker — 2.1.5.
3. Для контрактных тестов достаточно около 2 ГБ свободной памяти. Media-sanitizer ограничен одним CPU и 1 ГБ, а в простое использует около 13 МБ. Не изменять существующий `.wslconfig` без сверки настроек других WSL-проектов.

Источники: [Docker Desktop для Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [WSL backend](https://docs.docker.com/desktop/features/wsl/).

## Автоматический контракт

Из корня репозитория:

```powershell
docker pull postgres:16-alpine
docker pull directus/directus:11.17.4
npm run communications:build
node scripts/rehearse_communications.mjs
```

Скрипт создаёт отдельную закрытую сеть, временный PostgreSQL и настоящий Directus. После проверки удаляет только свои контейнеры и сеть. Образы и файлы теста сохраняются для повторного запуска. Контракт не использует Telegram/MAX/VK и не отправляет сообщения.

На Windows скрипт сам находит Docker CLI в стандартных каталогах Docker Desktop и добавляет его каталог в окружение дочерних процессов. Поэтому контракт работает и из терминала, открытого до установки Docker.

## Постоянный локальный стенд

Штатный запуск Docker Desktop и стенда одной командой:

```powershell
npm run communications:local:start
```

Если Docker Engine уже работает, команда не перезапускает его и только приводит Compose к требуемому состоянию. Если приложение уже запускается, команда ждёт 30 секунд. Восстановление выполняется лишь после неуспешного ожидания. Успешное завершение команды означает, что PostgreSQL и media-sanitizer прошли healthchecks, а Directus вернул `status=ok`.

Ручной запуск Compose для диагностики:

```powershell
docker compose -f infra/communications/docker-compose.test.yml up -d
npm run communications:local:setup
```

Адрес: `http://127.0.0.1:8056`. Все локальные учётные записи используют пароль `local-isvoi-fixture-password`:

- `admin@example.com` — администратор стенда;
- `manager@example.com` — менеджер магазина и пользователь модуля «Коммуникации»;
- `worker@example.com` — ограниченная служебная учётная запись обработчика;
- `intake@example.com` — ограниченная служебная учётная запись приёма заявок.

Порт привязан только к компьютеру; эти данные запрещено использовать вне изолированного локального окружения. Скрипт создаёт минимальные `store_locations`, `leads`, `lead_comments`, коммуникационную схему, точные политики доступа, тестовый магазин и Telegram-подключение. Его можно запускать повторно. Отправка и обработка подключения остаются заблокированы флагами `sending_enabled=false` и `recovery_hold=true`.

Пользователь `manager@example.com` видит модуль в панели Studio. Проектная настройка `module_bar` дополняется идемпотентно: существующий порядок модулей сохраняется, а `isvoi-inbox` добавляется или включается. Администратор не считается оператором endpoint без записи активного сотрудника для магазина.

Media-sanitizer не публикует сетевой порт и подключён к отдельной внутренней Docker-сети без внешнего доступа. Он полностью пересобирает JPEG/PNG/WebP через libvips, а OGG/Opus/MP3/WAV и MP4/WebM — через FFmpeg. Одновременно выполняется одно задание; исходник остаётся в карантине, пока очищенная версия не записана и не проверена. Документы и PDF в этом выпуске отклоняются.

Полная автоматическая проверка постоянного стенда:

```powershell
$env:COMM_LOCAL_SANITIZER = 'ready'
npm run communications:sanitizer:test
npm run communications:local:api:test
npm run communications:local:compat:test
npm run communications:ui:test
```

Контракт sanitizer проверяет реальные преобразования изображения, аудио и видео, запрет документов и повреждённых медиа. API-тест проверяет закрытый публичный доступ, разделение manager/worker, входящее обращение, персональную отметку чтения, принятие и ответ, приватную историю, карантин, очищенные изображение/аудио/видео, голосовое Opus Telegram, запрет PDF и исключение тестовых аккаунтов из бизнес-аналитики. Compatibility-тест проверяет старые `session`, `update`, `next`, `complete`, `intake` и `intake-check`. Для проверки аварийного режима остановите только `media-sanitizer`, удалите переменную `COMM_LOCAL_SANITIZER` и повторите API-тест: вложение должно вернуться из `scanning` в карантин, а текстовые обращения продолжат работать.

Флаг `ISVOI_TELEGRAM_USE_COMMUNICATIONS=true` включён только в локальном Compose. Без него старое расширение работает прежним способом. Поэтому локальная проверка адаптера не переключает production.

Отдельная одноразовая репетиция не использует данные постоянного стенда:

```powershell
npm run communications:rehearse
```

Она поднимает закрытую сеть и временные контейнеры, дважды применяет миграцию и проверяет гонку пяти операторов, идемпотентность, отзыв доступа, откат транзакции, неизвестный результат отправки и позднюю квитанцию.

Совместимость с фактической production-схемой проверяется без копирования рабочих строк:

```powershell
$env:COMM_REHEARSAL_SSH_HOST = 'root@217.114.14.32'
$env:COMM_REHEARSAL_SSH_KEY = 'C:\Users\1\.ssh\isvoi_beget_ed25519'
npm run communications:rehearse:production-schema
```

Скрипт получает только DDL через `pg_dump --schema-only`, восстанавливает его во временный PostgreSQL и создаёт синтетические Telegram-данные. Затем дважды выполняет backfill, сверяет маршруты, сотрудников, сессии, заявки, сообщения, вложения, подписки, события согласий, ссылки, карточки, черновики, квитанции, принятый outbox и курсор. Production-строки и секреты не копируются. Временные файлы, контейнер и сеть удаляются в `finally` как после успеха, так и после ошибки.

Остановка без удаления тестовой БД и файлов:

```powershell
docker compose -f infra/communications/docker-compose.test.yml stop
```

## Вход в Docker Desktop

Вход по email не требует изменений в архитектуре, Compose или переменных окружения ISVOI. Он авторизует обращения к Docker Hub и увеличивает лимит скачивания образов. Docker Desktop хранит учётные данные через системное хранилище Windows; пароль и токен нельзя помещать в `.env`, Compose или Git. Для production и CI при необходимости используется отдельный ограниченный токен организации, а не локальная сессия разработчика. Docker Desktop бесплатен для небольших компаний с численностью менее 250 сотрудников и выручкой менее 10 млн долларов в год; для более крупных компаний и государственных организаций требуется платная подписка.

Источники: [вход в Docker Desktop](https://docs.docker.com/desktop/setup/sign-in/), [хранилище учётных данных `docker login`](https://docs.docker.com/reference/cli/docker/login/), [условия использования Docker Desktop на Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## Повторная ошибка `sailor-ingest.sock`

На Docker Desktop 4.89.0 и 4.90.0 для Windows 11 build 26200 воспроизводился аварийный запуск с сообщениями о невозможности переименовать `sailor-ingest.sock` и `docker-secrets-engine/engine.sock`. Полное восстановление 10 сентября 2026 подтвердило, что WSL-диск, образы, тома и контейнеры при этом не повреждаются.

Штатное восстановление выполняет ярлык **ISVOI Docker** или `npm run communications:local:start`:

1. Сначала проверяет Engine и ждёт уже начавшийся запуск, чтобы не создать второй backend.
2. При подтверждённом сбое завершает процессы Docker, останавливает WSL и переименовывает оба временных socket-каталога с отметкой времени.
3. Сохраняет копию `%APPDATA%\Docker\settings-store.json` и фиксирует `EnableDockerAI=false`.
4. Запускает Docker Desktop ровно один раз, ждёт Engine и поднимает PostgreSQL, Directus и media-sanitizer.

Не использовать **Reset to factory defaults** для этой ошибки: он удаляет локальные контейнеры, образы и тома, тогда как повреждены временные сокеты запуска. Отключение Docker AI соответствует обходному решению для этой конкретной ошибки; после обновления Docker Desktop его можно проверить повторно. См. [сообщение об ошибке Docker Desktop](https://github.com/docker/desktop-feedback/issues/554), [настройки Docker Desktop](https://docs.docker.com/desktop/settings-and-maintenance/settings/) и [команду отключения model runner](https://docs.docker.com/reference/cli/docker/desktop/disable/).

Перед обновлением 4.89.0 → 4.90.0 создана локальная резервная копия двух остановленных WSL-дисков в `backups/docker-desktop/pre-4.90.0-20260910`. Каталог `backups/` исключён из Git.

Media-sanitizer рассчитан на текущий production-сервер: лимит 1 ГБ, один CPU и одно задание одновременно. Для выдачи оригинальных документов по-прежнему понадобится отдельный антивирусный или CDR-сервис.
