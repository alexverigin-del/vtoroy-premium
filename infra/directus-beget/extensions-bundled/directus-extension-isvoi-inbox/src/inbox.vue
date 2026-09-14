<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useApi } from "@directus/extensions-sdk";
const api = useApi(),
  base = "/isvoi-communications/v1";
const rows = ref<any[]>([]),
  history = ref<any[]>([]),
  selected = ref<any>(null),
  filter = ref("open"),
  platform = ref(""),
  draft = ref(""),
  note = ref(false),
  busy = ref(false),
  error = ref(""),
  files = ref<any[]>([]),
  staff = ref<any[]>([]),
  assignee = ref(""),
  tab = ref("inbox"),
  audience = ref<any>(null),
  connections = ref<any>(null),
  refreshing = ref(false),
  hasOlder = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined,
  alive = true,
  selection = 0;
const media = ref<Record<string, string>>({});
const status: Record<string, string> = {
  pending: "В очереди",
  sending: "Отправляется",
  accepted: "Принято площадкой",
  partial: "Доставлено частично",
  uncertain: "Результат неизвестен — требуется проверка",
  failed: "Ошибка отправки",
  blocked: "Получатель недоступен",
  suppressed: "Отправка остановлена",
  cancelled: "Отменено",
  quarantine: "Проверка файла",
  scanning: "Проверяется",
  ready: "Готово",
  rejected: "Файл отклонён",
  queued: "Ожидает менеджера",
  agent: "В работе",
  waiting: "Ожидаем клиента",
  closed: "Закрыто",
  bot: "Бот",
  on_track: "Первый ответ по графику",
  warning: "Срок первого ответа истёк",
  overdue: "Требуется эскалация",
  escalated: "Руководитель уведомлён",
  met: "Первый ответ вовремя",
  breached: "Первый ответ с опозданием",
  untracked: "SLA не настроен",
};
const canSend = computed(
  () =>
    selected.value &&
    !busy.value &&
    (draft.value.trim() || files.value.length) &&
    files.value.every((f) => f.state === "ready"),
);
const errorText = (e: any) => {
  const code = e.response?.data?.errors?.[0]?.message;
  return (
    (
      {
        STALE_CONVERSATION: "Заявка изменилась. Обновите данные и повторите действие.",
        CLAIM_REQUIRED: "Сначала примите заявку в работу.",
        FORBIDDEN: "Недостаточно прав для этого действия.",
        COMMUNICATIONS_DISABLED: "Коммуникации ещё не включены. Выполняется подготовка выпуска.",
        FILE_TOO_LARGE: "Файл должен быть не больше 20 МБ.",
        FILE_TYPE_MISMATCH: "Содержимое файла не соответствует его формату.",
        ATTACHMENT_NOT_READY: "Дождитесь проверки вложений.",
      } as any
    )[code] || "Не удалось выполнить действие. Текст сохранён. Проверьте соединение и повторите."
  );
};
async function load() {
  if (refreshing.value || !alive) return;
  refreshing.value = true;
  try {
    const { data } = await api.get(`${base}/inbox`, {
      params: { view: filter.value, ...(platform.value ? { platform: platform.value } : {}) },
    });
    rows.value = data.data;
    if (selected.value) {
      const latest = rows.value.find((r) => r.id === selected.value.id);
      if (latest) selected.value = { ...selected.value, ...latest };
      await loadHistory();
    }
    for (const f of files.value)
      if (f.state === "quarantine" || f.state === "scanning") {
        const { data } = await api.get(`${base}/attachments/${f.id}/status`);
        Object.assign(f, data.data);
      }
  } catch (e) {
    error.value = errorText(e);
  } finally {
    refreshing.value = false;
  }
}
async function loadHistory(older = false) {
  const current = selected.value,
    epoch = selection;
  if (!current) return;
  const { data } = await api.get(`${base}/threads/${current.thread_id}/messages`, {
    params: {
      conversation_id: current.id,
      ...(older && history.value.length ? { before: history.value[0].sequence } : {}),
    },
  });
  if (epoch !== selection) return;
  history.value = older ? [...data.data, ...history.value] : data.data;
  hasOlder.value = data.data.length === 50;
}
async function choose(row: any) {
  if (busy.value) return;
  if (pending) {
    error.value =
      "Результат предыдущего действия неизвестен. Повторите его с тем же содержанием перед переходом.";
    return;
  }
  if (
    (draft.value || files.value.length) &&
    selected.value?.id !== row.id &&
    !window.confirm("Перейти к другой заявке и очистить черновик?")
  )
    return;
  selection++;
  selected.value = row;
  history.value = [];
  draft.value = "";
  files.value = [];
  error.value = "";
  try {
    await loadHistory();
    await api.post(`${base}/commands`, {
      type: "read",
      key: crypto.randomUUID(),
      conversation_id: row.id,
      payload: {},
    });
  } catch (e) {
    error.value = errorText(e);
  }
}
// Retain the command key after a transport failure. A retry cannot duplicate the reply.
let pending: { fingerprint: string; key: string; body: any } | null = null;
async function command(type: string, payload: any = {}) {
  if (!selected.value || busy.value) return;
  busy.value = true;
  error.value = "";
  let body = {
    type,
    conversation_id: selected.value.id,
    expected_version: selected.value.version,
    payload,
  };
  const fingerprint = JSON.stringify({ type, conversation_id: body.conversation_id, payload });
  if (pending && pending.fingerprint !== fingerprint) {
    error.value =
      "Результат предыдущего действия неизвестен. Сначала повторите его с тем же содержанием.";
    busy.value = false;
    return;
  }
  const key = pending?.key || crypto.randomUUID();
  if (pending) body = pending.body;
  pending = { fingerprint, key, body };
  try {
    const { data } = await api.post(`${base}/commands`, { ...body, key });
    selected.value.version = data.data.version;
    pending = null;
    if (type === "reply" || type === "note") {
      draft.value = "";
      files.value = [];
    }
    await load();
  } catch (e: any) {
    error.value = errorText(e);
    if (e.response) pending = null;
  } finally {
    busy.value = false;
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || !selected.value) return;
  busy.value = true;
  error.value = "";
  try {
    for (const file of Array.from(input.files)) {
      if (file.size > 20000000)
        throw { response: { data: { errors: [{ message: "FILE_TOO_LARGE" }] } } };
      const { data } = await api.post(`${base}/attachments`, file, {
        headers: { "Content-Type": "application/octet-stream" },
        params: {
          conversation_id: selected.value.id,
          name: file.name,
          mime: file.type || "application/octet-stream",
        },
      });
      files.value.push(data.data);
    }
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
    input.value = "";
  }
}
async function openFile(f: any) {
  try {
    const { data } = await api.get(`${base}/attachments/${f.id}`, { responseType: "blob" });
    const url = URL.createObjectURL(data);
    if (f.kind === "document") {
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      if (media.value[f.id]) URL.revokeObjectURL(media.value[f.id]);
      media.value[f.id] = url;
    }
  } catch (e) {
    error.value = errorText(e);
  }
}
async function showAudience() {
  tab.value = "audience";
  try {
    audience.value = (await api.get(`${base}/audience`)).data.data;
  } catch (e) {
    error.value = errorText(e);
  }
}
async function showConnections() {
  tab.value = "connections";
  try {
    connections.value = (await api.get(`${base}/connections`)).data.data;
  } catch (e) {
    error.value = errorText(e);
  }
}
async function refreshCurrent() {
  if (tab.value === "audience") return showAudience();
  if (tab.value === "connections") return showConnections();
  return load();
}
const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const day = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
const connectionName = (id: string) =>
  audience.value?.connections?.find((connection: any) => connection.id === id)?.name || id;
const optionalDate = (value: string | null) => (value ? date(value) : "—");
const healthName: Record<string, string> = {
  ok: "Работает",
  idle: "Ожидает первых событий",
  delayed: "Есть задержка",
  attention: "Требует проверки",
  error: "Ошибка подключения",
  disabled: "Отключено",
};
const connectionHealthName = (item: any) =>
  item.source === "legacy_telegram" && item.health === "ok"
    ? "Работает отдельно"
    : healthName[item.health] || item.health;
const eventName: Record<string, string> = {
  first_seen: "Новые аккаунты",
  subscribed: "Подписки",
  unsubscribed: "Отписки",
  lead_created: "Новые заявки",
  first_agent_response: "Первые ответы менеджеров",
  sla_escalated: "Эскалации SLA",
};
const unreadLabel = (value: unknown) => {
  const count = Number(value) || 0,
    mod100 = count % 100,
    mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "новых" : mod10 === 1 ? "новое" : "новых";
  return `${count} ${word}`;
};
async function tick() {
  await load();
  if (alive) timer = setTimeout(tick, 3000);
}
onMounted(async () => {
  tick();
  try {
    staff.value = (await api.get(`${base}/staff`)).data.data;
  } catch {}
});
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(timer);
  Object.values(media.value).forEach(URL.revokeObjectURL);
});
</script>

<template>
  <private-view title="Коммуникации">
    <div class="workspace">
      <nav class="tabs" aria-label="Разделы коммуникаций">
        <button :aria-current="tab === 'inbox' ? 'page' : undefined" @click="tab = 'inbox'">
          Обращения</button
        ><button :aria-current="tab === 'audience' ? 'page' : undefined" @click="showAudience">
          Аудитория
        </button>
        <button :aria-current="tab === 'connections' ? 'page' : undefined" @click="showConnections">
          Подключения
        </button>
      </nav>
      <p v-if="error" class="error" role="alert">
        {{ error }} <button @click="refreshCurrent">Обновить</button>
      </p>
      <div v-if="tab === 'inbox'" class="inbox" :class="{ 'has-selection': selected }">
        <aside class="queue" aria-label="Очередь обращений">
          <div class="filters">
            <select v-model="filter" aria-label="Статус обращений" @change="load">
              <option value="open">Все открытые</option>
              <option value="mine">Мои</option>
              <option value="unassigned">Без ответственного</option>
              <option value="awaiting">Ждут ответа</option>
              <option value="closed">Закрытые</option>
            </select>
            <select v-model="platform" aria-label="Площадка" @change="load">
              <option value="">Все площадки</option>
              <option>telegram</option>
              <option>max</option>
              <option>vk</option>
            </select>
          </div>
          <p v-if="!rows.length" class="empty">Обращений по выбранным условиям нет.</p>
          <button
            v-for="row in rows"
            :key="row.id"
            class="case"
            :class="{ selected: selected?.id === row.id }"
            @click="choose(row)"
          >
            <span class="platform">{{ row.platform }}</span
            ><strong>{{ row.reference_code || "Обращение" }}</strong
            ><span>{{ status[row.handling] }}</span
            ><span v-if="row.sla_state !== 'untracked'" :class="['sla', row.sla_state]">
              {{ status[row.sla_state] }} </span
            ><span
              v-if="Number(row.unread_count)"
              class="unread"
              aria-label="Непрочитанные сообщения"
            >
              {{ unreadLabel(row.unread_count) }} </span
            ><small v-if="row.awaiting_since">Ожидает с {{ date(row.awaiting_since) }}</small>
          </button>
        </aside>
        <section v-if="selected" class="conversation" aria-label="Переписка">
          <header>
            <button class="back" @click="selected = null">← Очередь</button
            ><strong>{{ selected.reference_code || "Переписка" }}</strong
            ><span>{{ status[selected.handling] }}</span
            ><span v-if="selected.sla_state !== 'untracked'" :class="['sla', selected.sla_state]">
              {{ status[selected.sla_state] }} </span
            ><button :disabled="busy" @click="command('claim')">Принять в работу</button>
          </header>
          <div class="messages" aria-live="polite">
            <button v-if="hasOlder" @click="loadHistory(true)">Загрузить предыдущие</button>
            <article
              v-for="message in history"
              :key="message.id"
              :class="['message', message.direction]"
            >
              <small
                >{{
                  message.direction === "in"
                    ? "Клиент"
                    : message.direction === "internal"
                      ? "Внутренняя заметка"
                      : "Менеджер"
                }}
                · {{ date(message.occurred_at) }}
                <span v-if="message.edited_at">· изменено</span></small
              >
              <p>{{ message.text }}</p>
              <div v-for="f in message.attachments" :key="f.id" class="attachment">
                <button :disabled="f.state !== 'ready'" @click="openFile(f)">
                  {{ f.name }} · {{ status[f.state] }}</button
                ><template v-if="media[f.id]"
                  ><img v-if="f.kind === 'image'" :src="media[f.id]" :alt="f.name" /><audio
                    v-else-if="f.kind === 'audio' || f.kind === 'voice'"
                    :src="media[f.id]"
                    controls /><video
                    v-else-if="f.kind === 'video'"
                    :src="media[f.id]"
                    controls
                    playsinline
                /></template>
              </div>
              <small v-if="message.delivery" class="delivery">{{
                status[message.delivery.state]
              }}</small>
            </article>
            <p v-if="!history.length" class="empty">Сообщений пока нет.</p>
          </div>
          <form
            class="composer"
            @submit.prevent="
              command(note ? 'note' : 'reply', {
                text: draft,
                attachment_ids: files.map((f) => f.id),
              })
            "
          >
            <label class="note"><input v-model="note" type="checkbox" /> Внутренняя заметка</label
            ><label class="sr-only" for="reply">Текст сообщения</label
            ><textarea
              id="reply"
              v-model="draft"
              maxlength="3500"
              rows="3"
              :placeholder="note ? 'Заметка видна только сотрудникам' : 'Ответ клиенту…'"
            />
            <div v-for="f in files" :key="f.id" class="file-status">
              {{ f.name }} — {{ status[f.state] }}
              <button
                type="button"
                @click="files = files.filter((x) => x.id !== f.id)"
                :aria-label="`Убрать ${f.name}`"
              >
                ×
              </button>
            </div>
            <div class="composer-actions">
              <label class="upload"
                >Прикрепить файл<input
                  type="file"
                  multiple
                  :disabled="busy"
                  @change="upload" /></label
              ><small>До 20 МБ · файл проверяется перед отправкой</small
              ><button type="submit" class="primary" :disabled="!canSend">
                {{ busy ? "Сохранение…" : note ? "Сохранить заметку" : "Отправить" }}
              </button>
            </div>
          </form>
        </section>
        <section v-else class="empty selection-empty">Выберите обращение в очереди.</section>
        <aside v-if="selected" class="details" aria-label="Клиент и заявка">
          <h2>Заявка</h2>
          <dl>
            <dt>Площадка</dt>
            <dd>{{ selected.platform }}</dd>
            <dt>Аккаунт</dt>
            <dd>{{ selected.external_user_id }}</dd>
            <dt>Состояние</dt>
            <dd>{{ status[selected.handling] }}</dd>
            <template v-if="selected.first_response_due_at">
              <dt>SLA первого ответа</dt>
              <dd>
                {{ status[selected.sla_state] }} · до {{ date(selected.first_response_due_at) }}
              </dd>
            </template>
          </dl>
          <a :href="`/admin/content/leads/${selected.lead_id}`">Открыть карточку заявки ↗</a
          ><label
            >Передать сотруднику<select v-model="assignee">
              <option value="">Выберите сотрудника</option>
              <option
                v-for="person in staff"
                :key="person.user_id + person.store_id"
                :value="person.user_id"
              >
                {{
                  [person.first_name, person.last_name].filter(Boolean).join(" ") || person.user_id
                }}
              </option>
            </select></label
          ><button :disabled="!assignee || busy" @click="command('assign', { user_id: assignee })">
            Передать
          </button>
          <button :disabled="busy" @click="command('handling', { state: 'waiting' })">
            Ожидаем клиента</button
          ><button :disabled="busy" @click="command('handling', { state: 'agent' })">
            Вернуть в работу</button
          ><button :disabled="busy" @click="command('handling', { state: 'closed' })">
            Закрыть обращение
          </button>
        </aside>
      </div>
      <section v-else-if="tab === 'audience'" class="audience">
        <h2>Аудитория ботов</h2>
        <p>
          Аккаунты площадок могут принадлежать одному человеку. Сумма аккаунтов не равна числу
          уникальных клиентов. Тестовые аккаунты исключены.
        </p>
        <div v-if="audience" class="audience-sections">
          <div class="table-wrap">
            <h3>Сводка по подключениям</h3>
            <table>
              <caption class="sr-only">
                Аккаунты, подписчики, активность и доступность по подключениям
              </caption>
              <thead>
                <tr>
                  <th>Подключение</th>
                  <th>Аккаунты</th>
                  <th>Подписчики</th>
                  <th>Активны 7 дней</th>
                  <th>Активны 30 дней</th>
                  <th>Новые 30 дней</th>
                  <th>Недоступны</th>
                  <th>Доступность неизвестна</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="n in audience.connections" :key="n.id">
                  <th>{{ n.name }}</th>
                  <td>{{ n.users }}</td>
                  <td>{{ n.subscribers }}</td>
                  <td>{{ n.active_7 }}</td>
                  <td>{{ n.active_30 }}</td>
                  <td>{{ n.new_30 }}</td>
                  <td>{{ n.blocked }}</td>
                  <td>{{ n.unknown }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-wrap">
            <h3>Подписчики по темам</h3>
            <table v-if="audience.topics.length">
              <caption class="sr-only">
                Число согласившихся подписчиков по подключениям и темам
              </caption>
              <thead>
                <tr>
                  <th>Подключение</th>
                  <th>Тема</th>
                  <th>Подписчики</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="topic in audience.topics" :key="topic.connection_id + topic.topic_key">
                  <th>{{ connectionName(topic.connection_id) }}</th>
                  <td>{{ topic.topic_key }}</td>
                  <td>{{ topic.subscribers }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty compact">Подтверждённых тематических подписок пока нет.</p>
          </div>
          <div class="table-wrap">
            <h3>Динамика за 30 дней</h3>
            <table v-if="audience.daily.length">
              <caption class="sr-only">
                Ежедневные события аудитории и обращений за последние 30 дней
              </caption>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Подключение</th>
                  <th>Событие</th>
                  <th>Количество</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in audience.daily"
                  :key="entry.connection_id + entry.day + entry.kind"
                >
                  <th>{{ day(entry.day) }}</th>
                  <td>{{ connectionName(entry.connection_id) }}</td>
                  <td>{{ eventName[entry.kind] || entry.kind }}</td>
                  <td>{{ entry.events }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty compact">После начала наблюдений событий пока нет.</p>
          </div>
          <p v-if="audience.baseline_at" class="baseline">
            Начальный снимок: {{ date(audience.baseline_at) }}. Даты старых подписок не
            восстановлены искусственно.
          </p>
        </div>
      </section>
      <section v-else class="connections-view">
        <header class="section-heading">
          <div>
            <h2>Подключения площадок</h2>
            <p>Состояние приёма, отправки и очередей без доступа к секретам площадок.</p>
          </div>
          <button :disabled="refreshing" @click="showConnections">Обновить</button>
        </header>
        <template v-if="connections">
          <div
            v-if="connections.runtime?.recovery_hold || !connections.runtime?.sending_enabled"
            class="runtime-alert"
            role="status"
          >
            Исходящая отправка остановлена
            <span v-if="connections.runtime?.recovery_hold">· включён recovery hold</span>
          </div>
          <p class="checked">Проверено: {{ date(connections.checked_at) }}</p>
          <div class="connection-grid">
            <article v-for="item in connections.connections" :key="item.id" class="connection-card">
              <header>
                <div>
                  <span class="platform">{{ item.platform }}</span>
                  <h3>{{ item.name }}</h3>
                </div>
                <span :class="['health', item.health]">{{ connectionHealthName(item) }}</span>
              </header>
              <p v-if="item.migration_state === 'awaiting_cutover'" class="migration-note">
                Текущий Telegram-контур. Перенос в общее ядро ещё не выполнен; данные и очереди
                учитываются отдельно.
              </p>
              <dl>
                <dt>Режим</dt>
                <dd>{{ item.mode === "test" ? "Закрытый пилот" : "Рабочий" }}</dd>
                <dt>Бот</dt>
                <dd>{{ item.bot_username || "—" }}</dd>
                <dt>Последнее входящее</dt>
                <dd>{{ optionalDate(item.last_received_at) }}</dd>
                <dt>Последняя отправка</dt>
                <dd>{{ optionalDate(item.last_sent_at) }}</dd>
                <dt>Открытые обращения</dt>
                <dd>{{ item.open_conversations }}</dd>
                <dt>Аккаунты</dt>
                <dd>
                  {{ item.accounts }}
                  <small v-if="item.test_accounts !== null"
                    >тестовых: {{ item.test_accounts }}</small
                  ><small v-else>без отдельной legacy-метки теста</small>
                </dd>
                <dt>Очередь приёма</dt>
                <dd>
                  {{ item.inbound_pending === null ? "—" : item.inbound_pending }}
                  <small v-if="item.source === 'legacy_telegram'"
                    >long polling текущего контура</small
                  >
                  <small v-if="item.oldest_inbound_at"
                    >с {{ optionalDate(item.oldest_inbound_at) }}</small
                  >
                </dd>
                <dt>Очередь отправки</dt>
                <dd>
                  {{ item.outbox_pending }}
                  <small v-if="item.oldest_outbox_at"
                    >с {{ optionalDate(item.oldest_outbox_at) }}</small
                  >
                </dd>
                <dt>Неизвестный результат</dt>
                <dd>{{ item.uncertain }}</dd>
                <dt>Частичная доставка за 24 часа</dt>
                <dd>{{ item.delivery_partial_24 }}</dd>
                <dt>Ошибки за 24 часа</dt>
                <dd>{{ item.inbound_failed_24 + item.delivery_failed_24 }}</dd>
              </dl>
              <p v-if="item.error_code" class="connection-error">{{ item.error_code }}</p>
              <p class="marketing">
                Персональный маркетинг:
                {{
                  item.marketing_enabled
                    ? item.marketing_mode === "pilot"
                      ? "закрытый пилот"
                      : "включён"
                    : "выключен"
                }}
              </p>
            </article>
          </div>
        </template>
      </section>
    </div>
  </private-view>
</template>
<style scoped>
.workspace {
  --border: var(--theme--border-color, #d7dbe0);
  padding: 0 24px 24px;
  color: var(--theme--foreground, #263238);
}
button,
select,
textarea {
  font: inherit;
  color: inherit;
}
button,
select {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--theme--background, #fff);
}
button {
  cursor: pointer;
}
button:hover {
  border-color: var(--theme--primary, #6644ff);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
a:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--theme--primary, #6644ff);
  outline-offset: 2px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tabs [aria-current="page"],
.primary {
  background: var(--theme--primary, #6644ff);
  color: #fff;
}
.inbox {
  display: grid;
  grid-template-columns: 260px minmax(320px, 1fr) 230px;
  border: 1px solid var(--border);
  border-radius: 8px;
  min-height: 650px;
  height: calc(100vh - 180px);
  overflow: hidden;
}
.queue {
  border-right: 1px solid var(--border);
  overflow: auto;
}
.filters {
  display: grid;
  gap: 8px;
  padding: 12px;
}
.case {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  border-width: 0 0 1px;
  border-radius: 0;
  text-align: left;
  padding: 16px;
}
.case.selected {
  background: var(--theme--background-accent, #eeeafc);
  box-shadow: inset 3px 0 var(--theme--primary, #6644ff);
}
.platform {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 1px;
}
.unread {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--theme--primary, #6644ff);
  color: #fff;
  font-size: 11px;
}
.sla {
  padding: 3px 7px;
  border-radius: 4px;
  background: var(--theme--background-subdued, #eef1f4);
  font-size: 11px;
}
.sla.warning {
  background: var(--theme--warning-background, #fff2c2);
  color: var(--theme--warning, #7a5400);
}
.sla.overdue,
.sla.escalated,
.sla.breached {
  background: var(--theme--danger-background, #ffe1e1);
  color: var(--theme--danger, #a31313);
}
.sla.met {
  background: var(--theme--success-background, #dff5e5);
  color: var(--theme--success, #176c35);
}
.conversation {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.conversation header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.conversation header span {
  font-size: 12px;
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.message {
  max-width: 90%;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  align-self: flex-start;
  overflow-wrap: anywhere;
}
.message.out {
  align-self: flex-end;
  background: var(--theme--background-accent, #f3f0ff);
}
.message.internal {
  background: var(--theme--warning-background, #fff7d7);
  align-self: stretch;
  max-width: 100%;
}
.message p {
  white-space: pre-wrap;
  margin: 8px 0;
}
.message small {
  font-size: 11px;
  opacity: 0.75;
}
.attachment img,
.attachment video {
  max-width: 100%;
  max-height: 300px;
  margin-top: 8px;
}
.attachment audio {
  max-width: 100%;
  margin-top: 8px;
}
.attachment button {
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
}
.composer {
  padding: 16px;
  border-top: 1px solid var(--border);
}
textarea {
  display: block;
  resize: vertical;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--theme--background, #fff);
  padding: 12px;
  margin: 8px 0;
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.composer-actions small {
  font-size: 11px;
  flex: 1;
}
.note {
  font-size: 12px;
}
.upload {
  cursor: pointer;
  font-size: 12px;
  position: relative;
}
.upload input {
  max-width: 170px;
  display: block;
  margin-top: 4px;
}
.file-status {
  font-size: 12px;
  margin-bottom: 8px;
}
.details {
  padding: 16px;
  border-left: 1px solid var(--border);
  overflow: auto;
}
.details h2,
.audience h2,
.connections-view h2 {
  font-size: 18px;
  margin-bottom: 16px;
}
.details dl {
  display: grid;
  gap: 6px;
}
.details dt {
  font-size: 11px;
  opacity: 0.65;
}
.details dd {
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
.details a {
  display: block;
  margin: 10px 0 24px;
  color: var(--theme--primary, #6644ff);
}
.details label {
  font-size: 12px;
}
.details select,
.details button {
  display: block;
  width: 100%;
  margin: 8px 0;
}
.empty {
  padding: 24px;
  color: var(--theme--foreground-subdued, #687482);
}
.selection-empty {
  grid-column: span 2;
  display: grid;
  place-content: center;
}
.error {
  padding: 12px;
  background: var(--theme--danger-background, #ffe9e9);
  margin-bottom: 12px;
}
.back {
  display: none;
}
.audience p {
  max-width: 850px;
  margin: 16px 0;
  line-height: 1.6;
}
.section-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}
.section-heading h2,
.section-heading p {
  margin: 0 0 8px;
}
.checked {
  color: var(--theme--foreground-subdued, #687482);
  font-size: 12px;
}
.runtime-alert {
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid var(--theme--warning, #b78103);
  border-radius: 6px;
  background: var(--theme--warning-background, #fff7d7);
}
.connection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.connection-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px;
  background: var(--theme--background, #fff);
}
.connection-card > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}
.connection-card h3 {
  margin: 4px 0 16px;
}
.connection-card dl {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) auto;
  gap: 9px 16px;
  margin: 0;
}
.connection-card dt {
  color: var(--theme--foreground-subdued, #687482);
}
.connection-card dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.connection-card dd small {
  display: block;
}
.health {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--theme--success-background, #dff5e5);
  color: var(--theme--success, #176c35);
  font-size: 11px;
  white-space: nowrap;
}
.health.delayed,
.health.attention,
.health.idle {
  background: var(--theme--warning-background, #fff2c2);
  color: var(--theme--warning, #7a5400);
}
.health.error,
.connection-error {
  background: var(--theme--danger-background, #ffe1e1);
  color: var(--theme--danger, #a31313);
}
.health.disabled {
  background: var(--theme--background-subdued, #eef1f4);
  color: var(--theme--foreground-subdued, #687482);
}
.connection-error,
.marketing,
.migration-note {
  margin: 16px 0 0;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
}
.marketing {
  background: var(--theme--background-subdued, #eef1f4);
}
.migration-note {
  background: var(--theme--warning-background, #fff7d7);
  color: var(--theme--warning, #7a5400);
  line-height: 1.45;
}
.table-wrap {
  overflow: auto;
}
.audience-sections {
  display: grid;
  gap: 24px;
}
.audience h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.audience .compact {
  margin: 0;
  border: 1px solid var(--border);
}
.audience .baseline {
  margin-top: 0;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 14px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 1200px) {
  .inbox {
    grid-template-columns: 230px minmax(320px, 1fr);
  }
  .details {
    grid-column: 1/-1;
    border-left: 0;
    border-top: 1px solid var(--border);
    max-height: 230px;
  }
  .inbox {
    height: auto;
  }
  .conversation {
    height: 650px;
  }
}
@media (max-width: 700px) {
  .workspace {
    padding: 0 12px 16px;
  }
  .inbox {
    display: block;
    min-height: 0;
  }
  .has-selection .queue {
    display: none;
  }
  .conversation {
    height: calc(100dvh - 210px);
    min-height: 420px;
  }
  .back {
    display: block;
  }
  .details {
    max-height: none;
  }
  .message {
    max-width: 100%;
  }
  .messages {
    padding: 12px;
  }
  .composer-actions small {
    flex-basis: 100%;
  }
  .queue {
    border: 0;
  }
  .selection-empty {
    display: none;
  }
}
</style>
