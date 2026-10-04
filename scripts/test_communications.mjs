import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { testDatabase } from "./lib/communications-test-db.mjs";
import {
  createService,
  keyboard,
  createDelivery,
  createStaff,
  normalize,
  classify,
  marketingWindow,
  verifySecret,
  inspectFile,
  readBounded,
  sendOperation,
  telegramJSONRequest,
  publicIPv4,
  validateMediaURL,
  validateProviderUploadURL,
  mediaRoute,
  serviceDeadlines,
  defaultServiceLevel,
  createAttachmentStorage,
  StorageObjectMissingError,
  StorageUnavailableError,
} from "../packages/communications/dist/index.js";

async function streamBytes(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("attachment storage keeps legacy local objects readable and supports ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "isvoi-storage-"));
  const storage = createAttachmentStorage({
    ISVOI_COMMUNICATIONS_STORAGE_DRIVER: "local",
    ISVOI_COMMUNICATIONS_PRIVATE_DIR: root,
  });
  const key = randomUUID();
  const source = Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz");
  try {
    assert.deepEqual(await storage.put(key, source, "text/plain"), {
      driver: "local",
      version: null,
      etag: null,
    });
    assert.deepEqual(
      await storage.getBuffer({ storage_driver: "local", storage_key: key }),
      source,
    );
    assert.equal(
      (await streamBytes(await storage.getStream({ storage_key: key }, 10, 19))).toString(),
      "abcdefghij",
    );
    await storage.remove({ storage_driver: "local", storage_key: key });
    await assert.rejects(
      storage.getStream({ storage_driver: "local", storage_key: key }),
      StorageObjectMissingError,
    );
    await storage.remove({ storage_driver: "local", storage_key: key });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("attachment storage rejects unknown drivers instead of silently writing locally", () => {
  assert.throws(
    () => createAttachmentStorage({ ISVOI_COMMUNICATIONS_STORAGE_DRIVER: "typo" }),
    StorageUnavailableError,
  );
});

test("empty menus do not create invalid keyboard payloads", () => {
  assert.deepEqual(keyboard("telegram", []), {});
  assert.deepEqual(keyboard("max", []), {});
  assert.deepEqual(keyboard("vk", []), {});
});

test("SLA deadlines count only configured working time", () => {
  assert.deepEqual(serviceDeadlines("2026-09-07T07:05:00.000Z", defaultServiceLevel), {
    firstResponseDueAt: new Date("2026-09-07T07:15:00.000Z"),
    escalationDueAt: new Date("2026-09-07T07:20:00.000Z"),
  });
  const weekdayLevel = { ...defaultServiceLevel, working_days: [1, 2, 3, 4, 5] };
  assert.deepEqual(serviceDeadlines("2026-09-11T16:55:00.000Z", weekdayLevel), {
    firstResponseDueAt: new Date("2026-09-14T07:05:00.000Z"),
    escalationDueAt: new Date("2026-09-14T07:10:00.000Z"),
  });
  assert.equal(
    serviceDeadlines(
      "2026-09-07T07:05:30.000Z",
      defaultServiceLevel,
    ).firstResponseDueAt.toISOString(),
    "2026-09-07T07:15:30.000Z",
  );
  assert.throws(
    () => serviceDeadlines(new Date(), { ...defaultServiceLevel, workday_end: "09:00" }),
    /INVALID_SERVICE_LEVEL_SCHEDULE/,
  );
});

test("Telegram Opus voice is sent as voice instead of a generic document", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await sendOperation(
      "telegram",
      "123456:TEST_ONLY_abcdefghijklmnopqrstuvwxyz",
      { method: "attachment", payload: { peer_id: "900001" } },
      {
        bytes: Buffer.from("voice"),
        mime: "audio/ogg; codecs=opus",
        kind: "voice",
        name: "voice.opus",
      },
    );
    assert.equal(requested.endsWith("/sendVoice"), true);
    assert.deepEqual(result, { type: "accepted", externalId: "77" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram JSON transport pins IPv4, bounds the request, and preserves the provider receipt", async () => {
  let options;
  let sentBody;
  const fakeRequest = (value, onResponse) => {
    options = value;
    const req = new EventEmitter();
    req.end = (body) => {
      sentBody = body;
      const response = new EventEmitter();
      response.statusCode = 200;
      queueMicrotask(() => {
        onResponse(response);
        response.emit("data", Buffer.from('{"ok":true,"result":{"message_id":77}}'));
        response.emit("end");
        req.emit("close");
      });
    };
    req.destroy = (error) => req.emit("error", error);
    return req;
  };
  const result = await telegramJSONRequest("TEST_TOKEN", "sendMessage", {
    chat_id: "-1001234567890",
    text: "Проверка",
  }, fakeRequest);
  assert.equal(options.hostname, "api.telegram.org");
  assert.equal(options.family, 4);
  assert.equal(options.method, "POST");
  assert.equal(options.headers["content-length"], Buffer.byteLength(sentBody));
  assert.deepEqual(result, { status: 200, data: { ok: true, result: { message_id: 77 } } });
});

test("MAX addresses private messages by user_id and group messages by chat_id", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ message: { body: { mid: `max-${calls.length}` } } });
  };
  try {
    assert.deepEqual(
      await sendOperation("max", "MAX_TEST_TOKEN", {
        id: "op-max-private",
        method: "text",
        payload: { user_id: "227941682", text: "Личный ответ" },
      }),
      { type: "accepted", externalId: "max-1" },
    );
    assert.equal(calls[0].url, "https://platform-api2.max.ru/messages?user_id=227941682");
    assert.deepEqual(JSON.parse(calls[0].init.body), { text: "Личный ответ" });

    assert.deepEqual(
      await sendOperation("max", "MAX_TEST_TOKEN", {
        id: "op-max-group",
        method: "text",
        payload: { chat_id: "-900001", text: "Ответ в чат" },
      }),
      { type: "accepted", externalId: "max-2" },
    );
    assert.equal(calls[1].url, "https://platform-api2.max.ru/messages?chat_id=-900001");
    assert.deepEqual(JSON.parse(calls[1].init.body), { text: "Ответ в чат" });

    assert.deepEqual(
      await sendOperation("max", "MAX_TEST_TOKEN", {
        id: "op-max-ambiguous",
        method: "text",
        payload: { user_id: "1", chat_id: "2", text: "Не отправлять" },
      }),
      { type: "rejected", code: "INVALID_MAX_RECIPIENT" },
    );
    assert.equal(calls.length, 2, "ambiguous recipient is rejected before the provider call");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MAX media uses a provider upload slot and sends only its token", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1)
      return Response.json({ url: "https://iu.oneme.ru/upload.do?fixture=1" });
    if (calls.length === 2) return Response.json({ token: "max-upload-token" });
    return Response.json({ message: { body: { mid: "max-message-7" } } });
  };
  try {
    const result = await sendOperation(
      "max",
      "MAX_TEST_TOKEN",
      { id: "op-max-1", method: "attachment", payload: { user_id: "900001" } },
      {
        bytes: Buffer.from("image"),
        mime: "image/jpeg",
        kind: "image",
        name: "photo.jpg",
      },
    );
    assert.deepEqual(result, { type: "accepted", externalId: "max-message-7" });
    assert.equal(calls[0].url, "https://platform-api2.max.ru/uploads?type=image");
    assert.equal(calls[1].url, "https://iu.oneme.ru/upload.do?fixture=1");
    assert.equal(
      calls[1].init.headers?.Authorization,
      undefined,
      "bot token is not sent to upload host",
    );
    assert.equal(calls[2].url, "https://platform-api2.max.ru/messages?user_id=900001");
    assert.deepEqual(JSON.parse(calls[2].init.body), {
      attachments: [{ type: "image", payload: { token: "max-upload-token" } }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MAX attachment-not-ready retry reuses the prepared media token", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1)
      return Response.json({ url: "https://omu.okcdn.ru/upload?fixture=retry" });
    if (calls.length === 2) return Response.json({ retval: 1, token: "prepared-audio-token" });
    return Response.json(
      { code: "attachment.not.ready", message: "file not processed" },
      { status: 400 },
    );
  };
  try {
    const op = {
      id: "op-max-retry",
      method: "attachment",
      payload: { user_id: "700" },
    };
    const file = {
      bytes: Buffer.from("audio"),
      mime: "audio/mpeg",
      kind: "audio",
      name: "answer.mp3",
    };
    const first = await sendOperation("max", "MAX_TEST_TOKEN", op, file);
    assert.deepEqual(first, {
      type: "retryable",
      code: "ATTACHMENT_NOT_READY",
      resume: {
        platform: "max",
        attachment: { type: "audio", payload: { token: "prepared-audio-token" } },
      },
    });

    calls.length = 0;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ message: { body: { mid: "max-ready" } } });
    };
    const second = await sendOperation(
      "max",
      "MAX_TEST_TOKEN",
      { ...op, payload: { ...op.payload, provider_attachment: first.resume.attachment } },
      file,
    );
    assert.deepEqual(second, { type: "accepted", externalId: "max-ready" });
    assert.equal(calls.length, 1, "retry does not request another upload slot");
    assert.equal(calls[0].url, "https://platform-api2.max.ru/messages?user_id=700");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("VK photo upload is saved and sent with a stable operation random_id", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1)
      return Response.json({ response: { upload_url: "https://pu.vk.com/upload?fixture=1" } });
    if (calls.length === 2)
      return Response.json({ server: 11, photo: "photo-json", hash: "photo-hash" });
    if (calls.length === 3)
      return Response.json({ response: [{ owner_id: -42, id: 77, access_key: "access" }] });
    return Response.json({ response: 901 });
  };
  try {
    const op = {
      id: "9b1175b7-5a3e-4e1f-973a-2f893fd690dd",
      method: "attachment",
      payload: { peer_id: "12345" },
    };
    const file = {
      bytes: Buffer.from("image"),
      mime: "image/png",
      kind: "image",
      name: "client-photo.png",
    };
    const first = await sendOperation("vk", "VK_TEST_TOKEN", op, file);
    const firstSend = new URLSearchParams(calls[3].init.body);
    assert.deepEqual(first, { type: "accepted", externalId: "901" });
    assert.equal(calls[0].url, "https://api.vk.ru/method/photos.getMessagesUploadServer");
    assert.equal(calls[1].url, "https://pu.vk.com/upload?fixture=1");
    assert.equal(calls[2].url, "https://api.vk.ru/method/photos.saveMessagesPhoto");
    assert.equal(calls[3].url, "https://api.vk.ru/method/messages.send");
    assert.equal(firstSend.get("attachment"), "photo-42_77_access");
    assert.equal(firstSend.get("peer_id"), "12345");
    assert.match(firstSend.get("random_id"), /^[1-9][0-9]*$/);

    calls.length = 0;
    await sendOperation("vk", "VK_TEST_TOKEN", op, file);
    assert.equal(
      new URLSearchParams(calls[3].init.body).get("random_id"),
      firstSend.get("random_id"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("VK voice uses audio_message while video remains deliverable as a document", async () => {
  const originalFetch = globalThis.fetch;
  const run = async (kind, mime, savedField) => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1)
        return Response.json({ response: { upload_url: "https://psv4.userapi.com/upload" } });
      if (calls.length === 2) return Response.json({ file: "vk-file-token" });
      if (calls.length === 3)
        return Response.json({
          response: { [savedField]: { owner_id: -8, id: 19, access_key: "key" } },
        });
      return Response.json({ response: 902 });
    };
    const outcome = await sendOperation(
      "vk",
      "VK_TEST_TOKEN",
      { id: `op-${kind}`, method: "attachment", payload: { peer_id: "321" } },
      { bytes: Buffer.from(kind), mime, kind, name: `${kind}.bin` },
    );
    return { calls, outcome };
  };
  try {
    const voice = await run("voice", "audio/ogg; codecs=opus", "audio_message");
    assert.deepEqual(voice.outcome, { type: "accepted", externalId: "902" });
    assert.equal(new URLSearchParams(voice.calls[0].init.body).get("type"), "audio_message");
    assert.equal(new URLSearchParams(voice.calls[3].init.body).get("attachment"), "doc-8_19_key");

    const video = await run("video", "video/mp4", "doc");
    assert.deepEqual(video.outcome, { type: "accepted", externalId: "902" });
    assert.equal(new URLSearchParams(video.calls[0].init.body).get("type"), "doc");
    assert.equal(new URLSearchParams(video.calls[3].init.body).get("attachment"), "doc-8_19_key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("media preparation failures are retryable before the final send", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fixture network failure");
  };
  try {
    assert.deepEqual(
      await sendOperation(
        "max",
        "MAX_TEST_TOKEN",
        { id: "op-safe-retry", method: "attachment", payload: { user_id: "44" } },
        {
          bytes: Buffer.from("doc"),
          mime: "application/pdf",
          kind: "document",
          name: "document.pdf",
        },
      ),
      { type: "retryable", code: "MEDIA_PREPARATION_FAILED" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider media routes cover every accepted attachment kind", () => {
  const byKind = (kind, mime) => ({ kind, mime });
  assert.deepEqual(
    [
      mediaRoute("max", byKind("image", "image/webp")),
      mediaRoute("max", byKind("voice", "audio/ogg")),
      mediaRoute("max", byKind("audio", "audio/mpeg")),
      mediaRoute("max", byKind("video", "video/mp4")),
      mediaRoute("max", byKind("document", "application/pdf")),
    ],
    ["image", "audio", "audio", "video", "file"],
  );
  assert.deepEqual(
    [
      mediaRoute("vk", byKind("image", "image/jpeg")),
      mediaRoute("vk", byKind("voice", "audio/ogg; codecs=opus")),
      mediaRoute("vk", byKind("audio", "audio/mpeg")),
      mediaRoute("vk", byKind("video", "video/mp4")),
      mediaRoute("vk", byKind("document", "application/pdf")),
    ],
    ["photo", "audio_message", "doc", "doc", "doc"],
  );
  assert.equal(
    validateProviderUploadURL("max", "https://omu.okcdn.ru/upload", "audio").hostname,
    "omu.okcdn.ru",
  );
  assert.equal(validateProviderUploadURL("vk", "https://pu.vk.com/upload").hostname, "pu.vk.com");
  assert.throws(
    () => validateProviderUploadURL("max", "https://iu.oneme.ru.evil.example/upload", "image"),
    /MEDIA_UPLOAD_URL_FORBIDDEN/,
  );
  assert.throws(
    () => validateProviderUploadURL("vk", "https://userapi.com.evil.example/upload"),
    /MEDIA_UPLOAD_URL_FORBIDDEN/,
  );
});

test("delivery error classification never treats missing rights as customer opt-out", () => {
  assert.equal(
    classify("telegram", 403, { description: "Forbidden: bot was blocked by the user" }).type,
    "blocked",
  );
  assert.equal(
    classify("telegram", 403, { description: "not enough rights" }).type,
    "connection_error",
  );
  assert.equal(classify("telegram", 503, {}).type, "unknown");
  assert.equal(classify("vk", 200, { error: { error_code: 901 } }).type, "blocked");
  assert.deepEqual(classify("max", 400, { code: "attachment.not.ready" }), {
    type: "retryable",
    code: "ATTACHMENT_NOT_READY",
  });
  assert.equal(marketingWindow(new Date("2026-09-06T06:59:59Z")).allowed, false);
  assert.equal(marketingWindow(new Date("2026-09-06T07:00:00Z")).allowed, true);
  assert.equal(marketingWindow(new Date("2026-09-06T17:00:00Z")).allowed, false);
  assert.equal(verifySecret("a".repeat(32), "a".repeat(32)), true);
  assert.equal(verifySecret("a", "a"), false);
});
test("normalizes private messages, media and availability; rejects group ingress", () => {
  const message = {
    message_id: 2,
    date: 1700000000,
    from: { id: 123 },
    chat: { id: 123, type: "private" },
    voice: { file_id: "voice1", file_size: 19, mime_type: "audio/ogg" },
  };
  assert.equal(normalize("telegram", { update_id: 1, message }).attachments[0].kind, "voice");
  assert.equal(
    normalize("telegram", { update_id: 2, edited_message: { ...message, text: "updated" } }).kind,
    "edited",
  );
  assert.throws(() =>
    normalize("telegram", {
      update_id: 3,
      message: { ...message, chat: { id: -10, type: "group" } },
    }),
  );
  assert.equal(
    normalize("telegram", {
      update_id: 4,
      message: { ...message, chat: { id: -10, type: "supergroup" } },
    }).kind,
    "staff",
  );
  const token = "a".repeat(43);
  assert.equal(
    normalize("max", {
      update_type: "bot_started",
      timestamp: 1700000000000,
      chat_id: 123,
      user: { user_id: 123 },
      payload: token,
    }).text,
    `/start ${token}`,
  );
  assert.equal(
    normalize("vk", {
      type: "message_new",
      event_id: "vk-ref-1",
      object: { message: { from_id: 123, peer_id: 123, date: 1700000000, ref: token } },
    }).text,
    `/start ${token}`,
  );
});
test("file validation accepts only safe-media inputs and bounds streamed bytes", async () => {
  const opus = Buffer.concat([
    Buffer.from("OggS"),
    Buffer.from([0, 2]),
    Buffer.alloc(20),
    Buffer.from([1, 19]),
    Buffer.from("OpusHead"),
    Buffer.from([1, 1]),
    Buffer.from([0x80, 0xbb, 0, 0]),
    Buffer.alloc(9),
  ]);
  assert.deepEqual(await inspectFile(opus, "audio/ogg"), {
    mime: "audio/ogg; codecs=opus",
    kind: "audio",
    extension: "opus",
  });
  await assert.rejects(
    inspectFile(Buffer.from("Тестовый документ"), "text/plain"),
    /FILE_FORMAT_NOT_ALLOWED/,
  );
  await assert.rejects(
    inspectFile(Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"), "image/jpeg"),
    /FILE_FORMAT_NOT_ALLOWED/,
  );
  await assert.rejects(
    readBounded(
      (async function* () {
        yield Buffer.alloc(10_000_001);
        yield Buffer.alloc(10_000_000);
      })(),
    ),
    /FILE_TOO_LARGE/,
  );
  await assert.rejects(
    readBounded(
      (async function* () {
        yield Buffer.from("a");
      })(),
      2,
    ),
    /FILE_SIZE_MISMATCH/,
  );
});
test("private media transport pins exact hosts and rejects internal and reserved addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4("8.8.8.8"), true);
  for (const url of [
    "http://api.telegram.org/file",
    "https://api.telegram.org.evil.test/file",
    "https://api.telegram.org@evil.test/file",
    "https://127.0.0.1/file",
    "https://api.telegram.org:8443/file",
  ])
    assert.throws(() => validateMediaURL(url, ["api.telegram.org"]));
  assert.equal(
    validateMediaURL("https://api.telegram.org/file", ["api.telegram.org"]).hostname,
    "api.telegram.org",
  );
});
test("connections reports a live legacy Telegram contour without creating a core duplicate", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db, pg } = fixture;
  const store = randomUUID(),
    role = randomUUID(),
    manager = randomUUID(),
    worker = randomUUID(),
    route = randomUUID(),
    legacyConversation = randomUUID();
  await db("store_locations").insert({ id: store });
  await db("directus_roles").insert({ id: role });
  await db("directus_users").insert([
    { id: manager, role, status: "active" },
    { id: worker, role: null, status: "active" },
  ]);
  await db("comm_staff").insert({ user_id: manager, store_id: store, can_manage: true });
  await pg.exec(`
    CREATE TABLE telegram_routes(id uuid PRIMARY KEY,store_id uuid,bot_id bigint,enabled boolean);
    CREATE TABLE telegram_bot_settings(bot_id bigint PRIMARY KEY,public_username text,notifications_enabled boolean,pilot_mode boolean);
    CREATE TABLE telegram_runtime(bot_id bigint PRIMARY KEY,lease_until timestamptz,send_after timestamptz);
    CREATE TABLE telegram_client_sessions(id uuid PRIMARY KEY,bot_id bigint);
    CREATE TABLE lead_conversations(id uuid PRIMARY KEY,route_id uuid,closed_at timestamptz);
    CREATE TABLE lead_messages(id uuid PRIMARY KEY,conversation_id uuid,direction text,created_at timestamptz);
    CREATE TABLE telegram_message_outbox(id uuid PRIMARY KEY,bot_id bigint,state text,created_at timestamptz,sent_at timestamptz);
    CREATE TABLE telegram_deliveries(id uuid PRIMARY KEY,route_id uuid,state text,created_at timestamptz,sent_at timestamptz);
  `);
  await db("telegram_routes").insert({
    id: route,
    store_id: store,
    bot_id: "8694946838",
    enabled: true,
  });
  await db("telegram_bot_settings").insert({
    bot_id: "8694946838",
    public_username: "isvoi_help_bot",
    notifications_enabled: true,
    pilot_mode: true,
  });
  await db("telegram_runtime").insert({
    bot_id: "8694946838",
    lease_until: new Date(Date.now() + 60_000),
    send_after: new Date(),
  });
  await db("telegram_client_sessions").insert({ id: randomUUID(), bot_id: "8694946838" });
  await db("lead_conversations").insert({ id: legacyConversation, route_id: route });
  await db("lead_messages").insert({
    id: randomUUID(),
    conversation_id: legacyConversation,
    direction: "in",
    created_at: new Date(),
  });
  await db("telegram_message_outbox").insert({
    id: randomUUID(),
    bot_id: "8694946838",
    state: "pending",
    created_at: new Date(),
  });
  class ItemsService {}
  const context = {
    database: db,
    services: { ItemsService },
    getSchema: async () => ({}),
    env: {
      ISVOI_COMMUNICATIONS_ENABLED: true,
      ISVOI_TELEGRAM_ENABLED: true,
      ISVOI_TELEGRAM_BOT_ID: "8694946838",
      ISVOI_TELEGRAM_BOT_USERNAME: "isvoi_help_bot",
      ISVOI_TELEGRAM_MODE: "production",
    },
  };
  const service = createService(context),
    actor = await service.actor(manager);
  let overview = await service.connections(actor);
  assert.equal(overview.connections.length, 1);
  assert.equal(overview.connections[0].source, "legacy_telegram");
  assert.equal(overview.connections[0].migration_state, "awaiting_cutover");
  assert.equal(overview.connections[0].health, "ok");
  assert.equal(overview.connections[0].accounts, 1);
  assert.equal(overview.connections[0].test_accounts, null);
  assert.equal(overview.connections[0].open_conversations, 1);
  assert.equal(overview.connections[0].outbox_pending, 1);
  assert.equal("secret_ref" in overview.connections[0], false);
  await db("comm_connections").insert({
    platform: "telegram",
    external_id: "8694946838",
    name: "Telegram · подготовка переноса",
    enabled: false,
    mode: "production",
    store_id: store,
    worker_user_id: worker,
    secret_ref: "TELEGRAM_TOKEN_FILE",
  });
  overview = await service.connections(actor);
  assert.equal(overview.connections.filter((item) => item.platform === "telegram").length, 2);
  assert.equal(
    overview.connections.find((item) => item.source === "legacy_telegram")?.migration_state,
    "awaiting_cutover",
  );
  assert.equal(
    overview.connections.find((item) => item.source !== "legacy_telegram")?.enabled,
    false,
  );
  await db("comm_connections")
    .where({ platform: "telegram", external_id: "8694946838" })
    .update({ enabled: true });
  overview = await service.connections(actor);
  assert.equal(overview.connections.filter((item) => item.platform === "telegram").length, 2);
  context.env.ISVOI_TELEGRAM_USE_COMMUNICATIONS = true;
  overview = await service.connections(actor);
  assert.equal(
    overview.connections.filter((item) => item.platform === "telegram").length,
    1,
    JSON.stringify(
      overview.connections.map(({ id, platform, external_id, source }) => ({
        id,
        platform,
        external_id,
        source,
      })),
    ),
  );
  assert.equal(overview.connections[0].source, undefined);
});
test("PostgreSQL: pilot identity stays excluded after a connection enters production", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db } = fixture;
  const store = randomUUID();
  const intake = randomUUID();
  const worker = randomUUID();
  const connection = randomUUID();
  await db("store_locations").insert({ id: store });
  await db("directus_users").insert([intake, worker].map((id) => ({ id, status: "active" })));
  await db("comm_connections").insert({
    id: connection,
    platform: "telegram",
    external_id: "pilot-bot",
    name: "Pilot",
    enabled: true,
    mode: "test",
    store_id: store,
    worker_user_id: worker,
    service_user_id: intake,
    secret_ref: "PILOT",
    settings: { pilot_user_ids: ["123"] },
  });
  class ItemsService {
    constructor(table, options) {
      this.table = table;
      this.db = options.knex;
    }
    async createOne(values) {
      return (await this.db(this.table).insert(values).returning("id"))[0].id;
    }
  }
  const service = createService({
    database: db,
    services: { ItemsService },
    getSchema: async () => ({}),
    env: { ISVOI_COMMUNICATIONS_ENABLED: true },
  });
  const incoming = (update, user) => ({
    update_id: update,
    message: {
      message_id: update,
      date: 1700000000 + update,
      from: { id: user },
      chat: { id: user, type: "private" },
      text: `Question ${update}`,
    },
  });
  await service.ingest(connection, incoming(1, 123));
  await service.processIncoming(connection);
  const pilotLead = await db("leads").first();
  assert.equal(pilotLead.is_test, true);
  await db("leads").where({ id: pilotLead.id }).update({ status: "closed", assigned_to: intake });
  await db("comm_connections").where({ id: connection }).update({ mode: "production" });

  await service.ingest(connection, incoming(2, 123));
  await service.processIncoming(connection);
  const pilotLeads = await db("leads").where({ contact: "telegram:123" });
  assert.equal(pilotLeads.length, 2);
  assert.ok(pilotLeads.every((lead) => lead.is_test));
  const reopenedLead = pilotLeads.find((lead) => lead.id !== pilotLead.id);
  assert.equal(
    (await db("comm_conversations").where({ lead_id: reopenedLead.id }).first()).handling,
    "queued",
  );
  const pilotThread = await db("comm_threads")
    .join("comm_identities", "comm_identities.id", "comm_threads.identity_id")
    .where("comm_identities.external_user_id", "123")
    .select("comm_threads.id")
    .first();
  assert.equal(
    Number((await db("comm_outbox").where({ thread_id: pilotThread.id }).count("* as n").first()).n),
    2,
    "a newly opened case receives an acknowledgement even after an assigned closed case",
  );
  await service.ingest(connection, incoming(4, 123));
  await service.processIncoming(connection);
  assert.equal(
    Number((await db("comm_outbox").where({ thread_id: pilotThread.id }).count("* as n").first()).n),
    2,
    "another message in the active case does not repeat the acknowledgement",
  );

  await service.ingest(connection, incoming(3, 456));
  await service.processIncoming(connection);
  const liveLead = await db("leads").where({ contact: "telegram:456" }).first();
  assert.equal(liveLead.is_test, false);
  assert.equal(
    (await db("comm_identities").where({ external_user_id: "456" }).first()).is_test,
    false,
  );
});

test("PostgreSQL: durable ingest, command replay, partial delivery and queue isolation", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db } = fixture;
  const store = randomUUID(),
    role = randomUUID(),
    manager = randomUUID(),
    worker = randomUUID(),
    intake = randomUUID(),
    connection = randomUUID();
  await db("store_locations").insert({ id: store });
  await db("directus_roles").insert({ id: role });
  await db("directus_users").insert(
    [manager, worker, intake].map((id) => ({
      id,
      role: id === manager ? role : null,
      status: "active",
    })),
  );
  await db("comm_staff").insert({ user_id: manager, store_id: store, can_manage: true });
  await db("comm_connections").insert({
    id: connection,
    platform: "telegram",
    external_id: "bot1",
    name: "Test",
    enabled: true,
    mode: "test",
    store_id: store,
    worker_user_id: worker,
    service_user_id: intake,
    secret_ref: "TEST",
    settings: { pilot_user_ids: ["123"] },
  });
  // This shim exercises transactional business code, not Directus authorization contracts.
  class ItemsService {
    constructor(table, options) {
      this.table = table;
      this.db = options.knex;
      assert.equal(options.accountability.admin, false);
    }
    async createOne(values) {
      return (await this.db(this.table).insert(values).returning("id"))[0].id;
    }
    async readOne(id) {
      const row = await this.db(this.table).where({ id }).first();
      if (!row) throw Error("not found");
      return row;
    }
    async updateOne(id, data) {
      await this.db(this.table).where({ id }).update(data);
      return id;
    }
    async readByQuery(q) {
      return this.db(this.table).whereIn("id", q.filter.id._in);
    }
  }
  const context = {
    database: db,
    services: { ItemsService },
    getSchema: async () => ({}),
    env: { ISVOI_COMMUNICATIONS_ENABLED: true },
  };
  const service = createService(context),
    delivery = createDelivery(context, service),
    staffService = createStaff(context, service);
  const raw = {
    update_id: 10,
    message: {
      message_id: 20,
      date: 1700000000,
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      text: "handled",
    },
  };
  await db("comm_inbound").insert({
    connection_id: connection,
    external_id: "corrupt-fixture",
    event: null,
    received_at: new Date(Date.now() - 60_000),
  });
  await service.ingest(connection, raw);
  await service.ingest(connection, raw);
  assert.deepEqual(await service.processIncoming(connection), {
    id: (await db("comm_inbound").where({ external_id: "corrupt-fixture" }).first()).id,
    failed: true,
    error: "INVALID_STORED_EVENT",
  });
  await service.processIncoming(connection);
  assert.equal(Number((await db("comm_inbound").count("* as n").first()).n), 2);
  assert.equal(
    (await db("comm_inbound").where({ external_id: "corrupt-fixture" }).first()).error_code,
    "INVALID_STORED_EVENT",
  );
  assert.equal((await db("comm_messages").first()).text, "handled");
  const c = await db("comm_conversations").first();
  const expectedDeadlines = serviceDeadlines(
    new Date(raw.message.date * 1000),
    defaultServiceLevel,
  );
  assert.equal(
    new Date(c.first_response_due_at).toISOString(),
    expectedDeadlines.firstResponseDueAt.toISOString(),
  );
  assert.equal(
    new Date(c.escalation_due_at).toISOString(),
    expectedDeadlines.escalationDueAt.toISOString(),
  );
  const actor = await service.actor(manager);
  const claim = {
    type: "claim",
    key: randomUUID(),
    conversation_id: c.id,
    expected_version: c.version,
    payload: {},
  };
  const result = await service.commands(actor, claim);
  assert.deepEqual(await service.commands(actor, claim), result);
  await assert.rejects(
    service.commands(actor, { ...claim, payload: { changed: true } }),
    /IDEMPOTENCY_PARAMETER_MISMATCH/,
  );
  const reply = {
    type: "reply",
    key: randomUUID(),
    conversation_id: c.id,
    expected_version: result.version,
    payload: { text: "Ответ" },
  };
  await service.commands(actor, reply);
  const replyOutbox = await db("comm_outbox")
    .where({ dedupe_key: `reply:${reply.key}` })
    .first();
  await db("comm_operations").insert({
    outbox_id: replyOutbox.id,
    position: 1,
    method: "attachment",
    payload: { attachment_id: randomUUID(), peer_id: "123" },
  });
  await db("comm_runtime").update({ active: true, sending_enabled: true, recovery_hold: false });
  assert.equal(
    (await db("comm_conversations").where({ id: c.id }).first()).first_agent_response_at,
    null,
    "queued automatic acknowledgement does not count as an agent response",
  );
  const op = await delivery.next(connection, worker);
  assert.ok(op);
  await db("comm_operations")
    .where({ id: op.id })
    .update({ lease_until: new Date(0) });
  await db("comm_connections")
    .where({ id: connection })
    .update({ send_after: new Date(0) });
  assert.equal(await delivery.next(connection, worker), null);
  assert.equal((await db("comm_operations").where({ id: op.id }).first()).state, "uncertain");
  const completion = await delivery.complete(connection, worker, {
    attempt_id: op.attempt_id,
    lease_version: op.lease_version,
    outcome: { type: "accepted", externalId: "42" },
  });
  assert.equal(completion.state, "accepted");
  assert.equal((await db("comm_attempts").where({ id: op.attempt_id }).first()).late, true);
  const next = await delivery.next(connection, worker);
  assert.ok(next);
  await assert.rejects(
    delivery.complete(connection, manager, {
      attempt_id: next.attempt_id,
      lease_version: next.lease_version,
      outcome: { type: "accepted", externalId: "43" },
    }),
    /FORBIDDEN/,
  );
  await delivery.complete(connection, worker, {
    attempt_id: next.attempt_id,
    lease_version: next.lease_version,
    outcome: { type: "accepted", externalId: "43" },
  });
  await db("comm_connections")
    .where({ id: connection })
    .update({ send_after: new Date(0) });
  const attachmentOperation = await delivery.next(connection, worker);
  assert.equal(attachmentOperation.outbox_id, replyOutbox.id);
  assert.equal(attachmentOperation.position, 1);
  await db("comm_connections").where({ id: connection }).update({ platform: "max" });
  assert.deepEqual(
    await delivery.complete(connection, worker, {
      attempt_id: attachmentOperation.attempt_id,
      lease_version: attachmentOperation.lease_version,
      outcome: {
        type: "retryable",
        code: "ATTACHMENT_NOT_READY",
        resume: {
          platform: "max",
          attachment: { type: "audio", payload: { token: "persisted-media-token" } },
        },
      },
    }),
    { state: "sending" },
  );
  const retryableOperation = await db("comm_operations")
    .where({ id: attachmentOperation.id })
    .first();
  assert.equal(retryableOperation.state, "pending");
  assert.deepEqual(retryableOperation.payload.provider_attachment, {
    type: "audio",
    payload: { token: "persisted-media-token" },
  });
  await db("comm_connections").where({ id: connection }).update({ platform: "telegram" });
  assert.equal(await delivery.next(connection, worker), null, "retry backoff is enforced");
  await db("comm_outbox")
    .where({ id: replyOutbox.id })
    .update({ due_at: new Date(0) });
  await db("comm_connections")
    .where({ id: connection })
    .update({ send_after: new Date(0) });
  const attachmentRetry = await delivery.next(connection, worker);
  assert.equal(attachmentRetry.id, attachmentOperation.id);
  assert.equal(attachmentRetry.lease_version, attachmentOperation.lease_version + 1);
  await delivery.complete(connection, worker, {
    attempt_id: attachmentRetry.attempt_id,
    lease_version: attachmentRetry.lease_version,
    outcome: { type: "rejected", code: "FIXTURE_ATTACHMENT_REJECTED" },
  });
  assert.equal((await db("comm_outbox").where({ id: replyOutbox.id }).first()).state, "partial");
  assert.ok((await db("comm_conversations").where({ id: c.id }).first()).first_agent_response_at);
  assert.equal(
    Number(
      (
        await db("comm_events")
          .where({ kind: "first_agent_response", lead_id: c.lead_id })
          .count("* as n")
          .first()
      ).n,
    ),
    1,
  );
  assert.deepEqual(
    await db("comm_operations")
      .where({ outbox_id: replyOutbox.id })
      .orderBy("position")
      .pluck("state"),
    ["accepted", "failed"],
  );
  assert.equal((await service.audience(actor)).connections[0].users, 0, "pilot excluded");
  const connectionOverview = await service.connections(actor);
  assert.equal(connectionOverview.connections[0].id, connection);
  assert.equal(connectionOverview.connections[0].accounts, 1);
  assert.equal(connectionOverview.connections[0].test_accounts, 1);
  assert.equal(connectionOverview.connections[0].uncertain, 0);
  assert.equal(connectionOverview.runtime.sending_enabled, true);
  assert.equal("secret_ref" in connectionOverview.connections[0], false);
  assert.equal("worker_user_id" in connectionOverview.connections[0], false);
  assert.equal("settings" in connectionOverview.connections[0], false);
  const firstConversation = await db("comm_conversations").where({ id: c.id }).first();
  await service.commands(actor, {
    type: "handling",
    key: randomUUID(),
    conversation_id: c.id,
    expected_version: firstConversation.version,
    payload: { state: "closed" },
  });
  await service.ingest(connection, {
    ...raw,
    update_id: 11,
    message: { ...raw.message, message_id: 21, text: "Новый вопрос" },
  });
  await service.processIncoming(connection);
  assert.equal(
    Number((await db("leads").count("* as n").first()).n),
    2,
    "new support case after closure",
  );
  await service.ingest(connection, {
    ...raw,
    update_id: 12,
    message: { ...raw.message, message_id: 22, text: "Новый вопрос" },
  });
  await service.processIncoming(connection);
  assert.equal(
    Number((await db("comm_messages").where({ text: "Новый вопрос" }).count("* as n").first()).n),
    2,
    "identical text with different external IDs is not deduplicated",
  );
  const member = (id, date, state) => ({
    update_id: id,
    my_chat_member: {
      chat: { id: 123, type: "private" },
      date,
      new_chat_member: { status: state },
    },
  });
  await service.ingest(connection, member(13, 1700000200, "kicked"));
  await service.processIncoming(connection);
  await service.ingest(connection, member(14, 1700000100, "member"));
  await service.processIncoming(connection);
  assert.equal(
    (await db("comm_identities").first()).availability,
    "blocked",
    "late older unblock does not override block",
  );
  const destination = randomUUID();
  await db("comm_destinations").insert({
    id: destination,
    connection_id: connection,
    name: "Managers",
    external_id: "-100123",
    kind: "staff",
    enabled: true,
  });
  const overdue = await db("comm_conversations").orderBy("created_at", "desc").first();
  await db("comm_conversations")
    .where({ id: overdue.id })
    .update({
      escalation_due_at: new Date(Date.now() - 60_000),
      first_agent_response_at: null,
      sla_escalated_at: null,
    });
  const connectionRow = await db("comm_connections").where({ id: connection }).first();
  const concurrentSweeps = await Promise.all([
    db.transaction((trx) => staffService.sweep(trx, connectionRow)),
    db.transaction((trx) => staffService.sweep(trx, connectionRow)),
  ]);
  assert.equal(concurrentSweeps.filter(Boolean).length, 1, "concurrent workers escalate once");
  assert.deepEqual(concurrentSweeps.find(Boolean), {
    result: "sla_escalated",
    conversation_id: overdue.id,
  });
  assert.equal(await db.transaction((trx) => staffService.sweep(trx, connectionRow)), null);
  assert.ok((await db("comm_conversations").where({ id: overdue.id }).first()).sla_escalated_at);
  assert.equal(
    Number((await db("comm_events").where({ kind: "sla_escalated" }).count("* as n").first()).n),
    1,
  );
  assert.equal(
    Number((await db("comm_outbox").where({ purpose: "staff" }).count("* as n").first()).n),
    2,
    "one card and one escalation notification",
  );
  await db("comm_staff").where({ user_id: manager }).update({ enabled: false });
  await assert.rejects(
    service.messages(actor, c.thread_id, { conversation_id: c.id }),
    /FORBIDDEN/,
  );
  await assert.rejects(
    service.commands(actor, claim),
    /FORBIDDEN/,
    "receipt replay rechecks revoked scope",
  );
});
