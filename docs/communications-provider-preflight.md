# Проверка ресурсов MAX и VK

Дата фиксации контракта: 11 сентября 2026.

Скрипт `scripts/communications_provider_preflight.mjs` проверяет паспорт подключения перед живым пилотом. Он выполняет только операции чтения, не создаёт и не меняет webhook-подписки, callback-серверы, права или сообщения. Токены, webhook-секреты, confirmation code и тексты ошибок площадок не попадают в отчёт.

## Запуск

Создать закрытый файл `work/private/communications-providers.env`. Каталог `work` и env-файлы исключены из Git.

```dotenv
MAX_BOT_TOKEN=
MAX_BOT_ID=
MAX_BOT_USERNAME=
MAX_CA_CERT_PATH=infra/communications/certificates/russian_trusted_root_ca.crt
MAX_WEBHOOK_URL=https://example.ru/isvoi-communications/v1/webhooks/uuid-max
MAX_WEBHOOK_SECRET=

VK_GROUP_TOKEN=
VK_GROUP_ID=
VK_CALLBACK_SERVER_ID=
VK_WEBHOOK_URL=https://example.ru/isvoi-communications/v1/webhooks/uuid-vk
VK_WEBHOOK_SECRET=
VK_CONFIRMATION=
```

Пустой `VK_CALLBACK_SERVER_ID` допустим, если точному URL соответствует один callback-сервер.

```powershell
npm run communications:max:preflight
npm run communications:vk:preflight

# Безопасный JSON-паспорт для фиксации результата выпуска
node scripts/communications_provider_preflight.mjs --platform vk `
  --env work/private/communications-providers.env `
  --output work/communications-preflight/vk.json
```

Код завершения `0` означает, что read-only preflight пройден. Код `2` означает, что API доступен, но ресурс требует настройки. Код `1` означает ошибку входных параметров, сети, авторизации или формата ответа. Даже код `0` не заменяет закрытый живой пилот.

Регистрация подписки MAX вынесена в отдельную команду и по умолчанию также работает как проверка. Изменение выполняется только с `--apply` и точным повтором URL:

```powershell
node scripts/configure_max_webhook.mjs --apply `
  --confirm-webhook "https://api.isvoi.ru/isvoi-communications/v1/webhooks/<connection-id>"
```

Команда не удаляет другие подписки. При неизвестном результате POST она останавливается без автоматического повтора: сначала нужно снова выполнить `communications:max:preflight` и увидеть фактическое состояние площадки.

## Паспорт MAX

| Параметр         | Контракт ISVOI                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| API              | `https://platform-api2.max.ru`                                                                           |
| Авторизация      | Токен только в заголовке `Authorization`                                                                 |
| Read-only методы | `GET /me`, `GET /subscriptions`                                                                          |
| Идентичность     | `user_id`, `username`, `is_bot=true` совпадают с ожидаемым ботом                                         |
| Webhook          | Точный HTTPS URL на стандартном порту                                                                    |
| События          | `message_created`, `message_callback`, `message_edited`, `bot_started`, `bot_stopped`                    |
| Подпись          | `X-Max-Bot-Api-Secret`; совпадение подтверждается живым webhook, потому что GET API секрет не возвращает |
| Приём            | Endpoint должен вернуть HTTP 200 не позднее 30 секунд; событие сначала сохраняется в durable inbox       |

MAX требует HTTPS webhook и рекомендует webhook для production. Текущий домен API и ограничения webhook сверены с официальными методами [`GET /me`](https://dev.max.ru/docs-api/methods/GET/me), [`GET /subscriptions`](https://dev.max.ru/docs-api/methods/GET/subscriptions) и [`POST /subscriptions`](https://dev.max.ru/docs-api/methods/POST/subscriptions). POST указан как источник контракта, но preflight его не вызывает.

С 19 июля 2026 MAX использует для API домен `platform-api2.max.ru` и требует добавить сертификат Минцифры в доверенные. В репозитории хранится публичный `Russian Trusted Root CA`, скачанный из инфраструктуры Госуслуг: `infra/communications/certificates/russian_trusted_root_ca.crt`. Перед каждым использованием код проверяет, что это самоподписанный CA, срок его действия не истёк и SHA-256 равен `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31`.

Дополнительное доверие действует только для точного origin `https://platform-api2.max.ru`. Корень не устанавливается в Windows или системное хранилище контейнера и не применяется к Directus, Telegram, VK либо выданным MAX upload URL. Отключать TLS-проверку запрещено. Официальные основания: [история изменений MAX API](https://dev.max.ru/docs-api/changelog-api) и [страница сертификатов Госуслуг](https://www.gosuslugi.ru/tls).

## Паспорт VK

| Параметр             | Контракт ISVOI                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API                  | `https://api.vk.ru/method`, версия `5.199`                                                                                                      |
| Авторизация          | Токен сообщества только в form body                                                                                                             |
| Read-only методы     | `groups.getById`, `groups.getTokenPermissions`, `groups.getCallbackServers`, `groups.getCallbackSettings`, `groups.getCallbackConfirmationCode` |
| Идентичность         | ID сообщества совпадает с `VK_GROUP_ID`                                                                                                         |
| Права обслуживания   | `messages`, `photos`, `docs`                                                                                                                    |
| Callback             | Один выбранный сервер, точный URL, `status=ok`, совпадающие secret и confirmation code                                                          |
| События в настройках | `message_new`, `message_allow`, `message_deny`, `message_edit`                                                                                  |
| Проверка в пилоте    | `message_event`, входящий текст, каждый тип вложения, ответ менеджера и закрытие заявки                                                         |

Права стены для будущих публикаций намеренно не входят в готовность обслуживания обращений. Их следует выдавать отдельному подключению выпуска 4. Методы и структуры ответов закреплены официальной [схемой VK API 5.199](https://github.com/VKCOM/vk-api-schema).

## Живой пилот после preflight

Для каждой площадки использовать тестового пользователя и отдельное тестовое подключение. Проверить по одной цепочке: открыть continuation link, создать заявку, принять её в Directus, получить и отправить текст, изображение, голосовое, видео и документ, изменить сообщение, выполнить callback, заблокировать/разблокировать бота и закрыть заявку. В журнал выпуска сохранить безопасный JSON preflight, ID тестовой заявки, время событий и результаты доставки без payload и секретов.
