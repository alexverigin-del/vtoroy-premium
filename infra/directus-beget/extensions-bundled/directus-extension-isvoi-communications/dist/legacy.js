import { createRequire } from "node:module"; const require = createRequire(import.meta.url);

// packages/communications/src/legacy.ts
import { randomBytes as randomBytes2 } from "node:crypto";

// packages/communications/src/delivery.ts
import { randomUUID } from "node:crypto";

// packages/communications/src/policy.ts
import { createHash, timingSafeEqual } from "node:crypto";
var MAX_FILE_BYTES = 2e7;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var CommunicationError = class extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
  code;
  status;
};
var fail = (code, status = 400) => {
  throw new CommunicationError(code, status);
};
var flag = (value) => value === true || value === "true";
function identifier(value) {
  if (typeof value !== "string" && typeof value !== "number" || typeof value === "number" && !Number.isSafeInteger(value))
    return fail("INVALID_EXTERNAL_ID");
  const id = String(value);
  if (!/^-?[0-9A-Za-z_.:-]{1,180}$/.test(id)) return fail("INVALID_EXTERNAL_ID");
  return id;
}
var digest = (value) => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function validText(value, limit = 3500) {
  if (typeof value !== "string" || value.length > limit || value.includes("\0"))
    return fail("INVALID_TEXT");
  return value.trim();
}
function nextHandling(current, next) {
  const edges = {
    bot: ["queued", "agent", "closed"],
    queued: ["agent", "closed"],
    agent: ["queued", "waiting", "closed"],
    waiting: ["queued", "agent", "closed"],
    closed: []
  };
  if (next === current) return current;
  if (!edges[current]?.includes(next)) return fail("INVALID_HANDLING_TRANSITION", 409);
  return next;
}
function marketingWindow(now) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(now)
  );
  if (hour >= 10 && hour < 20) return { allowed: true, next: now };
  const next = new Date(now);
  next.setUTCHours(7, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return { allowed: false, next };
}

// packages/communications/src/delivery.ts
function createDelivery(context, service) {
  const db = context.database;
  async function worker(trx, connectionId, user) {
    if (typeof user !== "string" || !UUID.test(user)) return fail("FORBIDDEN", 403);
    const connection = await trx("comm_connections").where({ id: connectionId, worker_user_id: user, enabled: true }).forUpdate().first();
    if (!connection) return fail("FORBIDDEN", 403);
    const u = await trx("directus_users").where({ id: user, status: "active" }).first();
    if (!u) return fail("FORBIDDEN", 403);
    const accountability = await service.userAccountability(trx, user);
    const admin = await trx("directus_access as a").join("directus_policies as p", "p.id", "a.policy").where("p.admin_access", true).where((q) => q.where("a.user", user).orWhereIn("a.role", accountability.roles)).first();
    if (admin) return fail("ADMIN_WORKER_FORBIDDEN", 403);
    return connection;
  }
  async function summary(trx, outboxId) {
    const ops = await trx("comm_operations").where({ outbox_id: outboxId });
    let state = "sending";
    if (ops.some((o) => o.state === "uncertain")) state = "uncertain";
    else if (ops.every((o) => o.state === "accepted")) state = "accepted";
    else if (ops.some((o) => o.state === "failed" || o.state === "cancelled"))
      state = ops.some((o) => o.state === "accepted") ? "partial" : "failed";
    else if (ops.every((o) => o.state === "pending")) state = "pending";
    await trx("comm_outbox").where({ id: outboxId }).update({ state, ...state === "accepted" ? { accepted_at: trx.fn.now() } : {} });
    return state;
  }
  async function next(connectionId, user, allowedMethods) {
    if (!flag(context.env.ISVOI_COMMUNICATIONS_ENABLED))
      return fail("COMMUNICATIONS_DISABLED", 503);
    return db.transaction(async (trx) => {
      const n = await worker(trx, connectionId, user);
      const runtime = await trx("comm_runtime").where({ id: 1 }).first();
      if (!runtime?.active || !runtime.sending_enabled || runtime.recovery_hold) return null;
      const expired = await trx("comm_operations as o").join("comm_outbox as b", "b.id", "o.outbox_id").where("b.connection_id", n.id).where("o.state", "in_flight").andWhere("o.lease_until", "<", trx.fn.now()).select("o.id", "o.outbox_id");
      for (const o of expired) {
        await trx("comm_operations").where({ id: o.id }).update({ state: "uncertain", error_code: "LEASE_EXPIRED_UNKNOWN" });
        await summary(trx, o.outbox_id);
      }
      if (new Date(n.send_after) > /* @__PURE__ */ new Date()) return null;
      const jobs = await trx("comm_outbox as b").where("b.connection_id", n.id).whereIn("b.state", ["pending", "sending"]).andWhere("b.due_at", "<=", trx.fn.now()).whereRaw(
        "NOT EXISTS (SELECT 1 FROM comm_outbox older WHERE older.thread_id=b.thread_id AND (older.created_at,older.id)<(b.created_at,b.id) AND older.state IN ('pending','sending','uncertain','partial'))"
      ).orderByRaw("CASE WHEN b.purpose IN ('service','staff') THEN 0 ELSE 1 END").orderBy("b.created_at").limit(100).select("b.*").forUpdate().skipLocked();
      for (const b of jobs) {
        const reject = async (code) => {
          await trx("comm_outbox").where({ id: b.id }).update({ state: "suppressed", error_code: code });
          await trx("comm_operations").where({ outbox_id: b.id, state: "pending" }).update({ state: "cancelled", error_code: code });
        };
        if (b.expires_at && new Date(b.expires_at) <= /* @__PURE__ */ new Date()) {
          await reject("EXPIRED");
          continue;
        }
        if (b.identity_id) {
          const identity = await trx("comm_identities").where({ id: b.identity_id }).first();
          if (identity.availability === "blocked") {
            await reject("RECIPIENT_UNAVAILABLE");
            continue;
          }
          if (b.thread_id && !await trx("comm_threads").where({ id: b.thread_id, identity_id: b.identity_id, connection_id: n.id }).first()) {
            await reject("RECIPIENT_CHANGED");
            continue;
          }
        }
        if (b.created_by && b.purpose === "service") {
          try {
            const { lead } = await service.permitted(
              trx,
              { user: b.created_by },
              b.conversation_id
            );
            if (lead.assigned_to !== b.created_by || !["new", "in_progress", "waiting"].includes(lead.status)) {
              await reject("ASSIGNMENT_CHANGED");
              continue;
            }
          } catch {
            await reject("AUTHOR_ACCESS_REVOKED");
            continue;
          }
        }
        if (b.purpose === "marketing") {
          const campaign = await trx("comm_campaigns").where({ id: b.campaign_id }).first();
          const identity = await trx("comm_identities").where({ id: b.identity_id }).first();
          if (!n.marketing_enabled || !campaign || !["approved", "sending"].includes(campaign.state) || identity.contact_id !== b.contact_id || identity.is_test !== campaign.is_test) {
            await reject("CAMPAIGN_NOT_ALLOWED");
            continue;
          }
          if (!await trx("comm_subscriptions").where({ identity_id: b.identity_id, topic_key: campaign.topic_key, consent: true }).first()) {
            await reject("CONSENT_WITHDRAWN");
            continue;
          }
          const window = marketingWindow(/* @__PURE__ */ new Date());
          if (!window.allowed) {
            await trx("comm_outbox").where({ id: b.id }).update({ due_at: window.next });
            continue;
          }
          await trx("comm_contacts").where({ id: b.contact_id }).forUpdate().first();
          if (!await trx("comm_frequency").where({ outbox_id: b.id }).first()) {
            const count = await trx("comm_frequency").where({ contact_id: b.contact_id }).whereNull("released_at").andWhere("reserved_at", ">", trx.raw("now()-interval '7 days'")).count("* as count").first();
            if (Number(count.count) >= 2) {
              await reject("FREQUENCY_LIMIT");
              continue;
            }
            await trx("comm_frequency").insert({ contact_id: b.contact_id, outbox_id: b.id });
          }
        }
        const ops = await trx("comm_operations").where({ outbox_id: b.id }).orderBy("position").forUpdate();
        const op = ops.find((o) => o.state !== "accepted");
        if (!op || op.state !== "pending") continue;
        if (allowedMethods && !allowedMethods.includes(op.method)) continue;
        let payload = { ...op.payload };
        if (payload.card_id) {
          const card = await trx("comm_staff_cards").where({ id: payload.card_id, connection_id: n.id }).first();
          if (!card) {
            await reject("STAFF_CARD_MISSING");
            continue;
          }
          if (op.method !== "topic" && !card.topic_id) continue;
          if (op.method !== "topic") payload.message_thread_id = Number(card.topic_id);
          for (const key of ["card_id", "is_card", "draft_id", "draft_stage", "conversation_id"])
            delete payload[key];
        }
        const attemptId = randomUUID(), leaseVersion = op.lease_version + 1;
        await trx("comm_operations").where({ id: op.id }).update({
          state: "in_flight",
          attempt_id: attemptId,
          lease_version: leaseVersion,
          lease_until: new Date(Date.now() + 9e4),
          worker_id: user,
          attempts: op.attempts + 1
        });
        await trx("comm_attempts").insert({
          id: attemptId,
          operation_id: op.id,
          lease_version: leaseVersion
        });
        await trx("comm_outbox").where({ id: b.id }).update({ state: "sending" });
        await trx("comm_connections").where({ id: n.id }).update({ send_after: new Date(Date.now() + (b.purpose === "marketing" ? 3200 : 1100)) });
        return {
          ...op,
          payload,
          state: "in_flight",
          attempt_id: attemptId,
          lease_version: leaseVersion,
          connection_id: n.id,
          platform: n.platform
        };
      }
      return null;
    });
  }
  async function complete(connectionId, user, input) {
    if (!UUID.test(input?.attempt_id || "")) return fail("INVALID_ATTEMPT");
    const outcome = input.outcome;
    if (!outcome || !["accepted", "rate_limited", "rejected", "blocked", "connection_error", "unknown"].includes(
      outcome.type
    ))
      return fail("INVALID_OUTCOME");
    if (outcome.type === "accepted" && (typeof outcome.externalId !== "string" || !outcome.externalId || outcome.externalId.length > 200))
      return fail("INVALID_EXTERNAL_ID");
    return db.transaction(async (trx) => {
      const n = await worker(trx, connectionId, user);
      const attempt = await trx("comm_attempts").where({ id: input.attempt_id }).forUpdate().first();
      if (!attempt) return fail("NOT_FOUND", 404);
      const op = await trx("comm_operations").where({ id: attempt.operation_id }).forUpdate().first();
      const b = await trx("comm_outbox").where({ id: op.outbox_id, connection_id: n.id }).forUpdate().first();
      if (!b || op.worker_id !== user || attempt.lease_version !== input.lease_version)
        return fail("FORBIDDEN", 403);
      if (attempt.completed_at) return { state: b.state, replayed: true };
      if (op.attempt_id !== attempt.id) return fail("SUPERSEDED_ATTEMPT", 409);
      await trx("comm_attempts").where({ id: attempt.id }).update({
        completed_at: trx.fn.now(),
        outcome,
        late: new Date(op.lease_until) < /* @__PURE__ */ new Date()
      });
      let state = "failed", error = "code" in outcome ? String(outcome.code).slice(0, 100) : null;
      if (outcome.type === "accepted") {
        state = "accepted";
        await trx("comm_connections").where({ id: n.id }).update({ last_sent_at: trx.fn.now(), error_code: null });
      } else if (outcome.type === "unknown") state = "uncertain";
      else if (outcome.type === "rate_limited") {
        state = "pending";
        const due = new Date(
          Date.now() + Math.max(1, Math.min(86400, Number(outcome.retryAfter) || 60)) * 1e3
        );
        await trx("comm_outbox").where({ id: b.id }).update({ due_at: due });
        await trx("comm_connections").where({ id: n.id }).update({ send_after: due });
      } else if (outcome.type === "connection_error")
        await trx("comm_connections").where({ id: n.id }).update({ enabled: false, error_code: error });
      else if (outcome.type === "blocked" && b.identity_id)
        await trx("comm_identities").where({ id: b.identity_id }).update({ availability: "blocked", availability_at: trx.fn.now() });
      await trx("comm_operations").where({ id: op.id }).update({
        state,
        error_code: error,
        external_id: outcome.type === "accepted" ? outcome.externalId : null
      });
      if (outcome.type === "accepted" && op.payload.card_id) {
        if (op.method === "topic")
          await trx("comm_staff_cards").where({ id: op.payload.card_id }).update({ topic_id: outcome.externalId });
        else if (op.payload.is_card)
          await trx("comm_staff_cards").where({ id: op.payload.card_id }).update({ message_id: outcome.externalId });
        if (op.payload.draft_id && ["prompt", "preview"].includes(op.payload.draft_stage))
          await trx("comm_staff_drafts").where({ id: op.payload.draft_id }).update({ [`${op.payload.draft_stage}_message_id`]: outcome.externalId });
      }
      const result = await summary(trx, b.id);
      if (result === "accepted" && b.message_id && b.purpose === "service") {
        const message = await trx("comm_messages").where({ id: b.message_id }).first();
        await trx("comm_conversations").where({ id: b.conversation_id }).update({
          last_agent_reply_at: trx.fn.now(),
          awaiting_since: trx.raw(
            "CASE WHEN last_inbound_at<=? THEN NULL ELSE awaiting_since END",
            [message.occurred_at]
          )
        });
      }
      await service.event(trx, {
        connection_id: n.id,
        identity_id: b.identity_id,
        kind: "delivery_result",
        dedupe_key: `attempt:${attempt.id}`,
        facts: { outbox: b.id, outcome: outcome.type },
        is_test: n.mode === "test"
      });
      return { state: result };
    });
  }
  return { worker, next, complete };
}

// packages/communications/src/service.ts
import { randomBytes, randomUUID as randomUUID2 } from "node:crypto";

// packages/communications/src/normalize.ts
var date = (value, milliseconds = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fail("EVENT_TIME_REQUIRED");
  return new Date(milliseconds ? n : n * 1e3).toISOString();
};
var media = (kind, value) => ({
  kind,
  externalId: identifier(value.file_id),
  name: String(value.file_name || kind).slice(0, 200),
  mime: String(value.mime_type || "application/octet-stream"),
  size: Number.isSafeInteger(value.file_size) && value.file_size >= 0 ? value.file_size : null
});
function normalize(platform, raw) {
  if (!raw || typeof raw !== "object") return fail("INVALID_EVENT");
  if (platform === "telegram") {
    const id = identifier(raw.update_id), member = raw.my_chat_member;
    if (member?.chat?.type === "private")
      return {
        id,
        platform,
        actorId: identifier(member.chat.id),
        peerId: identifier(member.chat.id),
        kind: "availability",
        occurredAt: date(member.date),
        text: "",
        attachments: [],
        availability: member.new_chat_member?.status === "kicked" ? "blocked" : "allowed"
      };
    const cb = raw.callback_query, m2 = raw.edited_message || raw.message || cb?.message;
    if (m2?.chat?.type === "supergroup")
      return {
        id,
        platform,
        kind: "staff",
        actorId: identifier(cb?.from?.id ?? m2.from?.id),
        peerId: identifier(m2.chat.id),
        occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
        text: "",
        attachments: [],
        raw
      };
    if (!m2 || m2.chat?.type !== "private") return fail("NON_PRIVATE_EVENT");
    const attachments2 = [];
    if (m2.photo?.length) attachments2.push(media("image", m2.photo.at(-1)));
    for (const kind2 of ["voice", "audio", "video", "document"])
      if (m2[kind2]) attachments2.push(media(kind2, m2[kind2]));
    if (m2.video_note) attachments2.push(media("video", m2.video_note));
    if (cb?.from?.is_bot || !cb && m2.from?.is_bot || String(cb?.from?.id ?? m2.from?.id) !== String(m2.chat.id))
      return fail("INVALID_PRIVATE_ACTOR");
    return {
      id,
      platform,
      actorId: identifier(cb?.from?.id ?? m2.from?.id),
      peerId: identifier(m2.chat.id),
      kind: cb ? "callback" : raw.edited_message ? "edited" : m2.sticker || m2.contact || m2.location ? "unsupported" : "message",
      occurredAt: cb ? (/* @__PURE__ */ new Date()).toISOString() : date(m2.edit_date ?? m2.date),
      externalMessageId: identifier(m2.message_id),
      text: String(m2.text ?? m2.caption ?? ""),
      attachments: attachments2,
      albumId: m2.media_group_id ? identifier(m2.media_group_id) : void 0,
      callbackId: cb ? identifier(cb.id) : void 0,
      callbackData: cb?.data
    };
  }
  if (platform === "max") {
    const m2 = raw.message, u = raw.user || raw.callback?.user || m2?.sender;
    const actorId2 = identifier(u?.user_id), peerId2 = identifier(m2?.recipient?.chat_id ?? raw.chat_id ?? actorId2);
    if (m2?.recipient?.chat_type && m2.recipient.chat_type !== "dialog")
      return fail("NON_PRIVATE_EVENT");
    const kind2 = raw.update_type === "bot_stopped" ? "availability" : raw.update_type === "bot_started" ? "started" : raw.update_type === "message_callback" ? "callback" : raw.update_type === "message_edited" ? "edited" : raw.update_type === "message_created" ? "message" : "unsupported";
    const occurredAt = date(raw.timestamp, true);
    const id = String(
      raw.event_id ?? `${raw.update_type}:${m2?.body?.mid ?? raw.callback?.callback_id ?? actorId2}:${raw.timestamp}`
    );
    const attachments2 = (m2?.body?.attachments || []).filter((a) => ["image", "video", "audio", "file"].includes(a.type)).map((a) => ({
      kind: { image: "image", video: "video", audio: "audio", file: "document" }[a.type],
      externalId: String(a.payload?.token ?? a.payload?.video_id ?? digest(canonical(a.payload))),
      url: a.payload?.url,
      name: String(a.filename || a.type),
      mime: String(a.mime_type || "application/octet-stream"),
      size: Number.isSafeInteger(a.size) ? a.size : null
    }));
    return {
      id,
      platform,
      actorId: actorId2,
      peerId: peerId2,
      kind: kind2,
      occurredAt,
      externalMessageId: m2?.body?.mid ? identifier(m2.body.mid) : void 0,
      text: String(m2?.body?.text ?? ""),
      attachments: attachments2,
      callbackId: raw.callback?.callback_id,
      callbackData: raw.callback?.payload,
      availability: kind2 === "availability" ? "blocked" : kind2 === "started" ? "allowed" : void 0
    };
  }
  const m = raw.object?.message || raw.object, actorId = identifier(m?.from_id ?? m?.user_id), peerId = identifier(m?.peer_id ?? actorId);
  if (Number(peerId) >= 2e9 || Number(actorId) <= 0) return fail("NON_PRIVATE_EVENT");
  const kind = raw.type === "message_allow" || raw.type === "message_deny" ? "availability" : raw.type === "message_event" ? "callback" : raw.type === "message_edit" ? "edited" : raw.type === "message_new" ? "message" : "unsupported";
  if (!raw.event_id) return fail("EVENT_ID_REQUIRED");
  const attachments = (m.attachments || []).map((a) => {
    const v = a[a.type] || {};
    const kind2 = {
      photo: "image",
      audio_message: "voice",
      audio: "audio",
      video: "video",
      doc: "document"
    }[a.type];
    if (!kind2) return null;
    return {
      kind: kind2,
      externalId: `${a.type}${identifier(v.owner_id)}_${identifier(v.id)}${v.access_key ? "_" + v.access_key : ""}`,
      url: v.url ?? v.link_mp3 ?? v.sizes?.at(-1)?.url,
      name: String(v.title || kind2),
      mime: "application/octet-stream",
      size: Number.isSafeInteger(v.size) ? v.size : null
    };
  }).filter(Boolean);
  return {
    id: identifier(raw.event_id),
    platform,
    actorId,
    peerId,
    kind,
    occurredAt: m.date ? date(m.date) : (/* @__PURE__ */ new Date()).toISOString(),
    externalMessageId: m.id ? identifier(m.id) : m.conversation_message_id ? identifier(m.conversation_message_id) : void 0,
    text: String(m.text || ""),
    attachments,
    callbackId: m.event_id,
    callbackData: typeof m.payload === "string" ? m.payload : m.payload?.action,
    availability: kind === "availability" ? raw.type === "message_deny" ? "blocked" : "allowed" : void 0
  };
}

// packages/communications/src/service.ts
var activeLead = (lead) => ["new", "in_progress", "waiting"].includes(lead?.status);
var incomingKinds = /* @__PURE__ */ new Set([
  "message",
  "edited",
  "callback",
  "availability",
  "started",
  "unsupported",
  "staff"
]);
function isStoredEvent(value) {
  if (!value || typeof value !== "object") return false;
  const event = value;
  return typeof event.id === "string" && typeof event.platform === "string" && typeof event.actorId === "string" && typeof event.peerId === "string" && typeof event.kind === "string" && incomingKinds.has(event.kind) && typeof event.occurredAt === "string" && !Number.isNaN(Date.parse(event.occurredAt)) && typeof event.text === "string" && Array.isArray(event.attachments);
}
var menu = [
  ["\u041A\u0443\u043F\u0438\u0442\u044C / \u043F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C", "kind:selection"],
  ["\u041F\u0440\u043E\u0434\u0430\u0442\u044C / \u043E\u0431\u043C\u0435\u043D\u044F\u0442\u044C", "kind:trade"],
  ["\u0417\u0430\u0434\u0430\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441", "kind:support"],
  ["\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", "dialogs"],
  ["\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438", "news"]
];
function keyboard(platform, rows) {
  if (platform === "telegram")
    return {
      reply_markup: {
        inline_keyboard: rows.map(([text, data]) => [{ text, callback_data: data }])
      }
    };
  if (platform === "max")
    return {
      attachments: [
        {
          type: "inline_keyboard",
          payload: {
            buttons: rows.map(([text, data]) => [{ type: "callback", text, payload: data }])
          }
        }
      ]
    };
  return {
    keyboard: JSON.stringify({
      inline: true,
      buttons: rows.map(([label, action]) => [
        {
          action: { type: "callback", label, payload: JSON.stringify({ action }) },
          color: "secondary"
        }
      ])
    })
  };
}
function createService(context) {
  const { database: db, services, getSchema, env } = context;
  const enabled = () => {
    if (!flag(env.ISVOI_COMMUNICATIONS_ENABLED)) fail("COMMUNICATIONS_DISABLED", 503);
  };
  let staffProcessor;
  const setStaffProcessor = (fn) => {
    staffProcessor = fn;
  };
  let staffNotifier;
  const setStaffNotifier = (fn) => {
    staffNotifier = fn;
  };
  async function userAccountability(trx, id) {
    const user = await trx("directus_users").where({ id, status: "active" }).first();
    if (!user) return fail("FORBIDDEN", 403);
    const roles = [];
    let role = user.role;
    while (role) {
      if (roles.includes(role) || roles.length > 30) fail("INVALID_ROLE_TREE", 403);
      roles.push(role);
      role = (await trx("directus_roles").where({ id: role }).first())?.parent;
    }
    return { user: id, role: user.role, roles, admin: false, app: true };
  }
  async function actor(userId) {
    enabled();
    if (typeof userId !== "string" || !UUID.test(userId)) return fail("FORBIDDEN", 403);
    const accountability = await userAccountability(db, userId);
    if (!await db("comm_staff").where({ user_id: userId, enabled: true }).first())
      return fail("FORBIDDEN", 403);
    return { user: userId, accountability };
  }
  async function itemService(trx, collection, accountability) {
    return new services.ItemsService(collection, {
      knex: trx,
      schema: await getSchema(),
      accountability
    });
  }
  async function permitted(trx, a, conversationId, manage = false) {
    if (!UUID.test(conversationId || "")) return fail("INVALID_CONVERSATION");
    const c = await trx("comm_conversations as c").join("comm_threads as t", "t.id", "c.thread_id").join("comm_connections as n", "n.id", "t.connection_id").where("c.id", conversationId).select("c.*", "t.identity_id", "t.connection_id", "n.store_id").first();
    if (!c) return fail("NOT_FOUND", 404);
    const staff = await trx("comm_staff").where({ user_id: a.user, store_id: c.store_id, enabled: true }).first();
    if (!staff || manage && !staff.can_manage) return fail("FORBIDDEN", 403);
    const accountability = await userAccountability(trx, a.user);
    const service = await itemService(trx, "leads", accountability);
    const lead = await service.readOne(c.lead_id, {
      fields: [
        "id",
        "status",
        "assigned_to",
        "store_location_id",
        "is_test",
        "reference_code",
        "kind"
      ]
    });
    if (lead.store_location_id && lead.store_location_id !== c.store_id)
      return fail("FORBIDDEN", 403);
    return { c, lead, service, staff, accountability };
  }
  async function event(trx, values) {
    await trx("comm_events").insert(values).onConflict("dedupe_key").ignore();
  }
  async function enqueue(trx, connection, thread, text, values = {}, rows = []) {
    const id = randomUUID2();
    const [outbox] = await trx("comm_outbox").insert({
      id,
      connection_id: connection.id,
      thread_id: thread.id,
      identity_id: thread.identity_id,
      purpose: "service",
      dedupe_key: `notice:${id}`,
      ...values
    }).returning("*");
    const payload = connection.platform === "telegram" ? { chat_id: thread.external_peer_id, text } : connection.platform === "max" ? { chat_id: thread.external_peer_id, text } : {
      peer_id: thread.external_peer_id,
      message: text,
      random_id: parseInt(digest(id).slice(0, 7), 16)
    };
    Object.assign(payload, keyboard(connection.platform, rows));
    await trx("comm_operations").insert({ outbox_id: outbox.id, method: "text", payload });
    return outbox;
  }
  async function ingest(connectionId, raw) {
    enabled();
    const n = await db("comm_connections").where({ id: connectionId, enabled: true }).first();
    if (!n) return fail("CONNECTION_DISABLED", 403);
    let e;
    try {
      e = normalize(n.platform, raw);
    } catch (error) {
      if (n.platform !== "telegram" || error.code !== "NON_PRIVATE_EVENT") throw error;
      const id = identifier(raw?.update_id);
      await db("comm_inbound").insert({
        connection_id: n.id,
        external_id: id,
        event: null,
        state: "done",
        error_code: "NON_PRIVATE_EVENT",
        processed_at: db.fn.now()
      }).onConflict(["connection_id", "external_id"]).ignore();
      return { accepted: true, id: null };
    }
    if (e.kind !== "staff" && n.mode === "test" && !(n.settings?.pilot_user_ids || []).map(String).includes(e.actorId)) {
      await db("comm_inbound").insert({
        connection_id: n.id,
        external_id: e.id,
        event: null,
        state: "done",
        error_code: "PILOT_ONLY",
        processed_at: db.fn.now()
      }).onConflict(["connection_id", "external_id"]).ignore();
      return { accepted: true, id: null };
    }
    const [row] = await db("comm_inbound").insert({ connection_id: n.id, external_id: e.id, event: e }).onConflict(["connection_id", "external_id"]).ignore().returning("id");
    await db("comm_connections").where({ id: n.id }).update({ last_received_at: db.fn.now() });
    return { accepted: true, id: row?.id || null };
  }
  async function ensureIdentity(trx, n, e) {
    let identity = await trx("comm_identities").where({ connection_id: n.id, external_user_id: e.actorId }).first();
    if (!identity) {
      const [contact] = await trx("comm_contacts").insert({}).returning("id");
      [identity] = await trx("comm_identities").insert({
        contact_id: contact.id,
        connection_id: n.id,
        external_user_id: e.actorId,
        first_seen_at: e.occurredAt,
        is_test: n.mode === "test"
      }).returning("*");
      await event(trx, {
        connection_id: n.id,
        identity_id: identity.id,
        kind: "first_seen",
        dedupe_key: `identity:${identity.id}`,
        occurred_at: e.occurredAt,
        is_test: identity.is_test
      });
    }
    let thread = await trx("comm_threads").where({ connection_id: n.id, external_peer_id: e.peerId }).first();
    if (!thread)
      [thread] = await trx("comm_threads").insert({ connection_id: n.id, identity_id: identity.id, external_peer_id: e.peerId }).returning("*");
    if (thread.identity_id !== identity.id) return fail("THREAD_IDENTITY_CONFLICT", 409);
    return { identity, thread };
  }
  async function makeLead(trx, n, thread, e, kind = "support") {
    if (!n.service_user_id) return fail("INTAKE_NOT_CONFIGURED", 503);
    const accountability = await userAccountability(trx, n.service_user_id);
    const service = await itemService(trx, "leads", accountability);
    const id = await service.createOne({
      kind,
      status: "new",
      contact: `${n.platform}:${e.actorId}`,
      contact_channel: n.platform,
      message: e.text,
      source: n.platform,
      source_path: `bot:${n.external_id}`,
      store_location_id: n.store_id,
      is_test: n.mode === "test"
    });
    const [c] = await trx("comm_conversations").insert({ lead_id: id, thread_id: thread.id }).returning("*");
    await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: c.id, pending_kind: null });
    await trx("comm_access_grants").insert({ identity_id: thread.identity_id, lead_id: id }).onConflict(["identity_id", "lead_id"]).ignore();
    await event(trx, {
      connection_id: n.id,
      identity_id: thread.identity_id,
      lead_id: id,
      kind: "lead_created",
      dedupe_key: `lead:${id}`,
      is_test: n.mode === "test"
    });
    return c;
  }
  async function subscriptions(trx, n, thread, selected, source) {
    const settings = n.settings || {};
    if (settings.subscriptions_pilot_only) {
      const i = await trx("comm_identities").where({ id: thread.identity_id }).first();
      if (!(settings.pilot_user_ids || []).map(String).includes(i.external_user_id))
        return enqueue(
          trx,
          n,
          thread,
          "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C \u0437\u0430\u043A\u0440\u044B\u0442\u043E\u0433\u043E \u043F\u0438\u043B\u043E\u0442\u0430."
        );
    }
    if (!settings.consent_version || !settings.consent_text || !settings.subscriptions_enabled)
      return enqueue(
        trx,
        n,
        thread,
        "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B. \u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u043A \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442.",
        {},
        menu
      );
    if (selected) {
      const topics2 = await trx("comm_topics").where({ active: true }).orderBy("sort");
      for (const topic of topics2) {
        const consent = selected.includes(topic.key);
        const old = await trx("comm_subscriptions").where({ identity_id: thread.identity_id, topic_key: topic.key }).first();
        if (Boolean(old?.consent) === consent) continue;
        await trx("comm_subscriptions").insert({
          identity_id: thread.identity_id,
          topic_key: topic.key,
          consent,
          consent_version: String(settings.consent_version)
        }).onConflict(["identity_id", "topic_key"]).merge({
          consent,
          consent_version: String(settings.consent_version),
          updated_at: trx.fn.now()
        });
        await trx("comm_consent_events").insert({
          identity_id: thread.identity_id,
          topic_key: topic.key,
          consent,
          version: String(settings.consent_version),
          source
        });
        if (!consent)
          await trx("comm_outbox").where({ identity_id: thread.identity_id, purpose: "marketing", state: "pending" }).whereIn(
            "campaign_id",
            trx("comm_campaigns").where({ topic_key: topic.key }).select("id")
          ).update({ state: "cancelled", error_code: "CONSENT_WITHDRAWN" });
        await event(trx, {
          connection_id: n.id,
          identity_id: thread.identity_id,
          kind: consent ? "subscribed" : "unsubscribed",
          dedupe_key: `consent:${source}:${topic.key}`,
          facts: { topic: topic.key },
          is_test: n.mode === "test"
        });
      }
      await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: null });
      return enqueue(
        trx,
        n,
        thread,
        selected.length ? "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B." : "\u0412\u0441\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B.",
        {},
        menu
      );
    }
    const active = await trx("comm_subscriptions").where({ identity_id: thread.identity_id, consent: true }).pluck("topic_key");
    const draft = thread.subscription_draft ?? active;
    const topics = await trx("comm_topics").where({ active: true }).orderBy("sort");
    const rows = topics.map((t) => [
      `${draft.includes(t.key) ? "\u2713 " : "\u25CB "}${t.label}`,
      `news:toggle:${t.key}`
    ]);
    rows.push(
      ["\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438", "news:save"],
      ["\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u0441\u0451", "news:off"],
      ["\u0413\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E", "main"]
    );
    return enqueue(
      trx,
      n,
      thread,
      `${settings.consent_text}
\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043D\u0430\u0436\u0430\u0442\u0438\u044F \xAB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438\xBB.`,
      {},
      rows
    );
  }
  async function bindToken(trx, n, thread, token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const link = await trx("comm_link_tokens").where({ hash: digest(token), state: "pending" }).andWhere("expires_at", ">", trx.fn.now()).forUpdate().first();
    if (!link) return false;
    const lead = await trx("leads").where({ id: link.lead_id }).first();
    if (!activeLead(lead) || lead.store_location_id !== n.store_id) return false;
    if (link.source_identity_id) {
      if (link.source_identity_id === thread.identity_id) return false;
      await trx("comm_link_tokens").where({ hash: link.hash }).update({ target_identity_id: thread.identity_id, state: "confirm" });
      const source = await trx("comm_threads").where({ identity_id: link.source_identity_id }).first();
      const sourceConnection = await trx("comm_connections").where({ id: source.connection_id }).first();
      await enqueue(
        trx,
        sourceConnection,
        source,
        `\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0438 \u0432 ${n.platform}.`,
        {},
        [["\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", `link:${Buffer.from(link.hash, "hex").toString("base64url")}`]]
      );
      await enqueue(trx, n, thread, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0441\u0432\u044F\u0437\u044C \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0447\u0430\u0442\u0435. \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430.");
      return true;
    }
    const [c] = await trx("comm_conversations").insert({ thread_id: thread.id, lead_id: lead.id }).onConflict(["thread_id", "lead_id"]).merge({ thread_id: thread.id }).returning("*");
    await trx("comm_access_grants").insert({ identity_id: thread.identity_id, lead_id: lead.id }).onConflict(["identity_id", "lead_id"]).merge({ revoked_at: null });
    await trx("comm_link_tokens").where({ hash: link.hash }).update({ state: "done", target_identity_id: thread.identity_id });
    await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: c.id });
    await enqueue(trx, n, thread, "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443.");
    return true;
  }
  async function processIncoming(connectionId) {
    enabled();
    return db.transaction(async (trx) => {
      const n = await trx("comm_connections").where({ id: connectionId, enabled: true }).forUpdate().first();
      if (!n) return null;
      const row = await trx("comm_inbound").where({ connection_id: n.id, state: "pending" }).orderBy("received_at").forUpdate().skipLocked().first();
      if (!row) return null;
      if (!isStoredEvent(row.event)) {
        await trx("comm_inbound").where({ id: row.id }).update({
          state: "failed",
          processed_at: trx.fn.now(),
          error_code: "INVALID_STORED_EVENT",
          result: { result: "failed", error: "INVALID_STORED_EVENT" }
        });
        return { id: row.id, failed: true, error: "INVALID_STORED_EVENT" };
      }
      const e = row.event;
      if (e.kind === "staff") {
        if (!staffProcessor) return fail("STAFF_ADAPTER_UNAVAILABLE", 503);
        const result = await staffProcessor(trx, n, row);
        await trx("comm_inbound").where({ id: row.id }).update({ state: "done", processed_at: trx.fn.now(), result });
        return result;
      }
      const { identity, thread } = await ensureIdentity(trx, n, e);
      if (e.kind === "availability" || e.kind === "started") {
        if (!identity.availability_at || new Date(identity.availability_at) <= new Date(e.occurredAt)) {
          await trx("comm_identities").where({ id: identity.id }).update({ availability: e.availability, availability_at: e.occurredAt });
          if (e.availability === "blocked")
            await trx("comm_outbox").where({ identity_id: identity.id, state: "pending" }).update({ state: "blocked", error_code: "RECIPIENT_UNAVAILABLE" });
        }
      }
      if (["message", "callback", "started"].includes(e.kind)) {
        await trx("comm_identities").where({ id: identity.id }).where(
          (q) => q.whereNull("last_active_at").orWhere("last_active_at", "<", e.occurredAt)
        ).update({ last_active_at: e.occurredAt });
        await event(trx, {
          connection_id: n.id,
          identity_id: identity.id,
          kind: "active",
          dedupe_key: `active:${row.id}`,
          occurred_at: e.occurredAt,
          is_test: identity.is_test
        });
      }
      let handled = false, resultCode = "ignored";
      let text = e.kind === "callback" ? e.callbackData || "" : e.text.trim();
      if (e.kind === "callback" && text.startsWith("conv:")) text = `dialog:${text.slice(5)}`;
      const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
      if (start?.[1] && /^[A-Za-z0-9_-]{43}$/.test(start[1])) {
        const linked = await bindToken(trx, n, thread, start[1]);
        resultCode = linked ? "linked" : "invalid_link";
        if (!linked)
          await enqueue(
            trx,
            n,
            thread,
            "\u0421\u0441\u044B\u043B\u043A\u0430 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0430 \u0438\u043B\u0438 \u0441\u0440\u043E\u043A \u0435\u0451 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0438\u0441\u0442\u0451\u043A. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E \u0437\u0430\u044F\u0432\u043A\u0443 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u043E\u0435 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435.",
            {},
            menu
          );
        handled = true;
      } else if (start || ["/help", "main", "/start"].includes(text) || e.kind === "started") {
        if (start?.[1] && start[1].length < 65)
          await trx("comm_identities").where({ id: identity.id }).whereNull("source").update({ source: start[1] });
        await enqueue(
          trx,
          n,
          thread,
          String(
            n.settings?.welcome_text || "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u042D\u0442\u043E I \u0421\u0412\u041E\u0418. \u041F\u043E\u043C\u043E\u0436\u0435\u043C \u043F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C, \u043F\u0440\u043E\u0434\u0430\u0442\u044C \u0438\u043B\u0438 \u043E\u0431\u043C\u0435\u043D\u044F\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u043A\u0443 \u0438 \u043E\u0442\u0432\u0435\u0442\u0438\u043C \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u044B."
          ),
          {},
          menu
        );
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("link:")) {
        const hash = Buffer.from(text.slice(5), "base64url").toString("hex"), link = await trx("comm_link_tokens").where({ hash, state: "confirm", source_identity_id: identity.id }).andWhere("expires_at", ">", trx.fn.now()).forUpdate().first();
        if (link) {
          const ids = [identity.id, link.target_identity_id].sort();
          const identities = await trx("comm_identities").whereIn("id", ids).orderBy("id").forUpdate();
          const target = identities.find((i) => i.id === link.target_identity_id);
          const contacts = await trx("comm_contacts").whereIn("id", [identity.contact_id, target.contact_id]).orderBy("id").forUpdate();
          if (contacts.some((c2) => c2.merged_into)) return fail("CONTACT_ALREADY_MERGED", 409);
          if (target.contact_id !== identity.contact_id) {
            await trx("comm_identities").where({ contact_id: target.contact_id }).update({ contact_id: identity.contact_id });
            await trx("comm_frequency").where({ contact_id: target.contact_id }).update({ contact_id: identity.contact_id });
            await trx("comm_outbox").where({ contact_id: target.contact_id, purpose: "marketing", state: "pending" }).update({ state: "cancelled", error_code: "IDENTITY_LINK_RECHECK" });
            await trx("comm_contacts").where({ id: target.contact_id }).update({ merged_into: identity.contact_id });
          }
          const targetThread = await trx("comm_threads").where({ identity_id: target.id }).first();
          const [c] = await trx("comm_conversations").insert({ thread_id: targetThread.id, lead_id: link.lead_id }).onConflict(["thread_id", "lead_id"]).merge({ thread_id: targetThread.id }).returning("*");
          await trx("comm_access_grants").insert({ identity_id: target.id, lead_id: link.lead_id }).onConflict(["identity_id", "lead_id"]).merge({ revoked_at: null });
          await trx("comm_threads").where({ id: targetThread.id }).update({ selected_conversation_id: c.id });
          await trx("comm_link_tokens").where({ hash }).update({ state: "done" });
          await event(trx, {
            identity_id: identity.id,
            kind: "identity_linked",
            dedupe_key: `link:${hash}`,
            facts: { target: target.id, lead: link.lead_id },
            is_test: identity.is_test
          });
          await enqueue(trx, n, thread, "\u0421\u0432\u044F\u0437\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430 \u0434\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0438.");
        }
        handled = true;
      }
      if (["news", "/news"].includes(text)) {
        await subscriptions(trx, n, thread, null, e.id);
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("news:")) {
        if (text === "news:discard") {
          await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: null });
          await subscriptions(trx, n, { ...thread, subscription_draft: null }, null, e.id);
        }
        if (text === "news:off") await subscriptions(trx, n, thread, [], e.id);
        else if (text === "news:save") {
          if (Array.isArray(thread.subscription_draft))
            await subscriptions(trx, n, thread, thread.subscription_draft, e.id);
        } else if (text.startsWith("news:toggle:")) {
          const key = text.slice(12);
          if (await trx("comm_topics").where({ key, active: true }).first()) {
            let draft = thread.subscription_draft ?? await trx("comm_subscriptions").where({ identity_id: identity.id, consent: true }).pluck("topic_key");
            draft = draft.includes(key) ? draft.filter((v) => v !== key) : [...draft, key];
            await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: JSON.stringify(draft) });
            await subscriptions(trx, n, { ...thread, subscription_draft: draft }, null, e.id);
          }
        }
        handled = true;
        resultCode = "selected";
      }
      if (["/dialogs", "dialogs"].includes(text)) {
        const choices = await trx("comm_conversations as c").join("leads as l", "l.id", "c.lead_id").where("c.thread_id", thread.id).whereIn("l.status", ["new", "in_progress", "waiting"]).select("c.id", "l.reference_code");
        await enqueue(
          trx,
          n,
          thread,
          choices.length ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443." : "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u044F\u0432\u043E\u043A \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
          {},
          choices.map((c) => [c.reference_code || "\u0417\u0430\u044F\u0432\u043A\u0430", `dialog:${c.id}`])
        );
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("dialog:")) {
        const id = text.slice(7);
        const c = UUID.test(id) ? await trx("comm_conversations").where({ id, thread_id: thread.id }).first() : null;
        if (c && await trx("comm_access_grants").where({ identity_id: identity.id, lead_id: c.lead_id }).whereNull("revoked_at").first()) {
          await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: id });
          await enqueue(trx, n, thread, "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0435.");
        }
        handled = true;
        resultCode = "selected";
      }
      if (["/new", "new"].includes(text)) {
        await enqueue(trx, n, thread, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0435\u043C\u0443 \u043D\u043E\u0432\u043E\u0433\u043E \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F.", {}, menu.slice(0, 3));
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && /^kind:(selection|trade|support)$/.test(text)) {
        await trx("comm_threads").where({ id: thread.id }).update({ pending_kind: text.slice(5), selected_conversation_id: null });
        await enqueue(trx, n, thread, "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441 \u0438\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0444\u0430\u0439\u043B.");
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "unsupported")
        await enqueue(
          trx,
          n,
          thread,
          "\u042D\u0442\u043E\u0442 \u0444\u043E\u0440\u043C\u0430\u0442 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0438\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0444\u043E\u0442\u043E, \u0430\u0443\u0434\u0438\u043E, \u0432\u0438\u0434\u0435\u043E \u043B\u0438\u0431\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0434\u043E 20 \u041C\u0411."
        );
      if (e.kind === "edited") {
        const original = await trx("comm_messages").where({ thread_id: thread.id, external_id: e.externalMessageId, direction: "in" }).first();
        if (original && (!original.edited_at || new Date(original.edited_at) < new Date(e.occurredAt)))
          await trx("comm_messages").where({ id: original.id }).update({ text: validText(e.text, 2e4), edited_at: e.occurredAt });
        if (!original) {
          await trx("comm_inbound").where({ id: row.id }).update({ state: "failed", error_code: "EDIT_AWAITS_ORIGINAL" });
          return { id: row.id, deferred: true };
        }
        resultCode = "received";
      } else if (e.kind === "message" && !handled && (e.text.trim() || e.attachments.length)) {
        let c = thread.selected_conversation_id ? await trx("comm_conversations").where({ id: thread.selected_conversation_id }).first() : null;
        const lead = c ? await trx("leads").where({ id: c.lead_id }).first() : null;
        if (c && !await trx("comm_access_grants").where({ identity_id: identity.id, lead_id: c.lead_id }).whereNull("revoked_at").first())
          c = null;
        if (!c || !activeLead(lead))
          c = await makeLead(trx, n, thread, e, thread.pending_kind || "support");
        const [message] = await trx("comm_messages").insert({
          thread_id: thread.id,
          conversation_id: c.id,
          direction: "in",
          text: validText(e.text, 2e4),
          external_id: e.externalMessageId,
          occurred_at: e.occurredAt,
          album_id: e.albumId
        }).onConflict(["thread_id", "external_id", "direction"]).ignore().returning("*");
        if (message)
          for (const a of e.attachments)
            await trx("comm_attachments").insert({
              message_id: message.id,
              conversation_id: c.id,
              connection_id: n.id,
              kind: a.kind,
              name: a.name,
              mime: a.mime,
              size: a.size !== null && a.size <= MAX_FILE_BYTES ? a.size : null,
              state: a.size !== null && a.size > MAX_FILE_BYTES ? "rejected" : "pending",
              error_code: a.size !== null && a.size > MAX_FILE_BYTES ? "FILE_TOO_LARGE" : null,
              external_ref: a
            });
        if (message && staffNotifier) await staffNotifier(trx, n, c, message);
        if (message)
          await trx("comm_inbound").where({ connection_id: n.id, state: "failed", error_code: "EDIT_AWAITS_ORIGINAL" }).whereRaw("event->>'externalMessageId'=?", [e.externalMessageId]).update({ state: "pending", error_code: null });
        await trx("comm_conversations").where({ id: c.id }).update({
          last_inbound_at: e.occurredAt,
          awaiting_since: c.awaiting_since || e.occurredAt,
          handling: lead?.assigned_to ? "agent" : "queued",
          version: trx.raw("version+1")
        });
        if (!lead) await enqueue(trx, n, thread, "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043D\u044F\u0442\u043E. \u041E\u0442\u0432\u0435\u0442 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0430 \u043F\u0440\u0438\u0434\u0451\u0442 \u0441\u044E\u0434\u0430.");
        resultCode = "received";
      }
      await event(trx, {
        connection_id: n.id,
        identity_id: identity.id,
        kind: e.kind,
        dedupe_key: `event:${row.id}`,
        occurred_at: e.occurredAt,
        is_test: identity.is_test
      });
      await trx("comm_inbound").where({ id: row.id }).update({ state: "done", processed_at: trx.fn.now(), result: { result: resultCode } });
      return { id: row.id, result: resultCode };
    });
  }
  async function commands(a, command, transaction) {
    if (!UUID.test(command.key || "")) return fail("COMMAND_KEY_REQUIRED");
    const execute = async (trx) => {
      const fingerprint = digest(canonical(command));
      await trx("comm_command_receipts").insert({
        actor_id: a.user,
        command_type: command.type,
        command_key: command.key,
        fingerprint
      }).onConflict(["actor_id", "command_type", "command_key"]).ignore();
      const receipt = await trx("comm_command_receipts").where({ actor_id: a.user, command_type: command.type, command_key: command.key }).forUpdate().first();
      if (receipt.fingerprint !== fingerprint) return fail("IDEMPOTENCY_PARAMETER_MISMATCH", 409);
      const { c, service, staff, accountability } = await permitted(
        trx,
        a,
        command.conversation_id || ""
      );
      if (receipt.result) return receipt.result;
      await trx("leads").where({ id: c.lead_id }).forUpdate().first();
      const lead = await service.readOne(c.lead_id, {
        fields: [
          "id",
          "status",
          "assigned_to",
          "store_location_id",
          "is_test",
          "reference_code",
          "kind"
        ]
      });
      const locked = await trx("comm_conversations").where({ id: c.id }).forUpdate().first();
      if (command.type !== "read" && command.expected_version !== locked.version)
        return fail("STALE_CONVERSATION", 409);
      const n = await trx("comm_connections").where({ id: c.connection_id }).first(), thread = await trx("comm_threads").where({ id: c.thread_id }).first();
      const p = command.payload || {};
      let result = { ok: true };
      if (command.type === "read") {
        const latest = await trx("comm_messages").where({ conversation_id: c.id }).max("sequence as sequence").first();
        await trx("comm_reads").insert({ user_id: a.user, conversation_id: c.id, sequence: latest.sequence || 0 }).onConflict(["user_id", "conversation_id"]).merge({ sequence: latest.sequence || 0 });
      } else if (command.type === "claim" || command.type === "assign") {
        const current = await trx("leads").where({ id: lead.id }).forUpdate().first();
        if (!activeLead(current)) return fail("LEAD_CLOSED", 409);
        if (command.type === "claim" && current.assigned_to && current.assigned_to !== a.user)
          return fail("ALREADY_ASSIGNED", 409);
        const assignee = command.type === "claim" ? a.user : String(p.user_id || "");
        if (command.type === "assign" && !staff.can_manage) return fail("FORBIDDEN", 403);
        if (!UUID.test(assignee) || !await trx("comm_staff").where({ user_id: assignee, store_id: c.store_id, enabled: true }).first())
          return fail("INVALID_ASSIGNEE");
        await userAccountability(trx, assignee);
        await service.updateOne(lead.id, { assigned_to: assignee, status: "in_progress" });
        await trx("comm_conversations").where({ id: c.id }).update({ handling: "agent" });
      } else if (command.type === "reply" || command.type === "note") {
        if (command.type === "reply" && (!activeLead(lead) || lead.assigned_to !== a.user))
          return fail("CLAIM_REQUIRED", 403);
        const text = validText(p.text ?? "");
        const ids = Array.isArray(p.attachment_ids) ? p.attachment_ids : [];
        if (ids.length > 10 || ids.some((id) => typeof id !== "string" || !UUID.test(id)))
          return fail("INVALID_ATTACHMENTS");
        if (!text && !ids.length) return fail("EMPTY_MESSAGE");
        const files = ids.length ? await trx("comm_attachments").whereIn("id", ids).where({ uploaded_by: a.user, conversation_id: c.id, state: "ready" }).whereNull("message_id").forUpdate() : [];
        if (files.length !== ids.length) return fail("ATTACHMENT_NOT_READY", 409);
        const comments = await itemService(trx, "lead_comments", accountability);
        await comments.createOne({
          lead: lead.id,
          comment: text || "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
          outcome: "note",
          created_by: a.user
        });
        const [m] = await trx("comm_messages").insert({
          thread_id: thread.id,
          conversation_id: c.id,
          direction: command.type === "note" ? "internal" : "out",
          text,
          created_by: a.user
        }).returning("*");
        if (ids.length)
          await trx("comm_attachments").whereIn("id", ids).update({ message_id: m.id });
        if (command.type === "reply") {
          const outbox = await enqueue(trx, n, thread, text || "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435", {
            conversation_id: c.id,
            message_id: m.id,
            created_by: a.user,
            expected_version: locked.version + 1,
            dedupe_key: `reply:${command.key}`,
            expires_at: new Date(Date.now() + 24 * 36e5)
          });
          if (!text) await trx("comm_operations").where({ outbox_id: outbox.id }).delete();
          let position = text ? 1 : 0;
          for (const f of files)
            await trx("comm_operations").insert({
              outbox_id: outbox.id,
              position: position++,
              method: "attachment",
              payload: { attachment_id: f.id, peer_id: thread.external_peer_id }
            });
        }
        result = { ok: true, message_id: m.id };
      } else if (command.type === "handling") {
        if (lead.assigned_to !== a.user && !staff.can_manage) return fail("FORBIDDEN", 403);
        const handling = nextHandling(locked.handling, p.state);
        await trx("comm_conversations").where({ id: c.id }).update({ handling, ...handling === "closed" ? { closed_at: trx.fn.now() } : {} });
        if (handling === "closed") await service.updateOne(lead.id, { status: "closed" });
        else if (handling === "waiting") await service.updateOne(lead.id, { status: "waiting" });
        else if (handling === "agent") await service.updateOne(lead.id, { status: "in_progress" });
      } else if (command.type === "link_start") {
        if (lead.assigned_to !== a.user) return fail("CLAIM_REQUIRED", 403);
        const token = randomBytes(32).toString("base64url");
        await trx("comm_link_tokens").insert({
          hash: digest(token),
          source_identity_id: thread.identity_id,
          lead_id: lead.id,
          expires_at: new Date(Date.now() + 15 * 6e4)
        });
        result = { ok: true, token, expires_in: 900 };
      } else return fail("UNKNOWN_COMMAND");
      if (command.type !== "read")
        await trx("comm_conversations").where({ id: c.id }).increment("version", 1);
      result.version = (await trx("comm_conversations").where({ id: c.id }).first()).version;
      await event(trx, {
        connection_id: c.connection_id,
        lead_id: lead.id,
        kind: command.type,
        dedupe_key: `command:${receipt.id}`,
        facts: { actor: a.user },
        is_test: Boolean(lead.is_test)
      });
      await trx("comm_command_receipts").where({ id: receipt.id }).update({
        result: command.type === "link_start" ? { ok: true, issued: true, expires_in: 900, version: result.version } : result
      });
      return result;
    };
    return transaction ? execute(transaction) : db.transaction(execute);
  }
  async function inbox(a, query = {}) {
    const stores = await db("comm_staff").where({ user_id: a.user, enabled: true }).pluck("store_id");
    let q = db("comm_conversations as c").join("leads as l", "l.id", "c.lead_id").join("comm_threads as t", "t.id", "c.thread_id").join("comm_connections as n", "n.id", "t.connection_id").join("comm_identities as i", "i.id", "t.identity_id").leftJoin("comm_reads as r", function() {
      this.on("r.conversation_id", "=", "c.id").andOn("r.user_id", "=", db.raw("?", [a.user]));
    }).whereIn("n.store_id", stores).whereRaw("(l.store_location_id IS NULL OR l.store_location_id=n.store_id)");
    const view = query.view || query.filter;
    if (view === "mine") q = q.where("l.assigned_to", a.user);
    else if (view === "unassigned") q = q.whereNull("l.assigned_to");
    else if (view === "awaiting") q = q.whereNotNull("c.awaiting_since");
    else if (view === "closed") q = q.where("c.handling", "closed");
    else q = q.whereNot("c.handling", "closed");
    if (["telegram", "max", "vk"].includes(query.platform))
      q = q.where("n.platform", query.platform);
    const rows = await q.orderByRaw("c.awaiting_since ASC NULLS LAST").orderBy("c.created_at", "desc").limit(100).select(
      "c.*",
      "l.reference_code",
      "l.kind",
      "l.status",
      "l.assigned_to",
      "n.platform",
      "i.external_user_id",
      db.raw(
        "(SELECT count(*)::int FROM comm_messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.deleted_at IS NULL AND m.sequence>COALESCE(r.sequence,0)) AS unread_count"
      )
    );
    const service = await itemService(db, "leads", await userAccountability(db, a.user));
    const ids = rows.map((r) => r.lead_id);
    if (!ids.length) return [];
    const allowed = await service.readByQuery({
      fields: ["id"],
      limit: 100,
      filter: { id: { _in: ids } }
    });
    return rows.filter((r) => allowed.some((v) => v.id === r.lead_id));
  }
  async function messages(a, threadId, query = {}) {
    const conversationId = String(query.conversation_id || "");
    const { c } = await permitted(db, a, conversationId);
    if (c.thread_id !== threadId) return fail("FORBIDDEN", 403);
    let q = db("comm_messages").where({ conversation_id: c.id }).whereNull("deleted_at");
    if (query.before) {
      if (!/^\d+$/.test(String(query.before))) return fail("INVALID_CURSOR");
      q = q.where("sequence", "<", query.before);
    }
    const rows = await q.orderBy("sequence", "desc").limit(50);
    const files = rows.length ? await db("comm_attachments").whereIn(
      "message_id",
      rows.map((r) => r.id)
    ).select("id", "message_id", "kind", "name", "mime", "size", "state", "error_code") : [];
    const jobs = rows.length ? await db("comm_outbox").whereIn(
      "message_id",
      rows.map((r) => r.id)
    ).select("message_id", "state", "error_code") : [];
    return rows.map((m) => ({
      ...m,
      attachments: files.filter((f) => f.message_id === m.id),
      delivery: jobs.find((j) => j.message_id === m.id) || null
    })).reverse();
  }
  async function audience(a) {
    const scopes = await db("comm_staff").where({ user_id: a.user, enabled: true, can_manage: true }).pluck("store_id");
    if (!scopes.length) return fail("FORBIDDEN", 403);
    const result = await db.raw(
      `SELECT n.id,n.name,n.platform,count(DISTINCT i.id)::int AS users,
      count(DISTINCT i.id) FILTER(WHERE EXISTS(SELECT 1 FROM comm_subscriptions s WHERE s.identity_id=i.id AND s.consent))::int AS subscribers,
      count(DISTINCT i.id) FILTER(WHERE i.last_active_at>=now()-interval '30 days')::int AS active_30,
      count(DISTINCT i.id) FILTER(WHERE i.last_active_at>=now()-interval '7 days')::int AS active_7,
      count(DISTINCT i.id) FILTER(WHERE i.first_seen_at>=now()-interval '30 days')::int AS new_30,
      count(DISTINCT i.id) FILTER(WHERE i.availability='blocked')::int AS blocked,
      count(DISTINCT i.id) FILTER(WHERE i.availability='unknown')::int AS unknown,
      n.last_received_at,n.last_sent_at FROM comm_connections n LEFT JOIN comm_identities i ON i.connection_id=n.id AND NOT i.is_test
      WHERE n.store_id=ANY(?::uuid[]) GROUP BY n.id ORDER BY n.name`,
      [scopes]
    );
    const topics = await db.raw(
      `SELECT n.id AS connection_id,s.topic_key,count(DISTINCT s.identity_id)::int AS subscribers
      FROM comm_subscriptions s JOIN comm_identities i ON i.id=s.identity_id JOIN comm_connections n ON n.id=i.connection_id
      WHERE s.consent AND NOT i.is_test AND n.store_id=ANY(?::uuid[]) GROUP BY n.id,s.topic_key`,
      [scopes]
    );
    const daily = await db.raw(
      `SELECT e.connection_id,(e.occurred_at AT TIME ZONE 'Europe/Moscow')::date AS day,e.kind,count(*)::int AS events
      FROM comm_events e JOIN comm_connections n ON n.id=e.connection_id WHERE NOT e.is_test AND n.store_id=ANY(?::uuid[])
      AND e.occurred_at>=now()-interval '30 days' AND e.kind IN ('first_seen','subscribed','unsubscribed','lead_created') GROUP BY 1,2,3 ORDER BY 2`,
      [scopes]
    );
    return {
      connections: result.rows,
      topics: topics.rows,
      daily: daily.rows,
      baseline_at: (await db("comm_runtime").where({ id: 1 }).first())?.baseline_at
    };
  }
  return {
    actor,
    permitted,
    userAccountability,
    ingest,
    processIncoming,
    commands,
    inbox,
    messages,
    audience,
    enqueue,
    event,
    setStaffProcessor,
    setStaffNotifier
  };
}

// packages/communications/src/staff.ts
import { randomUUID as randomUUID3 } from "node:crypto";
var commandKey = (s) => {
  const h = digest(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
function createStaff(context, service) {
  async function queue(trx, n, card, text, values = {}, markup) {
    const destination = await trx("comm_destinations").where({ id: card.destination_id, enabled: true, kind: "staff" }).first();
    if (!destination) return fail("STAFF_DESTINATION_DISABLED", 503);
    const id = randomUUID3();
    await trx("comm_outbox").insert({
      id,
      connection_id: n.id,
      purpose: "staff",
      dedupe_key: `staff:${id}`,
      conversation_id: values.conversation_id
    });
    await trx("comm_operations").insert({
      outbox_id: id,
      method: "text",
      payload: {
        chat_id: destination.external_id,
        text,
        card_id: card.id,
        ...values,
        ...markup ? { reply_markup: markup } : {}
      }
    });
    return id;
  }
  async function notify(trx, n, c, message) {
    if (n.platform !== "telegram") return;
    const destination = await trx("comm_destinations").where({ connection_id: n.id, kind: "staff", enabled: true }).first();
    if (!destination) return;
    const lead = await trx("leads").where({ id: c.lead_id }).first();
    let card = await trx("comm_staff_cards").where({ connection_id: n.id, lead_id: c.lead_id }).first();
    if (!card) {
      [card] = await trx("comm_staff_cards").insert({ connection_id: n.id, lead_id: c.lead_id, destination_id: destination.id }).returning("*");
      const id = randomUUID3();
      await trx("comm_outbox").insert({
        id,
        connection_id: n.id,
        purpose: "staff",
        dedupe_key: `staff-card:${card.id}`
      });
      await trx("comm_operations").insert([
        {
          outbox_id: id,
          position: 0,
          method: "topic",
          payload: {
            chat_id: destination.external_id,
            name: String(lead.reference_code || "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435").slice(0, 128),
            card_id: card.id
          }
        },
        {
          outbox_id: id,
          position: 1,
          method: "text",
          payload: {
            chat_id: destination.external_id,
            text: `${lead.reference_code || "\u0417\u0430\u044F\u0432\u043A\u0430"} \xB7 ${lead.kind}
\u041D\u043E\u0432\u044B\u0439 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0439 \u0434\u0438\u0430\u043B\u043E\u0433.`,
            card_id: card.id,
            is_card: true,
            reply_markup: {
              inline_keyboard: [
                [{ text: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", callback_data: `take:${card.id}` }],
                [{ text: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `reply:${c.id}` }]
              ]
            }
          }
        }
      ]);
    }
    await queue(
      trx,
      n,
      card,
      `\u041A\u043B\u0438\u0435\u043D\u0442:
${String(message.text || "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435").slice(0, 3500)}`,
      { conversation_id: c.id },
      { inline_keyboard: [[{ text: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `reply:${c.id}` }]] }
    );
  }
  async function process(trx, n, row) {
    const raw = row.event.raw, q = raw.callback_query, m = q?.message || raw.message, from = q?.from || m?.from;
    if (!m || from?.is_bot !== false || m.sender_chat || !m.message_thread_id)
      return { result: "ignored" };
    if (q && String(m.from?.id) !== n.external_id) return { result: "ignored" };
    const account = await trx("comm_staff_accounts").where({ connection_id: n.id, external_user_id: String(from.id), enabled: true }).first();
    if (!account) return { result: "forbidden" };
    const card = await trx("comm_staff_cards as c").join("comm_destinations as d", "d.id", "c.destination_id").where({
      "c.connection_id": n.id,
      "c.topic_id": String(m.message_thread_id),
      "d.external_id": String(m.chat.id),
      "d.enabled": true
    }).select("c.*").first();
    if (!card) return { result: "stale" };
    const a = {
      user: account.user_id,
      accountability: await service.userAccountability(trx, account.user_id)
    };
    const c = await trx("comm_conversations").where({ lead_id: card.lead_id }).orderBy("created_at", "desc").first();
    if (!c) return { result: "stale" };
    await service.permitted(trx, a, c.id);
    const data = String(q?.data || "");
    if (data === `take:${card.id}`) {
      if (String(m.message_id) !== card.message_id) return { result: "stale" };
      await service.commands(
        a,
        {
          type: "claim",
          key: commandKey(`take:${n.id}:${row.external_id}`),
          conversation_id: c.id,
          expected_version: c.version,
          payload: {}
        },
        trx
      );
      await queue(trx, n, card, "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443.");
      return { result: "claimed" };
    }
    if (data === `reply:${c.id}`) {
      const sent = await trx("comm_operations as o").join("comm_outbox as b", "b.id", "o.outbox_id").where({
        "b.connection_id": n.id,
        "o.external_id": String(m.message_id),
        "o.state": "accepted"
      }).select("o.payload").first();
      if (String(m.message_id) !== card.message_id && !sent?.payload?.reply_markup?.inline_keyboard?.flat().some((b) => b.callback_data === data))
        return { result: "stale" };
      await trx("comm_staff_drafts").where({ conversation_id: c.id, user_id: a.user }).whereIn("state", ["awaiting", "preview"]).update({ state: "cancelled" });
      const [draft2] = await trx("comm_staff_drafts").insert({ conversation_id: c.id, user_id: a.user, external_user_id: String(from.id) }).returning("*");
      await queue(
        trx,
        n,
        card,
        "\u041E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0430 \u044D\u0442\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0442\u0435\u043A\u0441\u0442\u043E\u043C \u0438\u043B\u0438 \u043E\u0434\u043D\u0438\u043C \u0444\u043E\u0442\u043E. \u0417\u0430\u0442\u0435\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443. \u0421\u0440\u043E\u043A \u2014 10 \u043C\u0438\u043D\u0443\u0442.",
        { draft_id: draft2.id, draft_stage: "prompt" },
        { force_reply: true }
      );
      return { result: "draft_started" };
    }
    const match = data.match(/^(send|cancel):([0-9a-f-]{36})$/);
    if (match && UUID.test(match[2])) {
      const draft2 = await trx("comm_staff_drafts").where({
        id: match[2],
        conversation_id: c.id,
        user_id: a.user,
        external_user_id: String(from.id),
        state: "preview",
        preview_message_id: String(m.message_id)
      }).where("expires_at", ">", trx.fn.now()).forUpdate().first();
      if (!draft2) return { result: "stale" };
      if (match[1] === "cancel") {
        await trx("comm_staff_drafts").where({ id: draft2.id }).update({ state: "cancelled" });
        return { result: "cancelled" };
      }
      if (draft2.attachment_id && !await trx("comm_attachments").where({ id: draft2.attachment_id, state: "ready" }).first()) {
        await queue(
          trx,
          n,
          card,
          "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0438\u043B\u0438 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443 \u0432 Directus \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F."
        );
        return { result: "file_not_ready" };
      }
      await service.commands(
        a,
        {
          type: "reply",
          key: draft2.id,
          conversation_id: c.id,
          expected_version: c.version,
          payload: {
            text: draft2.text,
            attachment_ids: draft2.attachment_id ? [draft2.attachment_id] : []
          }
        },
        trx
      );
      await trx("comm_staff_drafts").where({ id: draft2.id }).update({ state: "confirmed" });
      return { result: "queued" };
    }
    if (data || !m.reply_to_message?.message_id) return { result: "internal" };
    const draft = await trx("comm_staff_drafts").where({
      conversation_id: c.id,
      user_id: a.user,
      external_user_id: String(from.id),
      state: "awaiting",
      prompt_message_id: String(m.reply_to_message.message_id)
    }).where("expires_at", ">", trx.fn.now()).forUpdate().first();
    if (!draft) return { result: "internal" };
    if (m.media_group_id || m.voice || m.video || m.document || !m.text && !m.photo?.length) {
      await queue(
        trx,
        n,
        card,
        "\u0414\u043B\u044F \u0431\u044B\u0441\u0442\u0440\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430 \u043F\u0440\u0438\u0448\u043B\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0438\u043B\u0438 \u043E\u0434\u043D\u043E \u0444\u043E\u0442\u043E. \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0438\u0437 Directus."
      );
      return { result: "unsupported" };
    }
    const text = validText(m.text || m.caption || "");
    let attachmentId = null;
    if (m.photo?.length) {
      const photo = m.photo.at(-1);
      const [f] = await trx("comm_attachments").insert({
        conversation_id: c.id,
        connection_id: n.id,
        uploaded_by: a.user,
        kind: "image",
        name: "\u0424\u043E\u0442\u043E \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0430",
        mime: "application/octet-stream",
        external_ref: { externalId: photo.file_id, size: photo.file_size || null, kind: "image" }
      }).returning("id");
      attachmentId = f.id;
    }
    await trx("comm_staff_drafts").where({ id: draft.id }).update({ state: "preview", text, attachment_id: attachmentId });
    await queue(
      trx,
      n,
      card,
      `\u041A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0443:
${text}${attachmentId ? "\n[\u0424\u043E\u0442\u043E \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438]" : ""}`,
      { draft_id: draft.id, draft_stage: "preview" },
      {
        inline_keyboard: [
          [{ text: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443", callback_data: `send:${draft.id}` }],
          [{ text: "\u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `cancel:${draft.id}` }]
        ]
      }
    );
    return { result: "draft_ready" };
  }
  service.setStaffProcessor(process);
  service.setStaffNotifier(notify);
  return { notify, process };
}

// packages/communications/src/legacy.ts
var RESULT_TEXT = {
  claimed: "\u0417\u0430\u044F\u0432\u043A\u0430 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0430 \u0437\u0430 \u0432\u0430\u043C\u0438.",
  already_yours: "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u0443 \u0432\u0430\u0441 \u0432 \u0440\u0430\u0431\u043E\u0442\u0435.",
  already_assigned: "\u0417\u0430\u044F\u0432\u043A\u0443 \u0443\u0436\u0435 \u043F\u0440\u0438\u043D\u044F\u043B \u0434\u0440\u0443\u0433\u043E\u0439 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440.",
  closed: "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430.",
  forbidden: "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u044D\u0442\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0435.",
  stale: "\u041A\u043D\u043E\u043F\u043A\u0430 \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0430. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443.",
  selected: "\u0412\u044B\u0431\u043E\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D.",
  linked: "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430.",
  invalid_link: "\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0430.",
  draft_started: "\u041E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u043D\u0430 \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0431\u043E\u0442\u0430 \u0432 \u044D\u0442\u043E\u0439 \u0442\u0435\u043C\u0435.",
  draft_ready: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443.",
  queued: "\u041E\u0442\u0432\u0435\u0442 \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C.",
  cancelled: "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430.",
  rate_limited: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043C\u0438\u043D\u0443\u0442\u0443.",
  received: "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043D\u044F\u0442\u043E.",
  ignored: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F."
};
function createLegacyTelegramCompatibility(context) {
  const db = context.database, env = context.env, botId = String(env.ISVOI_TELEGRAM_BOT_ID || ""), mode = String(env.ISVOI_TELEGRAM_MODE || "test"), service = createService(context), delivery = createDelivery(context, service);
  createStaff(context, service);
  async function authorize(req, trx, requireLease = true) {
    if (!flag(env.ISVOI_TELEGRAM_USE_COMMUNICATIONS)) return fail("TELEGRAM_COMPAT_DISABLED", 503);
    if (!flag(env.ISVOI_COMMUNICATIONS_ENABLED)) return fail("COMMUNICATIONS_DISABLED", 503);
    const user = req.accountability?.user;
    if (typeof user !== "string" || !UUID.test(user) || req.accountability?.admin === true || String(req.body?.bot_id) !== botId || !UUID.test(req.body?.worker_id || ""))
      return fail("FORBIDDEN", 403);
    const runtime = await trx("comm_runtime").where({ id: 1 }).first();
    if (!runtime?.active) return fail("COMMUNICATIONS_INACTIVE", 503);
    const connection = await trx("comm_connections").where({
      platform: "telegram",
      external_id: botId,
      mode,
      worker_user_id: user,
      enabled: true
    }).forUpdate().first();
    if (!connection) return fail("FORBIDDEN", 403);
    const worker = await trx("directus_users").where({ id: user, status: "active" }).first("id");
    if (!worker) return fail("FORBIDDEN", 403);
    if (requireLease && (connection.poll_owner !== req.body.worker_id || new Date(connection.poll_until) <= /* @__PURE__ */ new Date()))
      return fail("WORKER_LEASE_UNAVAILABLE", 409);
    return connection;
  }
  async function session(req) {
    return db.transaction(async (trx) => {
      const connection = await authorize(req, trx, false);
      if (connection.poll_owner && connection.poll_owner !== req.body.worker_id && new Date(connection.poll_until) > /* @__PURE__ */ new Date())
        return fail("WORKER_LEASE_UNAVAILABLE", 409);
      await trx("comm_connections").where({ id: connection.id }).update({
        poll_owner: req.body.worker_id,
        poll_until: new Date(Date.now() + 9e4)
      });
      return {
        update_offset: Number(connection.poll_offset),
        mode: connection.mode,
        conversations: true
      };
    });
  }
  async function refresh(req) {
    return db.transaction(async (trx) => {
      const connection = await authorize(req, trx);
      await trx("comm_connections").where({ id: connection.id }).update({
        poll_until: new Date(Date.now() + 9e4)
      });
      return connection;
    });
  }
  async function next(req) {
    const connection = await refresh(req);
    const operation = await delivery.next(connection.id, req.accountability.user, ["topic", "text"]);
    const current = await db("comm_connections").where({ id: connection.id }).first("poll_offset");
    if (!operation) return { job: null, update_offset: Number(current.poll_offset) };
    const outbox = await db("comm_outbox").where({ id: operation.outbox_id }).first();
    return {
      update_offset: Number(current.poll_offset),
      job: {
        id: operation.id,
        operation_id: operation.attempt_id,
        method: operation.method === "topic" ? "createForumTopic" : "sendMessage",
        payload: operation.payload,
        ...outbox.purpose !== "staff" ? { channel: "conversation", destination: "client" } : {},
        ...outbox.campaign_id ? { campaign_id: outbox.campaign_id } : {}
      }
    };
  }
  async function complete(req) {
    const connection = await refresh(req);
    if (!UUID.test(req.body?.id || "") || !UUID.test(req.body?.operation_id || ""))
      return fail("INVALID_OUTCOME");
    const operation = await db("comm_operations as o").join("comm_outbox as b", "b.id", "o.outbox_id").where({
      "o.id": req.body.id,
      "o.attempt_id": req.body.operation_id,
      "b.connection_id": connection.id
    }).select("o.*").first();
    if (!operation) return fail("STALE_OPERATION", 409);
    const old = req.body.outcome || {};
    let outcome;
    if (old.type === "ok" || old.type === "not_modified") {
      const externalId = operation.method === "topic" ? old.topic_id : old.message_id;
      if (externalId === void 0 || externalId === null) return fail("INVALID_OUTCOME");
      outcome = { type: "accepted", externalId: String(externalId) };
    } else if (old.type === "rate_limit") {
      outcome = { type: "rate_limited", retryAfter: old.retryAfter };
    } else if (old.type === "permanent") {
      outcome = { type: "rejected", code: `TELEGRAM_${Number(old.status) || 400}` };
    } else if (old.type === "unknown") {
      outcome = { type: "unknown" };
    } else return fail("INVALID_OUTCOME");
    await delivery.complete(connection.id, req.accountability.user, {
      attempt_id: operation.attempt_id,
      lease_version: operation.lease_version,
      outcome
    });
    return { ok: true };
  }
  async function update(req) {
    const connection = await refresh(req), update2 = req.body?.update;
    if (!Number.isSafeInteger(update2?.update_id) || update2.update_id < 0)
      return fail("INVALID_UPDATE");
    await service.ingest(connection.id, update2);
    const externalId = String(update2.update_id);
    for (let count = 0; count < 100; count++) {
      const row2 = await db("comm_inbound").where({ connection_id: connection.id, external_id: externalId }).first();
      if (!row2 || row2.state !== "pending") break;
      await service.processIncoming(connection.id);
    }
    const row = await db("comm_inbound").where({ connection_id: connection.id, external_id: externalId }).first();
    if (row?.state === "pending") return fail("INBOUND_BACKLOG_LIMIT", 503);
    if (row?.state === "failed") return fail(row.error_code || "INBOUND_PROCESSING_FAILED", 409);
    const changed = await db("comm_connections").where({ id: connection.id, poll_owner: req.body.worker_id }).where("poll_until", ">", db.fn.now()).update({ poll_offset: db.raw("GREATEST(poll_offset,?)", [update2.update_id + 1]) });
    if (!changed) return fail("WORKER_LEASE_UNAVAILABLE", 409);
    const result = String(row?.result?.result || "ignored");
    return {
      update_offset: Math.max(Number(connection.poll_offset), update2.update_id + 1),
      callback_id: update2.callback_query?.id || null,
      text: RESULT_TEXT[result] || RESULT_TEXT.ignored,
      result
    };
  }
  async function intakeIdentity(req, trx) {
    if (req.accountability?.admin === true) return fail("FORBIDDEN", 403);
    const connection = await trx("comm_connections").where({ platform: "telegram", external_id: botId, mode, enabled: true }).forUpdate().first();
    if (!connection || connection.service_user_id !== req.accountability?.user)
      return fail("FORBIDDEN", 403);
    await service.userAccountability(trx, connection.service_user_id);
    return connection;
  }
  async function intake(req) {
    const username = String(env.ISVOI_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username))
      return fail("BOT_USERNAME_REQUIRED", 503);
    return db.transaction(async (trx) => {
      const connection = await intakeIdentity(req, trx), accountability = await service.userAccountability(trx, connection.service_user_id), schema = await context.getSchema(), leads = new context.services.ItemsService("leads", { knex: trx, schema, accountability }), id = await leads.createOne(req.body), lead = await trx("leads").where({ id }).first();
      if (!lead || lead.store_location_id !== connection.store_id)
        return fail("INTAKE_STORE_MISMATCH", 409);
      const token = randomBytes2(32).toString("base64url");
      await trx("comm_link_tokens").insert({
        hash: digest(token),
        lead_id: id,
        expires_at: new Date(Date.now() + 15 * 6e4)
      });
      return { id, telegram_url: `https://t.me/${username}?start=${token}` };
    });
  }
  const intakeCheck = async (req) => db.transaction(async (trx) => {
    await intakeIdentity(req, trx);
    return { ok: true };
  });
  return { session, next, complete, update, intake, "intake-check": intakeCheck };
}
export {
  createLegacyTelegramCompatibility
};
