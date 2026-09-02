import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { SITE_CONTENT_CACHE_TAGS } from "@/lib/cache-tags";
import { markIndexNowDirty } from "@/lib/indexnow-queue";

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

  // A durable signal only; external indexing never blocks an editor's save.
  let indexing = "queued";
  try {
    await markIndexNowDirty();
    if (process.env.INDEXNOW_ENABLED !== "1") indexing = "disabled";
  } catch {
    indexing = "queue_failed";
    console.error(
      "[IndexNow] Could not persist revalidation signal; scheduled reconciliation will retry.",
    );
  }

  return NextResponse.json({
    ok: true,
    scope: "site-content",
    indexing,
    tags: SITE_CONTENT_CACHE_TAGS,
  });
}
