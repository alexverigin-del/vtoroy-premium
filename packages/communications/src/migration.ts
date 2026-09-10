import { randomUUID } from "node:crypto";
import { fail } from "./policy.js";
import type { Database } from "./types.js";

/** Idempotent shadow backfill. Never enables workers or modifies legacy rows. */
export async function backfillTelegram(db: Database, connectionId: string) {
  return db.transaction(async (trx: Database) => {
    const runtime = await trx("comm_runtime").where({ id: 1 }).forUpdate().first();
    if (runtime.active) return fail("BACKFILL_REQUIRES_INACTIVE_RUNTIME", 409);
    const n = await trx("comm_connections")
      .where({ id: connectionId, platform: "telegram" })
      .forUpdate()
      .first();
    if (!n) return fail("TELEGRAM_CONNECTION_REQUIRED");
    const settings = await trx("telegram_bot_settings").where({ bot_id: n.external_id }).first();
    if (settings)
      await trx("comm_connections")
        .where({ id: n.id })
        .update({
          bot_username: settings.public_username,
          settings: {
            welcome_text: settings.welcome_text,
            consent_text: settings.consent_text,
            consent_version: settings.consent_version,
            subscriptions_enabled: settings.notifications_enabled,
            subscriptions_pilot_only: settings.pilot_mode,
            pilot_user_ids: settings.pilot_user_ids,
            ...n.settings,
          },
        });
    const map = async (collection: string, old: string, id: string) =>
      trx("comm_legacy_map")
        .insert({ collection, legacy_id: String(old), new_id: id })
        .onConflict(["collection", "legacy_id"])
        .ignore();
    const routes = await trx("telegram_routes").where({
      bot_id: n.external_id,
      store_id: n.store_id,
      is_test: n.mode === "test",
    });
    for (const route of routes) {
      let destination = await trx("comm_destinations")
        .where({ connection_id: n.id, external_id: String(route.chat_id), kind: "staff" })
        .first();
      if (!destination)
        [destination] = await trx("comm_destinations")
          .insert({
            connection_id: n.id,
            external_id: String(route.chat_id),
            kind: "staff",
            name: "Группа менеджеров Telegram",
            enabled: route.enabled,
          })
          .returning("*");
      await map("telegram_routes", route.id, destination.id);
      for (const staff of await trx("telegram_staff").where({ route_id: route.id })) {
        await trx("comm_staff")
          .insert({
            user_id: staff.directus_user,
            store_id: route.store_id,
            enabled: staff.enabled,
          })
          .onConflict(["user_id", "store_id"])
          .ignore();
        await trx("comm_staff_accounts")
          .insert({
            connection_id: n.id,
            external_user_id: String(staff.telegram_user_id),
            user_id: staff.directus_user,
            enabled: staff.enabled,
          })
          .onConflict(["connection_id", "external_user_id"])
          .merge(["enabled"]);
      }
      for (const card of await trx("telegram_deliveries").where({ route_id: route.id })) {
        await trx("comm_staff_cards")
          .insert({
            id: card.id,
            connection_id: n.id,
            lead_id: card.lead_id,
            destination_id: destination.id,
            topic_id: card.topic_id ? String(card.topic_id) : null,
            message_id: card.message_id ? String(card.message_id) : null,
            created_at: card.created_at,
          })
          .onConflict("id")
          .merge(["topic_id", "message_id"]);
        await map("telegram_deliveries", card.id, card.id);
      }
    }
    const topics = await trx("telegram_notification_topics");
    for (const topic of topics)
      await trx("comm_topics")
        .insert({ key: topic.key, label: topic.label, active: topic.active, sort: topic.sort })
        .onConflict("key")
        .merge();
    const sessions = await trx("telegram_client_sessions")
      .where({ bot_id: n.external_id })
      .orderBy("id");
    for (const session of sessions) {
      let identity = await trx("comm_identities")
        .where({ connection_id: n.id, external_user_id: String(session.user_id) })
        .first();
      if (!identity) {
        const id = randomUUID();
        await trx("comm_contacts").insert({ id });
        [identity] = await trx("comm_identities")
          .insert({
            contact_id: id,
            connection_id: n.id,
            external_user_id: String(session.user_id),
            first_seen_at: null,
            source: session.entry_source,
            is_test: n.mode === "test",
          })
          .returning("*");
      }
      let thread = await trx("comm_threads")
        .where({ connection_id: n.id, external_peer_id: String(session.chat_id) })
        .first();
      if (!thread)
        [thread] = await trx("comm_threads")
          .insert({
            connection_id: n.id,
            identity_id: identity.id,
            external_peer_id: String(session.chat_id),
            pending_kind: session.pending_kind,
            subscription_draft: session.subscription_draft
              ? JSON.stringify(session.subscription_draft)
              : null,
          })
          .returning("*");
      await map("telegram_client_sessions", session.id, thread.id);
      const conversations = await trx("lead_conversations as c")
        .join("leads as l", "l.id", "c.lead_id")
        .where({ "c.bot_id": n.external_id, "c.client_user_id": String(session.user_id) })
        .select("c.*", "l.status", "l.assigned_to", "l.is_test", "l.store_location_id");
      for (const c of conversations) {
        if (c.store_location_id && c.store_location_id !== n.store_id)
          return fail("MIGRATION_STORE_MISMATCH", 409);
        await trx("comm_conversations")
          .insert({
            id: c.id,
            thread_id: thread.id,
            lead_id: c.lead_id,
            handling: ["won", "closed"].includes(c.status)
              ? "closed"
              : c.status === "waiting"
                ? "waiting"
                : c.assigned_to
                  ? "agent"
                  : "queued",
            created_at: c.created_at,
            closed_at: c.closed_at,
          })
          .onConflict("id")
          .merge(["handling", "closed_at"]);
        await map("lead_conversations", c.id, c.id);
        await trx("comm_access_grants")
          .insert({ identity_id: identity.id, lead_id: c.lead_id })
          .onConflict(["identity_id", "lead_id"])
          .ignore();
        const messages = await trx("lead_messages")
          .where({ conversation_id: c.id })
          .orderBy("created_at")
          .orderBy("id");
        for (const m of messages) {
          await trx("comm_messages")
            .insert({
              id: m.id,
              thread_id: thread.id,
              conversation_id: c.id,
              direction: m.direction,
              text: m.text,
              created_by: m.created_by,
              external_id: m.telegram_message_id ? String(m.telegram_message_id) : null,
              occurred_at: m.created_at,
              received_at: m.created_at,
              album_id: m.album_id,
            })
            .onConflict("id")
            .merge(["text", "external_id"]);
          await map("lead_messages", m.id, m.id);
          if (
            m.photo_file_id &&
            !(await trx("comm_attachments").where({ message_id: m.id }).first())
          )
            await trx("comm_attachments").insert({
              message_id: m.id,
              conversation_id: c.id,
              connection_id: n.id,
              kind: "image",
              name: "Фото Telegram",
              mime: "application/octet-stream",
              external_ref: { externalId: m.photo_file_id, size: null, kind: "image" },
            });
        }
        const incoming = messages.filter((m: any) => m.direction === "in").at(-1);
        if (incoming) {
          await trx("comm_conversations")
            .where({ id: c.id })
            .update({
              last_inbound_at: incoming.created_at,
              awaiting_since:
                messages.at(-1)?.direction === "in" && !c.closed_at ? incoming.created_at : null,
            });
          await trx("comm_identities")
            .where({ id: identity.id })
            .where((q: any) =>
              q.whereNull("last_active_at").orWhere("last_active_at", "<", incoming.created_at),
            )
            .update({ last_active_at: incoming.created_at });
        }
        if (c.is_test)
          await trx("comm_identities").where({ id: identity.id }).update({ is_test: true });
      }
      if (
        session.conversation_id &&
        conversations.some((c: any) => c.id === session.conversation_id)
      )
        await trx("comm_threads")
          .where({ id: thread.id })
          .update({ selected_conversation_id: session.conversation_id });
      for (const s of await trx("telegram_subscriptions").where({
        session_id: session.id,
        bot_id: n.external_id,
      })) {
        await trx("comm_subscriptions")
          .insert({
            id: s.id,
            identity_id: identity.id,
            topic_key: s.topic_key,
            consent:
              s.status === "active" || (s.status === "blocked" && s.consented_at && !s.revoked_at),
            consent_version: s.consent_version || "legacy-unknown",
            updated_at: s.updated_at,
          })
          .onConflict("id")
          .merge(["consent", "updated_at", "consent_version"]);
        await map("telegram_subscriptions", s.id, s.id);
        for (const e of await trx("telegram_subscription_events")
          .where({ subscription_id: s.id })
          .whereIn("event", ["subscribed", "unsubscribed"]))
          await trx("comm_consent_events")
            .insert({
              id: e.id,
              identity_id: identity.id,
              topic_key: s.topic_key,
              consent: e.event === "subscribed",
              version: e.consent_version || "legacy-unknown",
              source: e.source,
              created_at: e.created_at,
            })
            .onConflict("id")
            .ignore();
      }
    }
    for (const token of await trx("telegram_link_tokens").where({ bot_id: n.external_id }))
      await trx("comm_link_tokens")
        .insert({
          hash: token.token_hash,
          lead_id: token.lead_id,
          expires_at: token.expires_at,
          state: token.used_at ? "done" : "pending",
        })
        .onConflict("hash")
        .merge(["state", "expires_at"]);
    // Sent staff prompts retain their external IDs so old reply buttons remain attributable.
    for (const old of await trx("telegram_message_outbox").where({
      bot_id: n.external_id,
      destination: "group",
      state: "done",
    })) {
      const [box] = await trx("comm_outbox")
        .insert({
          id: old.id,
          connection_id: n.id,
          purpose: "staff",
          conversation_id: old.conversation_id,
          state: "accepted",
          accepted_at: old.sent_at || old.created_at,
          dedupe_key: `legacy-outbox:${old.id}`,
          created_at: old.created_at,
        })
        .onConflict("id")
        .ignore()
        .returning("id");
      if (box)
        await trx("comm_operations").insert({
          outbox_id: old.id,
          method: old.payload.photo ? "legacy_photo" : "text",
          payload: old.payload,
          state: "accepted",
          external_id: old.telegram_message_id ? String(old.telegram_message_id) : null,
        });
      await map("telegram_message_outbox", old.id, old.id);
    }
    for (const old of await trx("telegram_reply_drafts as d")
      .join("lead_conversations as c", "c.id", "d.conversation_id")
      .where("c.bot_id", n.external_id)
      .select("d.*")) {
      if (!(await trx("comm_conversations").where({ id: old.conversation_id }).first())) continue;
      let attachmentId = null;
      if (old.photo_file_id) {
        const existing = await trx("comm_legacy_map")
          .where({ collection: "telegram_draft_photo", legacy_id: old.id })
          .first();
        attachmentId = existing?.new_id;
        if (!attachmentId) {
          const [f] = await trx("comm_attachments")
            .insert({
              conversation_id: old.conversation_id,
              connection_id: n.id,
              uploaded_by: old.staff_user,
              kind: "image",
              name: "Фото черновика Telegram",
              mime: "application/octet-stream",
              external_ref: { externalId: old.photo_file_id, size: null, kind: "image" },
            })
            .returning("id");
          attachmentId = f.id;
          await map("telegram_draft_photo", old.id, f.id);
        }
      }
      await trx("comm_staff_drafts")
        .insert({
          id: old.id,
          conversation_id: old.conversation_id,
          user_id: old.staff_user,
          external_user_id: String(old.telegram_user_id),
          state: old.state,
          text: old.text,
          attachment_id: attachmentId,
          prompt_message_id: old.prompt_message_id ? String(old.prompt_message_id) : null,
          preview_message_id: old.preview_message_id ? String(old.preview_message_id) : null,
          expires_at: old.expires_at,
        })
        .onConflict("id")
        .merge([
          "state",
          "text",
          "attachment_id",
          "prompt_message_id",
          "preview_message_id",
          "expires_at",
        ]);
    }
    for (const receipt of await trx("telegram_receipts").where({ bot_id: n.external_id }))
      await trx("comm_inbound")
        .insert({
          connection_id: n.id,
          external_id: String(receipt.update_id),
          event: null,
          state: "done",
          processed_at: receipt.created_at || trx.fn.now(),
        })
        .onConflict(["connection_id", "external_id"])
        .ignore();
    const cursor = await trx("telegram_runtime").where({ bot_id: n.external_id }).first();
    if (cursor)
      await trx("comm_connections")
        .where({ id: n.id })
        .update({ poll_offset: cursor.update_offset });
    await trx("comm_runtime")
      .where({ id: 1 })
      .whereNull("baseline_at")
      .update({ baseline_at: trx.fn.now() });
    return { sessions: sessions.length, ...(await reconcileTelegram(trx, n.id)) };
  });
}
export async function reconcileTelegram(db: Database, connectionId: string) {
  const n = await db("comm_connections").where({ id: connectionId }).first();
  if (!n) return fail("CONNECTION_REQUIRED");
  const count = async (sql: string, bindings: unknown[]) =>
    Number((await db.raw(`SELECT count(*)::int AS count FROM ${sql}`, bindings)).rows[0].count);
  const missing = {
    routes: await count(
      `telegram_routes r
       WHERE r.bot_id=? AND r.store_id=? AND r.is_test=?
       AND NOT EXISTS(
        SELECT 1 FROM comm_legacy_map m
        JOIN comm_destinations d ON d.id=m.new_id
        WHERE m.collection='telegram_routes' AND m.legacy_id=r.id::text
         AND d.connection_id=? AND d.external_id=r.chat_id::text AND d.kind='staff'
       )`,
      [n.external_id, n.store_id, n.mode === "test", n.id],
    ),
    staff: await count(
      `telegram_staff s JOIN telegram_routes r ON r.id=s.route_id
       WHERE r.bot_id=? AND r.store_id=? AND r.is_test=?
       AND NOT EXISTS(
        SELECT 1 FROM comm_staff_accounts a
        WHERE a.connection_id=? AND a.external_user_id=s.telegram_user_id::text
         AND a.user_id=s.directus_user AND a.enabled=s.enabled
       )`,
      [n.external_id, n.store_id, n.mode === "test", n.id],
    ),
    sessions: await count(
      `telegram_client_sessions s
       WHERE s.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_legacy_map m
        JOIN comm_threads t ON t.id=m.new_id
        JOIN comm_identities i ON i.id=t.identity_id
        WHERE m.collection='telegram_client_sessions' AND m.legacy_id=s.id::text
         AND t.connection_id=? AND t.external_peer_id=s.chat_id::text
         AND i.connection_id=? AND i.external_user_id=s.user_id::text
       )`,
      [n.external_id, n.id, n.id],
    ),
    conversations: await count(
      `lead_conversations l
       WHERE l.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_conversations c WHERE c.id=l.id AND c.lead_id=l.lead_id
       )`,
      [n.external_id],
    ),
    messages: await count(
      `lead_messages m JOIN lead_conversations l ON l.id=m.conversation_id
       WHERE l.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_messages c
        WHERE c.id=m.id AND c.conversation_id=m.conversation_id
         AND c.direction=m.direction AND c.text=m.text
         AND c.external_id IS NOT DISTINCT FROM m.telegram_message_id::text
       )`,
      [n.external_id],
    ),
    message_attachments: await count(
      `lead_messages m JOIN lead_conversations l ON l.id=m.conversation_id
       WHERE l.bot_id=? AND m.photo_file_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM comm_attachments a
        WHERE a.message_id=m.id AND a.external_ref->>'externalId'=m.photo_file_id
       )`,
      [n.external_id],
    ),
    subscriptions: await count(
      `telegram_subscriptions s
       JOIN telegram_client_sessions legacy_session ON legacy_session.id=s.session_id
       WHERE s.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_legacy_map m
        JOIN comm_threads t ON t.id=m.new_id
        JOIN comm_subscriptions c ON c.identity_id=t.identity_id
        WHERE m.collection='telegram_client_sessions'
         AND m.legacy_id=legacy_session.id::text AND c.id=s.id AND c.topic_key=s.topic_key
         AND c.consent=(s.status='active' OR (s.status='blocked' AND s.consented_at IS NOT NULL AND s.revoked_at IS NULL))
       )`,
      [n.external_id],
    ),
    consent_events: await count(
      `telegram_subscription_events e
       JOIN telegram_subscriptions s ON s.id=e.subscription_id
       WHERE s.bot_id=? AND e.event IN ('subscribed','unsubscribed') AND NOT EXISTS(
        SELECT 1 FROM comm_consent_events c
        WHERE c.id=e.id AND c.topic_key=s.topic_key AND c.consent=(e.event='subscribed')
       )`,
      [n.external_id],
    ),
    tokens: await count(
      `telegram_link_tokens l
       WHERE l.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_link_tokens c
        WHERE c.hash=l.token_hash AND c.lead_id=l.lead_id AND c.expires_at=l.expires_at
       )`,
      [n.external_id],
    ),
    staff_cards: await count(
      `telegram_deliveries legacy_card
       JOIN telegram_routes r ON r.id=legacy_card.route_id
       WHERE r.bot_id=? AND r.store_id=? AND r.is_test=? AND NOT EXISTS(
        SELECT 1 FROM comm_staff_cards c
        WHERE c.id=legacy_card.id AND c.connection_id=? AND c.lead_id=legacy_card.lead_id
       )`,
      [n.external_id, n.store_id, n.mode === "test", n.id],
    ),
    staff_drafts: await count(
      `telegram_reply_drafts d JOIN lead_conversations l ON l.id=d.conversation_id
       WHERE l.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_staff_drafts c
        WHERE c.id=d.id AND c.conversation_id=d.conversation_id
       )`,
      [n.external_id],
    ),
    receipts: await count(
      `telegram_receipts r
       WHERE r.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_inbound c
        WHERE c.connection_id=? AND c.external_id=r.update_id::text AND c.state='done'
       )`,
      [n.external_id, n.id],
    ),
    accepted_staff_outbox: await count(
      `telegram_message_outbox legacy_box
       WHERE legacy_box.bot_id=? AND legacy_box.destination='group' AND legacy_box.state='done'
       AND NOT EXISTS(
        SELECT 1 FROM comm_outbox c
        WHERE c.id=legacy_box.id AND c.connection_id=? AND c.state='accepted'
       )`,
      [n.external_id, n.id],
    ),
    cursor: await count(
      `telegram_runtime legacy_runtime
       WHERE legacy_runtime.bot_id=? AND NOT EXISTS(
        SELECT 1 FROM comm_connections c
        WHERE c.id=? AND c.poll_offset=legacy_runtime.update_offset
       )`,
      [n.external_id, n.id],
    ),
  };
  const unresolved = await db("telegram_message_outbox")
    .where({ bot_id: n.external_id })
    .whereIn("state", ["pending", "in_flight", "uncertain"])
    .count("* as count")
    .first();
  const legacyUnresolved = Number(unresolved.count),
    dataReady = Object.values(missing).every((value) => value === 0) && legacyUnresolved === 0;
  return {
    missing,
    legacy_unresolved: legacyUnresolved,
    data_ready: dataReady,
    ready: false,
    reason: dataReady ? "CUTOVER_REQUIRES_LIVE_PILOT" : "CUTOVER_DATA_NOT_RECONCILED",
  };
}
