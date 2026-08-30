#!/usr/bin/env node

import { TRADE_PRICING_VERSION_V3, tradePricingConfigsV3 } from "./trade_pricing_v3_data.mjs";

export const TRADE_RELEASE_TARGET_COUNT = 17;
export const TRADE_RELEASE_TARGET_MODEL_COUNT = 8;

const round = (value, digits = 1) => Number(Number(value).toFixed(digits));

export function evaluateRealDeviceCandidate(candidate) {
  const config = tradePricingConfigsV3.find(
    (item) => item.modelSlug === candidate.model_slug && item.storage === candidate.storage,
  );
  if (!config)
    throw new Error(`Unsupported candidate ${candidate.model_slug} ${candidate.storage}`);

  const listingPrice = Number(candidate.listing_price);
  const purchasePrice = Number(candidate.purchase_price);
  if (!(listingPrice > 0) || !(purchasePrice > 0)) {
    throw new Error(`Candidate ${candidate.candidate_key} has invalid price evidence`);
  }

  const actualGrossMarginPct = ((listingPrice - purchasePrice) / listingPrice) * 100;
  const projectedGrossMarginPct = ((listingPrice - config.baseMax) / listingPrice) * 100;
  const identityOverrideAccepted =
    ["unmatched", "not_applicable"].includes(candidate.identity_status) &&
    ["verified", "not_required"].includes(candidate.authenticity_status) &&
    candidate.eligibility_status === "eligible" &&
    candidate.review_override === true &&
    candidate.review_note_present === true &&
    !String(candidate.block_reason ?? "").trim();
  const identityReady = candidate.identity_status === "matched" || identityOverrideAccepted;
  const releaseReady =
    candidate.product_status === "published" &&
    candidate.content_status === "ready" &&
    candidate.stock_status !== "hidden" &&
    Number(candidate.quantity) > 0 &&
    candidate.offer_ready === true &&
    candidate.eligibility_status === "eligible" &&
    identityReady &&
    Boolean(candidate.diagnostics_complete);

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
    identity_override_accepted: identityOverrideAccepted,
    identity_ready: identityReady,
    release_ready: releaseReady,
  };
}

export function mergeTradeDeskAcceptance(candidates, existing = {}) {
  const existingByKey = new Map(
    Array.isArray(existing.candidates)
      ? existing.candidates.map((candidate) => [candidate.candidate_key, candidate])
      : [],
  );

  return {
    schema_version: 2,
    pricing_version: TRADE_PRICING_VERSION_V3,
    target_candidate_count: TRADE_RELEASE_TARGET_COUNT,
    target_model_count: TRADE_RELEASE_TARGET_MODEL_COUNT,
    required_gross_headroom_pct: 25,
    cost_policy: {
      status: existing.cost_policy?.status ?? "proposed",
      preparation_cost_rub: existing.cost_policy?.preparation_cost_rub ?? 1_500,
      warranty_reserve_pct: existing.cost_policy?.warranty_reserve_pct ?? 3,
      warranty_reserve_min_rub: existing.cost_policy?.warranty_reserve_min_rub ?? 1_500,
      markdown_reserve_pct: existing.cost_policy?.markdown_reserve_pct ?? 5,
      sales_cost_pct: existing.cost_policy?.sales_cost_pct ?? 2,
      operations_cost_rub: existing.cost_policy?.operations_cost_rub ?? 1_000,
      tax_reserve_pct: existing.cost_policy?.tax_reserve_pct ?? 6,
      tax_regime: existing.cost_policy?.tax_regime ?? "usn_income",
      vat_mode: existing.cost_policy?.vat_mode ?? "without_vat",
      primary_document_mode: existing.cost_policy?.primary_document_mode ?? "external_print",
      kkt_mode: existing.cost_policy?.kkt_mode ?? "external_terminal",
      minimum_contribution_margin_pct:
        existing.cost_policy?.minimum_contribution_margin_pct ??
        existing.minimum_net_margin_pct ??
        15,
      target_contribution_margin_pct: existing.cost_policy?.target_contribution_margin_pct ?? 18,
      tax_treatment_confirmed: existing.cost_policy?.tax_treatment_confirmed ?? false,
      approved_by: existing.cost_policy?.approved_by ?? "",
      approved_at: existing.cost_policy?.approved_at ?? null,
      notes:
        existing.cost_policy?.notes ??
        "УСН «Доходы» 6%, без НДС. Договор и кассовые чеки оформляются вне ISVOI.",
    },
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

export function applyConfirmedTradeDeskApproval(acceptance, approvedAt = new Date().toISOString()) {
  const policy = {
    ...acceptance.cost_policy,
    status: "approved",
    tax_treatment_confirmed: true,
    approved_by: "Владелец проекта ISVOI",
    approved_at: approvedAt,
    notes:
      "Подтверждено владельцем проекта: УСН «Доходы» 6%, без НДС; подготовка 1 500 ₽; гарантийный резерв 3%, минимум 1 500 ₽; markdown 5%; продажи 2%; операции 1 000 ₽; минимальная contribution margin 15%. Договор и кассовые чеки оформляются вне ISVOI.",
  };
  const warrantyFor = (listingPrice) =>
    Math.round(
      Math.max(
        Number(policy.warranty_reserve_min_rub),
        Number(listingPrice) * (Number(policy.warranty_reserve_pct) / 100),
      ),
    );

  return {
    ...acceptance,
    cost_policy: policy,
    approval: {
      status: "approved",
      approved_by: "Владелец проекта ISVOI / Trade Desk",
      approved_at: approvedAt,
      notes:
        "Одобрены верхние границы draft v3 по всем 17 публичным устройствам. Каждый контрольный кейс рассчитан по quote max и должен сохранять contribution margin не ниже 15%.",
    },
    candidates: acceptance.candidates.map((candidate) => ({
      ...candidate,
      validated_offer_rub: candidate.quote_max,
      preparation_cost_rub: Number(policy.preparation_cost_rub),
      warranty_reserve_rub: warrantyFor(candidate.listing_price),
      trade_desk_status: "approved",
      trade_desk_note:
        "Одобрено для draft v3 по верхней границе quote; публичная карточка release-ready или имеет документированный operator override.",
    })),
  };
}

function validNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function calculateContributionMargin(candidate, offer, policy) {
  const listingPrice = Number(candidate.listing_price);
  const validatedOffer = Number(offer);
  const preparation = validNonNegative(policy?.preparation_cost_rub);
  const warrantyPct = validNonNegative(policy?.warranty_reserve_pct);
  const warrantyMinimum = validNonNegative(policy?.warranty_reserve_min_rub);
  const markdownPct = validNonNegative(policy?.markdown_reserve_pct);
  const salesPct = validNonNegative(policy?.sales_cost_pct);
  const operations = validNonNegative(policy?.operations_cost_rub);
  const taxPct = validNonNegative(policy?.tax_reserve_pct);
  if (
    !(listingPrice > 0) ||
    !(validatedOffer > 0) ||
    [preparation, warrantyPct, warrantyMinimum, markdownPct, salesPct, operations, taxPct].some(
      (value) => value == null,
    )
  ) {
    return null;
  }

  const warrantyReserve = Math.max(warrantyMinimum, listingPrice * (warrantyPct / 100));
  const markdownReserve = listingPrice * (markdownPct / 100);
  const salesCost = listingPrice * (salesPct / 100);
  const taxReserve = listingPrice * (taxPct / 100);
  const contributionProfit =
    listingPrice -
    validatedOffer -
    preparation -
    warrantyReserve -
    markdownReserve -
    salesCost -
    operations -
    taxReserve;

  return {
    preparation_cost_rub: round(preparation, 0),
    warranty_reserve_rub: round(warrantyReserve, 0),
    markdown_reserve_rub: round(markdownReserve, 0),
    sales_cost_rub: round(salesCost, 0),
    operations_cost_rub: round(operations, 0),
    tax_reserve_rub: round(taxReserve, 0),
    contribution_profit_rub: round(contributionProfit, 0),
    contribution_margin_pct: round((contributionProfit / listingPrice) * 100),
  };
}

export function evaluateTradeDeskGate(acceptance) {
  const candidates = acceptance.candidates ?? [];
  const policy = acceptance.cost_policy ?? {};
  const minimumContributionMarginPct = Number(policy.minimum_contribution_margin_pct);
  const targetContributionMarginPct = Number(policy.target_contribution_margin_pct);
  const validMinimumContributionMargin =
    Number.isFinite(minimumContributionMarginPct) && minimumContributionMarginPct > 0;
  const validTargetContributionMargin =
    Number.isFinite(targetContributionMarginPct) &&
    targetContributionMarginPct >= minimumContributionMarginPct;
  const costPolicyApproved =
    policy.status === "approved" &&
    String(policy.approved_by ?? "").trim().length > 0 &&
    Boolean(policy.approved_at) &&
    policy.tax_treatment_confirmed === true;

  let diagnosticsReady = 0;
  let identityReady = 0;
  let releaseReady = 0;
  let grossHeadroomReady = 0;
  let costInputsReady = 0;
  let approvedCandidates = 0;
  let netMarginReady = 0;

  const evaluatedCandidates = candidates.map((candidate) => {
    if (candidate.diagnostics_complete) diagnosticsReady += 1;
    if (candidate.identity_ready) identityReady += 1;
    if (candidate.release_ready) releaseReady += 1;
    if (candidate.gross_headroom_pass) grossHeadroomReady += 1;

    const offer = Number(candidate.validated_offer_rub);
    const preparation = Number(candidate.preparation_cost_rub);
    const warranty = Number(candidate.warranty_reserve_rub);
    const hasCostInputs =
      Number.isFinite(offer) &&
      offer > 0 &&
      Number.isFinite(preparation) &&
      preparation >= 0 &&
      Number.isFinite(warranty) &&
      warranty >= 0;
    if (hasCostInputs) costInputsReady += 1;

    const contribution = calculateContributionMargin(
      candidate,
      offer,
      hasCostInputs
        ? {
            ...policy,
            preparation_cost_rub: preparation,
            warranty_reserve_pct: 0,
            warranty_reserve_min_rub: warranty,
          }
        : policy,
    );
    const contributionMarginPass =
      hasCostInputs &&
      validMinimumContributionMargin &&
      candidate.release_ready === true &&
      offer === candidate.quote_max &&
      contribution != null &&
      contribution.contribution_margin_pct >= minimumContributionMarginPct;
    if (contributionMarginPass) netMarginReady += 1;
    if (candidate.trade_desk_status === "approved") approvedCandidates += 1;

    const policyScenario = calculateContributionMargin(candidate, candidate.quote_max, policy);

    return {
      ...candidate,
      projected_contribution_margin_pct: contribution?.contribution_margin_pct ?? null,
      contribution_margin_pass: contributionMarginPass,
      policy_scenario_at_quote_max: policyScenario,
    };
  });

  const approvalComplete =
    acceptance.approval?.status === "approved" &&
    String(acceptance.approval?.approved_by ?? "").trim().length > 0 &&
    Boolean(acceptance.approval?.approved_at);

  const target = Number(acceptance.target_candidate_count ?? TRADE_RELEASE_TARGET_COUNT);
  const targetModels = Number(acceptance.target_model_count ?? TRADE_RELEASE_TARGET_MODEL_COUNT);
  const modelCount = new Set(candidates.map((candidate) => candidate.model_slug)).size;
  const passed =
    candidates.length === target &&
    modelCount === targetModels &&
    diagnosticsReady === target &&
    identityReady === target &&
    releaseReady === target &&
    grossHeadroomReady === target &&
    costInputsReady === target &&
    approvedCandidates === target &&
    netMarginReady === target &&
    approvalComplete &&
    costPolicyApproved &&
    validTargetContributionMargin;

  return {
    passed,
    target,
    candidate_count: candidates.length,
    target_model_count: targetModels,
    model_count: modelCount,
    diagnostics_ready: diagnosticsReady,
    identity_ready: identityReady,
    release_ready: releaseReady,
    gross_headroom_ready: grossHeadroomReady,
    cost_inputs_ready: costInputsReady,
    approved_candidates: approvedCandidates,
    contribution_margin_ready: netMarginReady,
    minimum_contribution_margin_defined: validMinimumContributionMargin,
    target_contribution_margin_defined: validTargetContributionMargin,
    cost_policy_approved: costPolicyApproved,
    approval_complete: approvalComplete,
    candidates: evaluatedCandidates,
  };
}
