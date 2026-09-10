import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const root = resolve(import.meta.dirname, ".."),
  baseUrl = "http://127.0.0.1:8056",
  password = "local-isvoi-fixture-password",
  botId = "8908725708",
  connection = "55555555-5555-4555-8555-555555555555",
  workerId = randomUUID(),
  docker = (() => {
    if (process.env.DOCKER_CLI_PATH) return process.env.DOCKER_CLI_PATH;
    if (process.platform !== "win32") return "docker";
    const candidate = resolve(
      process.env.ProgramFiles || "C:\\Program Files",
      "Docker",
      "Docker",
      "resources",
      "bin",
      "docker.exe",
    );
    return existsSync(candidate) ? candidate : "docker";
  })();

async function call(path, { token, json, method = "GET" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { response, result: await response.json() };
}

async function login(email) {
  const { response, result } = await call("/auth/login", {
    method: "POST",
    json: { email, password, mode: "json" },
  });
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.data.access_token;
}

function psql(sql) {
  const result = spawnSync(
    docker,
    [
      "compose",
      "-f",
      resolve(root, "infra/communications/docker-compose.test.yml"),
      "exec",
      "-T",
      "database",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "communications_test",
    ],
    { cwd: root, input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) throw Error(result.stderr || "PSQL_FAILED");
}

psql(
  `UPDATE comm_runtime SET sending_enabled=false,recovery_hold=true WHERE id=1;
   UPDATE comm_connections SET poll_owner=NULL,poll_until=NULL WHERE id='${connection}';
   DELETE FROM comm_connections WHERE id IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
   INSERT INTO comm_connections(id,platform,external_id,name,enabled,mode,store_id,worker_user_id,service_user_id,secret_ref,bot_username)
   VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','max','max-fixture','MAX local fixture',true,'test','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','MAX_FIXTURE','isvoi_max_bot'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','vk','vk-fixture','VK local fixture',true,'test','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','VK_FIXTURE','isvoi_vk');`,
);

const worker = await login("worker@example.com"),
  intake = await login("intake@example.com"),
  manager = await login("manager@example.com"),
  identity = { bot_id: botId, worker_id: workerId };

let request = await call("/isvoi-telegram/session", { method: "POST", json: identity });
assert.equal(request.response.status, 403, "legacy worker endpoints must reject public access");

request = await call("/isvoi-telegram/session", {
  method: "POST",
  token: worker,
  json: identity,
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));
assert.equal(request.result.data.mode, "test");
assert.equal(request.result.data.conversations, true);

request = await call("/isvoi-telegram/intake-check", {
  method: "POST",
  token: intake,
  json: {},
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));

request = await call("/isvoi-telegram/intake", {
  method: "POST",
  token: intake,
  json: {
    kind: "selection",
    status: "new",
    contact: "legacy compatibility fixture",
    contact_channel: "telegram",
    message: "Проверка совместимого intake",
    source: "local-test",
    source_path: "/compatibility",
    store_location_id: "11111111-1111-4111-8111-111111111111",
    is_test: true,
    reference_code: `COMPAT-${Date.now()}`,
  },
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const leadId = request.result.data.id,
  token = new URL(request.result.data.telegram_url).searchParams.get("start");
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
assert.deepEqual(request.result.data.continuation_links, [
  {
    platform: "telegram",
    label: "Telegram local fixture",
    url: request.result.data.telegram_url,
  },
  {
    platform: "max",
    label: "MAX local fixture",
    url: `https://max.ru/isvoi_max_bot?start=${token}`,
  },
  {
    platform: "vk",
    label: "VK local fixture",
    url: `https://vk.me/isvoi_vk?ref=${token}&ref_source=site`,
  },
]);

let updateId = Number(String(Date.now()).slice(-9));
const privateUpdate = (text, user = 900002) => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    from: { id: user, is_bot: false, first_name: "Compatibility" },
    chat: { id: user, type: "private" },
    text,
  },
});
const linked = privateUpdate(`/start ${token}`);
for (let replay = 0; replay < 2; replay++) {
  request = await call("/isvoi-telegram/update", {
    method: "POST",
    token: worker,
    json: { ...identity, update: linked },
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  assert.equal(request.result.data.result, "linked");
}

const message = privateUpdate("Сообщение через старый endpoint");
for (let replay = 0; replay < 2; replay++) {
  request = await call("/isvoi-telegram/update", {
    method: "POST",
    token: worker,
    json: { ...identity, update: message },
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  assert.equal(request.result.data.result, "received");
}

request = await call("/isvoi-communications/v1/inbox", { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const conversationRow = request.result.data.find((row) => row.lead_id === leadId);
assert.ok(conversationRow, "legacy intake link must resolve to the same core lead");
request = await call(
  `/isvoi-communications/v1/threads/${conversationRow.thread_id}/messages?conversation_id=${conversationRow.id}`,
  { token: manager },
);
assert.equal(request.response.status, 200, JSON.stringify(request.result));
assert.equal(
  request.result.data.filter((row) => row.external_id === String(message.message.message_id))
    .length,
  1,
  "a repeated legacy update must not duplicate the core message",
);

try {
  psql("UPDATE comm_runtime SET sending_enabled=true,recovery_hold=false WHERE id=1;");
  request = await call("/isvoi-telegram/next", {
    method: "POST",
    token: worker,
    json: identity,
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  const job = request.result.data.job;
  assert.ok(job, "legacy next must lease a compatible core text/topic operation");
  assert.ok(["sendMessage", "createForumTopic"].includes(job.method));
  request = await call("/isvoi-telegram/complete", {
    method: "POST",
    token: worker,
    json: {
      ...identity,
      id: job.id,
      operation_id: job.operation_id,
      ...(job.channel ? { channel: job.channel } : {}),
      outcome: {
        type: "ok",
        ...(job.method === "createForumTopic" ? { topic_id: 700001 } : { message_id: 700001 }),
      },
    },
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  assert.equal(request.result.data.ok, true);
} finally {
  psql(
    `UPDATE comm_runtime SET sending_enabled=false,recovery_hold=true WHERE id=1;
     UPDATE comm_connections SET poll_owner=NULL,poll_until=NULL WHERE id='${connection}';
     DELETE FROM comm_connections WHERE id IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');`,
  );
}

console.log(
  "PASS: legacy API uses core receipts, one-token Telegram/MAX/VK continuation links, leases and delivery operations.",
);
