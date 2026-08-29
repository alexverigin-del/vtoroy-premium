#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  evaluateRealDeviceCandidate,
  evaluateTradeDeskGate,
  mergeTradeDeskAcceptance,
} from "./trade_pricing_real_device_validation.mjs";

const baseCandidate = {
  candidate_key: "fixture-1",
  candidate_source: "normalized_product",
  model_slug: "iphone-14-pro-max",
  storage: "256 ГБ",
  grade: "A",
  battery_text: "Аккумулятор 100%",
  diagnostics_complete: true,
  listing_price: 51_599,
  purchase_price: 43_600,
};
const evaluated = evaluateRealDeviceCandidate(baseCandidate);
assert.equal(evaluated.quote_min, 25_500);
assert.equal(evaluated.quote_max, 28_500);
assert.equal(evaluated.actual_gross_margin_pct, 15.5);
assert.equal(evaluated.projected_gross_margin_pct, 44.8);
assert.equal(evaluated.gross_headroom_pass, true);

const ten = Array.from({ length: 10 }, (_, index) => ({
  ...evaluated,
  candidate_key: `fixture-${index + 1}`,
}));
const pending = mergeTradeDeskAcceptance(ten);
const blocked = evaluateTradeDeskGate(pending);
assert.equal(blocked.passed, false);
assert.equal(blocked.diagnostics_ready, 10);
assert.equal(blocked.gross_headroom_ready, 10);
assert.equal(blocked.cost_inputs_ready, 0);

pending.minimum_net_margin_pct = 20;
pending.approval = {
  status: "approved",
  approved_by: "Trade Desk fixture",
  approved_at: "2026-08-29T20:00:00+03:00",
  notes: "fixture",
};
pending.candidates = pending.candidates.map((candidate) => ({
  ...candidate,
  validated_offer_rub: candidate.quote_max,
  preparation_cost_rub: 1_000,
  warranty_reserve_rub: 1_000,
  trade_desk_status: "approved",
}));
const passed = evaluateTradeDeskGate(pending);
assert.equal(passed.passed, true);
assert.equal(passed.net_margin_ready, 10);
assert.equal(passed.approved_candidates, 10);

process.stdout.write("trade pricing real-device validation tests: ok\n");
