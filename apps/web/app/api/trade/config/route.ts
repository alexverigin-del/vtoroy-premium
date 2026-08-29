import { NextResponse } from "next/server";
import { getTradePublicConfig } from "@/lib/trade-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getTradePublicConfig();
  return NextResponse.json(config, {
    status: config.active ? 200 : 503,
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
  });
}
