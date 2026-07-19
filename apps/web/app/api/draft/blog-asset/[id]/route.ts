import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { directusConfig } from "@/lib/directus";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const ALLOWED_WIDTHS = new Set([1200, 1600]);

type PreviewAssetRow = {
  cover_image?: string | { id?: string } | null;
  blocks?: Array<{ image?: string | { id?: string } | null }>;
};

function fileId(value: string | { id?: string } | null | undefined): string {
  return typeof value === "string" ? value : value?.id || "";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const draft = await draftMode();
  if (!draft.isEnabled) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { id } = await params;
  const post = (request.nextUrl.searchParams.get("post") || "").trim();
  const version = (request.nextUrl.searchParams.get("version") || "").trim();
  const requestedWidth = Number(request.nextUrl.searchParams.get("width"));
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(post) || !VERSION_PATTERN.test(version)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const token = (process.env.DIRECTUS_PREVIEW_TOKEN || "").trim();
  if (!directusConfig.url || !token) {
    return NextResponse.json({ error: "preview_unavailable" }, { status: 503 });
  }

  const fields = "cover_image,blocks.image";
  const itemUrl = new URL(`${directusConfig.url}/items/blog_posts/${post}`);
  itemUrl.searchParams.set("version", version);
  itemUrl.searchParams.set("fields", fields);
  const itemResponse = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!itemResponse.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const row = ((await itemResponse.json()) as { data?: PreviewAssetRow }).data;
  const referencedIds = new Set([
    fileId(row?.cover_image),
    ...(row?.blocks || []).map((block) => fileId(block.image)),
  ]);
  if (!referencedIds.has(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const width = ALLOWED_WIDTHS.has(requestedWidth) ? requestedWidth : 1600;
  const assetUrl = new URL(`${directusConfig.url}/assets/${id}`);
  assetUrl.searchParams.set("width", String(width));
  assetUrl.searchParams.set("quality", "84");
  assetUrl.searchParams.set("format", "auto");
  assetUrl.searchParams.set("withoutEnlargement", "true");
  const assetResponse = await fetch(assetUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const contentType = assetResponse.headers.get("content-type") || "";
  if (!assetResponse.ok || !contentType.startsWith("image/")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(assetResponse.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
