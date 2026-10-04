import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = "http://127.0.0.1:8056",
  password = "local-isvoi-fixture-password",
  connection = "55555555-5555-4555-8555-555555555555",
  sanitizerExpected = process.env.COMM_LOCAL_SANITIZER === "ready";

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

request = await call(`/isvoi-communications/v1/conversations/${conversation.id}/link-options`, { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
assert.ok(Array.isArray(request.result.data));
for (const target of request.result.data) assert.deepEqual(Object.keys(target).sort(), ["id", "name", "platform"]);
request = await call(`/isvoi-communications/v1/conversations/${conversation.id}/link-options`, { token: worker });
assert.equal(request.response.status, 403, "worker must not inspect account-link destinations");
request = await call(`/isvoi-communications/v1/audience/contacts/${conversation.contact_id}`, { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const contactAction = { key: randomUUID(), expected_version: request.result.data.contact.version,
  identity_id: conversation.identity_id, action: "prefer" };
const contactActionPath = `/isvoi-communications/v1/audience/contacts/${conversation.contact_id}/actions`;
request = await call(contactActionPath, { method: "POST", json: contactAction });
assert.equal(request.response.status, 403);
request = await call(contactActionPath, { token: worker, method: "POST", json: contactAction });
assert.equal(request.response.status, 403);
request = await call(contactActionPath, { token: manager, method: "POST", json: contactAction });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const contactResult = request.result.data;
request = await call(contactActionPath, { token: manager, method: "POST", json: contactAction });
assert.deepEqual(request.result.data, contactResult, "HTTP retry cannot apply contact mutation twice");
request = await call(contactActionPath, { token: manager, method: "POST", json: { ...contactAction, key: randomUUID() } });
assert.equal(request.response.status, 409, "stale contact version must be rejected");

const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
request = await call(
  `/isvoi-communications/v1/attachments?conversation_id=${conversation.id}&name=fixture.png&mime=image%2Fpng`,
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

if (sanitizerExpected) {
  assert.equal(
    (await scanUntilSettled(attachment.id, manager, worker)).state,
    "ready",
    "sanitizer must eventually release the target file",
  );
  request = await call(`/isvoi-communications/v1/attachments/${attachment.id}`, { token: manager });
  assert.equal(request.response.status, 200, "sanitized file must be downloadable");
  assert.notDeepEqual(Buffer.from(request.result), bytes, "stored object must be a re-encoded derivative");
  assert.equal(request.response.headers.get("content-type"), "image/png");
  assert.equal(request.response.headers.get("cache-control"), "private, no-store");
  assert.equal(request.response.headers.get("x-content-type-options"), "nosniff");

  const safeKinds = [
    {
      name: "sample.wav",
      mime: "audio/wav",
      bytes: (() => {
        const samples = Buffer.alloc(800);
        for (let i = 0; i < samples.length; i++) samples[i] = 128 + Math.round(40 * Math.sin((i * Math.PI) / 10));
        const header = Buffer.alloc(44);
        header.write("RIFF", 0); header.writeUInt32LE(36 + samples.length, 4); header.write("WAVEfmt ", 8);
        header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
        header.writeUInt32LE(8000, 24); header.writeUInt32LE(8000, 28); header.writeUInt16LE(1, 32);
        header.writeUInt16LE(8, 34); header.write("data", 36); header.writeUInt32LE(samples.length, 40);
        return Buffer.concat([header, samples]);
      })(),
    },
    {
      name: "sample.webm",
      mime: "video/webm",
      bytes: Buffer.from("GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAcrEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEpTbuMU6uEHFO7a1OsggcV7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNTkuMjcuMTAwV0GNTGF2ZjU5LjI3LjEwMESJiECPQAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYhWKv1wcR/Z/ZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAvrwgDglLCBILqBIJqBAlWwiFWxgQBVuYECElTDZ0CBc3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY1OS4yNy4xMDBzc9tjwItjxYhWKv1wcR/Z/WfIpUWjh0VOQ09ERVJEh5hMYXZjNTkuMzcuMTAwIGxpYnZweC12cDlnyKJFo4hEVVJBVElPTkSHlDAwOjAwOjAxLjAwMDAwMDAwMAAAH0O2dUVf54EAo0OTgQAAgKJJg0LgAfAB9gg4JBwYSgADID9j9/jYodiuc6uPiMo977r/uvP80C+Q8z+33L/h+JeH6L7HhMzS8GuRxRfLwnfXpgAAfveWN1XaBMnHUVx9QqFi/d3/DbI7RjUV4OpzRHlJpuIVM0ImyQ7vBJlz/3IjHZtQ8Tec+oxYQ+/oDWGaqxwIbkKj+DXwxC9ZVeUdyRWH+P9fvQOnabE45ZtBQuqh/qN/ZZ8P6Ak2uVYg4zghnrf0EuJtSNvMVWSNX1soGoiULg1gpYrqvigRxUjrMJk16O+3YLdYikiIjvwhn/S4/U/VYpXUMB0Qf8YMQoQj7sGu35z6Jnod+rx+8w/+D57VBxh73zkhHvwTr2lU8QuF/+NzDz1Pww3iUvRTuYhMsKnNDQQIfLjyDO7C/hZk50AzSuJ8T1xGhlOvGKNOlCrRNJCgwIuPMbSBigg6b+fipsqqRxZTbDFMAlmtVpvoWBjeZFSvvyH9cfeJO1SYJ/vd1oQRGRrUfEtIvNL4Nuj3otymk3jsQWNN/31lQcH+Pn5ihD9myCMK94Lsa0PA6M4ZDvbGzoiKJj22+bAxE0Iy+UzBBGP//XNv3wBRSXy58I3r/ChD/zapb7+j4O15AmQYnwLszoc6m9XouhhvydWCI/mdH4LB2vRaLfyF//LMm4hC9m9iHsJmUYVrAuyfDRMHHr5LR5rkn3C6+GfuSuFe/w+GUictZ0SnZt9oSf84+x9h5L1Oitjot22c+oMV1dAWM36C+cPHmqVMecwGOwPmS7YWL2RclJvd2KmsJEoSswy4oKMihzmclTISn+OYl/fxa3ModFOAABO++kmHlF/xIxZ1Oox9XjG9iDn21XPA2z+Z7WEH1JD0z20Hamn7Wa0gY3Lze6b6unGnIzO3XAzOHd/4C0O/h8vro+yKCAjVjBAGhjOY3+93k1gsUdnpArb/UlI4SCpaP7WC1/llrZZBBF5Ah7FohqlUGPgr3S54hoO4+mIqGRBdr7qV38xXeTdNcNTd6gtE9/IVv2zl4JKCgVvLyGafhC9DvEyMXJ/c9Hi7MhOwE5j1GwWSrWQ9/m5Ma6PTR/YyPZLebiG/jPO50hz+ZB/dL/COOJjuSgifunSJIP4APlUQ8MQPT7o6JBlfRGDkauRnPqZ6fwhIDL9c7ZkUWmGWoJE6yyJehgWHl2HS/eHhs0mj5m9I/XCmfH0Q5G2bnlR2ZPcJH2V8FLAAo+WBAMgApgBAkpwgUAAAA3AAAHUTe5/8AH9v3PNvcKfV0qQ/xWen/+ACsyGjvnx4D/+Yv9/+W0FhwP4mfNzTzD/8aX+daW6PLMa09GX/7/HgwSPWvn//VSI+u5uDwQ1fmN9ZIsVgAKP3gQGQAKYAQJKcYE7gAAMAAAB1Tfn//DjCT06spAdf//pi+h5Z1Nyop+VdYBQf/8Ajl9m6jT2ma1fD/eo/dyPUuML//lxwxGeLmmJP//2LQOWvkx5hT8lnorPYDWf/+ZqT//wX0/X7AennssHatjf+SExtH4DHgACj6oECWACmAECSnEhQAAADIAAAdU52NzA653//8rYmEDLwkahaHms9Fllosawf//qi8S1TscHW+7l/HEnEshErf//iOREeM+apwpERrEsk8/qXdGqm9Sv///HWI/qVVc+SbfBJ/KTH2cupYACj+IEDIACmAECSnDhNQAADIAAAdU52NytoGhZrAKhpMIiK//73zn+rgbdR6ORgsxCYjyHTZg+WCXn///hknmfofdJ94MtAgcT/X7fhhmljVz//7yUXNOsmB/f5XL7PdwrOm9y2Ht3Kxejsb///mvuu125N5ND7wzsgABxTu2uRu4+zgQC3iveBAfGCAbDwgQM=", "base64"),
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

  const opus = Buffer.from("T2dnUwACAAAAAAAAAAA5cscpAAAAADzCY+gBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAADlyxykBAAAAUe918QE+T3B1c1RhZ3MNAAAATGF2ZjU5LjI3LjEwMAEAAAAdAAAAZW5jb2Rlcj1MYXZjNTkuMzcuMTAwIGxpYm9wdXNPZ2dTAAS4JgAAAAAAADlyxykCAAAAjt0N0AtzSlZUSU5US1RVQXiBe8YRdvR1AAAHjspp27vin9OsGw694P5LBvg9zQynkRg6XUvhyRTv/1IE8M+rjFyc92AAVxN7l6kEARCcTlmflhpBgtA/phZ4oC0P6PNAvD3MRCgY5jFvO8YeYCYyKC/ylWRWNEH/WSJ8TcNjTqTOiU14nh6h5/yVTUqet//ilnkUKGHySp9LOJ6jxSLxd+4p+UOGXd3vND1+cRx88HkERnUUMXyZWKr03MoCFCE47lLPy21iu+gT/PHh03iZwl9zLdIzOTU2ZBZmF8CPmIm5EqDrsu3jbvIPz+PSLAk9BUgczPnzjE+473F4TOyLliQhj5Vg5NG/CVDLbfZFNJ7pLW27VW/A8BlNKhwi4hG/XrdseJnCX3Mt0i3vaopvCPxD4teYgxJ11EzVMl7FYWUMgSzBXP+xLWDOHpp5kIfBckqo2d4XFxQ6RQ+O9Vt32SQx7WFDjVnLRV2TuGGsOOrr5xbwcf1YeJnCX3Mt0i2eXCrADM7IZww+BPTiOjEeisKd3x6ncfmo3CQc2piM+X1wE3S4MceamwvLcznW8pfTKj1pw9agM2mpaq0IujFJRniZwl91nPxLOVF3rxg/kbhnLuVofegtTT9V5S0OTb9DU5MbE83adv1x5mAoSNTHDsVTTvXqKOY3ALOPZU+Ebj6YUMtB9ePrlBoSIRmyb3iZwl9zLdIxSi/8EocPobgXcbiKKl27MnI75n146aeoCl+jSXy+5aMmAdu/0vTAtIauLJVQ4r2b4AKEVTIW7p4V14qsC0HD0FtY/WmC9IMrKXHhUHiZwl9zLdIzOTUxG2TwZWxB0UzqprgEdJjFqt53azRSkCYQKA3gjuqA8aCWxpCpRsO3NUNHQrRC/eTuwpxTDxasrgI16GJcS2/rZHiZwl91nPxJSjgKHWKL5YoPiL+i0xTWog75yzmjAezLZ20GEL9rVd6UPInD62Ce+F1evCB31RY+edprkwHWTsZl0VkArkOB9myrfNdl+pyAxp/uWWiZwl9zLdIxSuJmS96qZq/X4jjxBigVQkRoHVmisSo1U5TB26FID/4rzB813Pa7V7LKO3AWHw6VOkS9xjRGGmN3BYz8VYGB9gKIhk4FNHH79MAbzs5ogaQ2HrDLMbMBBhvHMRifig1FCMBqHcYuDdRmrxB83lV9WE2Uvf+ZGmmpjC0ggwTDBbUleLpq4lKOQjV5rQo20Q==", "base64");
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

  const document = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
  request = await call(
    `/isvoi-communications/v1/attachments?conversation_id=${conversation.id}&name=document.pdf&mime=application%2Fpdf`,
    {
      method: "POST",
      token: manager,
      body: document,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(document.length),
      },
    },
  );
  assert.equal(request.response.status, 415, "documents are outside the safe-media profile");
  assert.equal(request.result.errors[0].message, "FILE_FORMAT_NOT_ALLOWED");
} else {
  request = await call(`/isvoi-communications/v1/workers/${connection}/scan`, {
    method: "POST",
    token: worker,
    json: {},
  });
  assert.equal(request.response.status, 200, JSON.stringify(request.result));
  assert.equal(request.result.data.state, "quarantine");
  assert.equal(request.result.data.error_code, "SANITIZER_UNAVAILABLE");
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

request = await call("/isvoi-communications/v1/connections", { token: manager });
assert.equal(request.response.status, 200, JSON.stringify(request.result));
const overview = request.result.data.connections.find((item) => item.id === connection);
assert.ok(overview, "manager must see operational state for the assigned connection");
assert.equal(typeof overview.inbound_pending, "number");
assert.equal(typeof overview.outbox_pending, "number");
assert.equal("secret_ref" in overview, false);
assert.equal("worker_user_id" in overview, false);
assert.equal("settings" in overview, false);

request = await call("/isvoi-communications/v1/connections");
assert.equal(request.response.status, 403, "connection operations must not be public");

console.log(
  `PASS Directus API: public denied, worker ingest/process, manager inbox/claim/reply/history/unread, link destination scope, contact action replay and stale version, quarantine hold, ${sanitizerExpected ? "safe-media image/audio/video/Telegram voice release, document rejection, private download" : "sanitizer outage"}, private collections, audience and connection operations (version ${version}).`,
);
