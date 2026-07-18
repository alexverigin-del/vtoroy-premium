import { NextRequest } from "next/server";

import { handleSiteRevalidation } from "@/lib/site-revalidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleSiteRevalidation(request);
}
