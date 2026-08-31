import { NextRequest, NextResponse } from "next/server";
import { getTradeExchangeOffers, TradeApiError } from "@/lib/trade-server";
import { isTradeQaRequest } from "@/lib/trade-qa";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const quoteId = (request.nextUrl.searchParams.get("quote_id") ?? "").trim().slice(0, 80);
  const storeId = (request.nextUrl.searchParams.get("store_location_id") ?? "").trim().slice(0, 80);
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  if (!quoteId || (cursor !== undefined && (!cursor || cursor.length > 1024))) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  try {
    const page = await getTradeExchangeOffers(
      quoteId,
      storeId || undefined,
      {
        allowDraft: isTradeQaRequest(request),
      },
      cursor,
    );
    return NextResponse.json(
      { ok: true, ...page },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof TradeApiError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "pricing_unavailable" }, { status: 503 });
  }
}
