import { randomBytes } from "node:crypto";
import { canonical, digest, fail, UUID } from "./policy.js";
import type { Actor, Context, Database } from "./types.js";

// Short database transactions only: no network calls while this coordination lock is held.
export async function identityLock(trx: Database) {
  await trx.raw("SELECT pg_advisory_xact_lock(73121,1)");
}
export async function frequencyCount(trx: Database, contactId: string) {
  const row = await trx("comm_frequency as f")
    .where((q: any) => q.where("f.contact_id", contactId).orWhereExists(
      trx("comm_frequency_carryovers as h").select(1)
        .whereRaw("h.frequency_id=f.id").where("h.contact_id", contactId),
    ))
    .whereNull("f.released_at")
    .andWhere("f.reserved_at", ">", trx.raw("now()-interval '7 days'"))
    .count("* as count").first();
  return Number(row?.count || 0);
}

const active = (lead: any) => ["new", "in_progress", "waiting"].includes(lead?.status);
const masked = (value: string) => `••••${String(value).slice(-4)}`;
const callbackHash = (hash: string) => Buffer.from(hash, "hex").toString("base64url");

export function createIdentities(context: Context, service: any) {
  const db = context.database;
  async function audit(trx: Database, identity: any, kind: string, key: string, facts: any) {
    await service.event(trx, {
      identity_id: identity.id, connection_id: identity.connection_id,
      kind, dedupe_key: key, facts, is_test: identity.is_test,
    });
  }
  async function cancelMarketing(trx: Database, ids: string[], code: string) {
    const cancelled = await trx("comm_outbox")
      .whereIn("identity_id", ids).where({ purpose: "marketing", state: "pending" })
      .update({ state: "cancelled", error_code: code }).returning("id");
    if (cancelled.length) await trx("comm_operations")
      .whereIn("outbox_id", cancelled.map((row: any) => row.id)).where({ state: "pending" })
      .update({ state: "cancelled", error_code: code });
  }
  async function members(trx: Database, contactId: string) {
    return trx("comm_identities as i").join("comm_connections as n", "n.id", "i.connection_id")
      .where("i.contact_id", contactId).select("i.*", "n.platform", "n.store_id", "n.enabled");
  }
  async function available(trx: Database, ids: string[]) {
    if (await trx("comm_outbox").whereIn("identity_id", ids)
      .whereIn("purpose", ["marketing", "service"])
      .whereIn("state", ["sending", "uncertain", "partial"]).first())
      return fail("IDENTITY_DELIVERY_BUSY", 409);
  }
  async function touch(trx: Database, contactId: string) {
    await trx("comm_contacts").where({ id: contactId }).increment("version", 1);
  }
  async function prefer(trx: Database, identity: any, key: string) {
    await trx("comm_identities").where({ contact_id: identity.contact_id }).update({ preferred: false });
    await trx("comm_identities").where({ id: identity.id }).update({ preferred: true });
    await cancelMarketing(trx, (await members(trx, identity.contact_id)).map((i: any) => i.id), "PREFERRED_CHANNEL_CHANGED");
    await touch(trx, identity.contact_id);
    await audit(trx, identity, "preferred_channel_changed", key, {});
  }
  async function stopMarketing(trx: Database, identity: any, key: string) {
    const ids = (await members(trx, identity.contact_id)).map((i: any) => i.id);
    await trx("comm_contacts").where({ id: identity.contact_id }).update({ marketing_opt_out: true });
    await cancelMarketing(trx, ids, "GLOBAL_OPT_OUT");
    // Topic consents remain separate evidence; the contact-level refusal always wins.
    await touch(trx, identity.contact_id);
    await audit(trx, identity, "marketing_opt_out", key, { scope: "all_linked_accounts" });
  }
  async function detach(trx: Database, identity: any, key: string) {
    const group = await members(trx, identity.contact_id);
    if (group.length < 2) return fail("IDENTITY_NOT_LINKED", 409);
    await available(trx, group.map((i: any) => i.id));
    const old = await trx("comm_contacts").where({ id: identity.contact_id }).first();
    const [next] = await trx("comm_contacts").insert({ name: old.name, marketing_opt_out: old.marketing_opt_out }).returning("*");
    // A split must not erase the previous seven-day frequency allowance.
    const history = await trx("comm_frequency as f")
      .where((q: any) => q.where("f.contact_id", old.id).orWhereExists(
        trx("comm_frequency_carryovers as h").select(1).whereRaw("h.frequency_id=f.id").where("h.contact_id", old.id),
      )).andWhere("f.reserved_at", ">", trx.raw("now()-interval '7 days'"))
      .select("f.id");
    if (history.length) await trx("comm_frequency_carryovers").insert(
      history.map((f: any) => ({ contact_id: next.id, frequency_id: f.id })),
    ).onConflict(["contact_id", "frequency_id"]).ignore();
    const nativeLeads = await trx("comm_access_grants").where({ identity_id: identity.id })
      .whereNull("link_id").whereNull("revoked_at").pluck("lead_id");
    const revoked = await trx("comm_access_grants").whereNotNull("link_id").whereNull("revoked_at")
      .where((q: any) => q.where("identity_id", identity.id).orWhereIn("lead_id", nativeLeads))
      .update({ revoked_at: trx.fn.now() }).returning(["identity_id", "lead_id"]);
    for (const grant of revoked) {
      const threads = await trx("comm_threads").where({ identity_id: grant.identity_id }).pluck("id");
      const conversations = await trx("comm_conversations").whereIn("thread_id", threads)
        .where({ lead_id: grant.lead_id }).pluck("id");
      await trx("comm_threads").whereIn("id", threads).whereIn("selected_conversation_id", conversations)
        .update({ selected_conversation_id: null, pending_kind: null });
      const cancelled = await trx("comm_outbox").whereIn("conversation_id", conversations)
        .where({ state: "pending", purpose: "service" })
        .update({ state: "cancelled", error_code: "LINK_ACCESS_REVOKED" }).returning("id");
      if (cancelled.length) await trx("comm_operations").whereIn("outbox_id", cancelled.map((o: any) => o.id))
        .where({ state: "pending" }).update({ state: "cancelled", error_code: "LINK_ACCESS_REVOKED" });
    }
    await cancelMarketing(trx, group.map((i: any) => i.id), "IDENTITY_UNLINKED");
    await trx("comm_link_tokens").whereIn("state", ["pending", "target_confirm", "confirm"])
      .where((q: any) => q.where("source_identity_id", identity.id).orWhere("target_identity_id", identity.id))
      .update({ state: "revoked" });
    await trx("comm_identity_links").whereNull("revoked_at")
      .where((q: any) => q.where("source_identity_id", identity.id).orWhere("target_identity_id", identity.id))
      .update({ revoked_at: trx.fn.now() });
    await trx("comm_identities").where({ id: identity.id }).update({ contact_id: next.id, preferred: true });
    const remaining = group.filter((i: any) => i.id !== identity.id);
    if (!remaining.some((i: any) => i.preferred)) await trx("comm_identities").where({ id: remaining[0].id }).update({ preferred: true });
    await touch(trx, old.id);
    await audit(trx, identity, "identity_unlinked", key, { previous_contact_id: old.id, contact_id: next.id });
    return next.id;
  }
  async function validateLink(trx: Database, link: any, n: any, target: any) {
    const source = await trx("comm_identities").where({ id: link.source_identity_id }).first();
    const sourceConnection = source && await trx("comm_connections").where({ id: source.connection_id }).first();
    const lead = await trx("leads").where({ id: link.lead_id }).first();
    if (!source || !sourceConnection?.enabled || !n.enabled || !active(lead) ||
      sourceConnection.store_id !== n.store_id || (lead.store_location_id && lead.store_location_id !== n.store_id) ||
      sourceConnection.platform === n.platform || source.id === target.id || source.is_test !== target.is_test ||
      (link.target_connection_id && link.target_connection_id !== n.id) ||
      !await trx("comm_access_grants").where({ identity_id: source.id, lead_id: lead.id }).whereNull("revoked_at").first())
      return fail("LINK_UNAVAILABLE", 409);
    const sourceGroup = await members(trx, source.contact_id);
    const targetGroup = await members(trx, target.contact_id);
    if (target.contact_id !== source.contact_id && (targetGroup.length !== 1 ||
      sourceGroup.some((i: any) => i.platform === n.platform) || sourceGroup.some((i: any) => i.store_id !== n.store_id)))
      return fail("LINK_GROUP_CONFLICT", 409);
    return { source, sourceConnection, lead, sourceGroup, targetGroup };
  }
  async function invite(trx: Database, n: any, thread: any, lead: any, targetId: unknown) {
    if (typeof targetId !== "string" || !UUID.test(targetId)) return fail("LINK_TARGET_REQUIRED");
    const target = await trx("comm_connections").where({ id: targetId, enabled: true }).first();
    const username = String(target?.bot_username || "").replace(/^@/, "");
    if (!active(lead) || !target || target.store_id !== n.store_id || target.platform === n.platform ||
      !/^[A-Za-z0-9_.-]{2,64}$/.test(username)) return fail("LINK_UNAVAILABLE", 409);
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + 900_000);
    await trx("comm_link_tokens").where({ source_identity_id: thread.identity_id, lead_id: lead.id })
      .whereIn("state", ["pending", "target_confirm", "confirm"]).update({ state: "revoked" });
    await trx("comm_link_tokens").insert({ hash: digest(token), source_identity_id: thread.identity_id,
      target_connection_id: target.id, lead_id: lead.id, expires_at: expires });
    const url = target.platform === "telegram" ? `https://t.me/${username}?start=${token}`
      : target.platform === "max" ? `https://max.ru/${username}?start=${token}`
      : `https://vk.me/${username}?ref=${token}&ref_source=account_link`;
    await service.enqueue(trx, n, thread,
      `Чтобы связать ваш аккаунт с ${target.platform.toUpperCase()}, откройте ссылку на своём аккаунте: ${url}\n` +
      "Ссылка действует 15 минут. Потребуется подтверждение в обоих чатах; доступ выдаётся только к этой заявке.",
      { expires_at: expires });
    return { ok: true, issued: true, expires_in: 900 };
  }
  async function bind(trx: Database, n: any, thread: any, link: any) {
    const target = await trx("comm_identities").where({ id: thread.identity_id }).first();
    const checked = await validateLink(trx, link, n, target);
    await trx("comm_link_tokens").where({ hash: link.hash }).update({ target_identity_id: target.id, state: "target_confirm" });
    const h = callbackHash(link.hash);
    await service.enqueue(trx, n, thread,
      `Связать этот аккаунт с ${checked.sourceConnection.platform.toUpperCase()} ${masked(checked.source.external_user_id)}? ` +
      "После подтверждения в обоих чатах менеджер увидит общую карточку. Доступ будет только к выбранной заявке.",
      { expires_at: link.expires_at }, [["Да, это мои аккаунты", `link:t:${h}`], ["Отмена", `link:x:${h}`]]);
    return true;
  }
  async function confirm(trx: Database, n: any, thread: any, action: string, hash: string) {
    const link = await trx("comm_link_tokens").where({ hash })
      .andWhere("expires_at", ">", trx.fn.now()).forUpdate().first();
    if (!link || !["target_confirm", "confirm"].includes(link.state)) return fail("LINK_UNAVAILABLE", 409);
    const who = thread.identity_id;
    if (action === "x") {
      if (![link.source_identity_id, link.target_identity_id].includes(who)) return fail("LINK_UNAVAILABLE", 409);
      await trx("comm_link_tokens").where({ hash }).update({ state: "revoked" });
      return service.enqueue(trx, n, thread, "Приглашение отменено.");
    }
    const target = await trx("comm_identities").where({ id: link.target_identity_id }).first();
    const targetConnection = await trx("comm_connections").where({ id: target.connection_id }).first();
    const { source, sourceConnection, lead, sourceGroup, targetGroup } = await validateLink(trx, link, targetConnection, target);
    const sourceThread = await trx("comm_threads").where({ identity_id: source.id }).first();
    if (action === "t" && link.state === "target_confirm" && who === target.id) {
      await trx("comm_link_tokens").where({ hash }).update({ state: "confirm", target_confirmed_at: trx.fn.now() });
      await service.enqueue(trx, sourceConnection, sourceThread,
        `Аккаунт ${targetConnection.platform.toUpperCase()} ${masked(target.external_user_id)} подтвердил связь. Это ваш аккаунт?`,
        { expires_at: link.expires_at }, [["Подтвердить связь", `link:s:${callbackHash(hash)}`], ["Отмена", `link:x:${callbackHash(hash)}`]]);
      return service.enqueue(trx, n, thread, "Ожидаем подтверждение в исходном чате. История пока недоступна.");
    }
    if (action !== "s" || link.state !== "confirm" || who !== source.id || !link.target_confirmed_at)
      return fail("LINK_UNAVAILABLE", 409);
    await available(trx, [...sourceGroup, ...targetGroup].map((i: any) => i.id));
    const sourceContact = await trx("comm_contacts").where({ id: source.contact_id }).first();
    const targetContact = await trx("comm_contacts").where({ id: target.contact_id }).first();
    if (sourceContact.merged_into || targetContact.merged_into) return fail("LINK_UNAVAILABLE", 409);
    await cancelMarketing(trx, [...sourceGroup, ...targetGroup].map((i: any) => i.id), "IDENTITY_LINK_RECHECK");
    if (source.contact_id !== target.contact_id) {
      const carryovers = await trx("comm_frequency_carryovers").where({ contact_id: target.contact_id });
      if (carryovers.length) await trx("comm_frequency_carryovers").insert(carryovers.map((h: any) => ({
        contact_id: source.contact_id, frequency_id: h.frequency_id,
      }))).onConflict(["contact_id", "frequency_id"]).ignore();
      await trx("comm_identities").where({ id: target.id }).update({ contact_id: source.contact_id, preferred: false });
      await trx("comm_frequency").where({ contact_id: target.contact_id }).update({ contact_id: source.contact_id });
      await trx("comm_contacts").where({ id: target.contact_id }).update({ merged_into: source.contact_id });
      await trx("comm_contacts").where({ id: source.contact_id })
        .update({ marketing_opt_out: sourceContact.marketing_opt_out || targetContact.marketing_opt_out });
      if (!sourceGroup.some((i: any) => i.preferred)) await trx("comm_identities").where({ id: source.id }).update({ preferred: true });
    }
    const [record] = await trx("comm_identity_links").insert({ hash, source_identity_id: source.id,
      target_identity_id: target.id, lead_id: link.lead_id }).returning("*");
    const targetThread = await trx("comm_threads").where({ identity_id: target.id }).first();
    const [c] = await trx("comm_conversations").insert({ thread_id: targetThread.id, lead_id: link.lead_id,
      handling: lead.status === "waiting" ? "waiting" : lead.assigned_to ? "agent" : "queued" })
      .onConflict(["thread_id", "lead_id"]).merge({ thread_id: targetThread.id }).returning("*");
    const grant = await trx("comm_access_grants").where({ identity_id: target.id, lead_id: link.lead_id }).first();
    if (!grant) await trx("comm_access_grants").insert({ identity_id: target.id, lead_id: link.lead_id, link_id: record.id });
    else if (grant.revoked_at) await trx("comm_access_grants").where({ id: grant.id }).update({ revoked_at: null, link_id: record.id });
    await trx("comm_threads").where({ id: targetThread.id }).update({ selected_conversation_id: c.id });
    await trx("comm_link_tokens").where({ hash }).update({ state: "done", source_confirmed_at: trx.fn.now() });
    await touch(trx, source.contact_id);
    await audit(trx, source, "identity_linked", `link:${hash}`, { target: target.id, lead: link.lead_id });
    await service.enqueue(trx, sourceConnection, sourceThread, "Аккаунты связаны. Доступ открыт только к выбранной заявке.");
    await service.enqueue(trx, targetConnection, targetThread, "Аккаунты связаны. Напишите сообщение по выбранной заявке.");
  }
  async function customer(trx: Database, n: any, thread: any, text: string, key: string) {
    const identity = await trx("comm_identities").where({ id: thread.identity_id }).first();
    if (/^link:[tsx]:[A-Za-z0-9_-]{43}$/.test(text)) {
      await confirm(trx, n, thread, text[5], Buffer.from(text.slice(7), "base64url").toString("hex"));
    } else if (text === "account:prefer") {
      await prefer(trx, identity, key);
      await service.enqueue(trx, n, thread, "Эта площадка выбрана предпочтительной для разрешённых рассылок.");
    } else if (text === "account:stop") {
      await stopMarketing(trx, identity, key);
      await service.enqueue(trx, n, thread, "Персональные рассылки отключены для всех связанных аккаунтов. Обращения работают.");
    } else if (text === "account:unlink") {
      await service.enqueue(trx, n, thread, "Отвязать этот аккаунт? Доступ к заявкам, полученный через связь, будет отозван. Ваши собственные обращения сохранятся.", {},
        [["Отвязать этот аккаунт", "account:unlink_confirm"], ["Отмена", "account"]]);
    } else if (text === "account:unlink_confirm") {
      await detach(trx, identity, key);
      await service.enqueue(trx, n, thread, "Аккаунт отвязан. Полученный через связь доступ отозван.");
    } else if (["account", "/account"].includes(text)) {
      const group = await members(trx, identity.contact_id);
      const contact = await trx("comm_contacts").where({ id: identity.contact_id }).first();
      await service.enqueue(trx, n, thread,
        `Ваши аккаунты: ${group.map((i: any) => `${i.platform.toUpperCase()} ${masked(i.external_user_id)}${i.preferred ? ' (предпочтительный)' : ''}`).join(', ')}.\n` +
        (contact.marketing_opt_out ? "Персональные рассылки отключены." : "Рассылки возможны только с вашим согласием."), {},
        [["Предпочитать эту площадку", "account:prefer"], ["Отключить все рассылки", "account:stop"],
          ...(group.length > 1 ? [["Отвязать этот аккаунт", "account:unlink"]] : []), ["Главное меню", "main"]]);
    } else return false;
    return true;
  }
  async function action(actor: Actor, contactId: string, input: any) {
    if (!UUID.test(contactId) || !UUID.test(input?.key || "")) return fail("COMMAND_KEY_REQUIRED");
    return db.transaction(async (trx: Database) => {
      await identityLock(trx);
      const group = await members(trx, contactId);
      if (!group.length) return fail("NOT_FOUND", 404);
      for (const member of group) if (!await trx("comm_staff")
        .where({ user_id: actor.user, store_id: member.store_id, enabled: true, can_manage: true }).first())
        return fail("FORBIDDEN", 403);
      const type = `contact_${String(input.action || "unknown")}`;
      const fingerprint = digest(canonical({ contactId, ...input }));
      await trx("comm_command_receipts").insert({ actor_id: actor.user, command_type: type, command_key: input.key, fingerprint })
        .onConflict(["actor_id", "command_type", "command_key"]).ignore();
      const receipt = await trx("comm_command_receipts").where({ actor_id: actor.user, command_type: type, command_key: input.key }).forUpdate().first();
      if (receipt.fingerprint !== fingerprint) return fail("IDEMPOTENCY_PARAMETER_MISMATCH", 409);
      if (receipt.result) return receipt.result;
      const contact = await trx("comm_contacts").where({ id: contactId }).forUpdate().first();
      if (input.expected_version !== contact.version) return fail("STALE_CONTACT", 409);
      const identity = group.find((i: any) => i.id === input.identity_id);
      if (!identity) return fail("IDENTITY_NOT_FOUND", 404);
      let nextId = contactId;
      if (input.action === "prefer") await prefer(trx, identity, `contact:${receipt.id}`);
      else if (input.action === "unlink") nextId = await detach(trx, identity, `contact:${receipt.id}`);
      else if (input.action === "stop_marketing") await stopMarketing(trx, identity, `contact:${receipt.id}`);
      else return fail("UNKNOWN_COMMAND");
      const result = { ok: true, contact_id: contactId, detached_contact_id: nextId !== contactId ? nextId : null,
        version: (await trx("comm_contacts").where({ id: contactId }).first()).version };
      await trx("comm_command_receipts").where({ id: receipt.id }).update({ result });
      return result;
    });
  }
  return { invite, bind, customer, action };
}
