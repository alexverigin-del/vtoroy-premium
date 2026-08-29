import { NextRequest, NextResponse } from "next/server";
import { getTradeExchangeOffers, TradeApiError } from "@/lib/trade-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const quoteId = (request.nextUrl.searchParams.get("quote_id") ?? "").trim().slice(0, 80);
  const storeId = (request.nextUrl.searchParams.get("store_location_id") ?? "").trim().slice(0, 80);
  if (!quoteId) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  try {
    const offers = await getTradeExchangeOffers(quoteId, storeId || undefined);
    return NextResponse.json(
      { ok: true, offers },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof TradeApiError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "pricing_unavailable" }, { status: 503 });
  }
}
