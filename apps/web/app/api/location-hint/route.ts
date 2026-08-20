import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cityAliases = new Map([
  ["belgorod", "belgorod"],
  ["белгород", "belgorod"],
]);

export function GET(request: NextRequest) {
  const raw =
    request.headers.get("x-isvoi-geo-city") ||
    request.headers.get("cf-ipcity") ||
    request.headers.get("x-vercel-ip-city") ||
    "";
  const normalized = decodeURIComponent(raw).trim().toLowerCase();
  return NextResponse.json(
    { slug: cityAliases.get(normalized) ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
