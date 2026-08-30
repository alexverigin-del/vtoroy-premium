#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const route = read("apps/web/app/lead-intake/route.ts");
const finalCta = read("apps/web/components/FinalCtaSection.tsx");
const wizard = read("apps/web/components/TradeInWizard.tsx");
const tradeServer = read("apps/web/lib/trade-server.ts");
const governance = read("scripts/setup_directus_trade_governance_sql.mjs");
const legalContent = read("scripts/setup_directus_trade_legal_content_sql.mjs");
const envExample = read("apps/web/.env.example");

for (const field of [
  "trade_consent_version",
  "trade_consent_at",
  "trade_consent_text_snapshot",
  "trade_consent_text_hash",
  "trade_consent_source_path",
]) {
  assert(route.includes(field), `lead route must persist ${field}`);
  assert(governance.includes(field), `Directus migration must create ${field}`);
}

assert(route.includes('error: "lead_storage_unavailable"'), "storage failure must be retryable");
assert(!route.includes("appendLeadLog"), "lead route must not write a local PII fallback log");
assert(!envExample.includes("LEADS_LOG_PATH"), "fallback PII log setting must be retired");
assert(tradeServer.includes('createHash("sha256")'), "consent snapshot must have SHA-256 evidence");

const postHandler = route.indexOf("export async function POST");
const consentGuard = route.indexOf("if (!accepted(body.trade_consent_accepted))", postHandler);
const idempotencyReplay = route.indexOf(
  "const existingReference = await existingTradeReference(idempotencyKey, isTest)",
  postHandler,
);
assert(consentGuard >= 0, "Trade-in consent guard must exist in POST");
assert(
  idempotencyReplay > consentGuard,
  "Trade-in consent must be validated before idempotency replay",
);

for (const component of [finalCta, wizard]) {
  assert(component.includes('type="checkbox"'), "both Trade-in forms must use a checkbox");
  assert(component.includes("trade_consent_accepted"), "both Trade-in forms must submit consent");
  assert(
    component.includes("trade_consent_version"),
    "both Trade-in forms must submit the version",
  );
}

const approvedVersion = "trade-consent-v1-2026-08-30";
assert(
  finalCta.includes(approvedVersion),
  "legacy Trade form must use the approved consent version",
);
assert(legalContent.includes(approvedVersion), "Directus legal content must use the same version");
assert(legalContent.includes("/privacy#trade-in-consent"), "consent must link to its own section");
assert(legalContent.includes("'published'"), "privacy page must be published");

console.log("Trade-in consent contract passed");
