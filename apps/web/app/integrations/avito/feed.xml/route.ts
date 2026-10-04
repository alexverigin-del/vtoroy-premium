import { NextResponse } from "next/server";

import { parseAvitoPilotIds, prepareAvitoFeed, type AvitoListingRow } from "@/lib/avito-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DirectusResponse<T> = { data?: T };

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function privateError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: PRIVATE_HEADERS });
}

export async function GET() {
  if (process.env.AVITO_FEED_ENABLED !== "1") {
    return privateError("avito_feed_disabled", 503);
  }
  if (process.env.AVITO_PHONE_SCHEMA_VERIFIED !== "1") {
    return privateError("avito_phone_schema_not_verified", 503);
  }
  const allowedIds = parseAvitoPilotIds(process.env.AVITO_FEED_ALLOWED_IDS || "");
  if (!allowedIds.length) {
    return privateError("avito_pilot_not_configured", 503);
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
    return privateError("avito_feed_not_configured", 503);
  }

  const fields = [
    "channel",
    "status",
    "external_id",
    "title_override",
    "description_override",
    "price_override",
    "category_mapping.channel",
    "category_mapping.product_category",
    "category_mapping.external_category",
    "category_mapping.external_goods_type",
    "category_mapping.default_attributes",
    "category_mapping.template_version",
    "category_mapping.is_active",
    "category_mapping.is_confirmed",
    "attributes",
    "product.id",
    "product.category.id",
    "product.category.slug",
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
    "product.listing_file",
    "product.images.status",
    "product.images.image.id",
    "product.images.sort",
    "product.images.role",
    "product.inventory_item.product",
    "product.inventory_item.quantity",
    "product.inventory_item.eligibility_status",
    "product.inventory_item.authenticity_status",
    "product.inventory_item.identity_status",
    "product.inventory_item.review_override",
    "product.inventory_item.review_note",
    "product.inventory_item.serial_full",
    "product.inventory_item.imei_full",
  ].join(",");
  const params = new URLSearchParams({
    "filter[channel][_eq]": "avito",
    "filter[external_id][_in]": allowedIds.join(","),
    fields,
    limit: "4",
  });
  let report;
  try {
    const response = await fetch(`${directusUrl}/items/product_channel_listings?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return privateError("avito_feed_source_failed", 502);
    const payload = (await response.json()) as DirectusResponse<AvitoListingRow[]>;
    if (!Array.isArray(payload.data)) return privateError("avito_feed_source_failed", 502);
    report = prepareAvitoFeed(payload.data, publicUrl, { allowedIds });
  } catch {
    return privateError("avito_feed_source_failed", 502);
  }
  if (report.errors.length || !report.xml) {
    return privateError("avito_feed_validation_failed", 503);
  }
  return new NextResponse(report.xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      ...PRIVATE_HEADERS,
    },
  });
}
