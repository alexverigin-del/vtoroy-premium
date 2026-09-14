import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { fail, MAX_FILE_BYTES, UUID, digest } from "./policy.js";
import type { Context, Actor } from "./types.js";
import {
  createAttachmentStorage,
  StorageObjectMissingError,
  StorageUnavailableError,
} from "./storage.js";
import type { StoredObject } from "./storage.js";

const allowed = new Map([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["image/gif", "image"],
  ["audio/ogg", "audio"],
  ["audio/ogg; codecs=opus", "audio"],
  ["audio/opus", "audio"],
  ["audio/mpeg", "audio"],
  ["audio/mp4", "audio"],
  ["audio/wav", "audio"],
  ["audio/x-wav", "audio"],
  ["audio/flac", "audio"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
  ["video/quicktime", "video"],
  ["application/pdf", "document"],
  ["application/msword", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"],
  ["text/plain", "document"],
]);
export async function inspectFile(buffer: Buffer, declared: string) {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) return fail("FILE_TOO_LARGE", 413);
  const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
  let mime = detected?.mime;
  if (!mime && declared === "text/plain") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (
        !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) &&
        !/<\s*(?:html|script|svg|iframe|!doctype)/i.test(text)
      )
        mime = "text/plain";
    } catch {}
  }
  if (!mime || !allowed.has(mime)) return fail("FILE_FORMAT_NOT_ALLOWED", 415);
  const declaredBase = declared.split(";", 1)[0].trim().toLowerCase(),
    detectedBase = mime.split(";", 1)[0].trim().toLowerCase();
  if (
    declaredBase &&
    declaredBase !== "application/octet-stream" &&
    declaredBase !== detectedBase &&
    !(declaredBase === "audio/ogg" && detectedBase === "audio/opus")
  )
    return fail("FILE_TYPE_MISMATCH", 415);
  return { mime, kind: allowed.get(mime)!, extension: detected?.ext || "txt" };
}
export async function readBounded(stream: AsyncIterable<Uint8Array>, size?: unknown) {
  if (size !== undefined && (!/^\d+$/.test(String(size)) || Number(size) > MAX_FILE_BYTES))
    return fail("FILE_TOO_LARGE", 413);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > MAX_FILE_BYTES) return fail("FILE_TOO_LARGE", 413);
    chunks.push(Buffer.from(chunk));
  }
  if (size !== undefined && length !== Number(size)) return fail("FILE_SIZE_MISMATCH");
  return Buffer.concat(chunks);
}
/** Clamd INSTREAM. A timeout/error leaves the object in quarantine. */
export async function scanClamAV(
  buffer: Buffer,
  host: string,
  port = 3310,
): Promise<"clean" | "infected"> {
  return new Promise((resolveScan, reject) => {
    const socket = createConnection({ host, port });
    let result = "";
    let settled = false;
    const finish = (error?: Error, value?: "clean" | "infected") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolveScan(value!);
    };
    socket.setTimeout(30000, () => finish(new Error("SCANNER_UNAVAILABLE")));
    socket.on("error", () => finish(new Error("SCANNER_UNAVAILABLE")));
    socket.on("data", (chunk) => {
      result += chunk.toString();
      if (result.length > 4096) return finish(new Error("SCANNER_PROTOCOL"));
      if (result.includes("\0")) {
        if (/: OK\0/.test(result)) finish(undefined, "clean");
        else if (/ FOUND\0/.test(result)) finish(undefined, "infected");
        else finish(new Error("SCANNER_UNAVAILABLE"));
      }
    });
    socket.on("end", () => {
      if (!settled) finish(new Error("SCANNER_UNAVAILABLE"));
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buffer.length; i += 65536) {
        const part = buffer.subarray(i, i + 65536),
          header = Buffer.alloc(4);
        header.writeUInt32BE(part.length);
        socket.write(header);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
export function createAttachments(context: Context, service: any) {
  const db = context.database,
    storage = createAttachmentStorage(context.env);
  async function store(buffer: Buffer, metadata: any) {
    const inspected = await inspectFile(buffer, metadata.mime || "");
    const key = randomUUID();
    let stored: StoredObject | undefined;
    try {
      stored = await storage.put(key, buffer, inspected.mime);
      const values = {
        ...metadata,
        mime: inspected.mime,
        kind: metadata.kind === "voice" && inspected.kind === "audio" ? "voice" : inspected.kind,
        name: `${String(metadata.name || "file")
          .replace(/[\x00-\x1f/\\<>:"|?*]/g, "_")
          .slice(0, 140)}`,
        storage_driver: stored.driver,
        storage_version: stored.version,
        object_etag: stored.etag,
        storage_key: key,
        sha256: digest(buffer),
        size: buffer.length,
        state: "quarantine",
      };
      if (metadata.id) {
        delete values.id;
        const changed = await db("comm_attachments")
          .where({ id: metadata.id, state: "pending" })
          .update(values);
        if (!changed) {
          await storage.remove({ storage_driver: stored.driver, storage_key: key });
          return fail("FILE_STATE_CHANGED", 409);
        }
        return { id: metadata.id, state: "quarantine" };
      }
      return (await db("comm_attachments").insert(values).returning(["id", "state", "name"]))[0];
    } catch (error) {
      if (stored)
        await storage
          .remove({ storage_driver: stored.driver, storage_key: key })
          .catch(() => undefined);
      throw error;
    }
  }
  async function upload(
    a: Actor,
    conversationId: string,
    stream: AsyncIterable<Uint8Array>,
    metadata: any,
  ) {
    const { c } = await service.permitted(db, a, conversationId);
    const waiting = await db("comm_attachments")
      .where({ uploaded_by: a.user })
      .whereIn("state", ["pending", "quarantine"])
      .count("* as count")
      .first();
    if (Number(waiting.count) >= 10) return fail("TOO_MANY_PENDING_FILES", 429);
    const buffer = await readBounded(stream, metadata.size);
    return store(buffer, {
      conversation_id: conversationId,
      connection_id: c.connection_id,
      uploaded_by: a.user,
      name: metadata.name,
      mime: metadata.mime,
    });
  }
  async function scanOne(connectionId: string) {
    const row = await db.transaction(async (trx: any) => {
      // Recover a process that died after claiming a file. Quarantine is safe to retry because
      // scanning has no external delivery side effect.
      await trx("comm_attachments")
        .where({ state: "scanning", connection_id: connectionId })
        .andWhere("checked_at", "<", trx.raw("now()-interval '2 minutes'"))
        .update({ state: "quarantine", error_code: "SCANNER_INTERRUPTED", checked_at: null });
      const row = await trx("comm_attachments")
        .where({ state: "quarantine", connection_id: connectionId })
        .orderBy("created_at")
        .forUpdate()
        .skipLocked()
        .first();
      if (!row) return null;
      await trx("comm_attachments")
        .where({ id: row.id, state: "quarantine" })
        .update({ state: "scanning", checked_at: trx.fn.now(), error_code: null });
      return row;
    });
    if (!row) return null;
    let bytes: Buffer;
    try {
      bytes = await storage.getBuffer(row);
    } catch (error) {
      if (!(error instanceof StorageObjectMissingError)) {
        await db("comm_attachments")
          .where({ id: row.id, state: "scanning" })
          .update({ state: "quarantine", error_code: "STORAGE_UNAVAILABLE", checked_at: null });
        return { id: row.id, state: "quarantine", error_code: "STORAGE_UNAVAILABLE" };
      }
      await db("comm_attachments")
        .where({ id: row.id, state: "scanning" })
        .update({ state: "rejected", error_code: "FILE_MISSING", checked_at: db.fn.now() });
      return { id: row.id, state: "rejected" };
    }
    if (digest(bytes) !== row.sha256) {
      await db("comm_attachments")
        .where({ id: row.id, state: "scanning" })
        .update({ state: "rejected", error_code: "FILE_INTEGRITY", checked_at: db.fn.now() });
      return { id: row.id, state: "rejected" };
    }
    let result;
    try {
      result = await scanClamAV(
        bytes,
        String(context.env.ISVOI_COMMUNICATIONS_CLAMAV_HOST || "clamav"),
      );
    } catch {
      await db("comm_attachments")
        .where({ id: row.id, state: "scanning" })
        .update({ state: "quarantine", error_code: "SCANNER_UNAVAILABLE", checked_at: null });
      return { id: row.id, state: "quarantine", error_code: "SCANNER_UNAVAILABLE" };
    }
    const state = result === "clean" ? "ready" : "rejected";
    if (result === "infected") {
      try {
        await storage.remove(row);
      } catch {
        await db("comm_attachments")
          .where({ id: row.id, state: "scanning" })
          .update({ state: "quarantine", error_code: "STORAGE_UNAVAILABLE", checked_at: null });
        return { id: row.id, state: "quarantine", error_code: "STORAGE_UNAVAILABLE" };
      }
    }
    const changed = await db("comm_attachments")
      .where({ id: row.id, state: "scanning" })
      .update({
        state,
        checked_at: db.fn.now(),
        error_code: result === "clean" ? null : "MALWARE_DETECTED",
      });
    if (!changed) return fail("FILE_STATE_CHANGED", 409);
    return { id: row.id, state };
  }
  async function get(a: Actor, id: string) {
    if (!UUID.test(id)) return fail("NOT_FOUND", 404);
    const row = await db("comm_attachments").where({ id }).first();
    if (!row) return fail("NOT_FOUND", 404);
    await service.permitted(db, a, row.conversation_id);
    if (row.state !== "ready") return fail("FILE_NOT_READY", 409);
    return row;
  }
  async function stream(row: any, start?: number, end?: number) {
    try {
      return await storage.getStream(row, start, end);
    } catch (error) {
      if (error instanceof StorageObjectMissingError) return fail("FILE_MISSING", 404);
      return fail("STORAGE_UNAVAILABLE", 503);
    }
  }
  return { store, upload, scanOne, get, stream };
}
