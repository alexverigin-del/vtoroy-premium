import assert from "node:assert/strict";
import { selectRetention } from "./prune_directus_backups.mjs";

const entry = (name) => ({ name });
const now = new Date("2026-09-14T18:00:00Z");
const result = selectRetention(
  [
    entry("20260914T020000Z"),
    entry("20260913T020000Z"),
    entry("20260908T010000Z"),
    entry("20260908T220000Z"),
    entry("20260901T010000Z"),
    entry("20260901T220000Z"),
    entry("20260801T010000Z"),
    entry("20260802T220000Z"),
    entry("20260601T010000Z"),
    entry("20260625T220000Z"),
    entry("20250501T010000Z"),
    entry("manual-keep"),
  ],
  now,
);

assert.deepEqual(result.keep, [
  "20260601T010000Z",
  "20260625T220000Z",
  "20260802T220000Z",
  "20260901T220000Z",
  "20260908T010000Z",
  "20260908T220000Z",
  "20260913T020000Z",
  "20260914T020000Z",
  "manual-keep",
]);
assert.deepEqual(result.remove, [
  "20250501T010000Z",
  "20260801T010000Z",
  "20260901T010000Z",
]);

console.log("PASS Directus backup retention: recent, daily, weekly and monthly tiers with unknown-name preservation.");
