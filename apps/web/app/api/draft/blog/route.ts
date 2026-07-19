import { timingSafeEqual } from "node:crypto";
import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getBlogPostPreview } from "@/lib/blog";

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

export async function GET(request: NextRequest) {
  const expectedSecret = (process.env.BLOG_PREVIEW_SECRET || "").trim();
  const candidateSecret = (request.nextUrl.searchParams.get("secret") || "").trim();
  const id = (request.nextUrl.searchParams.get("id") || "").trim();

  if (!expectedSecret || !matchesSecret(candidateSecret, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400 });
  }

  const post = await getBlogPostPreview(id);
  if (!post) {
    return NextResponse.json({ ok: false, error: "preview_unavailable" }, { status: 404 });
  }

  const draft = await draftMode();
  draft.enable();
  const redirect = NextResponse.redirect(
    new URL(`/blog/${post.slug}?preview=${encodeURIComponent(post.id)}`, request.url),
  );
  redirect.headers.set("Referrer-Policy", "no-referrer");
  return redirect;
}
