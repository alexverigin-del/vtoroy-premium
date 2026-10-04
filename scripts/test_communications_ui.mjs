import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { chromium } from "playwright";

// Renders the actual Vue module. API fixture tests interaction, not Directus permissions.
const root = resolve("work/communications-ui"),
  output = resolve("work/output/playwright");
await mkdir(root, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(
  resolve(root, "index.html"),
  '<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/main.js"></script></html>',
);
await writeFile(
  resolve(root, "sdk.js"),
  `export function useApi(){return {get:async(url,o={})=>{const r=await fetch(url+'?'+new URLSearchParams(o.params||{}));if(!r.ok)throw {response:{data:await r.json()}};return {data:o.responseType==='blob'?await r.blob():await r.json()};},post:async(url,body,o={})=>{const r=await fetch(url+'?'+new URLSearchParams(o.params||{}),{method:'POST',headers:o.headers||{'content-type':'application/json'},body:body instanceof Blob?body:JSON.stringify(body)});if(!r.ok)throw {response:{data:await r.json()}};return {data:await r.json()};}}}`,
);
await writeFile(
  resolve(root, "main.js"),
  `import {createApp,h} from 'vue';import Inbox from '/@fs/${resolve("infra/directus-beget/extensions-bundled/directus-extension-isvoi-inbox/src/inbox.vue").replaceAll("\\", "/")}';const app=createApp(Inbox);app.component('private-view',{props:['title'],setup:(props,{slots})=>()=>h('main',[h('h1',{style:'padding:24px'},props.title),slots.default?.()])});app.mount('#app');`,
);
const server = await createServer({
  root,
  configFile: false,
  plugins: [vue()],
  resolve: { alias: { "@directus/extensions-sdk": resolve(root, "sdk.js") } },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
});
await server.listen();
const address = server.httpServer.address();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const faults = [];
  page.on("pageerror", (e) => faults.push(e.message));
  const c = {
    id: "11111111-1111-4111-8111-111111111111",
    thread_id: "22222222-2222-4222-8222-222222222222",
    lead_id: "33333333-3333-4333-8333-333333333333",
    reference_code: "ISV-0101",
    platform: "telegram",
    external_user_id: "123",
    contact_id: "contact-1",
    identity_id: "identity-1",
    handling: "queued",
    unread_count: 1,
    version: 1,
    awaiting_since: new Date().toISOString(),
    first_response_due_at: new Date(Date.now() - 60_000).toISOString(),
    sla_state: "warning",
  };
  const history = [
    {
      id: "first",
      sequence: 1,
      direction: "in",
      text: "Здравствуйте! Помогите подобрать телефон.",
      occurred_at: new Date().toISOString(),
      attachments: [],
    },
  ];
  const receipts = new Map(),
    requests = [];
  const management = {
    connections: [
      {
        id: "telegram-core",
        name: "Telegram · Поддержка",
        platform: "telegram",
        enabled: true,
        mode: "production",
        marketing_enabled: false,
        settings: {
          welcome_text: "Добро пожаловать",
          welcome_file_id: "welcome-file",
          consent_text: "Согласие",
          consent_version: "pilot-v1",
          subscriptions_enabled: true,
          subscriptions_pilot_only: true,
          config_version: 1,
        },
      },
      {
        id: "max-test",
        name: "MAX · Поддержка",
        platform: "max",
        enabled: true,
        mode: "test",
        marketing_enabled: false,
        settings: { welcome_text: "MAX", config_version: 1 },
      },
    ],
    topics: [{ key: "news_promotions", label: "Новости и акции" }],
    test_recipients: [
      { id: "77777777-7777-4777-8777-777777777777", connection_id: "telegram-core", platform: "telegram", label: "Telegram · ••••0123" },
    ],
  };
  const campaigns = [];
  const contactCard = {
    contact: { id: "contact-1", name: "Иван", version: 1, marketing_opt_out: false },
    identities: [
      { id: "identity-1", platform: "telegram", external_user_id: "12345", availability: "allowed", preferred: true },
      { id: "identity-2", platform: "max", external_user_id: "67890", availability: "allowed", preferred: false },
    ],
    subscriptions: [], consent_events: [], conversations: [], deliveries: [], frequency_7d: 0,
  };
  const contactRequests = [];
  let dropContactAction = true;
  let dropReply = true;
  await page.route("**/isvoi-communications/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let data;
    if (path.endsWith("/inbox")) data = [c];
    else if (path.endsWith("/staff"))
      data = [
        {
          user_id: "44444444-4444-4444-8444-444444444444",
          store_id: "store",
          first_name: "Анна",
          last_name: "Менеджер",
        },
      ];
    else if (path.endsWith("/messages")) data = history;
    else if (path.endsWith("/link-options")) data = [{ id: "max-test", name: "MAX · Поддержка", platform: "max" }];
    else if (path.endsWith("/commands")) {
      const body = req.postDataJSON();
      requests.push(body);
      if (receipts.has(body.key)) data = receipts.get(body.key);
      else {
        if (body.type === "claim") c.handling = "agent";
        if (body.type === "handling") c.handling = body.payload.state;
        if (["reply", "note"].includes(body.type))
          history.push({
            id: body.key,
            sequence: history.length + 1,
            direction: body.type === "note" ? "internal" : "out",
            text: body.payload.text,
            occurred_at: new Date().toISOString(),
            attachments: [],
            delivery: body.type === "reply" ? { state: "accepted" } : null,
          });
        data = { ok: true, version: ++c.version };
        receipts.set(body.key, data);
        if (body.type === "reply" && dropReply) {
          dropReply = false;
          await route.abort("failed");
          return;
        }
      }
    } else if (path.endsWith("/attachments"))
      data = { id: "55555555-5555-4555-8555-555555555555", name: "note.txt", state: "quarantine" };
    else if (path.endsWith("/status"))
      data = { id: "55555555-5555-4555-8555-555555555555", name: "note.txt", state: "ready" };
    else if (path.endsWith("/audience/contacts/contact-1/actions")) {
      const body = req.postDataJSON();
      contactRequests.push(body);
      if (!receipts.has(body.key)) {
        if (body.action === "prefer") contactCard.identities.forEach(i => i.preferred = i.id === body.identity_id);
        if (body.action === "unlink") contactCard.identities = contactCard.identities.filter(i => i.id !== body.identity_id);
        if (body.action === "stop_marketing") contactCard.contact.marketing_opt_out = true;
        receipts.set(body.key, { ok: true, version: ++contactCard.contact.version });
        if (dropContactAction) { dropContactAction = false; await route.abort("failed"); return; }
      }
      data = receipts.get(body.key);
    } else if (path.endsWith("/audience/contacts/contact-1")) data = contactCard;
    else if (path.endsWith("/audience/contacts"))
      data = [{ id: "contact-1", name: "Иван", accounts: [{ platform: "telegram" }], subscribed: true, last_active_at: new Date().toISOString(), conversations: 1 }];
    else if (path.endsWith("/audience"))
      data = {
        connections: [
          {
            id: "test",
            name: "Telegram",
            users: 12,
            subscribers: 4,
            active_7: 5,
            active_30: 8,
            new_30: 2,
            blocked: 1,
            unknown: 3,
          },
        ],
        topics: [{ connection_id: "test", topic_key: "offers", subscribers: 4 }],
        daily: [
          { connection_id: "test", day: "2026-09-06", kind: "first_seen", events: 2 },
          { connection_id: "test", day: "2026-09-06", kind: "subscribed", events: 1 },
        ],
        baseline_at: "2026-09-01T09:00:00.000Z",
      };
    else if (path.endsWith("/management")) data = management;
    else if (path.includes("/management/connections/")) {
      const connection = management.connections.find((item) => path.endsWith(item.id));
      Object.assign(connection.settings, req.postDataJSON(), { config_version: connection.settings.config_version + 1 });
      data = { ok: true, settings: connection.settings };
    } else if (path.endsWith("/campaigns") && req.method() === "GET") data = campaigns;
    else if (path.endsWith("/campaigns") && req.method() === "POST") {
      const body = req.postDataJSON();
      const campaign = { id: crypto.randomUUID(), name: body.name, topic_key: body.topic_key, state: "draft", is_test: body.is_test, targets: body.connection_ids.map((id) => ({ connection_id: id, platform: management.connections.find((item) => item.id === id).platform })), variants: body.variants, results: [] };
      campaigns.unshift(campaign);
      data = { ok: true, id: campaign.id, version: 1 };
    } else if (path.includes("/campaigns/") && path.endsWith("/actions")) {
      const campaign = campaigns.find((item) => path.includes(item.id));
      const action = req.postDataJSON().action;
      if (action === "review") campaign.state = "review";
      if (action === "approve") campaign.state = "sending";
      if (action === "cancel") campaign.state = "cancelled";
      data = { ok: true, action };
    } else if (path.endsWith("/connections"))
      data = {
        checked_at: "2026-09-13T18:00:00.000Z",
        runtime: { active: true, sending_enabled: true, recovery_hold: false },
        connections: [
          {
            id: "legacy-telegram-8694946838",
            name: "Telegram · I СВОИ · Поддержка",
            platform: "telegram",
            enabled: true,
            mode: "production",
            bot_username: "isvoi_help_bot",
            marketing_enabled: true,
            marketing_mode: "pilot",
            health: "ok",
            source: "legacy_telegram",
            migration_state: "awaiting_cutover",
            last_received_at: "2026-09-13T17:57:00.000Z",
            last_sent_at: "2026-09-13T17:59:00.000Z",
            open_conversations: 1,
            accounts: 1,
            test_accounts: null,
            inbound_pending: null,
            inbound_failed_24: 0,
            outbox_pending: 0,
            oldest_inbound_at: null,
            oldest_outbox_at: null,
            uncertain: 0,
            delivery_failed_24: 0,
            delivery_partial_24: 0,
            error_code: null,
          },
          {
            id: "max-test",
            name: "MAX · Поддержка",
            platform: "max",
            enabled: true,
            mode: "test",
            bot_username: "isvoi_support_bot",
            marketing_enabled: false,
            health: "ok",
            last_received_at: "2026-09-13T17:58:00.000Z",
            last_sent_at: "2026-09-13T17:59:00.000Z",
            open_conversations: 1,
            accounts: 1,
            test_accounts: 1,
            inbound_pending: 0,
            inbound_failed_24: 0,
            outbox_pending: 0,
            oldest_inbound_at: null,
            oldest_outbox_at: null,
            uncertain: 0,
            delivery_failed_24: 2,
            delivery_partial_24: 0,
            error_code: null,
          },
        ],
      };
    else throw Error(`Unexpected fixture route ${path}`);
    await route.fulfill({ json: { data } });
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.waitForTimeout(1500);
  await page.getByText("1 новое", { exact: true }).waitFor();
  await page.getByText("Срок первого ответа истёк", { exact: true }).first().waitFor();
  console.log((await page.locator("body").innerText()).slice(0, 2000));
  console.log("browser faults", faults);
  await page.getByRole("button", { name: /ISV-0101/ }).click();
  await page.getByRole("button", { name: "Принять в работу", exact: true }).click();
  await page.getByLabel("Площадка для связи").selectOption("max-test");
  await page.getByRole("button", { name: "Отправить приглашение", exact: true }).click();
  await page.getByText(/Приглашение отправлено в текущий бот/).waitFor();
  assert.equal(requests.filter(r => r.type === "link_start").length, 1);
  assert.equal(requests.find(r => r.type === "link_start").payload.target_connection_id, "max-test");
  await page.getByLabel("Текст сообщения").fill("Да, поможем. Какой бюджет?");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await page.getByRole("alert").waitFor();
  // Poll changes the server version before the retry. The original request must remain identical.
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await page.getByText("Принято площадкой", { exact: true }).waitFor();
  const replies = requests.filter((r) => r.type === "reply");
  assert.equal(replies.length, 2);
  assert.deepEqual(replies[0], replies[1]);
  assert.equal(history.filter((m) => m.direction === "out").length, 1);
  await page.getByLabel("Внутренняя заметка", { exact: true }).check();
  await page.getByLabel("Текст сообщения").fill("Клиент предпочитает компактный корпус.");
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  await page.getByText("Клиент предпочитает компактный корпус.", { exact: true }).waitFor();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("Проверка") });
  await page.getByText("note.txt — Готово", { exact: false }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: resolve(output, "communications-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Аудитория", exact: true }).click();
  await page.getByRole("heading", { name: "Подписчики по темам" }).waitFor();
  await page.getByRole("cell", { name: "offers", exact: true }).waitFor();
  await page.getByText("Новые аккаунты", { exact: true }).waitFor();
  await page.getByText(/Начальный снимок:/).waitFor();
  await page.getByRole("heading", { name: "Контакты аудитории" }).waitFor();
  await page.getByRole("button", { name: "Иван", exact: true }).click();
  await page.getByRole("heading", { name: "Иван", exact: true }).waitFor();
  await page.getByText("Лимит маркетинга за 7 дней: 0 из 2", { exact: true }).waitFor();
  const prefer = page.getByRole("button", { name: "Выбрать предпочтительной", exact: true }).last();
  await prefer.click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Иван", exact: true }).click();
  await page.getByRole("button", { name: "Повторить незавершённое действие", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.subscriber-card dl')[1]?.querySelector('button')?.disabled);
  assert.equal(contactRequests.length, 2);
  assert.deepEqual(contactRequests[0], contactRequests[1], "contact retry preserves key and version after response loss");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Отвязать аккаунт MAX", exact: true }).click();
  await page.getByRole("button", { name: "Отвязать аккаунт MAX", exact: true }).waitFor({ state: "hidden" });
  assert.equal(contactCard.identities.length, 1);
  await page.screenshot({ path: resolve(output, "communications-audience.png"), fullPage: true });
  await page.getByRole("button", { name: "Подключения", exact: true }).click();
  await page.getByRole("heading", { name: "Подключения площадок" }).waitFor();
  await page.getByText("MAX · Поддержка", { exact: true }).waitFor();
  await page.getByText("Telegram · I СВОИ · Поддержка", { exact: true }).waitFor();
  await page.getByText("Работает отдельно", { exact: true }).waitFor();
  await page.getByText(/Перенос в общее ядро ещё не выполнен/).waitFor();
  await page.getByText("Персональный маркетинг: закрытый пилот", { exact: true }).waitFor();
  await page.getByText("Работает", { exact: true }).waitFor();
  await page.getByText("Персональный маркетинг: выключен", { exact: true }).waitFor();
  await page.screenshot({
    path: resolve(output, "communications-connections.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Настройки ботов", exact: true }).click();
  await page.getByRole("heading", { name: "Настройки ботов", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Приветствие", { exact: true }).inputValue(), "Добро пожаловать");
  await page.getByRole("button", { name: "Кампании", exact: true }).click();
  await page.getByRole("heading", { name: "Омниканальные кампании" }).waitFor();
  await page.getByLabel("Название").fill("Тестовая новость");
  await page.getByText("Telegram · Поддержка · маркетинг выключен", { exact: true }).click();
  await page.getByPlaceholder("Текст сообщения").fill("Новость для Telegram");
  await page.getByRole("button", { name: "Создать черновик", exact: true }).click();
  await page.getByRole("heading", { name: "Тестовая новость", exact: true }).waitFor();
  await page.getByRole("button", { name: "Обращения", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, "communications-mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "mobile horizontal overflow",
  );
  await page.getByRole("button", { name: "Открыть карточку клиента", exact: true }).click();
  await page.getByRole("heading", { name: "Иван", exact: true }).waitFor();
  await page.getByRole("button", { name: "Отключить все рассылки", exact: true }).click();
  await page.getByText("Все персональные рассылки отключены", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Обращения", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "← Очередь", exact: true }).isVisible(),
    true,
  );
  assert.deepEqual(faults, []);
  console.log(
    "PASS UI: actual Vue module, claim/reply/note/upload, invitation, contact action retry key after response loss, preferred channel, unlink, global refusal, audience, desktop and mobile layout.",
  );
} finally {
  await browser.close();
  await server.close();
}
