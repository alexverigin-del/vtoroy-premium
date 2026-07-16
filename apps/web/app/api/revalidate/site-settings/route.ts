import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { SITE_SETTINGS_CACHE_TAG } from "@/lib/cache-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function isAuthorized(request: NextRequest, expected: string): boolean {
  const headerSecret = (request.headers.get("x-isvoi-revalidate-secret") || "").trim();
  const bearerSecret = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  return matchesSecret(headerSecret, expected) || matchesSecret(bearerSecret, expected);
}

export async function POST(request: NextRequest) {
  const secret = (process.env.SITE_REVALIDATION_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "site_revalidation_not_configured" },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  revalidateTag(SITE_SETTINGS_CACHE_TAG);
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, scope: "site-settings" });
}
