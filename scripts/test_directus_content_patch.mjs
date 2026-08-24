#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  applyPatchToRow,
  assertLockMatches,
  buildDiff,
  buildUpdateSql,
  captureLock,
  contentValuesEqual,
  validatePatch,
} from "./lib/directus-content-patch.mjs";

const row = {
  id: "section-1",
  section_key: "final_cta",
  headline: "До",
  content: { closing: { title: "Старый заголовок", note: "Сохранить" }, untouched: true },
  date_updated: "2026-08-22T12:00:00.000Z",
};
const schema = {
  id: { dataType: "uuid" },
  section_key: { dataType: "character varying" },
  headline: { dataType: "text" },
  content: { dataType: "json" },
  date_updated: { dataType: "timestamp with time zone" },
};
const patch = {
  version: 1,
  id: "2026-08-22-final-cta-copy",
  description: "Точечное обновление завершающего блока главной",
  collection: "page_sections",
  selector: { id: "section-1" },
  changes: {
    headline: "После",
    "content.closing.title": "Новый заголовок",
  },
  remove: ["content.closing.note"],
  revalidate: "site-content",
};

validatePatch(patch);
const hash = "a".repeat(64);
const prepared = captureLock(patch, row, hash);
validatePatch(prepared, { requireLock: true });
assert.equal(prepared.lock.snapshotHash, hash);
assert.equal(prepared.lock.versionField, "date_updated");
assertLockMatches(prepared, row, hash);

const { desired, touchedRoots } = applyPatchToRow(row, prepared, schema);
assert.equal(desired.headline, "После");
assert.equal(desired.content.closing.title, "Новый заголовок");
assert.equal(desired.content.closing.note, undefined);
assert.equal(desired.content.untouched, true);
assert.deepEqual(touchedRoots, ["content", "headline"]);
assert.equal(buildDiff(row, desired, prepared).length, 3);
assert.equal(
  contentValuesEqual(
    { items: [{ title: "Passport", text: "Факт" }], note: "Сохранить" },
    { note: "Сохранить", items: [{ text: "Факт", title: "Passport" }] },
  ),
  true,
);

const sql = buildUpdateSql({
  patch: prepared,
  desired,
  touchedRoots,
  currentHash: hash,
  commit: false,
});
assert.match(sql, /ROLLBACK;/u);
assert.match(sql, /optimistic lock failed/u);
assert.match(sql, /content_patch\.rehearsal\|ok/u);
assert.doesNotMatch(sql, /COMMIT;/u);

assert.throws(
  () => validatePatch({ ...patch, collection: "leads" }),
  /outside the content-patch ownership boundary/u,
);
assert.throws(
  () => validatePatch({ ...patch, changes: { updated_at: "now" }, remove: [] }),
  /immutable/u,
);
assert.throws(
  () => assertLockMatches({ ...prepared, lock: { snapshotHash: "0".repeat(64) } }, row, hash),
  /Snapshot changed/u,
);

console.log("Directus content patch tests passed.");
