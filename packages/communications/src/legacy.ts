import { randomBytes } from "node:crypto";
import { createDelivery } from "./delivery.js";
import { digest, fail, flag, UUID } from "./policy.js";
import { createService } from "./service.js";
import { createStaff } from "./staff.js";
import type { Context, Database } from "./types.js";

const RESULT_TEXT: Record<string, string> = {
  claimed: "Заявка закреплена за вами.",
  already_yours: "Заявка уже у вас в работе.",
  already_assigned: "Заявку уже принял другой менеджер.",
  closed: "Заявка уже завершена.",
  forbidden: "Нет доступа к этой заявке.",
  stale: "Кнопка устарела. Откройте актуальную карточку.",
  selected: "Выбор сохранён.",
  linked: "Заявка подключена.",
  invalid_link: "Ссылка недействительна или уже использована.",
  draft_started: "Ответьте на приглашение бота в этой теме.",
  draft_ready: "Проверьте черновик и подтвердите отправку.",
  queued: "Ответ поставлен в очередь.",
  cancelled: "Отправка отменена.",
  rate_limited: "Слишком много действий. Подождите минуту.",
  received: "Сообщение принято.",
  ignored: "Действие не поддерживается.",
};

/**
 * Preserves the six legacy /isvoi-telegram endpoints while the old worker is replaced.
 * All durable state belongs to the communications core; this adapter never writes legacy queues.
 */
export function createLegacyTelegramCompatibility(context: Context) {
  const db = context.database,
    env = context.env,
    botId = String(env.ISVOI_TELEGRAM_BOT_ID || ""),
    mode = String(env.ISVOI_TELEGRAM_MODE || "test"),
    service = createService(context),
    delivery = createDelivery(context, service);
  createStaff(context, service);

  const continuationUrl = (connection: any, token: string, fallbackUsername = "") => {
    const configured = String(connection.bot_username || "").replace(/^@/, ""),
      username = /^[A-Za-z0-9_.-]{2,64}$/.test(configured) ? configured : fallbackUsername;
    if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username)) return null;
    if (connection.platform === "telegram") return `https://t.me/${username}?start=${token}`;
    if (connection.platform === "max") return `https://max.ru/${username}?start=${token}`;
    if (connection.platform === "vk")
      return `https://vk.me/${username}?ref=${token}&ref_source=site`;
    return null;
  };

  async function authorize(req: any, trx: Database, requireLease = true) {
    if (!flag(env.ISVOI_TELEGRAM_USE_COMMUNICATIONS)) return fail("TELEGRAM_COMPAT_DISABLED", 503);
    if (!flag(env.ISVOI_COMMUNICATIONS_ENABLED)) return fail("COMMUNICATIONS_DISABLED", 503);
    const user = req.accountability?.user;
    if (
      typeof user !== "string" ||
      !UUID.test(user) ||
      req.accountability?.admin === true ||
      String(req.body?.bot_id) !== botId ||
      !UUID.test(req.body?.worker_id || "")
    )
      return fail("FORBIDDEN", 403);
    const runtime = await trx("comm_runtime").where({ id: 1 }).first();
    if (!runtime?.active) return fail("COMMUNICATIONS_INACTIVE", 503);
    const connection = await trx("comm_connections")
      .where({
        platform: "telegram",
        external_id: botId,
        mode,
        worker_user_id: user,
        enabled: true,
      })
      .forUpdate()
      .first();
    if (!connection) return fail("FORBIDDEN", 403);
    const worker = await trx("directus_users").where({ id: user, status: "active" }).first("id");
    if (!worker) return fail("FORBIDDEN", 403);
    if (
      requireLease &&
      (connection.poll_owner !== req.body.worker_id ||
        new Date(connection.poll_until) <= new Date())
    )
      return fail("WORKER_LEASE_UNAVAILABLE", 409);
    return connection;
  }

  async function session(req: any) {
    return db.transaction(async (trx: Database) => {
      const connection = await authorize(req, trx, false);
      if (
        connection.poll_owner &&
        connection.poll_owner !== req.body.worker_id &&
        new Date(connection.poll_until) > new Date()
      )
        return fail("WORKER_LEASE_UNAVAILABLE", 409);
      await trx("comm_connections")
        .where({ id: connection.id })
        .update({
          poll_owner: req.body.worker_id,
          poll_until: new Date(Date.now() + 90000),
        });
      return {
        update_offset: Number(connection.poll_offset),
        mode: connection.mode,
        conversations: true,
      };
    });
  }

  async function refresh(req: any) {
    return db.transaction(async (trx: Database) => {
      const connection = await authorize(req, trx);
      await trx("comm_connections")
        .where({ id: connection.id })
        .update({
          poll_until: new Date(Date.now() + 90000),
        });
      return connection;
    });
  }

  async function next(req: any) {
    const connection = await refresh(req);
    const operation = await delivery.next(connection.id, req.accountability.user, [
      "topic",
      "text",
    ]);
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
        ...(outbox.purpose !== "staff" ? { channel: "conversation", destination: "client" } : {}),
        ...(outbox.campaign_id ? { campaign_id: outbox.campaign_id } : {}),
      },
    };
  }

  async function complete(req: any) {
    const connection = await refresh(req);
    if (!UUID.test(req.body?.id || "") || !UUID.test(req.body?.operation_id || ""))
      return fail("INVALID_OUTCOME");
    const operation = await db("comm_operations as o")
      .join("comm_outbox as b", "b.id", "o.outbox_id")
      .where({
        "o.id": req.body.id,
        "o.attempt_id": req.body.operation_id,
        "b.connection_id": connection.id,
      })
      .select("o.*")
      .first();
    if (!operation) return fail("STALE_OPERATION", 409);
    const old = req.body.outcome || {};
    let outcome: any;
    if (old.type === "ok" || old.type === "not_modified") {
      const externalId = operation.method === "topic" ? old.topic_id : old.message_id;
      if (externalId === undefined || externalId === null) return fail("INVALID_OUTCOME");
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
      outcome,
    });
    return { ok: true };
  }

  async function update(req: any) {
    const connection = await refresh(req),
      update = req.body?.update;
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0)
      return fail("INVALID_UPDATE");
    await service.ingest(connection.id, update);
    const externalId = String(update.update_id);
    for (let count = 0; count < 100; count++) {
      const row = await db("comm_inbound")
        .where({ connection_id: connection.id, external_id: externalId })
        .first();
      if (!row || row.state !== "pending") break;
      await service.processIncoming(connection.id);
    }
    const row = await db("comm_inbound")
      .where({ connection_id: connection.id, external_id: externalId })
      .first();
    if (row?.state === "pending") return fail("INBOUND_BACKLOG_LIMIT", 503);
    if (row?.state === "failed") return fail(row.error_code || "INBOUND_PROCESSING_FAILED", 409);
    const changed = await db("comm_connections")
      .where({ id: connection.id, poll_owner: req.body.worker_id })
      .where("poll_until", ">", db.fn.now())
      .update({ poll_offset: db.raw("GREATEST(poll_offset,?)", [update.update_id + 1]) });
    if (!changed) return fail("WORKER_LEASE_UNAVAILABLE", 409);
    const result = String(row?.result?.result || "ignored");
    return {
      update_offset: Math.max(Number(connection.poll_offset), update.update_id + 1),
      callback_id: update.callback_query?.id || null,
      text: RESULT_TEXT[result] || RESULT_TEXT.ignored,
      result,
    };
  }

  async function intakeIdentity(req: any, trx: Database) {
    if (req.accountability?.admin === true) return fail("FORBIDDEN", 403);
    const connection = await trx("comm_connections")
      .where({ platform: "telegram", external_id: botId, mode, enabled: true })
      .forUpdate()
      .first();
    if (!connection || connection.service_user_id !== req.accountability?.user)
      return fail("FORBIDDEN", 403);
    await service.userAccountability(trx, connection.service_user_id);
    return connection;
  }

  async function intake(req: any) {
    const username = String(env.ISVOI_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) return fail("BOT_USERNAME_REQUIRED", 503);
    return db.transaction(async (trx: Database) => {
      const connection = await intakeIdentity(req, trx),
        accountability = await service.userAccountability(trx, connection.service_user_id),
        schema = await context.getSchema(),
        leads = new context.services.ItemsService("leads", { knex: trx, schema, accountability }),
        id = await leads.createOne(req.body),
        lead = await trx("leads").where({ id }).first();
      if (!lead || lead.store_location_id !== connection.store_id)
        return fail("INTAKE_STORE_MISMATCH", 409);
      const token = randomBytes(32).toString("base64url");
      await trx("comm_link_tokens").insert({
        hash: digest(token),
        lead_id: id,
        expires_at: new Date(Date.now() + 15 * 60000),
      });
      const connections = await trx("comm_connections")
        .where({ store_id: connection.store_id, enabled: true })
        .whereIn("platform", ["telegram", "max", "vk"])
        .orderByRaw("CASE platform WHEN 'telegram' THEN 1 WHEN 'max' THEN 2 ELSE 3 END")
        .orderBy("name");
      const continuation_links = connections.flatMap((candidate: any) => {
        const url = continuationUrl(
          candidate,
          token,
          candidate.id === connection.id ? username : "",
        );
        return url ? [{ platform: candidate.platform, label: candidate.name, url }] : [];
      });
      const telegram = continuation_links.find((link: any) => link.platform === "telegram");
      return { id, telegram_url: telegram.url, continuation_links };
    });
  }

  const intakeCheck = async (req: any) =>
    db.transaction(async (trx: Database) => {
      await intakeIdentity(req, trx);
      return { ok: true };
    });

  return { session, next, complete, update, intake, "intake-check": intakeCheck };
}
