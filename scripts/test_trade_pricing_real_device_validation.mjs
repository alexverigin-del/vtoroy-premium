#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  calculateContributionMargin,
  evaluateRealDeviceCandidate,
  evaluateTradeDeskGate,
  mergeTradeDeskAcceptance,
  applyConfirmedTradeDeskApproval,
} from "./trade_pricing_real_device_validation.mjs";

const baseCandidate = {
  candidate_key: "fixture-1",
  candidate_source: "normalized_product",
  model_slug: "iphone-14-pro-max",
  storage: "256 ГБ",
  grade: "A",
  battery_text: "Аккумулятор 100%",
  diagnostics_complete: true,
  product_status: "published",
  content_status: "ready",
  stock_status: "available",
  quantity: 1,
  offer_ready: true,
  eligibility_status: "eligible",
  identity_status: "matched",
  authenticity_status: "verified",
  review_override: false,
  review_note_present: false,
  block_reason: "",
  listing_price: 51_599,
  purchase_price: 43_600,
};
const evaluated = evaluateRealDeviceCandidate(baseCandidate);
assert.equal(evaluated.quote_min, 25_500);
assert.equal(evaluated.quote_max, 28_500);
assert.equal(evaluated.actual_gross_margin_pct, 15.5);
assert.equal(evaluated.projected_gross_margin_pct, 44.8);
assert.equal(evaluated.gross_headroom_pass, true);
assert.equal(evaluated.release_ready, true);

const models = [
  "iphone-13-pro",
  "iphone-14-pro",
  "iphone-14-pro-max",
  "iphone-15-pro",
  "iphone-16-pro",
  "iphone-16-pro-max",
  "samsung-galaxy-s22-ultra",
  "samsung-galaxy-s23-ultra",
];
const seventeen = Array.from({ length: 17 }, (_, index) => ({
  ...evaluated,
  candidate_key: `fixture-${index + 1}`,
  model_slug: models[index % models.length],
}));
const pending = mergeTradeDeskAcceptance(seventeen);
const blocked = evaluateTradeDeskGate(pending);
assert.equal(blocked.passed, false);
assert.equal(blocked.diagnostics_ready, 17);
assert.equal(blocked.identity_ready, 17);
assert.equal(blocked.release_ready, 17);
assert.equal(blocked.gross_headroom_ready, 17);
assert.equal(blocked.cost_inputs_ready, 0);
assert.equal(blocked.cost_policy_approved, false);
assert.equal(blocked.candidates[0].policy_scenario_at_quote_max.contribution_margin_pct, 23.9);

const approved = applyConfirmedTradeDeskApproval(pending, "2026-08-30T12:00:00+03:00");
const passed = evaluateTradeDeskGate(approved);
assert.equal(passed.passed, true);
assert.equal(passed.contribution_margin_ready, 17);
assert.equal(passed.approved_candidates, 17);
assert.equal(passed.model_count, 8);

const margin = calculateContributionMargin(evaluated, evaluated.quote_max, approved.cost_policy);
assert.deepEqual(margin, {
  preparation_cost_rub: 1_500,
  warranty_reserve_rub: 1_548,
  markdown_reserve_rub: 2_580,
  sales_cost_rub: 1_032,
  operations_cost_rub: 1_000,
  tax_reserve_rub: 3_096,
  contribution_profit_rub: 12_343,
  contribution_margin_pct: 23.9,
});

const acceptedOverride = evaluateRealDeviceCandidate({
  ...baseCandidate,
  candidate_key: "white-titanium",
  identity_status: "unmatched",
  review_override: true,
  review_note_present: true,
});
assert.equal(acceptedOverride.identity_override_accepted, true);
assert.equal(acceptedOverride.release_ready, true);

const rejectedOverride = evaluateRealDeviceCandidate({
  ...baseCandidate,
  candidate_key: "missing-review-note",
  identity_status: "unmatched",
  review_override: true,
  review_note_present: false,
});
assert.equal(rejectedOverride.release_ready, false);

const rejectedDraft = evaluateRealDeviceCandidate({
  ...baseCandidate,
  candidate_key: "draft-card",
  product_status: "draft",
});
assert.equal(rejectedDraft.release_ready, false);

process.stdout.write("trade pricing real-device validation tests: ok\n");
