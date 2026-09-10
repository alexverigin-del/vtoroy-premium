import type { AttachmentRef, IncomingEvent, Platform } from "./types.js";
import { canonical, digest, fail, identifier } from "./policy.js";
const date = (value: unknown, milliseconds = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fail("EVENT_TIME_REQUIRED");
  return new Date(milliseconds ? n : n * 1000).toISOString();
};
const media = (kind: AttachmentRef["kind"], value: any): AttachmentRef => ({
  kind,
  externalId: identifier(value.file_id),
  name: String(value.file_name || kind).slice(0, 200),
  mime: String(value.mime_type || "application/octet-stream"),
  size: Number.isSafeInteger(value.file_size) && value.file_size >= 0 ? value.file_size : null,
});
export function normalize(platform: Platform, raw: any): IncomingEvent {
  if (!raw || typeof raw !== "object") return fail("INVALID_EVENT");
  if (platform === "telegram") {
    const id = identifier(raw.update_id),
      member = raw.my_chat_member;
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
        availability: member.new_chat_member?.status === "kicked" ? "blocked" : "allowed",
      };
    const cb = raw.callback_query,
      m = raw.edited_message || raw.message || cb?.message;
    if (m?.chat?.type === "supergroup")
      return {
        id,
        platform,
        kind: "staff",
        actorId: identifier(cb?.from?.id ?? m.from?.id),
        peerId: identifier(m.chat.id),
        occurredAt: new Date().toISOString(),
        text: "",
        attachments: [],
        raw,
      };
    if (!m || m.chat?.type !== "private") return fail("NON_PRIVATE_EVENT");
    const attachments: AttachmentRef[] = [];
    if (m.photo?.length) attachments.push(media("image", m.photo.at(-1)));
    for (const kind of ["voice", "audio", "video", "document"] as const)
      if (m[kind]) attachments.push(media(kind, m[kind]));
    if (m.video_note) attachments.push(media("video", m.video_note));
    if (
      cb?.from?.is_bot ||
      (!cb && m.from?.is_bot) ||
      String(cb?.from?.id ?? m.from?.id) !== String(m.chat.id)
    )
      return fail("INVALID_PRIVATE_ACTOR");
    return {
      id,
      platform,
      actorId: identifier(cb?.from?.id ?? m.from?.id),
      peerId: identifier(m.chat.id),
      kind: cb
        ? "callback"
        : raw.edited_message
          ? "edited"
          : m.sticker || m.contact || m.location
            ? "unsupported"
            : "message",
      occurredAt: cb ? new Date().toISOString() : date(m.edit_date ?? m.date),
      externalMessageId: identifier(m.message_id),
      text: String(m.text ?? m.caption ?? ""),
      attachments,
      albumId: m.media_group_id ? identifier(m.media_group_id) : undefined,
      callbackId: cb ? identifier(cb.id) : undefined,
      callbackData: cb?.data,
    };
  }
  if (platform === "max") {
    const m = raw.message,
      u = raw.user || raw.callback?.user || m?.sender;
    const actorId = identifier(u?.user_id),
      peerId = identifier(m?.recipient?.chat_id ?? raw.chat_id ?? actorId);
    if (m?.recipient?.chat_type && m.recipient.chat_type !== "dialog")
      return fail("NON_PRIVATE_EVENT");
    const kind =
      raw.update_type === "bot_stopped"
        ? "availability"
        : raw.update_type === "bot_started"
          ? "started"
          : raw.update_type === "message_callback"
            ? "callback"
            : raw.update_type === "message_edited"
              ? "edited"
              : raw.update_type === "message_created"
                ? "message"
                : "unsupported";
    const occurredAt = date(raw.timestamp, true);
    const id = String(
      raw.event_id ??
        `${raw.update_type}:${m?.body?.mid ?? raw.callback?.callback_id ?? actorId}:${raw.timestamp}`,
    );
    const attachments = (m?.body?.attachments || [])
      .filter((a: any) => ["image", "video", "audio", "file"].includes(a.type))
      .map((a: any) => ({
        kind: ({ image: "image", video: "video", audio: "audio", file: "document" } as any)[a.type],
        externalId: String(a.payload?.token ?? a.payload?.video_id ?? digest(canonical(a.payload))),
        url: a.payload?.url,
        name: String(a.filename || a.type),
        mime: String(a.mime_type || "application/octet-stream"),
        size: Number.isSafeInteger(a.size) ? a.size : null,
      }));
    return {
      id,
      platform,
      actorId,
      peerId,
      kind,
      occurredAt,
      externalMessageId: m?.body?.mid ? identifier(m.body.mid) : undefined,
      text: String(m?.body?.text ?? ""),
      attachments,
      callbackId: raw.callback?.callback_id,
      callbackData: raw.callback?.payload,
      availability:
        kind === "availability" ? "blocked" : kind === "started" ? "allowed" : undefined,
    };
  }
  const m = raw.object?.message || raw.object,
    actorId = identifier(m?.from_id ?? m?.user_id),
    peerId = identifier(m?.peer_id ?? actorId);
  if (Number(peerId) >= 2_000_000_000 || Number(actorId) <= 0) return fail("NON_PRIVATE_EVENT");
  const kind =
    raw.type === "message_allow" || raw.type === "message_deny"
      ? "availability"
      : raw.type === "message_event"
        ? "callback"
        : raw.type === "message_edit"
          ? "edited"
          : raw.type === "message_new"
            ? "message"
            : "unsupported";
  // VK events without a timestamp can still be uniquely deduplicated by event_id.
  if (!raw.event_id) return fail("EVENT_ID_REQUIRED");
  const attachments = (m.attachments || [])
    .map((a: any) => {
      const v = a[a.type] || {};
      const kind = (
        {
          photo: "image",
          audio_message: "voice",
          audio: "audio",
          video: "video",
          doc: "document",
        } as any
      )[a.type];
      if (!kind) return null;
      return {
        kind,
        externalId: `${a.type}${identifier(v.owner_id)}_${identifier(v.id)}${v.access_key ? "_" + v.access_key : ""}`,
        url: v.url ?? v.link_mp3 ?? v.sizes?.at(-1)?.url,
        name: String(v.title || kind),
        mime: "application/octet-stream",
        size: Number.isSafeInteger(v.size) ? v.size : null,
      };
    })
    .filter(Boolean);
  return {
    id: identifier(raw.event_id),
    platform,
    actorId,
    peerId,
    kind,
    occurredAt: m.date ? date(m.date) : new Date().toISOString(),
    externalMessageId: m.id
      ? identifier(m.id)
      : m.conversation_message_id
        ? identifier(m.conversation_message_id)
        : undefined,
    text: String(m.text || ""),
    attachments,
    callbackId: m.event_id,
    callbackData: typeof m.payload === "string" ? m.payload : m.payload?.action,
    availability:
      kind === "availability" ? (raw.type === "message_deny" ? "blocked" : "allowed") : undefined,
  };
}
