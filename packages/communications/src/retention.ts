import { unlink } from "node:fs/promises";
import type { Database } from "./types.js";
/** Run daily; only expired conversations are removed, never the permanent peer. */
export async function retainCommunications(db: Database, attachmentPath: (key: string) => string) {
  const result = await db.transaction(async (trx: Database) => {
    await trx.raw("SELECT pg_advisory_xact_lock(73119,1)");
    if (await trx("comm_backups").where({ state: "running" }).first())
      return { paused_for_backup: true };
    const ids = await trx("comm_conversations")
      .whereNotNull("closed_at")
      .whereRaw("closed_at<=now()-interval '6 months'")
      .pluck("id");
    const stale = trx("comm_messages")
      .whereNull("conversation_id")
      .whereRaw("received_at<=now()-interval '30 days'")
      .select("id");
    const media = await trx("comm_attachments")
      .where((q: any) =>
        q
          .whereIn("conversation_id", ids)
          .orWhereIn("message_id", stale)
          .orWhere((u: any) =>
            u.whereNull("message_id").whereRaw("created_at<=now()-interval '30 days'"),
          ),
      )
      .select("id", "storage_key");
    for (const f of media)
      if (f.storage_key)
        await trx("comm_file_gc")
          .insert({ storage_key: f.storage_key })
          .onConflict("storage_key")
          .ignore();
    await trx("comm_staff_drafts")
      .whereIn("conversation_id", ids)
      .orWhere("expires_at", "<", trx.fn.now())
      .delete();
    await trx("comm_attachments")
      .whereIn(
        "id",
        media.map((f: any) => f.id),
      )
      .delete();
    await trx("comm_outbox").whereIn("conversation_id", ids).delete();
    await trx("comm_messages").whereIn("id", stale).delete();
    await trx("comm_conversations").whereIn("id", ids).delete();
    const raw = await trx("comm_inbound")
      .where({ state: "done" })
      .whereNotNull("event")
      .whereRaw("processed_at<=now()-interval '7 days'")
      .update({ event: null });
    await trx("comm_link_tokens").where("expires_at", "<", trx.fn.now()).delete();
    return { conversations: ids.length, files: media.length, raw_events: raw };
  });
  // Hold the same lock as backup registration while deleting files. Failed deletion remains queued.
  await db.transaction(async (trx: Database) => {
    await trx.raw("SELECT pg_advisory_xact_lock(73119,1)");
    if (await trx("comm_backups").where({ state: "running" }).first()) return;
    for (const f of await trx("comm_file_gc").orderBy("queued_at").limit(100)) {
      if (await trx("comm_attachments").where({ storage_key: f.storage_key }).first()) continue;
      try {
        await unlink(attachmentPath(f.storage_key));
      } catch (e: any) {
        if (e.code !== "ENOENT") continue;
      }
      await trx("comm_file_gc").where({ storage_key: f.storage_key }).delete();
    }
  });
  return result;
}
