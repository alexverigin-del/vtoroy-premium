#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mergeSectionEditorContent } from "../apps/web/lib/section-editor-content.ts";
import { effectiveSectionContentSql, sectionAuditViewSql } from "./lib/studio-section-content.mjs";

const legacy = {
  note: "Ручное примечание",
  disclaimer: "Условия",
  steps: [{ title: "Первый", text: "Текст", note: "Уточнение" }],
  proof: ["Цена", "Состояние"],
  form: { consent_version: "unchanged" },
};
assert.deepEqual(mergeSectionEditorContent({}, legacy), legacy);
assert.deepEqual(
  mergeSectionEditorContent({ editor_steps: null, editor_proof: null }, legacy),
  legacy,
);
const migrated = {
  editor_note: legacy.note,
  editor_disclaimer: legacy.disclaimer,
  editor_steps: legacy.steps,
  editor_proof: legacy.proof.map((text) => ({ text })),
};
assert.deepEqual(mergeSectionEditorContent(migrated, legacy), legacy);
const empty = mergeSectionEditorContent(
  { editor_note: "", editor_disclaimer: "", editor_steps: [], editor_proof: [] },
  legacy,
);
assert.equal(empty.note, "");
assert.equal(empty.disclaimer, "");
assert.deepEqual(empty.steps, []);
assert.deepEqual(empty.proof, []);
assert.deepEqual(empty.form, legacy.form);
assert.equal(legacy.proof.length, 2);
assert.deepEqual(mergeSectionEditorContent({ editor_proof: "invalid" }, legacy).proof, []);
assert.deepEqual(
  mergeSectionEditorContent({ editor_steps: [null, { title: 1, text: "x" }] }, legacy).steps,
  [],
);
assert.throws(() => effectiveSectionContentSql("s;DROP TABLE x"));
assert.match(sectionAuditViewSql, /CREATE TEMP TABLE/);
assert.doesNotMatch(sectionAuditViewSql, /jsonb_populate_record/);
const blocked = spawnSync(process.execPath, ["scripts/rehearse_directus_studio_ux.mjs"], {
  encoding: "utf8",
  env: { ...process.env, DIRECTUS_AUDIT_SSH_TARGET: "deploy@217.114.14.32" },
});
assert.equal(blocked.status, 1);
assert.match(blocked.stderr, /staging host/);

for (const script of [
  "setup_directus_studio_workspace_sql.mjs",
  "setup_directus_studio_content_sql.mjs",
  "audit_directus_studio_workspace_sql.mjs",
  "audit_directus_studio_content_sql.mjs",
  "audit_directus_trade_page_sql.mjs",
  "audit_directus_insights_sql.mjs",
]) {
  const result = spawnSync(process.execPath, [`scripts/${script}`, "--rehearse"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length > 1000);
  if (script.startsWith("setup")) assert.match(result.stdout, /ROLLBACK;\s*$/);
  if (script.includes("workspace") && script.startsWith("setup")) {
    assert.doesNotMatch(
      result.stdout,
      /UPDATE (?:page_sections|site_pages|products|leads|directus_permissions|directus_policies)\s/i,
    );
    assert.match(result.stdout, /"user" IS NULL/);
  }
  if (script.includes("content") && script.startsWith("setup")) {
    assert.match(result.stdout, /IF NOT EXISTS\(SELECT 1 FROM information_schema.columns/);
    assert.match(result.stdout, /BEFORE UPDATE OF editor_proof/);
    assert.match(result.stdout, /isvoi_normalize_editor_clear\('editor_proof','\[\]'\)/);
  }
}
const tradeAudit = fs.readFileSync("scripts/audit_directus_trade_page_sql.mjs", "utf8");
assert.doesNotMatch(tradeAudit, /marketing-pages\.json|expectedCopyRows|copy_mismatch/);
assert.match(tradeAudit, /\/privacy#trade-in-consent/);
console.log(
  "Studio UX: content equivalence, explicit deletion, malformed values, SQL generation and legal guard tests passed.",
);
