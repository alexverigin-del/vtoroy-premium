import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./lib/communications-test-db.mjs";
import {
  createService,
  createDelivery,
  createStaff,
  normalize,
  classify,
  marketingWindow,
  verifySecret,
  inspectFile,
  readBounded,
  sendOperation,
  publicIPv4,
  validateMediaURL,
  serviceDeadlines,
  defaultServiceLevel,
} from "../packages/communications/dist/index.js";

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
});
test("file validation uses content, rejects active formats and bounds streamed bytes", async () => {
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
  assert.equal(
    (await inspectFile(Buffer.from("Тестовый документ"), "text/plain")).kind,
    "document",
  );
  await assert.rejects(
    inspectFile(Buffer.from("<svg><script>alert(1)</script></svg>"), "text/plain"),
    /FILE_FORMAT_NOT_ALLOWED/,
  );
  await assert.rejects(
    inspectFile(Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"), "image/jpeg"),
    /FILE_TYPE_MISMATCH/,
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
  await delivery.complete(connection, worker, {
    attempt_id: attachmentOperation.attempt_id,
    lease_version: attachmentOperation.lease_version,
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
