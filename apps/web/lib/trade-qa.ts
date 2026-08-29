import "server-only";

import type { NextRequest } from "next/server";
import {
  createTradeQaSessionToken,
  matchesTradeQaSecret,
  validateTradeQaSessionToken,
} from "./trade-qa-session";

export const TRADE_QA_COOKIE = "isvoi_trade_qa";

function qaSecret(): string {
  return (process.env.TRADE_QA_SECRET ?? "").trim();
}

export function tradeQaEnabled(): boolean {
  return process.env.TRADE_QA_ENABLED === "1" && qaSecret().length >= 32;
}

export function authenticateTradeQaSecret(candidate: string): boolean {
  return tradeQaEnabled() && matchesTradeQaSecret(candidate.trim(), qaSecret());
}

export function issueTradeQaSession(): string {
  if (!tradeQaEnabled()) throw new Error("trade_qa_unavailable");
  return createTradeQaSessionToken(qaSecret());
}

export function validateTradeQaSession(value: string | undefined): boolean {
  return tradeQaEnabled() && validateTradeQaSessionToken(value ?? "", qaSecret());
}

export function isTradeQaRequest(request: NextRequest): boolean {
  return validateTradeQaSession(request.cookies.get(TRADE_QA_COOKIE)?.value);
}
