import type { TradeQuoteRequest } from "@vtoroy/shared";
import { NextRequest, NextResponse } from "next/server";
import { createTradeQuote, TradeApiError } from "@/lib/trade-server";
import { isTradeQaRequest } from "@/lib/trade-qa";

export const dynamic = "force-dynamic";

const buckets = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 20;

function limited(request: NextRequest): boolean {
  const key = (request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").slice(0, 80);
  const now = Date.now();
  const active = (buckets.get(key) ?? []).filter((time) => time > now - WINDOW_MS);
  if (active.length >= MAX_REQUESTS) return true;
  active.push(now);
  buckets.set(key, active);
  return false;
}

export async function POST(request: NextRequest) {
  if (limited(request)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let body: TradeQuoteRequest;
  try {
    body = (await request.json()) as TradeQuoteRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  try {
    const quote = await createTradeQuote(body, { allowDraft: isTradeQaRequest(request) });
    return NextResponse.json({ ok: true, quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TradeApiError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "pricing_unavailable" }, { status: 503 });
  }
}
