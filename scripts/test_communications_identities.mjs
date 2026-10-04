import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./lib/communications-test-db.mjs";
import { createService, frequencyCount } from "../packages/communications/dist/index.js";

async function fixture(t) {
  const f = await testDatabase();
  t.after(f.close);
  const { db } = f;
  const store = randomUUID(), manager = randomUUID(), worker = randomUUID();
  const sourceConnection = randomUUID(), targetConnection = randomUUID();
  const sourceContact = randomUUID(), targetContact = randomUUID();
  const source = randomUUID(), target = randomUUID();
  const sourceThread = randomUUID(), targetThread = randomUUID();
  const lead = randomUUID(), otherLead = randomUUID(), conversation = randomUUID();
  await db("store_locations").insert({ id: store });
  await db("directus_users").insert([manager, worker].map((id) => ({ id, status: "active" })));
  await db("comm_staff").insert({ user_id: manager, store_id: store, can_manage: true });
  await db("comm_connections").insert([
    { id: sourceConnection, platform: "telegram", external_id: "tg", name: "TG", enabled: true,
      mode: "production", store_id: store, worker_user_id: worker, secret_ref: "TG", bot_username: "fixture_bot" },
    { id: targetConnection, platform: "max", external_id: "max", name: "MAX", enabled: true,
      mode: "production", store_id: store, worker_user_id: worker, secret_ref: "MAX", bot_username: "fixture_max_bot" },
  ]);
  await db("comm_contacts").insert([{ id: sourceContact }, { id: targetContact }]);
  await db("comm_identities").insert([
    { id: source, connection_id: sourceConnection, contact_id: sourceContact, external_user_id: "111", availability: "allowed" },
    { id: target, connection_id: targetConnection, contact_id: targetContact, external_user_id: "222", availability: "allowed" },
  ]);
  await db("comm_threads").insert([
    { id: sourceThread, connection_id: sourceConnection, identity_id: source, external_peer_id: "111" },
    { id: targetThread, connection_id: targetConnection, identity_id: target, external_peer_id: "max-chat" },
  ]);
  await db("leads").insert([lead, otherLead].map((id) => ({
    id, store_location_id: store, status: "in_progress", assigned_to: manager, is_test: false,
  })));
  await db("comm_conversations").insert({ id: conversation, thread_id: sourceThread, lead_id: lead });
  await db("comm_threads").where({ id: sourceThread }).update({ selected_conversation_id: conversation });
  await db("comm_access_grants").insert([
    { identity_id: source, lead_id: lead }, { identity_id: target, lead_id: otherLead },
  ]);
  class ItemsService {
    constructor(table, options) { this.table = table; this.db = options.knex; }
    async readOne(id) { return this.db(this.table).where({ id }).first(); }
    async updateOne(id, values) { return this.db(this.table).where({ id }).update(values); }
    async createOne(values) { return (await this.db(this.table).insert(values).returning("id"))[0].id; }
    async readByQuery(query) { return this.db(this.table).whereIn("id", query.filter.id._in); }
  }
  const service = createService({ database: db, services: { ItemsService }, getSchema: async () => ({}),
    env: { ISVOI_COMMUNICATIONS_ENABLED: true } });
  const actor = { user: manager, accountability: {} };
  async function issue(overrides = {}) {
    const c = await db("comm_conversations").where({ id: conversation }).first();
    const command = { type: "link_start", key: randomUUID(), conversation_id: conversation,
      expected_version: c.version, payload: { target_connection_id: targetConnection, ...overrides } };
    const result = await service.commands(actor, command);
    assert.deepEqual(await service.commands(actor, command), result, "replay must not issue a second invitation");
    const notice = await db("comm_operations as p").join("comm_outbox as o", "o.id", "p.outbox_id")
      .orderBy("o.created_at", "desc").select("p.*").first();
    const token = notice.payload.text.match(/\/link (link_[A-Za-z0-9_-]{43})/)[1];
    assert.equal(notice.payload.reply_markup.inline_keyboard[0][0].url, `https://max.ru/fixture_max_bot?start=${token}`);
    const link = await db("comm_link_tokens").where({ state: "pending" }).first();
    const h = Buffer.from(link.hash, "hex").toString("base64url");
    return { token, hash: link.hash, targetButton: `link:t:${h}`, sourceButton: `link:s:${h}` };
  }
  async function post(who, text, kind = "callback") {
    const i = await db("comm_identities").where({ id: who }).first();
    const n = await db("comm_connections").where({ id: i.connection_id }).first();
    const thread = await db("comm_threads").where({ identity_id: i.id }).first();
    const eventId = randomUUID();
    const [row] = await db("comm_inbound").insert({ connection_id: n.id, external_id: eventId,
      event: { id: eventId, platform: n.platform, actorId: i.external_user_id, peerId: thread.external_peer_id,
        kind, text, callbackData: kind === "callback" ? text : null, attachments: [],
        externalMessageId: eventId, occurredAt: new Date().toISOString() } }).returning("id");
    await service.processIncoming(n.id);
    assert.equal((await db("comm_inbound").where({ id: row.id }).first()).state, "done");
  }
  async function link() {
    const invitation = await issue();
    await post(target, `/start ${invitation.token}`, "message");
    await post(target, invitation.targetButton);
    await post(source, invitation.sourceButton);
    return invitation;
  }
  return { ...f, actor, service, store, manager, sourceConnection, targetConnection,
    sourceContact, targetContact, source, target, sourceThread, targetThread,
    lead, otherLead, conversation, issue, post, link };
}

test("account linking requires both identities, grants only one case, and ignores forwarded confirmation", async (t) => {
  const f = await fixture(t);
  const { db } = f;
  const invitation = await f.issue();
  await f.post(f.target, `/start ${invitation.token}`, "message");
  assert.equal((await db("comm_link_tokens").where({ hash: invitation.hash }).first()).state, "target_confirm");
  assert.equal((await db("comm_identities").where({ id: f.target }).first()).contact_id, f.targetContact);
  assert.equal(await db("comm_access_grants").where({ identity_id: f.target, lead_id: f.lead }).first(), undefined);
  await f.post(f.source, invitation.targetButton); // A forwarded button does not prove target ownership.
  assert.equal((await db("comm_link_tokens").where({ hash: invitation.hash }).first()).state, "target_confirm");
  await f.post(f.target, invitation.targetButton);
  assert.equal((await db("comm_link_tokens").where({ hash: invitation.hash }).first()).state, "confirm");
  await f.post(f.target, invitation.sourceButton);
  assert.equal((await db("comm_identities").where({ id: f.target }).first()).contact_id, f.targetContact);
  await f.post(f.source, invitation.sourceButton);
  await f.post(f.source, invitation.sourceButton); // Replay cannot merge or grant again.
  assert.equal((await db("comm_identities").where({ id: f.target }).first()).contact_id, f.sourceContact);
  assert.equal(Number((await db("comm_identity_links").count("* as n").first()).n), 1);
  assert.ok((await db("comm_access_grants").where({ identity_id: f.target, lead_id: f.lead }).first()).link_id);
  assert.equal(await db("comm_access_grants").where({ identity_id: f.source, lead_id: f.otherLead }).first(), undefined);
  const card = await f.service.audienceContact(f.actor, f.sourceContact);
  assert.equal(card.identities.length, 2);
  assert.equal(card.links.length, 1);
  assert.equal("hash" in card.links[0], false);
  // Staff history is unified for the authorized lead, not the unrelated case.
  const [targetCase] = await db("comm_conversations").where({ thread_id: f.targetThread, lead_id: f.lead });
  await db("comm_messages").insert({ thread_id: f.targetThread, conversation_id: targetCase.id,
    direction: "in", text: "From MAX", external_id: "max-history" });
  const history = await f.service.messages(f.actor, f.sourceThread, { conversation_id: f.conversation });
  assert.equal(history.at(-1).text, "From MAX");
  assert.equal(history.at(-1).platform, "max");
});

test("link confirmation rechecks closed case, expiry and connection scope", async (t) => {
  const f = await fixture(t);
  const { db } = f;
  const invitation = await f.issue();
  await f.post(f.target, `/start ${invitation.token}`, "message");
  await f.post(f.target, invitation.targetButton);
  await db("leads").where({ id: f.lead }).update({ status: "closed" });
  await f.post(f.source, invitation.sourceButton);
  assert.equal(Number((await db("comm_identity_links").count("* as n").first()).n), 0);
  await db("leads").where({ id: f.lead }).update({ status: "in_progress" });
  await db("comm_link_tokens").where({ hash: invitation.hash }).update({ expires_at: new Date(0) });
  await f.post(f.source, invitation.sourceButton);
  assert.equal(Number((await db("comm_identity_links").count("* as n").first()).n), 0);
  const otherStore = randomUUID();
  await db("store_locations").insert({ id: otherStore });
  await db("comm_connections").where({ id: f.targetConnection }).update({ store_id: otherStore });
  await assert.rejects(f.issue(), /LINK_UNAVAILABLE/);
});

test("damaged start token never becomes attribution; full fallback command requires both confirmations", async (t) => {
  const f = await fixture(t);
  const invite = await f.issue();
  const raw = invite.token.slice(5);
  const damaged = raw.slice(0, 33) + raw.slice(34);
  assert.equal(damaged.length, 42);
  await f.post(f.target, `/start ${damaged}`, "message");
  const badEvent = await f.db("comm_inbound").whereRaw("event->>'text' = ?", [`/start ${damaged}`]).first();
  assert.equal(badEvent.result.result, "invalid_link");
  assert.equal((await f.db("comm_identities").where({ id: f.target }).first()).source, null);
  assert.equal((await f.db("comm_link_tokens").where({ hash: invite.hash }).first()).state, "pending");
  await f.post(f.target, `/start ${invite.token.slice(0, -1)}`, "message");
  assert.equal((await f.db("comm_link_tokens").where({ hash: invite.hash }).first()).state, "pending");
  await f.post(f.target, `/link ${invite.token}`, "message");
  assert.equal((await f.db("comm_link_tokens").where({ hash: invite.hash }).first()).state, "target_confirm");
  assert.equal((await f.db("comm_identities").where({ id: f.target }).first()).contact_id, f.targetContact);
  await f.post(f.target, invite.targetButton);
  await f.post(f.source, invite.sourceButton);
  assert.equal((await f.db("comm_identities").where({ id: f.target }).first()).contact_id, f.sourceContact);
});

test("unlink revokes shared access, cancels queued reply, and preserves frequency and refusal", async (t) => {
  const f = await fixture(t);
  const { db } = f;
  await f.link();
  const shared = await db("comm_conversations").where({ thread_id: f.targetThread, lead_id: f.lead }).first();
  const outboxId = randomUUID();
  await db("comm_outbox").insert({ id: outboxId, connection_id: f.targetConnection,
    thread_id: f.targetThread, conversation_id: shared.id, identity_id: f.target, purpose: "service", dedupe_key: outboxId });
  await db("comm_operations").insert({ outbox_id: outboxId, method: "text", payload: { text: "private reply" } });
  const marketing = randomUUID();
  await db("comm_outbox").insert({ id: marketing, connection_id: f.sourceConnection, contact_id: f.sourceContact,
    identity_id: f.source, purpose: "marketing", state: "accepted", dedupe_key: marketing });
  await db("comm_frequency").insert({ contact_id: f.sourceContact, outbox_id: marketing });
  await f.post(f.source, "account:stop");
  await f.post(f.target, "account:prefer");
  assert.equal((await db("comm_identities").where({ id: f.target }).first()).preferred, true);
  assert.equal((await db("comm_identities").where({ id: f.source }).first()).preferred, false);
  const card = await f.service.audienceContact(f.actor, f.sourceContact);
  const input = { key: randomUUID(), expected_version: card.contact.version, identity_id: f.target, action: "unlink" };
  const result = await f.service.contactAction(f.actor, f.sourceContact, input);
  assert.deepEqual(await f.service.contactAction(f.actor, f.sourceContact, input), result);
  assert.ok(result.detached_contact_id);
  assert.equal((await db("comm_contacts").where({ id: result.detached_contact_id }).first()).marketing_opt_out, true);
  assert.equal(await frequencyCount(db, result.detached_contact_id), 1);
  assert.ok((await db("comm_access_grants").where({ identity_id: f.target, lead_id: f.lead }).first()).revoked_at);
  assert.equal((await db("comm_access_grants").where({ identity_id: f.target, lead_id: f.otherLead }).first()).revoked_at, null);
  assert.equal((await db("comm_outbox").where({ id: outboxId }).first()).state, "cancelled");
  assert.equal((await db("comm_threads").where({ id: f.targetThread }).first()).selected_conversation_id, null);
  assert.equal(await db("comm_access_grants").where({ identity_id: f.source, lead_id: f.otherLead }).first(), undefined);
  await assert.rejects(f.service.contactAction(f.actor, f.sourceContact, { ...input, key: randomUUID() }), /STALE_CONTACT/);
});

test("contact mutations deny cross-store staff and uncertain operations", async (t) => {
  const f = await fixture(t);
  await f.link();
  const foreign = randomUUID();
  await f.db("directus_users").insert({ id: foreign, status: "active" });
  const card = await f.service.audienceContact(f.actor, f.sourceContact);
  const input = { key: randomUUID(), expected_version: card.contact.version, identity_id: f.target, action: "unlink" };
  await assert.rejects(f.service.contactAction({ user: foreign }, f.sourceContact, input), /FORBIDDEN/);
  await f.db("comm_outbox").insert({ connection_id: f.targetConnection, identity_id: f.target,
    purpose: "service", state: "uncertain", dedupe_key: randomUUID() });
  await assert.rejects(f.service.contactAction(f.actor, f.sourceContact, input), /IDENTITY_DELIVERY_BUSY/);
});

test("target cannot pull an existing account group or change destination after invitation", async (t) => {
  const f = await fixture(t);
  const extra = randomUUID();
  await f.db("comm_identities").insert({ id: extra, contact_id: f.targetContact,
    connection_id: f.sourceConnection, external_user_id: "another-person" });
  const invite = await f.issue();
  await f.post(f.target, `/start ${invite.token}`, "message");
  assert.equal((await f.db("comm_link_tokens").where({ hash: invite.hash }).first()).state, "pending");
  assert.equal((await f.db("comm_identities").where({ id: extra }).first()).contact_id, f.targetContact);
  await f.db("comm_identities").where({ id: extra }).delete();
  await f.post(f.target, `/start ${invite.token}`, "message");
  await f.post(f.target, invite.targetButton);
  await f.db("comm_connections").where({ id: f.targetConnection }).update({ enabled: false });
  await f.post(f.source, invite.sourceButton);
  assert.equal(Number((await f.db("comm_identity_links").count("* as n").first()).n), 0);
});

test("merging and relinking cannot reset refusal or double count shared frequency", async (t) => {
  const f = await fixture(t);
  for (const contactId of [f.sourceContact, f.targetContact]) {
    const id = randomUUID();
    await f.db("comm_outbox").insert({ id, connection_id: f.sourceConnection, purpose: "marketing",
      state: "accepted", contact_id: contactId, dedupe_key: id });
    await f.db("comm_frequency").insert({ contact_id: contactId, outbox_id: id });
  }
  await f.db("comm_contacts").where({ id: f.targetContact }).update({ marketing_opt_out: true });
  await f.link();
  assert.equal(await frequencyCount(f.db, f.sourceContact), 2);
  assert.equal((await f.db("comm_contacts").where({ id: f.sourceContact }).first()).marketing_opt_out, true);
  const card = await f.service.audienceContact(f.actor, f.sourceContact);
  const result = await f.service.contactAction(f.actor, f.sourceContact, { key: randomUUID(),
    expected_version: card.contact.version, identity_id: f.target, action: "unlink" });
  assert.equal(await frequencyCount(f.db, result.detached_contact_id), 2);
  await f.link();
  assert.equal(await frequencyCount(f.db, f.sourceContact), 2, "one reservation seen via carryover and owner is counted once");
  assert.equal((await f.db("comm_contacts").where({ id: f.sourceContact }).first()).marketing_opt_out, true);
});
