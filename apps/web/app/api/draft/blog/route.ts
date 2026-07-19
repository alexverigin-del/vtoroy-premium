import { timingSafeEqual } from "node:crypto";
import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getBlogPostPreview } from "@/lib/blog";
import { siteUrl } from "@/lib/structured-data";

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
  const requestedVersion = (request.nextUrl.searchParams.get("version") || "").trim();
  const version = requestedVersion && requestedVersion !== "main" ? requestedVersion : undefined;

  if (!expectedSecret || !matchesSecret(candidateSecret, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400 });
  }
  if (version && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(version)) {
    return NextResponse.json({ ok: false, error: "invalid_version" }, { status: 400 });
  }

  const post = await getBlogPostPreview(id, version);
  if (!post) {
    return NextResponse.json({ ok: false, error: "preview_unavailable" }, { status: 404 });
  }

  const draft = await draftMode();
  draft.enable();
  const redirectUrl = new URL(siteUrl(`/blog/${post.slug}`));
  redirectUrl.searchParams.set("preview", post.id);
  if (version) redirectUrl.searchParams.set("version", version);
  const redirect = NextResponse.redirect(redirectUrl);
  redirect.headers.set("Referrer-Policy", "no-referrer");
  return redirect;
}
