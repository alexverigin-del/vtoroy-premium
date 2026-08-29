import type { TradeAnswerValue, TradeAnswers, TradeQuestionKey } from "@vtoroy/shared";

export type TradePricingRule = {
  questionKey: TradeQuestionKey;
  optionValue: TradeAnswerValue;
  label: string;
  deltaMin: number;
  deltaMax: number;
  factorType: "positive" | "risk" | "neutral";
  manualEvaluation: boolean;
  safetyStop: boolean;
};

export type TradeCalculationResult = {
  min: number;
  max: number;
  positiveFactors: string[];
  riskFactors: string[];
  manualEvaluation: boolean;
  safetyStop: boolean;
};

export function calculateTradeRange(
  baseMin: number,
  baseMax: number,
  answers: TradeAnswers,
  rules: TradePricingRule[],
): TradeCalculationResult {
  let min = baseMin;
  let max = baseMax;
  let manualEvaluation = false;
  let safetyStop = false;
  const positiveFactors: string[] = [];
  const riskFactors: string[] = [];

  for (const [questionKey, optionValue] of Object.entries(answers)) {
    const rule = rules.find(
      (candidate) => candidate.questionKey === questionKey && candidate.optionValue === optionValue,
    );
    if (!rule) continue;

    min += rule.deltaMin;
    max += rule.deltaMax;
    manualEvaluation ||= rule.manualEvaluation;
    safetyStop ||= rule.safetyStop;
    if (rule.factorType === "positive" && !positiveFactors.includes(rule.label)) {
      positiveFactors.push(rule.label);
    }
    if (rule.factorType === "risk" && !riskFactors.includes(rule.label)) {
      riskFactors.push(rule.label);
    }
  }

  min = Math.max(0, Math.round(min));
  max = Math.max(0, Math.round(max));
  if (min > max) [min, max] = [max, min];

  return { min, max, positiveFactors, riskFactors, manualEvaluation, safetyStop };
}

/** Quote expiry is 23:59:59.999 Moscow time after the configured calendar-day window. */
export function tradeQuoteValidUntil(now: Date, validityDays: number): Date {
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate() + Math.max(1, Math.floor(validityDays)),
      20,
      59,
      59,
      999,
    ),
  );
}

export function isTradeQuoteExpired(validUntil: string, now = new Date()): boolean {
  const expiry = new Date(validUntil);
  return !Number.isFinite(expiry.getTime()) || expiry.getTime() < now.getTime();
}
