import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  createAttachmentStorage,
  StorageObjectMissingError,
} from "../packages/communications/dist/index.js";

if (!process.argv.includes("--confirm-live-s3")) {
  console.error("Refusing to write a live S3 test object without --confirm-live-s3");
  process.exit(2);
}

const storage = createAttachmentStorage(process.env);
assert.equal(storage.selected, "s3", "live smoke requires the s3 driver");

const key = randomUUID();
const source = randomBytes(64 * 1024);
let stored;
try {
  stored = await storage.put(key, source, "application/octet-stream");
  const record = {
    storage_driver: stored.driver,
    storage_version: stored.version,
    storage_key: key,
    size: source.length,
  };
  const restored = await storage.getBuffer(record);
  assert.equal(
    createHash("sha256").update(restored).digest("hex"),
    createHash("sha256").update(source).digest("hex"),
  );
  const chunks = [];
  for await (const chunk of await storage.getStream(record, 4096, 8191))
    chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), source.subarray(4096, 8192));
  await storage.remove(record);
  await assert.rejects(storage.getStream(record), StorageObjectMissingError);
  stored = undefined;
  console.log(
    JSON.stringify({
      status: "COMMUNICATIONS_S3_ADAPTER_READY",
      bytes: source.length,
      range_bytes: 4096,
    }),
  );
} finally {
  if (stored)
    await storage
      .remove({
        storage_driver: stored.driver,
        storage_version: stored.version,
        storage_key: key,
      })
      .catch(() => undefined);
}
