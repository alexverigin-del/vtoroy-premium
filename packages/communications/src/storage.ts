import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import type { Readable } from "node:stream";
import { flag, MAX_FILE_BYTES, UUID } from "./policy.js";

export type StorageDriverName = "local" | "s3";
export type StorageRecord = {
  storage_driver?: StorageDriverName | null;
  storage_version?: string | null;
  storage_key: string;
  size?: number | string | null;
};
export type StoredObject = {
  driver: StorageDriverName;
  version: string | null;
  etag: string | null;
};

export class StorageUnavailableError extends Error {
  constructor() {
    super("STORAGE_UNAVAILABLE");
  }
}
export class StorageObjectMissingError extends Error {
  constructor() {
    super("STORAGE_OBJECT_MISSING");
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}
function cleanPrefix(value: unknown) {
  const prefix = clean(value).replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").some((part) => !part || part === "." || part === ".."))
    throw new StorageUnavailableError();
  return prefix;
}
function localPath(root: string, key: string) {
  if (!UUID.test(key)) throw new StorageObjectMissingError();
  return join(root, key);
}
async function boundedBody(body: AsyncIterable<Uint8Array>) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.length;
    if (length > MAX_FILE_BYTES) throw new StorageUnavailableError();
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function isMissing(error: any) {
  return (
    error?.name === "NoSuchKey" ||
    error?.name === "NoSuchVersion" ||
    error?.name === "NotFound" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

export function createAttachmentStorage(env: Record<string, unknown>) {
  const root = resolve(
    clean(env.ISVOI_COMMUNICATIONS_PRIVATE_DIR) || "/directus/private-communications",
  );
  const configuredDriver = clean(env.ISVOI_COMMUNICATIONS_STORAGE_DRIVER) || "local";
  if (configuredDriver !== "local" && configuredDriver !== "s3")
    throw new StorageUnavailableError();
  const selected: StorageDriverName = configuredDriver;
  let s3Promise: Promise<{ client: S3Client; bucket: string; prefix: string }> | null = null;

  async function s3() {
    if (s3Promise) return s3Promise;
    s3Promise = (async () => {
      const endpoint = clean(env.ISVOI_COMMUNICATIONS_S3_ENDPOINT),
        region = clean(env.ISVOI_COMMUNICATIONS_S3_REGION) || "ru1",
        bucket = clean(env.ISVOI_COMMUNICATIONS_S3_BUCKET),
        prefix = cleanPrefix(env.ISVOI_COMMUNICATIONS_S3_PREFIX || "communications/objects"),
        accessFile = clean(env.ISVOI_COMMUNICATIONS_S3_ACCESS_KEY_FILE),
        secretFile = clean(env.ISVOI_COMMUNICATIONS_S3_SECRET_KEY_FILE);
      if (!endpoint.startsWith("https://") || !bucket || !accessFile || !secretFile)
        throw new StorageUnavailableError();
      const [accessKeyId, secretAccessKey] = await Promise.all([
        readFile(accessFile, "utf8"),
        readFile(secretFile, "utf8"),
      ]);
      if (!accessKeyId.trim() || !secretAccessKey.trim()) throw new StorageUnavailableError();
      return {
        bucket,
        prefix,
        client: new S3Client({
          endpoint,
          region,
          forcePathStyle: flag(env.ISVOI_COMMUNICATIONS_S3_FORCE_PATH_STYLE),
          credentials: {
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretAccessKey.trim(),
          },
        }),
      };
    })();
    return s3Promise;
  }
  function driver(row: StorageRecord): StorageDriverName {
    return row.storage_driver === "s3" ? "s3" : "local";
  }
  async function put(key: string, buffer: Buffer, mime: string): Promise<StoredObject> {
    if (!UUID.test(key)) throw new StorageUnavailableError();
    if (selected === "local") {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(localPath(root, key), buffer, { flag: "wx", mode: 0o600 });
      return { driver: "local", version: null, etag: null };
    }
    try {
      const target = await s3(),
        objectKey = posix.join(target.prefix, key),
        written = await target.client.send(
          new PutObjectCommand({
            Bucket: target.bucket,
            Key: objectKey,
            Body: buffer,
            ContentLength: buffer.length,
            ContentType: mime,
          }),
        ),
        head = await target.client.send(
          new HeadObjectCommand({ Bucket: target.bucket, Key: objectKey }),
        );
      if (Number(head.ContentLength) !== buffer.length) throw new StorageUnavailableError();
      return {
        driver: "s3",
        version: written.VersionId || head.VersionId || null,
        etag: written.ETag || head.ETag || null,
      };
    } catch (error) {
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError();
    }
  }
  async function getStream(row: StorageRecord, start?: number, end?: number): Promise<Readable> {
    if (!UUID.test(row.storage_key)) throw new StorageObjectMissingError();
    if (driver(row) === "local") {
      try {
        await stat(localPath(root, row.storage_key));
        return createReadStream(localPath(root, row.storage_key),
          start === undefined ? undefined : { start, end });
      } catch (error: any) {
        if (error?.code === "ENOENT") throw new StorageObjectMissingError();
        throw new StorageUnavailableError();
      }
    }
    try {
      const target = await s3(),
        response = await target.client.send(
          new GetObjectCommand({
            Bucket: target.bucket,
            Key: posix.join(target.prefix, row.storage_key),
            VersionId: row.storage_version || undefined,
            Range: start === undefined ? undefined : `bytes=${start}-${end ?? ""}`,
          }),
        ),
        body = response.Body as any;
      if (!body || typeof body.pipe !== "function") throw new StorageUnavailableError();
      return body as Readable;
    } catch (error) {
      if (isMissing(error)) throw new StorageObjectMissingError();
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError();
    }
  }
  async function getBuffer(row: StorageRecord) {
    try {
      return await boundedBody((await getStream(row)) as AsyncIterable<Uint8Array>);
    } catch (error) {
      if (
        error instanceof StorageObjectMissingError ||
        error instanceof StorageUnavailableError
      )
        throw error;
      throw new StorageUnavailableError();
    }
  }
  async function remove(row: StorageRecord) {
    if (!UUID.test(row.storage_key)) throw new StorageObjectMissingError();
    if (driver(row) === "local") {
      try {
        await unlink(localPath(root, row.storage_key));
      } catch (error: any) {
        if (error?.code !== "ENOENT") throw new StorageUnavailableError();
      }
      return;
    }
    try {
      const target = await s3();
      await target.client.send(
        new DeleteObjectCommand({
          Bucket: target.bucket,
          Key: posix.join(target.prefix, row.storage_key),
          VersionId: row.storage_version || undefined,
        }),
      );
    } catch {
      throw new StorageUnavailableError();
    }
  }
  return {
    selected,
    put,
    getStream,
    getBuffer,
    remove,
  };
}
