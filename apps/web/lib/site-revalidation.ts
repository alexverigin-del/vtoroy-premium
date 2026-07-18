import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { SITE_CONTENT_CACHE_TAGS } from "@/lib/cache-tags";

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

export async function handleSiteRevalidation(request: NextRequest) {
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

  for (const tag of SITE_CONTENT_CACHE_TAGS) revalidateTag(tag);
  revalidatePath("/", "layout");

  return NextResponse.json({
    ok: true,
    scope: "site-content",
    tags: SITE_CONTENT_CACHE_TAGS,
  });
}
