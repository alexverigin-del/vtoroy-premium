import { NextRequest, NextResponse } from "next/server";

const CLUB_HOST = "club.isvoi.ru";
const CITY_HOSTS = new Map([["belgorod.isvoi.ru", "belgorod"]]);
const MAIN_HOST = "isvoi.ru";
const WWW_HOST = "www.isvoi.ru";
const CLUB_SUBDOMAIN_ENABLED = process.env.CLUB_SUBDOMAIN_ENABLED === "1";
const CLUB_INDEXING_ENABLED = process.env.CLUB_INDEXING_ENABLED === "1";

const PASS_THROUGH_PREFIXES = ["/_next", "/assets", "/lead-intake"];
const PASS_THROUGH_FILES = new Set([
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-gold.png",
  "/robots.txt",
  "/sitemap.xml",
]);

function hostWithoutPort(request: NextRequest): string {
  return (request.headers.get("host") || "").split(":")[0].toLowerCase();
}

function isStaticAsset(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function shouldPassThrough(pathname: string): boolean {
  return (
    PASS_THROUGH_FILES.has(pathname) ||
    isStaticAsset(pathname) ||
    PASS_THROUGH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function clubResponse(response: NextResponse): NextResponse {
  if (!CLUB_INDEXING_ENABLED) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export function middleware(request: NextRequest) {
  const host = hostWithoutPort(request);
  const { pathname, search } = request.nextUrl;

  // Serve the ownership proof without a React route/client entry. Never expose
  // it on Club or other subdomains. Loopback is allowed only for local QA.
  if (pathname === "/indexnow-key.txt" && [MAIN_HOST, "localhost", "127.0.0.1"].includes(host)) {
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      Allow: "GET, HEAD",
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      return new NextResponse("Method not allowed", { status: 405, headers });
    }
    const enabled = process.env.INDEXNOW_ENABLED === "1";
    const key = process.env.INDEXNOW_KEY || "";
    const valid = /^[a-zA-Z0-9-]{8,128}$/.test(key);
    const status = !enabled ? 404 : valid ? 200 : 503;
    const body = !enabled ? "Not found" : valid ? key : "IndexNow is not configured";
    return new NextResponse(request.method === "HEAD" ? null : body, { status, headers });
  }

  if (host === CLUB_HOST) {
    if (pathname === "/robots.txt") {
      return clubResponse(NextResponse.rewrite(new URL("/club-robots.txt", request.url)));
    }

    if (pathname === "/sitemap.xml") {
      return clubResponse(NextResponse.rewrite(new URL("/club-sitemap.xml", request.url)));
    }

    if (pathname === "/") {
      return clubResponse(NextResponse.rewrite(new URL("/club", request.url)));
    }

    if (pathname.startsWith("/legal/")) {
      return clubResponse(NextResponse.rewrite(new URL(`/club${pathname}${search}`, request.url)));
    }

    if (pathname === "/club" || pathname === "/club/") {
      return NextResponse.redirect(new URL("/", request.url), 301);
    }

    if (shouldPassThrough(pathname)) {
      return clubResponse(NextResponse.next());
    }

    return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301);
  }

  const citySlug = CITY_HOSTS.get(host);
  if (citySlug) {
    if (pathname.startsWith("/product/") || shouldPassThrough(pathname)) {
      return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301);
    }
    const cityPath = pathname === "/" ? `/${citySlug}` : `/${citySlug}${pathname}`;
    return NextResponse.redirect(`https://${MAIN_HOST}${cityPath}${search}`, 301);
  }

  if (host && host.endsWith(`.${MAIN_HOST}`) && host !== CLUB_HOST && !CITY_HOSTS.has(host)) {
    return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301);
  }

  if (
    CLUB_SUBDOMAIN_ENABLED &&
    (host === MAIN_HOST || host === WWW_HOST) &&
    (pathname === "/club" || pathname === "/club/")
  ) {
    return NextResponse.redirect(`https://${CLUB_HOST}/`, 301);
  }

  if (pathname === "/store") {
    return NextResponse.redirect(new URL(`/belgorod${search}`, request.url), 301);
  }

  if (pathname === "/stores/belgorod") {
    return NextResponse.redirect(new URL(`/belgorod${search}`, request.url), 301);
  }

  if (pathname === "/trade/qa" || pathname.startsWith("/trade/qa/")) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};
