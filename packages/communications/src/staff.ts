import { randomUUID } from "node:crypto";
import { digest, fail, UUID, validText } from "./policy.js";
import type { Context, Database, Connection } from "./types.js";

const commandKey = (s: string) => {
  const h = digest(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function createStaff(context: Context, service: any) {
  async function queue(
    trx: Database,
    n: Connection,
    card: any,
    text: string,
    values: any = {},
    markup?: any,
  ) {
    const destination = await trx("comm_destinations")
      .where({ id: card.destination_id, enabled: true, kind: "staff" })
      .first();
    if (!destination) return fail("STAFF_DESTINATION_DISABLED", 503);
    const id = randomUUID();
    await trx("comm_outbox").insert({
      id,
      connection_id: n.id,
      purpose: "staff",
      dedupe_key: `staff:${id}`,
      conversation_id: values.conversation_id,
    });
    await trx("comm_operations").insert({
      outbox_id: id,
      method: "text",
      payload: {
        chat_id: destination.external_id,
        text,
        card_id: card.id,
        ...values,
        ...(markup ? { reply_markup: markup } : {}),
      },
    });
    return id;
  }
  async function ensureCard(trx: Database, n: Connection, c: any) {
    if (n.platform !== "telegram") return;
    const destination = await trx("comm_destinations")
      .where({ connection_id: n.id, kind: "staff", enabled: true })
      .first();
    if (!destination) return;
    const lead = await trx("leads").where({ id: c.lead_id }).first();
    let card = await trx("comm_staff_cards")
      .where({ connection_id: n.id, lead_id: c.lead_id })
      .first();
    if (!card) {
      [card] = await trx("comm_staff_cards")
        .insert({ connection_id: n.id, lead_id: c.lead_id, destination_id: destination.id })
        .returning("*");
      const id = randomUUID();
      await trx("comm_outbox").insert({
        id,
        connection_id: n.id,
        purpose: "staff",
        dedupe_key: `staff-card:${card.id}`,
      });
      await trx("comm_operations").insert([
        {
          outbox_id: id,
          position: 0,
          method: "topic",
          payload: {
            chat_id: destination.external_id,
            name: String(lead.reference_code || "Обращение").slice(0, 128),
            card_id: card.id,
          },
        },
        {
          outbox_id: id,
          position: 1,
          method: "text",
          payload: {
            chat_id: destination.external_id,
            text: `${lead.reference_code || "Заявка"} · ${lead.kind}\nНовый клиентский диалог.`,
            card_id: card.id,
            is_card: true,
            reply_markup: {
              inline_keyboard: [
                [{ text: "Принять в работу", callback_data: `take:${card.id}` }],
                [{ text: "Ответить клиенту", callback_data: `reply:${c.id}` }],
              ],
            },
          },
        },
      ]);
    }
    return card;
  }
  async function notify(trx: Database, n: Connection, c: any, message: any) {
    const card = await ensureCard(trx, n, c);
    if (!card) return;
    await queue(
      trx,
      n,
      card,
      `Клиент:\n${String(message.text || "Вложение").slice(0, 3500)}`,
      { conversation_id: c.id },
      { inline_keyboard: [[{ text: "Ответить клиенту", callback_data: `reply:${c.id}` }]] },
    );
  }
  async function sweep(trx: Database, n: Connection) {
    if (n.platform !== "telegram") return null;
    const c = await trx("comm_conversations as c")
      .join("comm_threads as t", "t.id", "c.thread_id")
      .join("leads as l", "l.id", "c.lead_id")
      .where({ "t.connection_id": n.id })
      .whereNull("c.closed_at")
      .whereNull("c.first_agent_response_at")
      .whereNull("c.sla_escalated_at")
      .where("c.escalation_due_at", "<=", trx.fn.now())
      .orderBy("c.escalation_due_at")
      .select("c.*", "l.reference_code")
      .forUpdate("c")
      .skipLocked()
      .first();
    if (!c) return null;
    const card = await ensureCard(trx, n, c);
    if (!card) return null;
    await queue(
      trx,
      n,
      card,
      `SLA: по заявке ${c.reference_code || c.lead_id} нет первого ответа менеджера за установленное рабочее время.`,
      { conversation_id: c.id },
      {
        inline_keyboard: [
          [{ text: "Принять в работу", callback_data: `take:${card.id}` }],
          [{ text: "Ответить клиенту", callback_data: `reply:${c.id}` }],
        ],
      },
    );
    await trx("comm_conversations").where({ id: c.id }).update({ sla_escalated_at: trx.fn.now() });
    await service.event(trx, {
      connection_id: n.id,
      lead_id: c.lead_id,
      kind: "sla_escalated",
      dedupe_key: `conversation:${c.id}:sla-escalated`,
      is_test: n.mode === "test",
      facts: { conversation_id: c.id },
    });
    return { result: "sla_escalated", conversation_id: c.id };
  }
  async function process(trx: Database, n: Connection, row: any) {
    const raw = row.event.raw,
      q = raw.callback_query,
      m = q?.message || raw.message,
      from = q?.from || m?.from;
    if (!m || from?.is_bot !== false || m.sender_chat || !m.message_thread_id)
      return { result: "ignored" };
    if (q && String(m.from?.id) !== n.external_id) return { result: "ignored" };
    const account = await trx("comm_staff_accounts")
      .where({ connection_id: n.id, external_user_id: String(from.id), enabled: true })
      .first();
    if (!account) return { result: "forbidden" };
    const card = await trx("comm_staff_cards as c")
      .join("comm_destinations as d", "d.id", "c.destination_id")
      .where({
        "c.connection_id": n.id,
        "c.topic_id": String(m.message_thread_id),
        "d.external_id": String(m.chat.id),
        "d.enabled": true,
      })
      .select("c.*")
      .first();
    if (!card) return { result: "stale" };
    const a = {
      user: account.user_id,
      accountability: await service.userAccountability(trx, account.user_id),
    };
    const c = await trx("comm_conversations")
      .where({ lead_id: card.lead_id })
      .orderBy("created_at", "desc")
      .first();
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
          payload: {},
        },
        trx,
      );
      await queue(trx, n, card, "Заявка принята в работу.");
      return { result: "claimed" };
    }
    if (data === `reply:${c.id}`) {
      const sent = await trx("comm_operations as o")
        .join("comm_outbox as b", "b.id", "o.outbox_id")
        .where({
          "b.connection_id": n.id,
          "o.external_id": String(m.message_id),
          "o.state": "accepted",
        })
        .select("o.payload")
        .first();
      if (
        String(m.message_id) !== card.message_id &&
        !sent?.payload?.reply_markup?.inline_keyboard
          ?.flat()
          .some((b: any) => b.callback_data === data)
      )
        return { result: "stale" };
      await trx("comm_staff_drafts")
        .where({ conversation_id: c.id, user_id: a.user })
        .whereIn("state", ["awaiting", "preview"])
        .update({ state: "cancelled" });
      const [draft] = await trx("comm_staff_drafts")
        .insert({ conversation_id: c.id, user_id: a.user, external_user_id: String(from.id) })
        .returning("*");
      await queue(
        trx,
        n,
        card,
        "Ответьте именно на это сообщение текстом или одним фото. Затем проверьте черновик и подтвердите отправку. Срок — 10 минут.",
        { draft_id: draft.id, draft_stage: "prompt" },
        { force_reply: true },
      );
      return { result: "draft_started" };
    }
    const match = data.match(/^(send|cancel):([0-9a-f-]{36})$/);
    if (match && UUID.test(match[2])) {
      const draft = await trx("comm_staff_drafts")
        .where({
          id: match[2],
          conversation_id: c.id,
          user_id: a.user,
          external_user_id: String(from.id),
          state: "preview",
          preview_message_id: String(m.message_id),
        })
        .where("expires_at", ">", trx.fn.now())
        .forUpdate()
        .first();
      if (!draft) return { result: "stale" };
      if (match[1] === "cancel") {
        await trx("comm_staff_drafts").where({ id: draft.id }).update({ state: "cancelled" });
        return { result: "cancelled" };
      }
      if (
        draft.attachment_id &&
        !(await trx("comm_attachments").where({ id: draft.attachment_id, state: "ready" }).first())
      ) {
        await queue(
          trx,
          n,
          card,
          "Вложение ещё проверяется или отклонено. Откройте заявку в Directus для проверки состояния.",
        );
        return { result: "file_not_ready" };
      }
      await service.commands(
        a,
        {
          type: "reply",
          key: draft.id,
          conversation_id: c.id,
          expected_version: c.version,
          payload: {
            text: draft.text,
            attachment_ids: draft.attachment_id ? [draft.attachment_id] : [],
          },
        },
        trx,
      );
      await trx("comm_staff_drafts").where({ id: draft.id }).update({ state: "confirmed" });
      return { result: "queued" };
    }
    if (data || !m.reply_to_message?.message_id) return { result: "internal" };
    const draft = await trx("comm_staff_drafts")
      .where({
        conversation_id: c.id,
        user_id: a.user,
        external_user_id: String(from.id),
        state: "awaiting",
        prompt_message_id: String(m.reply_to_message.message_id),
      })
      .where("expires_at", ">", trx.fn.now())
      .forUpdate()
      .first();
    if (!draft) return { result: "internal" };
    if (m.media_group_id || m.voice || m.video || m.document || (!m.text && !m.photo?.length)) {
      await queue(
        trx,
        n,
        card,
        "Для быстрого ответа пришлите текст или одно фото. Остальные вложения можно отправить из Directus.",
      );
      return { result: "unsupported" };
    }
    const text = validText(m.text || m.caption || "");
    let attachmentId = null;
    if (m.photo?.length) {
      const photo = m.photo.at(-1);
      const [f] = await trx("comm_attachments")
        .insert({
          conversation_id: c.id,
          connection_id: n.id,
          uploaded_by: a.user,
          kind: "image",
          name: "Фото менеджера",
          mime: "application/octet-stream",
          external_ref: { externalId: photo.file_id, size: photo.file_size || null, kind: "image" },
        })
        .returning("id");
      attachmentId = f.id;
    }
    await trx("comm_staff_drafts")
      .where({ id: draft.id })
      .update({ state: "preview", text, attachment_id: attachmentId });
    await queue(
      trx,
      n,
      card,
      `К отправке клиенту:\n${text}${attachmentId ? "\n[Фото ожидает проверки]" : ""}`,
      { draft_id: draft.id, draft_stage: "preview" },
      {
        inline_keyboard: [
          [{ text: "Отправить клиенту", callback_data: `send:${draft.id}` }],
          [{ text: "Отмена", callback_data: `cancel:${draft.id}` }],
        ],
      },
    );
    return { result: "draft_ready" };
  }
  service.setStaffProcessor(process);
  service.setStaffNotifier(notify);
  return { notify, process, sweep };
}
