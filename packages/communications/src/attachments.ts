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
  ["audio/ogg", "audio"],
  ["audio/ogg; codecs=opus", "audio"],
  ["audio/opus", "audio"],
  ["audio/mpeg", "audio"],
  ["audio/wav", "audio"],
  ["audio/x-wav", "audio"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
]);
export async function inspectFile(buffer: Buffer, declared: string) {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) return fail("FILE_TOO_LARGE", 413);
  const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
  let mime = detected?.mime;
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
export class SanitizerUnavailableError extends Error {
  constructor() {
    super("SANITIZER_UNAVAILABLE");
  }
}
export class SanitizerRejectedError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export type SanitizedMedia = {
  bytes: Buffer;
  mime: string;
  extension: string;
  kind: "image" | "voice" | "audio" | "video";
  version: string;
};
export async function sanitizeMedia(
  buffer: Buffer,
  mime: string,
  kind: "image" | "voice" | "audio" | "video",
  configuredUrl: string,
): Promise<SanitizedMedia> {
  let endpoint: URL;
  try {
    const base = new URL(configuredUrl);
    if (!(["http:", "https:"] as string[]).includes(base.protocol) || base.username || base.password)
      throw new Error();
    endpoint = new URL("/v1/sanitize", base);
  } catch {
    throw new SanitizerUnavailableError();
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length),
        "X-Input-Mime": mime,
        "X-Input-Kind": kind,
      },
      body: buffer as any,
      signal: AbortSignal.timeout(55_000),
      redirect: "error",
    });
  } catch {
    throw new SanitizerUnavailableError();
  }
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429)
      throw new SanitizerUnavailableError();
    let code = "MEDIA_SANITIZATION_FAILED";
    try {
      const body = await response.json();
      if (/^[A-Z0-9_]{1,60}$/.test(String(body?.error_code))) code = String(body.error_code);
    } catch {}
    throw new SanitizerRejectedError(code);
  }
  if (!response.body) throw new SanitizerUnavailableError();
  const outputMime = String(response.headers.get("content-type") || "").split(";", 1)[0],
    extension = String(response.headers.get("x-sanitized-extension") || ""),
    outputKind = String(response.headers.get("x-sanitized-kind") || ""),
    version = String(response.headers.get("x-sanitizer-version") || "");
  if (
    !["image/jpeg", "image/png", "image/webp", "audio/ogg", "video/mp4"].includes(outputMime) ||
    !["jpg", "png", "webp", "ogg", "mp4"].includes(extension) ||
    outputKind !== kind ||
    !/^isvoi-safe-media\/[0-9]+$/.test(version)
  )
    throw new SanitizerUnavailableError();
  const bytes = await readBounded(
    response.body as unknown as AsyncIterable<Uint8Array>,
    response.headers.get("content-length") || undefined,
  ).catch(() => {
    throw new SanitizerUnavailableError();
  });
  const inspected = await inspectFile(bytes, outputMime).catch(() => {
    throw new SanitizerUnavailableError();
  });
  const inspectedKind = kind === "voice" && inspected.kind === "audio" ? "voice" : inspected.kind;
  if (inspectedKind !== kind) throw new SanitizerUnavailableError();
  return { bytes, mime: outputMime, extension, kind, version };
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
      // Recover a process that died after claiming a file. Sanitization has no external delivery
      // side effect and writes a new immutable object before the database pointer is swapped.
      await trx("comm_attachments")
        .where({ state: "scanning", connection_id: connectionId })
        .andWhere("checked_at", "<", trx.raw("now()-interval '2 minutes'"))
        .update({ state: "quarantine", error_code: "SANITIZER_INTERRUPTED", checked_at: null });
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
    let result: SanitizedMedia;
    try {
      result = await sanitizeMedia(
        bytes,
        row.mime,
        row.kind,
        String(context.env.ISVOI_COMMUNICATIONS_SANITIZER_URL || "http://media-sanitizer:8080"),
      );
    } catch (error) {
      if (error instanceof SanitizerRejectedError) {
        const changed = await db.transaction(async (trx: any) => {
          await trx("comm_file_gc")
            .insert({
              storage_key: row.storage_key,
              storage_driver: row.storage_driver || "local",
              storage_version: row.storage_version || null,
            })
            .onConflict("storage_key")
            .ignore();
          return trx("comm_attachments")
            .where({ id: row.id, state: "scanning" })
            .update({
              state: "rejected",
              error_code: error.code,
              checked_at: trx.fn.now(),
              source_sha256: row.sha256,
              storage_key: null,
              storage_version: null,
              object_etag: null,
            });
        });
        if (!changed) return fail("FILE_STATE_CHANGED", 409);
        try {
          await storage.remove(row);
          await db("comm_file_gc").where({ storage_key: row.storage_key }).delete();
        } catch {}
        return { id: row.id, state: "rejected", error_code: error.code };
      }
      await db("comm_attachments")
        .where({ id: row.id, state: "scanning" })
        .update({ state: "quarantine", error_code: "SANITIZER_UNAVAILABLE", checked_at: null });
      return { id: row.id, state: "quarantine", error_code: "SANITIZER_UNAVAILABLE" };
    }
    const newKey = randomUUID();
    let replacement: StoredObject | undefined;
    try {
      replacement = await storage.put(newKey, result.bytes, result.mime);
      const changed = await db.transaction(async (trx: any) => {
        await trx("comm_file_gc")
          .insert({
            storage_key: row.storage_key,
            storage_driver: row.storage_driver || "local",
            storage_version: row.storage_version || null,
          })
          .onConflict("storage_key")
          .ignore();
        const baseName = String(row.name || "file")
          .replace(/\.[^.]{1,12}$/u, "")
          .replace(/[\x00-\x1f/\\<>:"|?*]/g, "_")
          .slice(0, 125);
        return trx("comm_attachments")
          .where({ id: row.id, state: "scanning" })
          .update({
            state: "ready",
            checked_at: trx.fn.now(),
            error_code: null,
            name: `${baseName || "file"}.${result.extension}`,
            mime: result.mime,
            size: result.bytes.length,
            sha256: digest(result.bytes),
            source_sha256: row.sha256,
            sanitized_at: trx.fn.now(),
            sanitizer_version: result.version,
            storage_driver: replacement!.driver,
            storage_version: replacement!.version,
            object_etag: replacement!.etag,
            storage_key: newKey,
          });
      });
      if (!changed) return fail("FILE_STATE_CHANGED", 409);
    } catch (error) {
      if (replacement)
        await storage
          .remove({ storage_driver: replacement.driver, storage_key: newKey, storage_version: replacement.version })
          .catch(() => undefined);
      if (error instanceof StorageUnavailableError) {
        await db("comm_attachments")
          .where({ id: row.id, state: "scanning" })
          .update({ state: "quarantine", error_code: "STORAGE_UNAVAILABLE", checked_at: null });
        return { id: row.id, state: "quarantine", error_code: "STORAGE_UNAVAILABLE" };
      }
      throw error;
    }
    try {
      await storage.remove(row);
      await db("comm_file_gc").where({ storage_key: row.storage_key }).delete();
    } catch {}
    return { id: row.id, state: "ready" };
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
  return { store, upload, scanOne, get, stream, remove: storage.remove };
}
