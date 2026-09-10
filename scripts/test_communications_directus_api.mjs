import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = "http://127.0.0.1:8056",
  password = "local-isvoi-fixture-password",
  connection = "55555555-5555-4555-8555-555555555555",
  scannerExpected = process.env.COMM_LOCAL_SCANNER === "ready";

async function call(path, { token, json, body, headers = {}, method = "GET" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    body: json === undefined ? body : JSON.stringify(json),
    headers: {
      ...(json === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const type = response.headers.get("content-type") || "";
  const result = type.includes("json") ? await response.json() : await response.arrayBuffer();
  return { response, result };
}

async function login(email) {
  const { response, result } = await call("/auth/login", {
    method: "POST",
    json: { email, password, mode: "json" },
  });
  assert.equal(response.status, 200);
  return result.data.access_token;
}

async function scanUntilSettled(id, manager, worker, limit = 50) {
  for (let i = 0; i < limit; i++) {
    const scan = await call(`/isvoi-communications/v1/workers/${connection}/scan`, {
      method: "POST",
      token: worker,
      json: {},
    });
    assert.equal(scan.response.status, 200, JSON.stringify(scan.result));
    const status = await call(`/isvoi-communications/v1/attachments/${id}/status`, {
      token: manager,
    });
    assert.equal(status.response.status, 200, JSON.stringify(status.result));
    if (!["quarantine", "scanning"].includes(status.result.data.state)) return status.result.data;
  }
  assert.fail(`scanner did not settle attachment ${id}`);
}

const manager = await login("manager@example.com"),
  worker = await login("worker@example.com"),
  updateId = Number(String(Date.now()).slice(-9));

let request = await call("/isvoi-communications/v1/inbox");
assert.equal(request.response.status, 403, "public endpoint access must be denied");

request = await call(`/isvoi-communications/v1/workers/${connection}/ingest`, {
  method: "POST",
  token: worker,
  json: {
    update: {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        from: { id: 900001, is_bot: false, first_name: "Fixture" },
        chat: { id: 900001, type: "private" },
        text: "Проверка реального Directus API",
      },
    },
  },
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));

request = await call(`/isvoi-communications/v1/workers/${connection}/process`, {
  method: "POST",
  token: worker,
  json: {},
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));

request = await call("/isvoi-communications/v1/inbox", { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const conversation = request.result.data.find((item) => item.external_user_id === "900001");
assert.ok(conversation, "ingested conversation must appear in manager inbox");
assert.ok(Number(conversation.unread_count) >= 1, "new inbound message must be unread for manager");

request = await call("/isvoi-communications/v1/commands", {
  method: "POST",
  token: manager,
  json: {
    type: "read",
    key: randomUUID(),
    conversation_id: conversation.id,
    payload: {},
  },
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));
request = await call("/isvoi-communications/v1/inbox", { token: manager });
assert.equal(
  Number(request.result.data.find((item) => item.id === conversation.id).unread_count),
  0,
  "read marker must be personal and clear the manager's inbound count",
);

request = await call("/isvoi-communications/v1/commands", {
  method: "POST",
  token: manager,
  json: {
    type: "claim",
    key: randomUUID(),
    conversation_id: conversation.id,
    expected_version: conversation.version,
    payload: {},
  },
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));
let version = request.result.data.version;

const bytes = Buffer.from("safe local attachment\n", "utf8");
request = await call(
  `/isvoi-communications/v1/attachments?conversation_id=${conversation.id}&name=fixture.txt&mime=text%2Fplain`,
  {
    method: "POST",
    token: manager,
    body: bytes,
    headers: { "content-type": "application/octet-stream", "content-length": String(bytes.length) },
  },
);
assert.equal(request.response.status, 201, JSON.stringify(request.result));
const attachment = request.result.data;
assert.equal(attachment.state, "quarantine");

request = await call(`/isvoi-communications/v1/attachments/${attachment.id}`, { token: manager });
assert.equal(request.response.status, 409, "quarantined file must not be downloadable");

if (scannerExpected) {
  assert.equal(
    (await scanUntilSettled(attachment.id, manager, worker)).state,
    "ready",
    "scanner must eventually release the target file",
  );
  request = await call(`/isvoi-communications/v1/attachments/${attachment.id}`, { token: manager });
  assert.equal(request.response.status, 200, "clean file must be downloadable after scanning");
  assert.deepEqual(Buffer.from(request.result), bytes);
  assert.equal(request.response.headers.get("cache-control"), "private, no-store");
  assert.equal(request.response.headers.get("x-content-type-options"), "nosniff");

  const safeKinds = [
    {
      name: "pixel.png",
      mime: "image/png",
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    },
    {
      name: "sample.wav",
      mime: "audio/wav",
      bytes: Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.from([36, 0, 0, 0]),
        Buffer.from("WAVEfmt "),
        Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x40, 0x1f, 0, 0, 1, 0, 8, 0]),
        Buffer.from("data"),
        Buffer.alloc(8),
      ]),
    },
    {
      name: "sample.mp4",
      mime: "video/mp4",
      bytes: Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex"),
    },
    {
      name: "sample.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"),
    },
  ];
  for (const fixture of safeKinds) {
    const uploaded = await call(
      `/isvoi-communications/v1/attachments?conversation_id=${conversation.id}&name=${fixture.name}&mime=${encodeURIComponent(fixture.mime)}`,
      {
        method: "POST",
        token: manager,
        body: fixture.bytes,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(fixture.bytes.length),
        },
      },
    );
    assert.equal(uploaded.response.status, 201, JSON.stringify(uploaded.result));
    assert.equal((await scanUntilSettled(uploaded.result.data.id, manager, worker)).state, "ready");
  }

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
  request = await call(`/isvoi-communications/v1/workers/${connection}/ingest`, {
    method: "POST",
    token: worker,
    json: {
      update: {
        update_id: updateId + 1,
        message: {
          message_id: updateId + 1,
          date: Math.floor(Date.now() / 1000),
          from: { id: 900001, is_bot: false },
          chat: { id: 900001, type: "private" },
          voice: {
            file_id: `voice_${updateId}`,
            file_size: opus.length,
            mime_type: "audio/ogg",
          },
        },
      },
    },
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  request = await call(`/isvoi-communications/v1/workers/${connection}/process`, {
    method: "POST",
    token: worker,
    json: {},
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  const media = await call(`/isvoi-communications/v1/workers/${connection}/media`, {
    token: worker,
  });
  assert.equal(media.response.status, 200, JSON.stringify(media.result));
  assert.equal(media.result.data.kind, "voice");
  request = await call(
    `/isvoi-communications/v1/workers/${connection}/media/${media.result.data.id}`,
    {
      method: "POST",
      token: worker,
      body: opus,
      headers: { "content-type": "application/octet-stream", "content-length": String(opus.length) },
    },
  );
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  assert.equal((await scanUntilSettled(media.result.data.id, manager, worker)).state, "ready");

  const eicar = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    "ascii",
  );
  request = await call(
    `/isvoi-communications/v1/attachments?conversation_id=${conversation.id}&name=eicar.txt&mime=text%2Fplain`,
    {
      method: "POST",
      token: manager,
      body: eicar,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(eicar.length),
      },
    },
  );
  assert.equal(request.response.status, 201, JSON.stringify(request.result));
  const infected = request.result.data;
  const infectedStatus = await scanUntilSettled(infected.id, manager, worker);
  assert.equal(infectedStatus.state, "rejected");
  assert.equal(infectedStatus.error_code, "MALWARE_DETECTED");
  request = await call(`/isvoi-communications/v1/attachments/${infected.id}`, { token: manager });
  assert.equal(request.response.status, 409, "rejected file must never be downloadable");
} else {
  request = await call(`/isvoi-communications/v1/workers/${connection}/scan`, {
    method: "POST",
    token: worker,
    json: {},
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  assert.equal(request.result.data.state, "quarantine");
  assert.equal(request.result.data.error_code, "SCANNER_UNAVAILABLE");
}

request = await call("/isvoi-communications/v1/inbox", { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
version = request.result.data.find((item) => item.id === conversation.id).version;
request = await call("/isvoi-communications/v1/commands", {
  method: "POST",
  token: manager,
  json: {
    type: "reply",
    key: randomUUID(),
    conversation_id: conversation.id,
    expected_version: version,
    payload: { text: "Ответ из реального Directus endpoint" },
  },
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));
version = request.result.data.version;

request = await call(`/isvoi-communications/v1/threads/${conversation.thread_id}/messages?conversation_id=${conversation.id}`, {
  token: manager,
});
assert.equal(request.response.status, 200, JSON.stringify(request.result));
assert.ok(request.result.data.some((message) => message.text === "Ответ из реального Directus endpoint"));

request = await call("/items/comm_messages?limit=1");
assert.equal(request.response.status, 403, "comm tables must not be public through Items API");

request = await call("/isvoi-communications/v1/audience", { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const analytics = request.result.data.connections.find((item) => item.id === connection);
assert.ok(analytics, "manager must see analytics for the assigned store connection");
assert.equal(analytics.users, 0, "test identities must be excluded from business analytics");

console.log(
  `PASS Directus API: public denied, worker ingest/process, manager inbox/claim/reply/history/unread, quarantine hold, ${scannerExpected ? "ClamAV image/audio/video/document/Telegram voice release, EICAR rejection, private download" : "scanner outage"}, private collections, audience (version ${version}).`,
);
