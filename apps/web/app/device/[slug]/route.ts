import type { NextRequest } from "next/server";

export function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const destination = new URL(`/product/${encodeURIComponent(slug)}`, request.url);
    return Response.redirect(destination, 301);
  });
}
