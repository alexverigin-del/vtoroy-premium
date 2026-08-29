import type { TradeEventName } from "@vtoroy/shared";
import { NextRequest, NextResponse } from "next/server";
import { recordTradeEvent } from "@/lib/trade-server";
import { isTradeQaRequest } from "@/lib/trade-qa";

export const dynamic = "force-dynamic";

const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_EVENTS = 60;

const ALLOWED_EVENTS = new Set<TradeEventName>([
  "trade_start",
  "trade_model_selected",
  "trade_condition_completed",
  "trade_quote_shown",
  "trade_scenario_selected",
  "trade_lead_submitted",
  "trade_diagnostics_completed",
  "trade_final_offer_accepted",
  "trade_api_error",
]);

function safeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function limited(request: NextRequest): boolean {
  const key = (request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").slice(0, 80);
  const now = Date.now();
  const active = (buckets.get(key) ?? []).filter((time) => time > now - WINDOW_MS);
  if (active.length >= MAX_EVENTS) return true;
  active.push(now);
  buckets.set(key, active);
  return false;
}

export async function POST(request: NextRequest) {
  if (limited(request)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const eventName = safeText(body.event_name, 80) as TradeEventName;
  const sessionId = safeText(body.session_id, 80);
  if (!ALLOWED_EVENTS.has(eventName) || !sessionId) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  await recordTradeEvent({
    eventName,
    sessionId,
    quoteId: safeText(body.quote_id, 80) || undefined,
    scenario: safeText(body.scenario, 80) || undefined,
    step: safeText(body.step, 80) || undefined,
    durationMs: Number.isFinite(Number(body.duration_ms))
      ? Math.max(0, Math.min(Number(body.duration_ms), 86_400_000))
      : undefined,
    errorCode: safeText(body.error_code, 80) || undefined,
    isTest: isTradeQaRequest(request),
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
