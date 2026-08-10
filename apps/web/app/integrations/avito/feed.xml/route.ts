import { NextResponse } from "next/server";

import { buildAvitoFeed, type AvitoListingRow } from "@/lib/avito-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DirectusResponse<T> = { data?: T };

export async function GET() {
  if (process.env.AVITO_FEED_ENABLED !== "1") {
    return NextResponse.json({ ok: false, error: "avito_feed_disabled" }, { status: 503 });
  }
  const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
  const publicUrl = (
    process.env.NEXT_PUBLIC_DIRECTUS_URL ||
    process.env.DIRECTUS_PUBLIC_URL ||
    directusUrl
  ).replace(/\/+$/, "");
  const token =
    process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN || process.env.CATALOG_IMPORT_DIRECTUS_TOKEN || "";
  if (!directusUrl || !publicUrl || !token) {
    return NextResponse.json({ ok: false, error: "avito_feed_not_configured" }, { status: 503 });
  }

  const fields = [
    "external_id",
    "title_override",
    "description_override",
    "price_override",
    "category_code",
    "attributes",
    "product.id",
    "product.status",
    "product.content_status",
    "product.stock_status",
    "product.stock_quantity",
    "product.condition",
    "product.title",
    "product.price",
    "product.short_description",
    "product.warranty_text",
    "product.completeness",
    "product.images.status",
    "product.images.image.id",
    "product.images.sort",
  ].join(",");
  const params = new URLSearchParams({
    "filter[channel][_eq]": "avito",
    "filter[status][_eq]": "active",
    fields,
    limit: "500",
  });
  const response = await fetch(`${directusUrl}/items/product_channel_listings?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: "avito_feed_source_failed" }, { status: 502 });
  }
  const payload = (await response.json()) as DirectusResponse<AvitoListingRow[]>;
  const feed = buildAvitoFeed(payload.data ?? [], publicUrl);
  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
