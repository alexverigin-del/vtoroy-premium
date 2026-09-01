import { NextResponse } from "next/server";

import {
  buildYandexBusinessFeed,
  selectYandexBusinessOffers,
  type YandexBusinessProductRow,
} from "@/lib/yandex-business-feed";
import { SITE_URL } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DirectusResponse<T> = { data?: T };

const ERROR_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function privateError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: ERROR_HEADERS });
}

async function readProducts(directusUrl: string, token: string) {
  const fields = [
    "id",
    "product_type",
    "condition",
    "status",
    "content_status",
    "stock_status",
    "stock_quantity",
    "title",
    "short_description",
    "headline",
    "warranty",
    "warranty_text",
    "completeness",
    "listing_file.id",
    "brand.slug",
    "brand.name",
    "category.slug",
    "category.name",
    "device_details.grade",
    "device_details.battery_text",
    "offers.status",
    "offers.price",
    "offers.stock_quantity",
    "offers.stock_status",
    "offers.updated_at",
    "offers.location.slug",
    "offers.location.status",
  ].join(",");
  const pageSize = 500;
  const products: YandexBusinessProductRow[] = [];

  for (let page = 0; page <= 20; page += 1) {
    const params = new URLSearchParams({
      "filter[status][_eq]": "published",
      "filter[content_status][_eq]": "ready",
      "filter[product_type][_eq]": "device",
      "filter[condition][_eq]": "used",
      "filter[stock_status][_eq]": "available",
      "filter[stock_quantity][_gt]": "0",
      fields,
      limit: String(pageSize),
      offset: String(page * pageSize),
      sort: "sort,title",
    });
    const response = await fetch(`${directusUrl}/items/products?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Directus returned ${response.status}`);
    const payload = (await response.json()) as DirectusResponse<YandexBusinessProductRow[]>;
    const pageProducts = payload.data ?? [];
    products.push(...pageProducts);
    if (products.length > 10000) {
      throw new Error("Yandex Business feed exceeded the 10000 product limit");
    }
    if (pageProducts.length < pageSize) return products;
  }

  return products;
}

export async function GET() {
  if (process.env.YANDEX_BUSINESS_FEED_ENABLED !== "1") {
    return privateError("yandex_business_feed_disabled", 503);
  }

  const directusUrl = (process.env.DIRECTUS_URL || "").replace(/\/+$/u, "");
  const directusPublicUrl = (
    process.env.NEXT_PUBLIC_DIRECTUS_URL ||
    process.env.DIRECTUS_PUBLIC_URL ||
    ""
  ).replace(/\/+$/u, "");
  if (!directusUrl || !directusPublicUrl) {
    return privateError("yandex_business_feed_not_configured", 503);
  }

  try {
    const products = await readProducts(directusUrl, process.env.DIRECTUS_TOKEN || "");
    const offers = selectYandexBusinessOffers(products, {
      directusPublicUrl,
      siteUrl: SITE_URL,
    });
    if (offers.length === 0) {
      return privateError("yandex_business_feed_has_no_eligible_offers", 503);
    }

    const feed = buildYandexBusinessFeed(offers);
    if (Buffer.byteLength(feed, "utf8") > 15 * 1024 * 1024) {
      return privateError("yandex_business_feed_exceeds_size_limit", 503);
    }

    return new NextResponse(feed, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
        "Content-Disposition": 'inline; filename="isvoi-yandex-business.yml"',
        "Content-Type": "application/xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return privateError("yandex_business_feed_source_failed", 502);
  }
}
