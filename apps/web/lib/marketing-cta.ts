const TRADE_CALCULATOR_TARGETS = new Set(["#trade-calculator", "/trade#trade-calculator"]);
const CLUB_LEGACY_TARGETS = new Set(["#final", "/#final", "/club#final"]);

export function tradePrimaryCtaForRuntime(
  url: string | undefined,
  calculatorActive: boolean,
): string | undefined {
  const target = url?.trim();
  if (!calculatorActive && target && TRADE_CALCULATOR_TARGETS.has(target)) return "#final";
  return url;
}

export function clubPrimaryCtaForRuntime(url: string | undefined): string | undefined {
  const target = url?.trim();
  if (target && CLUB_LEGACY_TARGETS.has(target)) return "#club-request";
  return url;
}
