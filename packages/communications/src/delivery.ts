import { randomUUID } from "node:crypto";
import { fail, flag, marketingWindow, UUID } from "./policy.js";
import type { Context, Database, Outcome } from "./types.js";

/** A lease authorizes ONE HTTP attempt. Expiry never means safe to resend. */
export function createDelivery(context: Context, service: any) {
  const db = context.database;
  async function worker(trx: Database, connectionId: string, user: unknown) {
    if (typeof user !== "string" || !UUID.test(user)) return fail("FORBIDDEN", 403);
    const connection = await trx("comm_connections")
      .where({ id: connectionId, worker_user_id: user, enabled: true })
      .forUpdate()
      .first();
    if (!connection) return fail("FORBIDDEN", 403);
    const u = await trx("directus_users").where({ id: user, status: "active" }).first();
    if (!u) return fail("FORBIDDEN", 403);
    const accountability = await service.userAccountability(trx, user);
    const admin = await trx("directus_access as a")
      .join("directus_policies as p", "p.id", "a.policy")
      .where("p.admin_access", true)
      .where((q: any) => q.where("a.user", user).orWhereIn("a.role", accountability.roles))
      .first();
    if (admin) return fail("ADMIN_WORKER_FORBIDDEN", 403);
    return connection;
  }
  async function summary(trx: Database, outboxId: string) {
    const ops = await trx("comm_operations").where({ outbox_id: outboxId });
    let state = "sending";
    if (ops.some((o: any) => o.state === "uncertain")) state = "uncertain";
    else if (ops.every((o: any) => o.state === "accepted")) state = "accepted";
    else if (ops.some((o: any) => o.state === "failed" || o.state === "cancelled"))
      state = ops.some((o: any) => o.state === "accepted") ? "partial" : "failed";
    else if (ops.every((o: any) => o.state === "pending")) state = "pending";
    await trx("comm_outbox")
      .where({ id: outboxId })
      .update({ state, ...(state === "accepted" ? { accepted_at: trx.fn.now() } : {}) });
    return state;
  }
  async function next(connectionId: string, user: unknown, allowedMethods?: string[]) {
    if (!flag(context.env.ISVOI_COMMUNICATIONS_ENABLED))
      return fail("COMMUNICATIONS_DISABLED", 503);
    return db.transaction(async (trx: Database) => {
      const n = await worker(trx, connectionId, user);
      const runtime = await trx("comm_runtime").where({ id: 1 }).first();
      if (!runtime?.active || !runtime.sending_enabled || runtime.recovery_hold) return null;
      const expired = await trx("comm_operations as o")
        .join("comm_outbox as b", "b.id", "o.outbox_id")
        .where("b.connection_id", n.id)
        .where("o.state", "in_flight")
        .andWhere("o.lease_until", "<", trx.fn.now())
        .select("o.id", "o.outbox_id");
      for (const o of expired) {
        await trx("comm_operations")
          .where({ id: o.id })
          .update({ state: "uncertain", error_code: "LEASE_EXPIRED_UNKNOWN" });
        await summary(trx, o.outbox_id);
      }
      if (new Date(n.send_after) > new Date()) return null;
      // An unresolved earlier operation blocks only its peer; other peers/connections continue.
      const jobs = await trx("comm_outbox as b")
        .where("b.connection_id", n.id)
        .whereIn("b.state", ["pending", "sending"])
        .andWhere("b.due_at", "<=", trx.fn.now())
        .whereRaw(
          "NOT EXISTS (SELECT 1 FROM comm_outbox older WHERE older.thread_id=b.thread_id AND (older.created_at,older.id)<(b.created_at,b.id) AND older.state IN ('pending','sending','uncertain','partial'))",
        )
        .orderByRaw("CASE WHEN b.purpose IN ('service','staff') THEN 0 ELSE 1 END")
        .orderBy("b.created_at")
        .limit(100)
        .select("b.*")
        .forUpdate()
        .skipLocked();
      for (const b of jobs) {
        const reject = async (code: string) => {
          await trx("comm_outbox")
            .where({ id: b.id })
            .update({ state: "suppressed", error_code: code });
          await trx("comm_operations")
            .where({ outbox_id: b.id, state: "pending" })
            .update({ state: "cancelled", error_code: code });
        };
        if (b.expires_at && new Date(b.expires_at) <= new Date()) {
          await reject("EXPIRED");
          continue;
        }
        if (b.identity_id) {
          const identity = await trx("comm_identities").where({ id: b.identity_id }).first();
          if (identity.availability === "blocked") {
            await reject("RECIPIENT_UNAVAILABLE");
            continue;
          }
          if (
            b.thread_id &&
            !(await trx("comm_threads")
              .where({ id: b.thread_id, identity_id: b.identity_id, connection_id: n.id })
              .first())
          ) {
            await reject("RECIPIENT_CHANGED");
            continue;
          }
        }
        if (b.created_by && b.purpose === "service") {
          try {
            const { lead } = await service.permitted(
              trx,
              { user: b.created_by },
              b.conversation_id,
            );
            if (
              lead.assigned_to !== b.created_by ||
              !["new", "in_progress", "waiting"].includes(lead.status)
            ) {
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
          if (
            !n.marketing_enabled ||
            !campaign ||
            !["approved", "sending"].includes(campaign.state) ||
            identity.contact_id !== b.contact_id ||
            identity.is_test !== campaign.is_test
          ) {
            await reject("CAMPAIGN_NOT_ALLOWED");
            continue;
          }
          if (
            !(await trx("comm_subscriptions")
              .where({ identity_id: b.identity_id, topic_key: campaign.topic_key, consent: true })
              .first())
          ) {
            await reject("CONSENT_WITHDRAWN");
            continue;
          }
          const window = marketingWindow(new Date());
          if (!window.allowed) {
            await trx("comm_outbox").where({ id: b.id }).update({ due_at: window.next });
            continue;
          }
          await trx("comm_contacts").where({ id: b.contact_id }).forUpdate().first();
          if (!(await trx("comm_frequency").where({ outbox_id: b.id }).first())) {
            const count = await trx("comm_frequency")
              .where({ contact_id: b.contact_id })
              .whereNull("released_at")
              .andWhere("reserved_at", ">", trx.raw("now()-interval '7 days'"))
              .count("* as count")
              .first();
            if (Number(count.count) >= 2) {
              await reject("FREQUENCY_LIMIT");
              continue;
            }
            await trx("comm_frequency").insert({ contact_id: b.contact_id, outbox_id: b.id });
          }
        }
        const ops = await trx("comm_operations")
          .where({ outbox_id: b.id })
          .orderBy("position")
          .forUpdate();
        const op = ops.find((o: any) => o.state !== "accepted");
        if (!op || op.state !== "pending") continue;
        // The legacy Telegram worker can drain text/topic operations during cutover, but it
        // cannot fetch protected binary attachments. Leave those operations untouched for the
        // new media-aware worker while continuing with independent peers.
        if (allowedMethods && !allowedMethods.includes(op.method)) continue;
        let payload = { ...op.payload };
        if (payload.card_id) {
          const card = await trx("comm_staff_cards")
            .where({ id: payload.card_id, connection_id: n.id })
            .first();
          if (!card) {
            await reject("STAFF_CARD_MISSING");
            continue;
          }
          if (op.method !== "topic" && !card.topic_id) continue;
          if (op.method !== "topic") payload.message_thread_id = Number(card.topic_id);
          for (const key of ["card_id", "is_card", "draft_id", "draft_stage", "conversation_id"])
            delete payload[key];
        }
        const attemptId = randomUUID(),
          leaseVersion = op.lease_version + 1;
        await trx("comm_operations")
          .where({ id: op.id })
          .update({
            state: "in_flight",
            attempt_id: attemptId,
            lease_version: leaseVersion,
            lease_until: new Date(Date.now() + 90000),
            worker_id: user,
            attempts: op.attempts + 1,
          });
        await trx("comm_attempts").insert({
          id: attemptId,
          operation_id: op.id,
          lease_version: leaseVersion,
        });
        await trx("comm_outbox").where({ id: b.id }).update({ state: "sending" });
        await trx("comm_connections")
          .where({ id: n.id })
          .update({ send_after: new Date(Date.now() + (b.purpose === "marketing" ? 3200 : 1100)) });
        return {
          ...op,
          payload,
          state: "in_flight",
          attempt_id: attemptId,
          lease_version: leaseVersion,
          connection_id: n.id,
          platform: n.platform,
        };
      }
      return null;
    });
  }
  async function complete(connectionId: string, user: unknown, input: any) {
    if (!UUID.test(input?.attempt_id || "")) return fail("INVALID_ATTEMPT");
    const outcome: Outcome = input.outcome;
    if (
      !outcome ||
      !["accepted", "rate_limited", "rejected", "blocked", "connection_error", "unknown"].includes(
        outcome.type,
      )
    )
      return fail("INVALID_OUTCOME");
    if (
      outcome.type === "accepted" &&
      (typeof outcome.externalId !== "string" ||
        !outcome.externalId ||
        outcome.externalId.length > 200)
    )
      return fail("INVALID_EXTERNAL_ID");
    return db.transaction(async (trx: Database) => {
      const n = await worker(trx, connectionId, user);
      const attempt = await trx("comm_attempts")
        .where({ id: input.attempt_id })
        .forUpdate()
        .first();
      if (!attempt) return fail("NOT_FOUND", 404);
      const op = await trx("comm_operations")
        .where({ id: attempt.operation_id })
        .forUpdate()
        .first();
      const b = await trx("comm_outbox")
        .where({ id: op.outbox_id, connection_id: n.id })
        .forUpdate()
        .first();
      if (!b || op.worker_id !== user || attempt.lease_version !== input.lease_version)
        return fail("FORBIDDEN", 403);
      if (attempt.completed_at) return { state: b.state, replayed: true };
      if (op.attempt_id !== attempt.id) return fail("SUPERSEDED_ATTEMPT", 409);
      await trx("comm_attempts")
        .where({ id: attempt.id })
        .update({
          completed_at: trx.fn.now(),
          outcome,
          late: new Date(op.lease_until) < new Date(),
        });
      let state = "failed",
        error = "code" in outcome ? String(outcome.code).slice(0, 100) : null;
      if (outcome.type === "accepted") {
        state = "accepted";
        await trx("comm_connections")
          .where({ id: n.id })
          .update({ last_sent_at: trx.fn.now(), error_code: null });
      } else if (outcome.type === "unknown") state = "uncertain";
      else if (outcome.type === "rate_limited") {
        state = "pending";
        const due = new Date(
          Date.now() + Math.max(1, Math.min(86400, Number(outcome.retryAfter) || 60)) * 1000,
        );
        await trx("comm_outbox").where({ id: b.id }).update({ due_at: due });
        await trx("comm_connections").where({ id: n.id }).update({ send_after: due });
      } else if (outcome.type === "connection_error")
        await trx("comm_connections")
          .where({ id: n.id })
          .update({ enabled: false, error_code: error });
      else if (outcome.type === "blocked" && b.identity_id)
        await trx("comm_identities")
          .where({ id: b.identity_id })
          .update({ availability: "blocked", availability_at: trx.fn.now() });
      await trx("comm_operations")
        .where({ id: op.id })
        .update({
          state,
          error_code: error,
          external_id: outcome.type === "accepted" ? outcome.externalId : null,
        });
      if (outcome.type === "accepted" && op.payload.card_id) {
        if (op.method === "topic")
          await trx("comm_staff_cards")
            .where({ id: op.payload.card_id })
            .update({ topic_id: outcome.externalId });
        else if (op.payload.is_card)
          await trx("comm_staff_cards")
            .where({ id: op.payload.card_id })
            .update({ message_id: outcome.externalId });
        if (op.payload.draft_id && ["prompt", "preview"].includes(op.payload.draft_stage))
          await trx("comm_staff_drafts")
            .where({ id: op.payload.draft_id })
            .update({ [`${op.payload.draft_stage}_message_id`]: outcome.externalId });
      }
      const result = await summary(trx, b.id);
      if (outcome.type === "accepted" && b.message_id && b.purpose === "service") {
        const message = await trx("comm_messages").where({ id: b.message_id }).first();
        const conversation = await trx("comm_conversations")
          .where({ id: b.conversation_id })
          .forUpdate()
          .first("first_agent_response_at", "lead_id");
        await trx("comm_conversations")
          .where({ id: b.conversation_id })
          .update({
            last_agent_reply_at: trx.fn.now(),
            first_agent_response_at: trx.raw("COALESCE(first_agent_response_at,now())"),
            awaiting_since: trx.raw(
              "CASE WHEN last_inbound_at<=? THEN NULL ELSE awaiting_since END",
              [message.occurred_at],
            ),
          });
        if (!conversation.first_agent_response_at)
          await service.event(trx, {
            connection_id: n.id,
            identity_id: b.identity_id,
            lead_id: conversation.lead_id,
            kind: "first_agent_response",
            dedupe_key: `conversation:${b.conversation_id}:first-agent-response`,
            is_test: n.mode === "test",
          });
      }
      await service.event(trx, {
        connection_id: n.id,
        identity_id: b.identity_id,
        kind: "delivery_result",
        dedupe_key: `attempt:${attempt.id}`,
        facts: { outbox: b.id, outcome: outcome.type },
        is_test: n.mode === "test",
      });
      return { state: result };
    });
  }
  return { worker, next, complete };
}
