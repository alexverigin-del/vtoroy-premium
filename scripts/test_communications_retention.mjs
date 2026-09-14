import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./lib/communications-test-db.mjs";
import { retainCommunications } from "../packages/communications/dist/index.js";

test("retention pauses for backup and removes only expired conversation data", async (t) => {
  const fixture = await testDatabase();
  t.after(fixture.close);
  const { db } = fixture;
  const store = randomUUID();
  const user = randomUUID();
  const connection = randomUUID();
  const contact = randomUUID();
  const identity = randomUUID();
  const thread = randomUUID();
  const oldLead = randomUUID();
  const currentLead = randomUUID();
  const oldConversation = randomUUID();
  const currentConversation = randomUUID();
  const oldMessage = randomUUID();
  const currentMessage = randomUUID();
  const oldStorageKey = randomUUID();

  await db("store_locations").insert({ id: store });
  await db("directus_users").insert({ id: user, status: "active", role: null });
  await db("comm_connections").insert({
    id: connection,
    platform: "telegram",
    external_id: "retention-test",
    name: "Retention",
    enabled: false,
    mode: "test",
    store_id: store,
    worker_user_id: user,
    secret_ref: "TEST_ONLY",
  });
  await db("comm_contacts").insert({ id: contact, name: "Permanent peer" });
  await db("comm_identities").insert({
    id: identity,
    contact_id: contact,
    connection_id: connection,
    external_user_id: "retention-peer",
    is_test: true,
  });
  await db("comm_threads").insert({
    id: thread,
    connection_id: connection,
    identity_id: identity,
    external_peer_id: "retention-peer",
  });
  await db("leads").insert([
    { id: oldLead, kind: "support", status: "closed", store_location_id: store, is_test: true },
    { id: currentLead, kind: "support", status: "closed", store_location_id: store, is_test: true },
  ]);
  await db("comm_conversations").insert([
    {
      id: oldConversation,
      thread_id: thread,
      lead_id: oldLead,
      handling: "closed",
      closed_at: db.raw("now()-interval '6 months 1 day'"),
    },
    {
      id: currentConversation,
      thread_id: thread,
      lead_id: currentLead,
      handling: "closed",
      closed_at: db.raw("now()-interval '5 months'"),
    },
  ]);
  await db("comm_messages").insert([
    {
      id: oldMessage,
      thread_id: thread,
      conversation_id: oldConversation,
      direction: "in",
      text: "Expired",
    },
    {
      id: currentMessage,
      thread_id: thread,
      conversation_id: currentConversation,
      direction: "in",
      text: "Keep",
    },
  ]);
  await db("comm_attachments").insert({
    message_id: oldMessage,
    conversation_id: oldConversation,
    connection_id: connection,
    kind: "image",
    state: "ready",
    name: "expired.webp",
    mime: "image/webp",
    size: 100,
    storage_driver: "s3",
    storage_key: oldStorageKey,
  });
  await db("comm_inbound").insert({
    connection_id: connection,
    external_id: "old-payload",
    event: { private: "payload" },
    state: "done",
    processed_at: db.raw("now()-interval '8 days'"),
  });
  await db("comm_link_tokens").insert({
    hash: "a".repeat(64),
    lead_id: currentLead,
    expires_at: db.raw("now()-interval '1 day'"),
  });
  const backup = randomUUID();
  await db("comm_backups").insert({ id: backup, state: "running" });

  const removed = [];
  assert.deepEqual(await retainCommunications(db, async (record) => removed.push(record), true), {
    paused_for_backup: true,
  });
  assert.ok(await db("comm_conversations").where({ id: oldConversation }).first());

  await db("comm_backups").where({ id: backup }).update({ state: "completed" });
  assert.deepEqual(await retainCommunications(db, async (record) => removed.push(record), true), {
    conversations: 1,
    files: 1,
    raw_events: 1,
  });
  assert.equal(await db("comm_conversations").where({ id: oldConversation }).first(), undefined);
  assert.ok(await db("comm_conversations").where({ id: currentConversation }).first());
  assert.ok(await db("comm_threads").where({ id: thread }).first(), "permanent peer remains");
  assert.ok(await db("comm_messages").where({ id: currentMessage }).first());
  assert.equal((await db("comm_inbound").where({ external_id: "old-payload" }).first()).event, null);
  assert.equal(Number((await db("comm_link_tokens").count("* as n").first()).n), 0);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].storage_key, oldStorageKey);
  assert.equal(Number((await db("comm_file_gc").count("* as n").first()).n), 0);
  const runtime = await db("comm_runtime").where({ id: 1 }).first();
  assert.ok(runtime.last_retention_at);
  assert.ok(new Date(runtime.retention_after) > new Date());
  assert.deepEqual(await retainCommunications(db, async () => assert.fail("not due")), {
    not_due: true,
  });
});
