#!/usr/bin/env node

import { tradePricingConfigsV2 } from "./trade_pricing_v2_data.mjs";

const round = (value, digits = 1) => Number(Number(value).toFixed(digits));

export function evaluateRealDeviceCandidate(candidate) {
  const config = tradePricingConfigsV2.find(
    (item) => item.modelSlug === candidate.model_slug && item.storage === candidate.storage,
  );
  if (!config) throw new Error(`Unsupported candidate ${candidate.model_slug} ${candidate.storage}`);

  const listingPrice = Number(candidate.listing_price);
  const purchasePrice = Number(candidate.purchase_price);
  if (!(listingPrice > 0) || !(purchasePrice > 0)) {
    throw new Error(`Candidate ${candidate.candidate_key} has invalid price evidence`);
  }

  const actualGrossMarginPct = ((listingPrice - purchasePrice) / listingPrice) * 100;
  const projectedGrossMarginPct = ((listingPrice - config.baseMax) / listingPrice) * 100;

  return {
    ...candidate,
    listing_price: listingPrice,
    historical_purchase_price: purchasePrice,
    quote_min: config.baseMin,
    quote_max: config.baseMax,
    actual_gross_profit: round(listingPrice - purchasePrice, 0),
    actual_gross_margin_pct: round(actualGrossMarginPct),
    projected_gross_profit_at_quote_max: round(listingPrice - config.baseMax, 0),
    projected_gross_margin_pct: round(projectedGrossMarginPct),
    gross_headroom_pass: projectedGrossMarginPct >= 25,
    diagnostics_complete: Boolean(candidate.diagnostics_complete),
  };
}

export function mergeTradeDeskAcceptance(candidates, existing = {}) {
  const existingByKey = new Map(
    Array.isArray(existing.candidates)
      ? existing.candidates.map((candidate) => [candidate.candidate_key, candidate])
      : [],
  );

  return {
    schema_version: 1,
    pricing_version: "trade-pricing-v2-draft",
    target_candidate_count: 10,
    required_gross_headroom_pct: 25,
    minimum_net_margin_pct: existing.minimum_net_margin_pct ?? null,
    approval: {
      status: existing.approval?.status ?? "pending",
      approved_by: existing.approval?.approved_by ?? "",
      approved_at: existing.approval?.approved_at ?? null,
      notes: existing.approval?.notes ?? "",
    },
    candidates: candidates.map((candidate) => {
      const previous = existingByKey.get(candidate.candidate_key) ?? {};
      return {
        ...candidate,
        validated_offer_rub: previous.validated_offer_rub ?? null,
        preparation_cost_rub: previous.preparation_cost_rub ?? null,
        warranty_reserve_rub: previous.warranty_reserve_rub ?? null,
        trade_desk_status: previous.trade_desk_status ?? "pending",
        trade_desk_note: previous.trade_desk_note ?? "",
      };
    }),
  };
}

export function evaluateTradeDeskGate(acceptance) {
  const candidates = acceptance.candidates ?? [];
  const minimumNetMarginPct = Number(acceptance.minimum_net_margin_pct);
  const validMinimumNetMargin = Number.isFinite(minimumNetMarginPct) && minimumNetMarginPct > 0;

  let diagnosticsReady = 0;
  let grossHeadroomReady = 0;
  let costInputsReady = 0;
  let approvedCandidates = 0;
  let netMarginReady = 0;

  const evaluatedCandidates = candidates.map((candidate) => {
    if (candidate.diagnostics_complete) diagnosticsReady += 1;
    if (candidate.gross_headroom_pass) grossHeadroomReady += 1;

    const offer = Number(candidate.validated_offer_rub);
    const preparation = Number(candidate.preparation_cost_rub);
    const warranty = Number(candidate.warranty_reserve_rub);
    const hasCostInputs =
      Number.isFinite(offer) && offer > 0 &&
      Number.isFinite(preparation) && preparation >= 0 &&
      Number.isFinite(warranty) && warranty >= 0;
    if (hasCostInputs) costInputsReady += 1;

    const netMarginPct = hasCostInputs
      ? ((candidate.listing_price - offer - preparation - warranty) / candidate.listing_price) * 100
      : null;
    const netMarginPass =
      hasCostInputs &&
      validMinimumNetMargin &&
      offer <= candidate.quote_max &&
      netMarginPct >= minimumNetMarginPct;
    if (netMarginPass) netMarginReady += 1;
    if (candidate.trade_desk_status === "approved") approvedCandidates += 1;

    return {
      ...candidate,
      projected_net_margin_pct: netMarginPct == null ? null : round(netMarginPct),
      net_margin_pass: netMarginPass,
    };
  });

  const approvalComplete =
    acceptance.approval?.status === "approved" &&
    String(acceptance.approval?.approved_by ?? "").trim().length > 0 &&
    Boolean(acceptance.approval?.approved_at);

  const target = Number(acceptance.target_candidate_count ?? 10);
  const passed =
    candidates.length === target &&
    diagnosticsReady === target &&
    grossHeadroomReady === target &&
    costInputsReady === target &&
    approvedCandidates === target &&
    netMarginReady === target &&
    approvalComplete;

  return {
    passed,
    target,
    candidate_count: candidates.length,
    diagnostics_ready: diagnosticsReady,
    gross_headroom_ready: grossHeadroomReady,
    cost_inputs_ready: costInputsReady,
    approved_candidates: approvedCandidates,
    net_margin_ready: netMarginReady,
    minimum_net_margin_defined: validMinimumNetMargin,
    approval_complete: approvalComplete,
    candidates: evaluatedCandidates,
  };
}
