import type { TradeAnswers, TradePublicConfig, TradeQuote, TradeScenario } from "@vtoroy/shared";

export type TradeStep =
  | "device"
  | "manual"
  | "condition"
  | "safety"
  | "quote"
  | "expired"
  | "scenario"
  | "exchange"
  | "exchange-empty"
  | "contact"
  | "submitted";

export type TradeWizardSnapshot = {
  runId: string;
  step: TradeStep;
  deviceModelId: string;
  configurationId: string;
  answers: TradeAnswers;
  quote?: TradeQuote;
  quoteInputKey?: string;
  scenario?: TradeScenario;
};

export function tradeInputKey(model: string, configuration: string, answers: TradeAnswers): string {
  return JSON.stringify([
    model,
    configuration,
    Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

export function tradeQuoteExpired(quote: TradeQuote, now = Date.now()): boolean {
  return (
    quote.status !== "active" ||
    !Number.isFinite(Date.parse(quote.validUntil)) ||
    Date.parse(quote.validUntil) <= now
  );
}

export function tradeBackStep(step: TradeStep, scenario?: TradeScenario): TradeStep {
  switch (step) {
    case "manual":
    case "condition":
      return "device";
    case "quote":
    case "safety":
    case "expired":
      return "condition";
    case "scenario":
      return "quote";
    case "exchange":
    case "exchange-empty":
      return "scenario";
    case "contact":
      return scenario === "exchange"
        ? "exchange"
        : scenario === "stock_notification"
          ? "exchange-empty"
          : "scenario";
    default:
      return "device";
  }
}

// History is only a navigation hint. It must never resurrect invalid or completed data.
export function resolveTradeStep(
  requested: unknown,
  state: TradeWizardSnapshot,
  config: TradePublicConfig,
  hasOffer = false,
): TradeStep {
  if (state.step === "submitted") return "submitted";
  if (requested === "device" || requested === "manual") return requested;
  if (
    !config.devices.some(
      (d) => d.id === state.configurationId && d.deviceModelId === state.deviceModelId,
    )
  )
    return "device";
  if (requested === "condition") return "condition";
  if (!config.questions.every((q) => q.options.some((o) => o.value === state.answers[q.key])))
    return "condition";
  if (requested === "safety")
    return state.quoteInputKey ===
      tradeInputKey(state.deviceModelId, state.configurationId, state.answers)
      ? "safety"
      : "condition";
  if (
    !state.quote ||
    state.quoteInputKey !== tradeInputKey(state.deviceModelId, state.configurationId, state.answers)
  )
    return "condition";
  if (tradeQuoteExpired(state.quote)) return "expired";
  if (requested === "quote" || requested === "expired") return "quote";
  if (requested === "scenario" || requested === "exchange-empty") return requested;
  if (requested === "exchange") return state.scenario === "exchange" ? "exchange" : "scenario";
  if (requested === "contact") {
    if (!state.scenario || state.scenario === "manual_evaluation") return "scenario";
    return state.scenario === "exchange" && !hasOffer ? "exchange" : "contact";
  }
  return "device";
}

export function restoreTradeState(
  value: unknown,
  config: TradePublicConfig,
  newRunId: string,
): TradeWizardSnapshot {
  const fresh: TradeWizardSnapshot = {
    runId: newRunId,
    step: "device",
    deviceModelId: "",
    configurationId: "",
    answers: {},
  };
  if (!value || typeof value !== "object") return fresh;
  const saved = value as Partial<TradeWizardSnapshot>;
  // Legacy snapshots have no input fingerprint; retain answers, never their quote.
  if (saved.step === "submitted") return fresh;
  const deviceModelId = config.devices.some((d) => d.deviceModelId === saved.deviceModelId)
    ? saved.deviceModelId!
    : "";
  const configurationId = config.devices.some(
    (d) => d.id === saved.configurationId && d.deviceModelId === deviceModelId,
  )
    ? saved.configurationId!
    : "";
  const answers: TradeAnswers = {};
  for (const question of config.questions) {
    const answer = saved.answers?.[question.key];
    if (question.options.some((o) => o.value === answer)) answers[question.key] = answer;
  }
  const state: TradeWizardSnapshot = { ...fresh, deviceModelId, configurationId, answers };
  if (typeof saved.runId === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(saved.runId))
    state.runId = saved.runId;
  if (
    [
      "sale",
      "commission_consultation",
      "exchange",
      "manual_evaluation",
      "stock_notification",
    ].includes(saved.scenario ?? "")
  )
    state.scenario = saved.scenario;
  const q = saved.quote;
  if (
    q &&
    typeof q.id === "string" &&
    q.deviceModelId === deviceModelId &&
    q.configurationId === configurationId &&
    q.pricingVersion === config.pricingVersion &&
    typeof q.deviceLabel === "string" &&
    ["active", "expired", "superseded"].includes(q.status) &&
    Number.isFinite(Date.parse(q.validUntil)) &&
    q.range?.currency === "RUB" &&
    Number.isFinite(q.range.min) &&
    Number.isFinite(q.range.max) &&
    q.range.min >= 0 &&
    q.range.max >= q.range.min &&
    Array.isArray(q.positiveFactors) &&
    q.positiveFactors.every((f) => typeof f === "string") &&
    Array.isArray(q.riskFactors) &&
    q.riskFactors.every((f) => typeof f === "string") &&
    saved.quoteInputKey === tradeInputKey(deviceModelId, configurationId, answers)
  ) {
    state.quote = q;
    state.quoteInputKey = saved.quoteInputKey;
  }
  state.step = resolveTradeStep(saved.step, state, config);
  return state;
}
