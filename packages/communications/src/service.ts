import { randomBytes, randomUUID } from "node:crypto";
import type { Actor, Command, Connection, Context, Database, IncomingEvent } from "./types.js";
import {
  canonical,
  digest,
  fail,
  flag,
  identifier,
  MAX_FILE_BYTES,
  nextHandling,
  UUID,
  validText,
} from "./policy.js";
import { normalize } from "./normalize.js";
import { defaultServiceLevel, serviceDeadlines, type ServiceLevel } from "./sla.js";

const activeLead = (lead: any) => ["new", "in_progress", "waiting"].includes(lead?.status);
const incomingKinds = new Set([
  "message",
  "edited",
  "callback",
  "availability",
  "started",
  "unsupported",
  "staff",
]);
function isStoredEvent(value: unknown): value is IncomingEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    typeof event.platform === "string" &&
    typeof event.actorId === "string" &&
    typeof event.peerId === "string" &&
    typeof event.kind === "string" &&
    incomingKinds.has(event.kind) &&
    typeof event.occurredAt === "string" &&
    !Number.isNaN(Date.parse(event.occurredAt)) &&
    typeof event.text === "string" &&
    Array.isArray(event.attachments)
  );
}
const menu = [
  ["Купить / подобрать", "kind:selection"],
  ["Продать / обменять", "kind:trade"],
  ["Задать вопрос", "kind:support"],
  ["Мои заявки", "dialogs"],
  ["Подписки", "news"],
];
export function keyboard(platform: string, rows: string[][]): Record<string, unknown> {
  if (!rows.length) return {};
  if (platform === "telegram")
    return {
      reply_markup: {
        inline_keyboard: rows.map(([text, data]) => [{ text, callback_data: data }]),
      },
    };
  if (platform === "max")
    return {
      attachments: [
        {
          type: "inline_keyboard",
          payload: {
            buttons: rows.map(([text, data]) => [{ type: "callback", text, payload: data }]),
          },
        },
      ],
    };
  return {
    keyboard: JSON.stringify({
      inline: true,
      buttons: rows.map(([label, action]) => [
        {
          action: { type: "callback", label, payload: JSON.stringify({ action }) },
          color: "secondary",
        },
      ]),
    }),
  };
}
export function createService(context: Context) {
  const { database: db, services, getSchema, env } = context;
  const enabled = () => {
    if (!flag(env.ISVOI_COMMUNICATIONS_ENABLED)) fail("COMMUNICATIONS_DISABLED", 503);
  };
  let staffProcessor: ((trx: Database, n: Connection, row: any) => Promise<any>) | undefined;
  const setStaffProcessor = (fn: typeof staffProcessor) => {
    staffProcessor = fn;
  };
  let staffNotifier:
    ((trx: Database, n: Connection, c: any, message: any) => Promise<void>) | undefined;
  const setStaffNotifier = (fn: typeof staffNotifier) => {
    staffNotifier = fn;
  };
  async function userAccountability(trx: Database, id: string) {
    const user = await trx("directus_users").where({ id, status: "active" }).first();
    if (!user) return fail("FORBIDDEN", 403);
    const roles: string[] = [];
    let role = user.role;
    while (role) {
      if (roles.includes(role) || roles.length > 30) fail("INVALID_ROLE_TREE", 403);
      roles.push(role);
      role = (await trx("directus_roles").where({ id: role }).first())?.parent;
    }
    return { user: id, role: user.role, roles, admin: false, app: true };
  }
  async function actor(userId: unknown): Promise<Actor> {
    enabled();
    if (typeof userId !== "string" || !UUID.test(userId)) return fail("FORBIDDEN", 403);
    const accountability = await userAccountability(db, userId);
    if (!(await db("comm_staff").where({ user_id: userId, enabled: true }).first()))
      return fail("FORBIDDEN", 403);
    return { user: userId, accountability };
  }
  async function itemService(trx: Database, collection: string, accountability: any) {
    return new services.ItemsService(collection, {
      knex: trx,
      schema: await getSchema(),
      accountability,
    });
  }
  async function permitted(trx: Database, a: Actor, conversationId: string, manage = false) {
    if (!UUID.test(conversationId || "")) return fail("INVALID_CONVERSATION");
    const c = await trx("comm_conversations as c")
      .join("comm_threads as t", "t.id", "c.thread_id")
      .join("comm_connections as n", "n.id", "t.connection_id")
      .where("c.id", conversationId)
      .select("c.*", "t.identity_id", "t.connection_id", "n.store_id")
      .first();
    if (!c) return fail("NOT_FOUND", 404);
    const staff = await trx("comm_staff")
      .where({ user_id: a.user, store_id: c.store_id, enabled: true })
      .first();
    if (!staff || (manage && !staff.can_manage)) return fail("FORBIDDEN", 403);
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
        "kind",
      ],
    });
    if (lead.store_location_id && lead.store_location_id !== c.store_id)
      return fail("FORBIDDEN", 403);
    return { c, lead, service, staff, accountability };
  }
  async function event(trx: Database, values: any) {
    await trx("comm_events").insert(values).onConflict("dedupe_key").ignore();
  }
  async function maxUserId(trx: Database, thread: any) {
    const identity = await trx("comm_identities")
      .where({ id: thread.identity_id })
      .first("external_user_id");
    if (!identity?.external_user_id) return fail("IDENTITY_NOT_FOUND", 409);
    return identity.external_user_id;
  }
  async function enqueue(
    trx: Database,
    connection: Connection,
    thread: any,
    text: string,
    values: any = {},
    rows: string[][] = [],
  ) {
    const id = randomUUID();
    const [outbox] = await trx("comm_outbox")
      .insert({
        id,
        connection_id: connection.id,
        thread_id: thread.id,
        identity_id: thread.identity_id,
        purpose: "service",
        dedupe_key: `notice:${id}`,
        ...values,
      })
      .returning("*");
    const payload: any =
      connection.platform === "telegram"
        ? { chat_id: thread.external_peer_id, text }
        : connection.platform === "max"
          ? { user_id: await maxUserId(trx, thread), text }
          : {
              peer_id: thread.external_peer_id,
              message: text,
              random_id: parseInt(digest(id).slice(0, 7), 16),
            };
    Object.assign(payload, keyboard(connection.platform, rows));
    await trx("comm_operations").insert({ outbox_id: outbox.id, method: "text", payload });
    return outbox;
  }
  async function welcome(trx: Database, connection: Connection, thread: any) {
    const welcomeText = String(
      connection.settings?.welcome_text ||
        "Здравствуйте! Это I СВОИ. Поможем подобрать, продать или обменять технику и ответим на вопросы.",
    );
    const fileId = connection.settings?.welcome_file_id;
    const origin = String(env.PUBLIC_URL || "").replace(/\/$/, "");
    if (
      connection.platform !== "telegram" ||
      typeof fileId !== "string" ||
      !UUID.test(fileId) ||
      !origin.startsWith("https://")
    )
      return enqueue(trx, connection, thread, welcomeText, {}, menu);
    const id = randomUUID();
    const [outbox] = await trx("comm_outbox")
      .insert({
        id,
        connection_id: connection.id,
        thread_id: thread.id,
        identity_id: thread.identity_id,
        purpose: "service",
        dedupe_key: `welcome:${id}`,
      })
      .returning("*");
    await trx("comm_operations").insert({
      outbox_id: outbox.id,
      method: "remote_image",
      payload: {
        chat_id: thread.external_peer_id,
        photo: `${origin}/assets/${fileId}`,
        caption: welcomeText,
        ...keyboard(connection.platform, menu),
      },
    });
    return outbox;
  }
  async function ingest(connectionId: string, raw: unknown) {
    enabled();
    const n = await db("comm_connections").where({ id: connectionId, enabled: true }).first();
    if (!n) return fail("CONNECTION_DISABLED", 403);
    let e: IncomingEvent;
    try {
      e = normalize(n.platform, raw);
    } catch (error: any) {
      if (n.platform !== "telegram" || error.code !== "NON_PRIVATE_EVENT") throw error;
      const id = identifier((raw as any)?.update_id);
      await db("comm_inbound")
        .insert({
          connection_id: n.id,
          external_id: id,
          event: null,
          state: "done",
          error_code: "NON_PRIVATE_EVENT",
          processed_at: db.fn.now(),
        })
        .onConflict(["connection_id", "external_id"])
        .ignore();
      return { accepted: true, id: null };
    }
    if (
      e.kind !== "staff" &&
      n.mode === "test" &&
      !(n.settings?.pilot_user_ids || []).map(String).includes(e.actorId)
    ) {
      await db("comm_inbound")
        .insert({
          connection_id: n.id,
          external_id: e.id,
          event: null,
          state: "done",
          error_code: "PILOT_ONLY",
          processed_at: db.fn.now(),
        })
        .onConflict(["connection_id", "external_id"])
        .ignore();
      return { accepted: true, id: null };
    }
    const [row] = await db("comm_inbound")
      .insert({ connection_id: n.id, external_id: e.id, event: e })
      .onConflict(["connection_id", "external_id"])
      .ignore()
      .returning("id");
    await db("comm_connections").where({ id: n.id }).update({ last_received_at: db.fn.now() });
    return { accepted: true, id: row?.id || null };
  }
  async function ensureIdentity(trx: Database, n: Connection, e: IncomingEvent) {
    let identity = await trx("comm_identities")
      .where({ connection_id: n.id, external_user_id: e.actorId })
      .first();
    if (!identity) {
      const [contact] = await trx("comm_contacts").insert({}).returning("id");
      [identity] = await trx("comm_identities")
        .insert({
          contact_id: contact.id,
          connection_id: n.id,
          external_user_id: e.actorId,
          first_seen_at: e.occurredAt,
          is_test: n.mode === "test",
        })
        .returning("*");
      await event(trx, {
        connection_id: n.id,
        identity_id: identity.id,
        kind: "first_seen",
        dedupe_key: `identity:${identity.id}`,
        occurred_at: e.occurredAt,
        is_test: identity.is_test,
      });
    }
    let thread = await trx("comm_threads")
      .where({ connection_id: n.id, external_peer_id: e.peerId })
      .first();
    if (!thread)
      [thread] = await trx("comm_threads")
        .insert({ connection_id: n.id, identity_id: identity.id, external_peer_id: e.peerId })
        .returning("*");
    if (thread.identity_id !== identity.id) return fail("THREAD_IDENTITY_CONFLICT", 409);
    await trx("comm_identities")
      .where({ id: identity.id })
      .update({
        last_active_at: e.occurredAt,
        ...(e.kind !== "availability" ? { availability: "allowed", availability_at: e.occurredAt } : {}),
      });
    return { identity, thread };
  }
  async function makeLead(
    trx: Database,
    n: Connection,
    thread: any,
    e: IncomingEvent,
    identity: any,
    kind = "support",
  ) {
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
      is_test: identity.is_test,
    });
    await trx("comm_service_levels")
      .insert({ store_id: n.store_id })
      .onConflict("store_id")
      .ignore();
    const configured = await trx("comm_service_levels").where({ store_id: n.store_id }).first();
    const level: ServiceLevel = { ...defaultServiceLevel, ...configured };
    const deadlines = serviceDeadlines(e.occurredAt, level);
    const [c] = await trx("comm_conversations")
      .insert({
        lead_id: id,
        thread_id: thread.id,
        first_response_due_at: deadlines.firstResponseDueAt,
        escalation_due_at: deadlines.escalationDueAt,
      })
      .returning("*");
    await trx("comm_threads")
      .where({ id: thread.id })
      .update({ selected_conversation_id: c.id, pending_kind: null });
    await trx("comm_access_grants")
      .insert({ identity_id: thread.identity_id, lead_id: id })
      .onConflict(["identity_id", "lead_id"])
      .ignore();
    await event(trx, {
      connection_id: n.id,
      identity_id: thread.identity_id,
      lead_id: id,
      kind: "lead_created",
      dedupe_key: `lead:${id}`,
      is_test: identity.is_test,
    });
    return c;
  }
  async function subscriptions(
    trx: Database,
    n: Connection,
    thread: any,
    selected: string[] | null,
    source: string,
  ) {
    const settings = n.settings || {};
    const identity = await trx("comm_identities").where({ id: thread.identity_id }).first();
    if (settings.subscriptions_pilot_only) {
      if (!((settings.pilot_user_ids as string[]) || []).map(String).includes(identity.external_user_id))
        return enqueue(
          trx,
          n,
          thread,
          "Подписки пока доступны только участникам закрытого пилота.",
        );
    }
    if (!settings.consent_version || !settings.consent_text || !settings.subscriptions_enabled)
      return enqueue(
        trx,
        n,
        thread,
        "Подписки пока недоступны. Обращения к менеджеру работают.",
        {},
        menu,
      );
    if (selected) {
      const topics = await trx("comm_topics").where({ active: true }).orderBy("sort");
      for (const topic of topics) {
        const consent = selected.includes(topic.key);
        const old = await trx("comm_subscriptions")
          .where({ identity_id: thread.identity_id, topic_key: topic.key })
          .first();
        if (Boolean(old?.consent) === consent) continue;
        await trx("comm_subscriptions")
          .insert({
            identity_id: thread.identity_id,
            topic_key: topic.key,
            consent,
            consent_version: String(settings.consent_version),
          })
          .onConflict(["identity_id", "topic_key"])
          .merge({
            consent,
            consent_version: String(settings.consent_version),
            updated_at: trx.fn.now(),
          });
        await trx("comm_consent_events").insert({
          identity_id: thread.identity_id,
          topic_key: topic.key,
          consent,
          version: String(settings.consent_version),
          source,
        });
        if (!consent)
          await trx("comm_outbox")
            .where({ identity_id: thread.identity_id, purpose: "marketing", state: "pending" })
            .whereIn(
              "campaign_id",
              trx("comm_campaigns").where({ topic_key: topic.key }).select("id"),
            )
            .update({ state: "cancelled", error_code: "CONSENT_WITHDRAWN" });
        await event(trx, {
          connection_id: n.id,
          identity_id: thread.identity_id,
          kind: consent ? "subscribed" : "unsubscribed",
          dedupe_key: `consent:${source}:${topic.key}`,
          facts: { topic: topic.key },
          is_test: identity.is_test,
        });
      }
      await trx("comm_threads").where({ id: thread.id }).update({ subscription_draft: null });
      return enqueue(
        trx,
        n,
        thread,
        selected.length ? "Подписки сохранены." : "Все подписки отключены.",
        {},
        menu,
      );
    }
    const active = await trx("comm_subscriptions")
      .where({ identity_id: thread.identity_id, consent: true })
      .pluck("topic_key");
    const draft = thread.subscription_draft ?? active;
    const topics = await trx("comm_topics").where({ active: true }).orderBy("sort");
    const rows = topics.map((t: any) => [
      `${draft.includes(t.key) ? "✓ " : "○ "}${t.label}`,
      `news:toggle:${t.key}`,
    ]);
    rows.push(
      ["Сохранить подписки", "news:save"],
      ["Отключить всё", "news:off"],
      ["Главное меню", "main"],
    );
    return enqueue(
      trx,
      n,
      thread,
      `${settings.consent_text}\nИзменения применяются после нажатия «Сохранить подписки».`,
      {},
      rows,
    );
  }
  async function bindToken(trx: Database, n: Connection, thread: any, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const link = await trx("comm_link_tokens")
      .where({ hash: digest(token), state: "pending" })
      .andWhere("expires_at", ">", trx.fn.now())
      .forUpdate()
      .first();
    if (!link) return false;
    const lead = await trx("leads").where({ id: link.lead_id }).first();
    if (!activeLead(lead) || lead.store_location_id !== n.store_id) return false;
    if (link.source_identity_id) {
      if (link.source_identity_id === thread.identity_id) return false;
      await trx("comm_link_tokens")
        .where({ hash: link.hash })
        .update({ target_identity_id: thread.identity_id, state: "confirm" });
      const source = await trx("comm_threads")
        .where({ identity_id: link.source_identity_id })
        .first();
      const sourceConnection = await trx("comm_connections")
        .where({ id: source.connection_id })
        .first();
      // The confirmation is bound to the source identity; forwarding this button cannot grant access.
      await enqueue(
        trx,
        sourceConnection,
        source,
        `Подтвердите продолжение этой заявки в ${n.platform}.`,
        {},
        [["Подтвердить", `link:${Buffer.from(link.hash, "hex").toString("base64url")}`]],
      );
      await enqueue(trx, n, thread, "Подтвердите связь в исходном чате. История пока недоступна.");
      return true;
    }
    const [c] = await trx("comm_conversations")
      .insert({ thread_id: thread.id, lead_id: lead.id })
      .onConflict(["thread_id", "lead_id"])
      .merge({ thread_id: thread.id })
      .returning("*");
    await trx("comm_access_grants")
      .insert({ identity_id: thread.identity_id, lead_id: lead.id })
      .onConflict(["identity_id", "lead_id"])
      .merge({ revoked_at: null });
    await trx("comm_link_tokens")
      .where({ hash: link.hash })
      .update({ state: "done", target_identity_id: thread.identity_id });
    await trx("comm_threads").where({ id: thread.id }).update({ selected_conversation_id: c.id });
    await enqueue(trx, n, thread, "Заявка подключена. Напишите сообщение менеджеру.");
    return true;
  }
  async function processIncoming(connectionId: string) {
    enabled();
    return db.transaction(async (trx: Database) => {
      const n: Connection = await trx("comm_connections")
        .where({ id: connectionId, enabled: true })
        .forUpdate()
        .first();
      if (!n) return null;
      const row = await trx("comm_inbound")
        .where({ connection_id: n.id, state: "pending" })
        .orderBy("received_at")
        .forUpdate()
        .skipLocked()
        .first();
      if (!row) return null;
      if (!isStoredEvent(row.event)) {
        await trx("comm_inbound")
          .where({ id: row.id })
          .update({
            state: "failed",
            processed_at: trx.fn.now(),
            error_code: "INVALID_STORED_EVENT",
            result: { result: "failed", error: "INVALID_STORED_EVENT" },
          });
        return { id: row.id, failed: true, error: "INVALID_STORED_EVENT" };
      }
      const e: IncomingEvent = row.event;
      if (e.kind === "staff") {
        if (!staffProcessor) return fail("STAFF_ADAPTER_UNAVAILABLE", 503);
        const result = await staffProcessor(trx, n, row);
        await trx("comm_inbound")
          .where({ id: row.id })
          .update({ state: "done", processed_at: trx.fn.now(), result });
        return result;
      }
      const { identity, thread } = await ensureIdentity(trx, n, e);
      if (e.kind === "availability" || e.kind === "started") {
        if (
          !identity.availability_at ||
          new Date(identity.availability_at) <= new Date(e.occurredAt)
        ) {
          await trx("comm_identities")
            .where({ id: identity.id })
            .update({ availability: e.availability, availability_at: e.occurredAt });
          if (e.availability === "blocked")
            await trx("comm_outbox")
              .where({ identity_id: identity.id, state: "pending" })
              .update({ state: "blocked", error_code: "RECIPIENT_UNAVAILABLE" });
        }
      }
      if (["message", "callback", "started"].includes(e.kind)) {
        await trx("comm_identities")
          .where({ id: identity.id })
          .where((q: any) =>
            q.whereNull("last_active_at").orWhere("last_active_at", "<", e.occurredAt),
          )
          .update({ last_active_at: e.occurredAt });
        await event(trx, {
          connection_id: n.id,
          identity_id: identity.id,
          kind: "active",
          dedupe_key: `active:${row.id}`,
          occurred_at: e.occurredAt,
          is_test: identity.is_test,
        });
      }
      let handled = false,
        resultCode = "ignored";
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
            "Ссылка уже использована или срок её действия истёк. Выберите действующую заявку или создайте новое обращение.",
            {},
            menu,
          );
        handled = true;
      } else if (start || ["/help", "main", "/start"].includes(text) || e.kind === "started") {
        if (start?.[1] && start[1].length < 65)
          await trx("comm_identities")
            .where({ id: identity.id })
            .whereNull("source")
            .update({ source: start[1] });
        await welcome(trx, n, thread);
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("link:")) {
        const hash = Buffer.from(text.slice(5), "base64url").toString("hex"),
          link = await trx("comm_link_tokens")
            .where({ hash, state: "confirm", source_identity_id: identity.id })
            .andWhere("expires_at", ">", trx.fn.now())
            .forUpdate()
            .first();
        if (link) {
          const ids = [identity.id, link.target_identity_id].sort();
          const identities = await trx("comm_identities")
            .whereIn("id", ids)
            .orderBy("id")
            .forUpdate();
          const target = identities.find((i: any) => i.id === link.target_identity_id);
          const contacts = await trx("comm_contacts")
            .whereIn("id", [identity.contact_id, target.contact_id])
            .orderBy("id")
            .forUpdate();
          if (contacts.some((c: any) => c.merged_into)) return fail("CONTACT_ALREADY_MERGED", 409);
          if (target.contact_id !== identity.contact_id) {
            await trx("comm_identities")
              .where({ contact_id: target.contact_id })
              .update({ contact_id: identity.contact_id });
            await trx("comm_frequency")
              .where({ contact_id: target.contact_id })
              .update({ contact_id: identity.contact_id });
            await trx("comm_outbox")
              .where({ contact_id: target.contact_id, purpose: "marketing", state: "pending" })
              .update({ state: "cancelled", error_code: "IDENTITY_LINK_RECHECK" });
            await trx("comm_contacts")
              .where({ id: target.contact_id })
              .update({ merged_into: identity.contact_id });
          }
          const targetThread = await trx("comm_threads").where({ identity_id: target.id }).first();
          const [c] = await trx("comm_conversations")
            .insert({ thread_id: targetThread.id, lead_id: link.lead_id })
            .onConflict(["thread_id", "lead_id"])
            .merge({ thread_id: targetThread.id })
            .returning("*");
          await trx("comm_access_grants")
            .insert({ identity_id: target.id, lead_id: link.lead_id })
            .onConflict(["identity_id", "lead_id"])
            .merge({ revoked_at: null });
          await trx("comm_threads")
            .where({ id: targetThread.id })
            .update({ selected_conversation_id: c.id });
          await trx("comm_link_tokens").where({ hash }).update({ state: "done" });
          await event(trx, {
            identity_id: identity.id,
            kind: "identity_linked",
            dedupe_key: `link:${hash}`,
            facts: { target: target.id, lead: link.lead_id },
            is_test: identity.is_test,
          });
          await enqueue(trx, n, thread, "Связь подтверждена для выбранной заявки.");
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
            let draft =
              thread.subscription_draft ??
              (await trx("comm_subscriptions")
                .where({ identity_id: identity.id, consent: true })
                .pluck("topic_key"));
            draft = draft.includes(key) ? draft.filter((v: string) => v !== key) : [...draft, key];
            await trx("comm_threads")
              .where({ id: thread.id })
              .update({ subscription_draft: JSON.stringify(draft) });
            await subscriptions(trx, n, { ...thread, subscription_draft: draft }, null, e.id);
          }
        }
        handled = true;
        resultCode = "selected";
      }
      if (["/dialogs", "dialogs"].includes(text)) {
        const choices = await trx("comm_conversations as c")
          .join("leads as l", "l.id", "c.lead_id")
          .where("c.thread_id", thread.id)
          .whereIn("l.status", ["new", "in_progress", "waiting"])
          .select("c.id", "l.reference_code");
        await enqueue(
          trx,
          n,
          thread,
          choices.length ? "Выберите заявку." : "Активных заявок пока нет.",
          {},
          choices.map((c: any) => [c.reference_code || "Заявка", `dialog:${c.id}`]),
        );
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && text.startsWith("dialog:")) {
        const id = text.slice(7);
        const c = UUID.test(id)
          ? await trx("comm_conversations").where({ id, thread_id: thread.id }).first()
          : null;
        if (
          c &&
          (await trx("comm_access_grants")
            .where({ identity_id: identity.id, lead_id: c.lead_id })
            .whereNull("revoked_at")
            .first())
        ) {
          await trx("comm_threads")
            .where({ id: thread.id })
            .update({ selected_conversation_id: id });
          await enqueue(trx, n, thread, "Напишите сообщение по выбранной заявке.");
        }
        handled = true;
        resultCode = "selected";
      }
      if (["/new", "new"].includes(text)) {
        await enqueue(trx, n, thread, "Выберите тему нового обращения.", {}, menu.slice(0, 3));
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "callback" && /^kind:(selection|trade|support)$/.test(text)) {
        await trx("comm_threads")
          .where({ id: thread.id })
          .update({ pending_kind: text.slice(5), selected_conversation_id: null });
        await enqueue(trx, n, thread, "Опишите вопрос или приложите файл.");
        handled = true;
        resultCode = "selected";
      }
      if (e.kind === "unsupported")
        await enqueue(
          trx,
          n,
          thread,
          "Этот формат пока не поддерживается. Напишите текст или приложите фото, аудио, видео либо документ до 20 МБ.",
        );
      if (e.kind === "edited") {
        const original = await trx("comm_messages")
          .where({ thread_id: thread.id, external_id: e.externalMessageId, direction: "in" })
          .first();
        if (
          original &&
          (!original.edited_at || new Date(original.edited_at) < new Date(e.occurredAt))
        )
          await trx("comm_messages")
            .where({ id: original.id })
            .update({ text: validText(e.text, 20000), edited_at: e.occurredAt });
        if (!original) {
          await trx("comm_inbound")
            .where({ id: row.id })
            .update({ state: "failed", error_code: "EDIT_AWAITS_ORIGINAL" });
          return { id: row.id, deferred: true };
        }
        resultCode = "received";
      } else if (e.kind === "message" && !handled && (e.text.trim() || e.attachments.length)) {
        let c = thread.selected_conversation_id
          ? await trx("comm_conversations").where({ id: thread.selected_conversation_id }).first()
          : null;
        const lead = c ? await trx("leads").where({ id: c.lead_id }).first() : null;
        if (
          c &&
          !(await trx("comm_access_grants")
            .where({ identity_id: identity.id, lead_id: c.lead_id })
            .whereNull("revoked_at")
            .first())
        )
          c = null;
        if (!c || !activeLead(lead))
          c = await makeLead(trx, n, thread, e, identity, thread.pending_kind || "support");
        const [message] = await trx("comm_messages")
          .insert({
            thread_id: thread.id,
            conversation_id: c.id,
            direction: "in",
            text: validText(e.text, 20000),
            external_id: e.externalMessageId,
            occurred_at: e.occurredAt,
            album_id: e.albumId,
          })
          .onConflict(["thread_id", "external_id", "direction"])
          .ignore()
          .returning("*");
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
              external_ref: a,
            });
        if (message && staffNotifier) await staffNotifier(trx, n, c, message);
        if (message)
          await trx("comm_inbound")
            .where({ connection_id: n.id, state: "failed", error_code: "EDIT_AWAITS_ORIGINAL" })
            .whereRaw("event->>'externalMessageId'=?", [e.externalMessageId])
            .update({ state: "pending", error_code: null });
        await trx("comm_conversations")
          .where({ id: c.id })
          .update({
            last_inbound_at: e.occurredAt,
            awaiting_since: c.awaiting_since || e.occurredAt,
            handling: lead?.assigned_to ? "agent" : "queued",
            version: trx.raw("version+1"),
          });
        if (!lead) await enqueue(trx, n, thread, "Обращение принято. Ответ менеджера придёт сюда.");
        resultCode = "received";
      }
      await event(trx, {
        connection_id: n.id,
        identity_id: identity.id,
        kind: e.kind,
        dedupe_key: `event:${row.id}`,
        occurred_at: e.occurredAt,
        is_test: identity.is_test,
      });
      await trx("comm_inbound")
        .where({ id: row.id })
        .update({ state: "done", processed_at: trx.fn.now(), result: { result: resultCode } });
      return { id: row.id, result: resultCode };
    });
  }
  async function commands(a: Actor, command: Command, transaction?: Database) {
    if (!UUID.test(command.key || "")) return fail("COMMAND_KEY_REQUIRED");
    const execute = async (trx: Database) => {
      const fingerprint = digest(canonical(command));
      await trx("comm_command_receipts")
        .insert({
          actor_id: a.user,
          command_type: command.type,
          command_key: command.key,
          fingerprint,
        })
        .onConflict(["actor_id", "command_type", "command_key"])
        .ignore();
      const receipt = await trx("comm_command_receipts")
        .where({ actor_id: a.user, command_type: command.type, command_key: command.key })
        .forUpdate()
        .first();
      if (receipt.fingerprint !== fingerprint) return fail("IDEMPOTENCY_PARAMETER_MISMATCH", 409);
      const { c, service, staff, accountability } = await permitted(
        trx,
        a,
        command.conversation_id || "",
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
          "kind",
        ],
      });
      const locked = await trx("comm_conversations").where({ id: c.id }).forUpdate().first();
      if (command.type !== "read" && command.expected_version !== locked.version)
        return fail("STALE_CONVERSATION", 409);
      const n = await trx("comm_connections").where({ id: c.connection_id }).first(),
        thread = await trx("comm_threads").where({ id: c.thread_id }).first();
      const p = command.payload || {};
      let result: any = { ok: true };
      if (command.type === "read") {
        const latest = await trx("comm_messages")
          .where({ conversation_id: c.id })
          .max("sequence as sequence")
          .first();
        await trx("comm_reads")
          .insert({ user_id: a.user, conversation_id: c.id, sequence: latest.sequence || 0 })
          .onConflict(["user_id", "conversation_id"])
          .merge({ sequence: latest.sequence || 0 });
      } else if (command.type === "claim" || command.type === "assign") {
        const current = await trx("leads").where({ id: lead.id }).forUpdate().first();
        if (!activeLead(current)) return fail("LEAD_CLOSED", 409);
        if (command.type === "claim" && current.assigned_to && current.assigned_to !== a.user)
          return fail("ALREADY_ASSIGNED", 409);
        const assignee = command.type === "claim" ? a.user : String(p.user_id || "");
        if (command.type === "assign" && !staff.can_manage) return fail("FORBIDDEN", 403);
        if (
          !UUID.test(assignee) ||
          !(await trx("comm_staff")
            .where({ user_id: assignee, store_id: c.store_id, enabled: true })
            .first())
        )
          return fail("INVALID_ASSIGNEE");
        await userAccountability(trx, assignee);
        await service.updateOne(lead.id, { assigned_to: assignee, status: "in_progress" });
        await trx("comm_conversations").where({ id: c.id }).update({ handling: "agent" });
      } else if (command.type === "reply" || command.type === "note") {
        if (command.type === "reply" && (!activeLead(lead) || lead.assigned_to !== a.user))
          return fail("CLAIM_REQUIRED", 403);
        const text = validText(p.text ?? "");
        const ids = Array.isArray(p.attachment_ids) ? p.attachment_ids : [];
        if (ids.length > 10 || ids.some((id: unknown) => typeof id !== "string" || !UUID.test(id)))
          return fail("INVALID_ATTACHMENTS");
        if (!text && !ids.length) return fail("EMPTY_MESSAGE");
        const files = ids.length
          ? await trx("comm_attachments")
              .whereIn("id", ids)
              .where({ uploaded_by: a.user, conversation_id: c.id, state: "ready" })
              .whereNull("message_id")
              .forUpdate()
          : [];
        if (files.length !== ids.length) return fail("ATTACHMENT_NOT_READY", 409);
        const comments = await itemService(trx, "lead_comments", accountability);
        await comments.createOne({
          lead: lead.id,
          comment: text || "Вложение",
          outcome: "note",
          created_by: a.user,
        });
        const [m] = await trx("comm_messages")
          .insert({
            thread_id: thread.id,
            conversation_id: c.id,
            direction: command.type === "note" ? "internal" : "out",
            text,
            created_by: a.user,
          })
          .returning("*");
        if (ids.length)
          await trx("comm_attachments").whereIn("id", ids).update({ message_id: m.id });
        if (command.type === "reply") {
          const outbox = await enqueue(trx, n, thread, text || "Вложение", {
            conversation_id: c.id,
            message_id: m.id,
            created_by: a.user,
            expected_version: locked.version + 1,
            dedupe_key: `reply:${command.key}`,
            expires_at: new Date(Date.now() + 24 * 3600000),
          });
          if (!text) await trx("comm_operations").where({ outbox_id: outbox.id }).delete();
          let position = text ? 1 : 0;
          const attachmentRecipient =
            n.platform === "max"
              ? { user_id: await maxUserId(trx, thread) }
              : { peer_id: thread.external_peer_id };
          for (const f of files)
            await trx("comm_operations").insert({
              outbox_id: outbox.id,
              position: position++,
              method: "attachment",
              payload: { attachment_id: f.id, ...attachmentRecipient },
            });
        }
        result = { ok: true, message_id: m.id };
      } else if (command.type === "handling") {
        if (lead.assigned_to !== a.user && !staff.can_manage) return fail("FORBIDDEN", 403);
        const handling = nextHandling(locked.handling, p.state);
        await trx("comm_conversations")
          .where({ id: c.id })
          .update({ handling, ...(handling === "closed" ? { closed_at: trx.fn.now() } : {}) });
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
          expires_at: new Date(Date.now() + 15 * 60000),
        });
        // A staff command initiates the flow; the source customer must still confirm in their chat.
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
        is_test: Boolean(lead.is_test),
      });
      await trx("comm_command_receipts")
        .where({ id: receipt.id })
        .update({
          result:
            command.type === "link_start"
              ? { ok: true, issued: true, expires_in: 900, version: result.version }
              : result,
        });
      return result;
    };
    return transaction ? execute(transaction) : db.transaction(execute);
  }
  async function inbox(a: Actor, query: any = {}) {
    const stores = await db("comm_staff")
      .where({ user_id: a.user, enabled: true })
      .pluck("store_id");
    let q = db("comm_conversations as c")
      .join("leads as l", "l.id", "c.lead_id")
      .join("comm_threads as t", "t.id", "c.thread_id")
      .join("comm_connections as n", "n.id", "t.connection_id")
      .join("comm_identities as i", "i.id", "t.identity_id")
      .leftJoin("comm_reads as r", function (this: any) {
        this.on("r.conversation_id", "=", "c.id").andOn("r.user_id", "=", db.raw("?", [a.user]));
      })
      .whereIn("n.store_id", stores)
      .whereRaw("(l.store_location_id IS NULL OR l.store_location_id=n.store_id)");
    const view = query.view || query.filter;
    if (view === "mine") q = q.where("l.assigned_to", a.user);
    else if (view === "unassigned") q = q.whereNull("l.assigned_to");
    else if (view === "awaiting") q = q.whereNotNull("c.awaiting_since");
    else if (view === "closed") q = q.where("c.handling", "closed");
    else q = q.whereNot("c.handling", "closed");
    if (["telegram", "max", "vk"].includes(query.platform))
      q = q.where("n.platform", query.platform);
    const rows = await q
      .orderByRaw("c.awaiting_since ASC NULLS LAST")
      .orderBy("c.created_at", "desc")
      .limit(100)
      .select(
        "c.*",
        "l.reference_code",
        "l.kind",
        "l.status",
        "l.assigned_to",
        "n.platform",
        "i.external_user_id",
        db.raw(`CASE
          WHEN c.first_agent_response_at IS NOT NULL AND c.first_response_due_at IS NOT NULL
            THEN CASE WHEN c.first_agent_response_at<=c.first_response_due_at THEN 'met' ELSE 'breached' END
          WHEN c.sla_escalated_at IS NOT NULL THEN 'escalated'
          WHEN c.escalation_due_at<=now() THEN 'overdue'
          WHEN c.first_response_due_at<=now() THEN 'warning'
          WHEN c.first_response_due_at IS NOT NULL THEN 'on_track'
          ELSE 'untracked'
        END AS sla_state`),
        db.raw(
          "(SELECT count(*)::int FROM comm_messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.deleted_at IS NULL AND m.sequence>COALESCE(r.sequence,0)) AS unread_count",
        ),
      );
    const service = await itemService(db, "leads", await userAccountability(db, a.user));
    const ids = rows.map((r: any) => r.lead_id);
    if (!ids.length) return [];
    const allowed = await service.readByQuery({
      fields: ["id"],
      limit: 100,
      filter: { id: { _in: ids } },
    });
    return rows.filter((r: any) => allowed.some((v: any) => v.id === r.lead_id));
  }
  async function messages(a: Actor, threadId: string, query: any = {}) {
    const conversationId = String(query.conversation_id || "");
    const { c } = await permitted(db, a, conversationId);
    if (c.thread_id !== threadId) return fail("FORBIDDEN", 403);
    let q = db("comm_messages").where({ conversation_id: c.id }).whereNull("deleted_at");
    if (query.before) {
      if (!/^\d+$/.test(String(query.before))) return fail("INVALID_CURSOR");
      q = q.where("sequence", "<", query.before);
    }
    const rows = await q.orderBy("sequence", "desc").limit(50);
    const files = rows.length
      ? await db("comm_attachments")
          .whereIn(
            "message_id",
            rows.map((r: any) => r.id),
          )
          .select("id", "message_id", "kind", "name", "mime", "size", "state", "error_code")
      : [];
    const jobs = rows.length
      ? await db("comm_outbox")
          .whereIn(
            "message_id",
            rows.map((r: any) => r.id),
          )
          .select("message_id", "state", "error_code")
      : [];
    return rows
      .map((m: any) => ({
        ...m,
        attachments: files.filter((f: any) => f.message_id === m.id),
        delivery: jobs.find((j: any) => j.message_id === m.id) || null,
      }))
      .reverse();
  }
  async function connections(a: Actor) {
    const scopes = await db("comm_staff")
      .where({ user_id: a.user, enabled: true, can_manage: true })
      .pluck("store_id");
    if (!scopes.length) return fail("FORBIDDEN", 403);
    const result = await db.raw(
      `SELECT n.id,n.name,n.platform,n.enabled,n.mode,n.bot_username,n.marketing_enabled,
      n.last_received_at,n.last_sent_at,n.error_code,n.send_after,
      (SELECT count(*)::int FROM comm_identities i WHERE i.connection_id=n.id) AS accounts,
      (SELECT count(*)::int FROM comm_identities i WHERE i.connection_id=n.id AND i.is_test) AS test_accounts,
      (SELECT count(*)::int FROM comm_conversations c JOIN comm_threads t ON t.id=c.thread_id
        WHERE t.connection_id=n.id AND c.handling<>'closed') AS open_conversations,
      (SELECT count(*)::int FROM comm_inbound i WHERE i.connection_id=n.id AND i.state='pending') AS inbound_pending,
      (SELECT count(*)::int FROM comm_inbound i WHERE i.connection_id=n.id AND i.state='failed'
        AND i.received_at>=now()-interval '24 hours') AS inbound_failed_24,
      (SELECT count(*)::int FROM comm_outbox o WHERE o.connection_id=n.id
        AND o.state IN ('pending','sending')) AS outbox_pending,
      (SELECT count(*)::int FROM comm_outbox o WHERE o.connection_id=n.id
        AND o.state='uncertain') AS uncertain,
      (SELECT count(*)::int FROM comm_outbox o WHERE o.connection_id=n.id
        AND o.state='failed' AND o.created_at>=now()-interval '24 hours') AS delivery_failed_24,
      (SELECT count(*)::int FROM comm_outbox o WHERE o.connection_id=n.id
        AND o.state='partial' AND o.created_at>=now()-interval '24 hours') AS delivery_partial_24,
      (SELECT min(i.received_at) FROM comm_inbound i
        WHERE i.connection_id=n.id AND i.state='pending') AS oldest_inbound_at,
      (SELECT min(o.created_at) FROM comm_outbox o
        WHERE o.connection_id=n.id AND o.state IN ('pending','sending')) AS oldest_outbox_at,
      CASE
        WHEN NOT n.enabled THEN 'disabled'
        WHEN n.error_code IS NOT NULL THEN 'error'
        WHEN EXISTS(SELECT 1 FROM comm_outbox o WHERE o.connection_id=n.id AND o.state='uncertain')
          THEN 'attention'
        WHEN EXISTS(SELECT 1 FROM comm_inbound i WHERE i.connection_id=n.id AND i.state='pending'
          AND i.received_at<now()-interval '5 minutes')
          OR EXISTS(SELECT 1 FROM comm_outbox o WHERE o.connection_id=n.id
          AND o.state IN ('pending','sending') AND o.created_at<now()-interval '5 minutes')
          THEN 'delayed'
        WHEN n.last_received_at IS NULL AND n.last_sent_at IS NULL THEN 'idle'
        ELSE 'ok'
      END AS health
      FROM comm_connections n WHERE n.store_id=ANY(?::uuid[]) ORDER BY n.name`,
      [scopes],
    );
    const runtime = await db("comm_runtime")
      .where({ id: 1 })
      .first([
        "active",
        "sending_enabled",
        "recovery_hold",
        "cutover_at",
        "baseline_at",
        "last_backup_at",
      ]);
    const rows = [...result.rows];
    const legacyBotId = String(env.ISVOI_TELEGRAM_BOT_ID || "");
    const legacyCutoverConnection =
      flag(env.ISVOI_TELEGRAM_USE_COMMUNICATIONS) && /^\d+$/.test(legacyBotId)
      ? await db("comm_connections")
          .where({ platform: "telegram", external_id: legacyBotId, enabled: true })
          .whereIn("store_id", scopes)
          .first("id")
      : null;
    if (
      flag(env.ISVOI_TELEGRAM_ENABLED) &&
      /^\d+$/.test(legacyBotId) &&
      !legacyCutoverConnection
    ) {
      const routes = await db("telegram_routes")
        .where({ bot_id: legacyBotId, enabled: true })
        .whereIn("store_id", scopes)
        .select("id");
      const routeIds = routes.map((route: any) => route.id);
      if (routeIds.length) {
        const count = async (query: any) =>
          Number((await query.count("* as value").first())?.value || 0);
        const scalar = async (query: any) => (await query.first())?.value || null;
        const newest = (...values: any[]) => {
          const dates = values.filter(Boolean).map((value) => new Date(value));
          return dates.length
            ? new Date(Math.max(...dates.map((value) => value.getTime()))).toISOString()
            : null;
        };
        const oldest = (...values: any[]) => {
          const dates = values.filter(Boolean).map((value) => new Date(value));
          return dates.length
            ? new Date(Math.min(...dates.map((value) => value.getTime()))).toISOString()
            : null;
        };
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [
          settings,
          telegramRuntime,
          accounts,
          openConversations,
          pendingMessages,
          pendingCards,
          uncertainMessages,
          uncertainCards,
          failedMessages,
          failedCards,
          lastInboundMessage,
          lastOutboundMessage,
          lastOutboxSent,
          lastCardSent,
          oldestMessage,
          oldestCard,
        ] = await Promise.all([
          db("telegram_bot_settings").where({ bot_id: legacyBotId }).first(),
          db("telegram_runtime").where({ bot_id: legacyBotId }).first(),
          count(db("telegram_client_sessions").where({ bot_id: legacyBotId })),
          count(
            db("lead_conversations as c").whereIn("c.route_id", routeIds).whereNull("c.closed_at"),
          ),
          count(
            db("telegram_message_outbox")
              .where({ bot_id: legacyBotId })
              .whereIn("state", ["pending", "in_flight"]),
          ),
          count(
            db("telegram_deliveries")
              .whereIn("route_id", routeIds)
              .whereIn("state", ["pending", "in_flight"]),
          ),
          count(db("telegram_message_outbox").where({ bot_id: legacyBotId, state: "uncertain" })),
          count(
            db("telegram_deliveries").whereIn("route_id", routeIds).where({ state: "uncertain" }),
          ),
          count(
            db("telegram_message_outbox")
              .where({ bot_id: legacyBotId, state: "failed" })
              .where("created_at", ">=", since),
          ),
          count(
            db("telegram_deliveries")
              .whereIn("route_id", routeIds)
              .where({ state: "failed" })
              .where("created_at", ">=", since),
          ),
          scalar(
            db("lead_messages as m")
              .join("lead_conversations as c", "c.id", "m.conversation_id")
              .whereIn("c.route_id", routeIds)
              .where("m.direction", "in")
              .max("m.created_at as value"),
          ),
          scalar(
            db("lead_messages as m")
              .join("lead_conversations as c", "c.id", "m.conversation_id")
              .whereIn("c.route_id", routeIds)
              .where("m.direction", "out")
              .max("m.created_at as value"),
          ),
          scalar(
            db("telegram_message_outbox")
              .where({ bot_id: legacyBotId, state: "done" })
              .max("sent_at as value"),
          ),
          scalar(
            db("telegram_deliveries")
              .whereIn("route_id", routeIds)
              .where({ state: "done" })
              .max("sent_at as value"),
          ),
          scalar(
            db("telegram_message_outbox")
              .where({ bot_id: legacyBotId })
              .whereIn("state", ["pending", "in_flight"])
              .min("created_at as value"),
          ),
          scalar(
            db("telegram_deliveries")
              .whereIn("route_id", routeIds)
              .whereIn("state", ["pending", "in_flight"])
              .min("created_at as value"),
          ),
        ]);
        const outboxPending = pendingMessages + pendingCards;
        const uncertain = uncertainMessages + uncertainCards;
        const oldestOutboxAt = oldest(oldestMessage, oldestCard);
        const workerActive =
          telegramRuntime?.lease_until &&
          new Date(telegramRuntime.lease_until).getTime() > Date.now();
        const health = !workerActive
          ? "error"
          : uncertain
            ? "attention"
            : oldestOutboxAt && Date.now() - new Date(oldestOutboxAt).getTime() > 5 * 60 * 1000
              ? "delayed"
              : "ok";
        rows.push({
          id: `legacy-telegram-${legacyBotId}`,
          name: "Telegram · I СВОИ · Поддержка",
          platform: "telegram",
          enabled: true,
          mode: String(env.ISVOI_TELEGRAM_MODE || "production"),
          bot_username: String(
            env.ISVOI_TELEGRAM_BOT_USERNAME || settings?.public_username || "",
          ).replace(/^@/, ""),
          marketing_enabled: Boolean(settings?.notifications_enabled),
          marketing_mode: settings?.pilot_mode ? "pilot" : "public",
          last_received_at: newest(lastInboundMessage),
          last_sent_at: newest(lastOutboundMessage, lastOutboxSent, lastCardSent),
          error_code: workerActive ? null : "LEGACY_TELEGRAM_WORKER_INACTIVE",
          send_after: telegramRuntime?.send_after || null,
          accounts,
          test_accounts: null,
          open_conversations: openConversations,
          inbound_pending: null,
          inbound_failed_24: 0,
          outbox_pending: outboxPending,
          uncertain,
          delivery_failed_24: failedMessages + failedCards,
          delivery_partial_24: 0,
          oldest_inbound_at: null,
          oldest_outbox_at: oldestOutboxAt,
          health,
          source: "legacy_telegram",
          migration_state: "awaiting_cutover",
        });
      }
    }
    rows.sort(
      (left: any, right: any) =>
        ["telegram", "max", "vk"].indexOf(left.platform) -
          ["telegram", "max", "vk"].indexOf(right.platform) ||
        String(left.name).localeCompare(String(right.name), "ru"),
    );
    return { checked_at: new Date().toISOString(), runtime, connections: rows };
  }
  async function audience(a: Actor) {
    const scopes = await db("comm_staff")
      .where({ user_id: a.user, enabled: true, can_manage: true })
      .pluck("store_id");
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
      [scopes],
    );
    const topics = await db.raw(
      `SELECT n.id AS connection_id,s.topic_key,count(DISTINCT s.identity_id)::int AS subscribers
      FROM comm_subscriptions s JOIN comm_identities i ON i.id=s.identity_id JOIN comm_connections n ON n.id=i.connection_id
      WHERE s.consent AND NOT i.is_test AND n.store_id=ANY(?::uuid[]) GROUP BY n.id,s.topic_key`,
      [scopes],
    );
    const daily = await db.raw(
      `SELECT e.connection_id,(e.occurred_at AT TIME ZONE 'Europe/Moscow')::date AS day,e.kind,count(*)::int AS events
      FROM comm_events e JOIN comm_connections n ON n.id=e.connection_id WHERE NOT e.is_test AND n.store_id=ANY(?::uuid[])
      AND e.occurred_at>=now()-interval '30 days' AND e.kind IN ('first_seen','subscribed','unsubscribed','lead_created') GROUP BY 1,2,3 ORDER BY 2`,
      [scopes],
    );
    return {
      connections: result.rows,
      topics: topics.rows,
      daily: daily.rows,
      baseline_at: (await db("comm_runtime").where({ id: 1 }).first())?.baseline_at,
    };
  }
  async function audienceContacts(a: Actor, query: any = {}) {
    const scopes = await db("comm_staff")
      .where({ user_id: a.user, enabled: true, can_manage: true })
      .pluck("store_id");
    if (!scopes.length) return fail("FORBIDDEN", 403);
    let rows = db("comm_contacts as contact")
      .join("comm_identities as identity", "identity.contact_id", "contact.id")
      .join("comm_connections as connection", "connection.id", "identity.connection_id")
      .whereIn("connection.store_id", scopes)
      .groupBy("contact.id")
      .select(
        "contact.id",
        "contact.name",
        db.raw("min(identity.first_seen_at) as first_seen_at"),
        db.raw("max(identity.last_active_at) as last_active_at"),
        db.raw("count(distinct identity.id)::int as account_count"),
        db.raw("bool_or(identity.availability='blocked') as has_blocked_account"),
        db.raw("bool_or(exists(select 1 from comm_subscriptions subscription where subscription.identity_id=identity.id and subscription.consent)) as subscribed"),
        db.raw("coalesce(jsonb_agg(distinct jsonb_build_object('platform',connection.platform,'connection_id',connection.id,'external_user_id',identity.external_user_id,'availability',identity.availability)),'[]'::jsonb) as accounts"),
        db.raw("(select count(*)::int from comm_threads thread join comm_conversations conversation on conversation.thread_id=thread.id where thread.identity_id in (select related.id from comm_identities related where related.contact_id=contact.id)) as conversations"),
      );
    if (query.include_test !== "true") rows = rows.where({ "identity.is_test": false });
    if (["telegram", "max", "vk"].includes(query.platform))
      rows = rows.where("connection.platform", query.platform);
    if (query.search) {
      const search = `%${String(query.search).slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`;
      rows = rows.where((builder: any) =>
        builder.whereILike("contact.name", search).orWhereILike("identity.external_user_id", search),
      );
    }
    if (query.topic)
      rows = rows.whereExists(
        db("comm_subscriptions as selected_subscription")
          .select(1)
          .whereRaw("selected_subscription.identity_id=identity.id")
          .where({ topic_key: String(query.topic).slice(0, 100), consent: true }),
      );
    if (query.status === "subscribed")
      rows = rows.havingRaw("bool_or(exists(select 1 from comm_subscriptions subscription where subscription.identity_id=identity.id and subscription.consent))");
    else if (query.status === "blocked")
      rows = rows.havingRaw("bool_or(identity.availability='blocked')");
    else if (query.status === "active_7")
      rows = rows.havingRaw("max(identity.last_active_at)>=now()-interval '7 days'");
    return rows.orderByRaw("max(identity.last_active_at) desc nulls last").limit(100);
  }
  async function audienceContact(a: Actor, contactId: string) {
    if (!UUID.test(contactId)) return fail("NOT_FOUND", 404);
    const scopes = await db("comm_staff")
      .where({ user_id: a.user, enabled: true, can_manage: true })
      .pluck("store_id");
    if (!scopes.length) return fail("FORBIDDEN", 403);
    const identities = await db("comm_identities as identity")
      .join("comm_connections as connection", "connection.id", "identity.connection_id")
      .where({ "identity.contact_id": contactId })
      .whereIn("connection.store_id", scopes)
      .select(
        "identity.*",
        "connection.name as connection_name",
        "connection.platform",
        "connection.store_id",
      );
    if (!identities.length) return fail("NOT_FOUND", 404);
    const identityIds = identities.map((identity: any) => identity.id);
    const threads = await db("comm_threads").whereIn("identity_id", identityIds).select("id");
    const threadIds = threads.map((thread: any) => thread.id);
    const subscriptions = await db("comm_subscriptions as subscription")
      .join("comm_topics as topic", "topic.key", "subscription.topic_key")
      .whereIn("subscription.identity_id", identityIds)
      .select("subscription.*", "topic.label");
    const conversations = threadIds.length
      ? await db("comm_conversations as conversation")
          .join("comm_threads as thread", "thread.id", "conversation.thread_id")
          .join("leads as lead", "lead.id", "conversation.lead_id")
          .whereIn("conversation.thread_id", threadIds)
          .orderBy("conversation.created_at", "desc")
          .select("conversation.id", "conversation.handling", "conversation.created_at", "conversation.last_inbound_at", "lead.id as lead_id", "lead.reference_code", "lead.status")
      : [];
    return {
      contact: await db("comm_contacts").where({ id: contactId }).first(),
      identities,
      subscriptions,
      consent_events: await db("comm_consent_events")
        .whereIn("identity_id", identityIds)
        .orderBy("created_at", "desc")
        .limit(100),
      events: await db("comm_events")
        .whereIn("identity_id", identityIds)
        .orderBy("occurred_at", "desc")
        .limit(100),
      conversations,
      deliveries: await db("comm_outbox as outbox")
        .leftJoin("comm_campaigns as campaign", "campaign.id", "outbox.campaign_id")
        .whereIn("outbox.identity_id", identityIds)
        .whereNotNull("outbox.campaign_id")
        .orderBy("outbox.created_at", "desc")
        .limit(100)
        .select("outbox.id", "outbox.state", "outbox.error_code", "outbox.accepted_at", "outbox.created_at", "outbox.test_delivery", "campaign.name as campaign_name"),
      frequency_7d: Number(
        (
          await db("comm_frequency")
            .where({ contact_id: contactId })
            .whereNull("released_at")
            .andWhere("reserved_at", ">", db.raw("now()-interval '7 days'"))
            .count("* as count")
            .first()
        )?.count || 0,
      ),
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
    connections,
    audience,
    audienceContacts,
    audienceContact,
    enqueue,
    event,
    setStaffProcessor,
    setStaffNotifier,
  };
}
