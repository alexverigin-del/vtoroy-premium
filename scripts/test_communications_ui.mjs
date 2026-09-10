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
  await page.getByText("offers", { exact: true }).waitFor();
  await page.getByText("Новые аккаунты", { exact: true }).waitFor();
  await page.getByText(/Начальный снимок:/).waitFor();
  await page.screenshot({ path: resolve(output, "communications-audience.png"), fullPage: true });
  await page.getByRole("button", { name: "Обращения", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, "communications-mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "mobile horizontal overflow",
  );
  assert.equal(
    await page.getByRole("button", { name: "← Очередь", exact: true }).isVisible(),
    true,
  );
  assert.deepEqual(faults, []);
  console.log(
    "PASS UI: actual Vue module, claim/reply/note/upload, retry key after network failure, audience topics/daily baseline, desktop and mobile layout.",
  );
} finally {
  await browser.close();
  await server.close();
}
