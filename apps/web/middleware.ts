import { NextRequest, NextResponse } from "next/server";

const CLUB_HOST = "club.isvoi.ru";
const MAIN_HOST = "isvoi.ru";
const WWW_HOST = "www.isvoi.ru";

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

export function middleware(request: NextRequest) {
  const host = hostWithoutPort(request);
  const { pathname, search } = request.nextUrl;

  if (host === CLUB_HOST) {
    if (pathname === "/robots.txt") {
      return NextResponse.rewrite(new URL("/club-robots.txt", request.url));
    }

    if (pathname === "/sitemap.xml") {
      return NextResponse.rewrite(new URL("/club-sitemap.xml", request.url));
    }

    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/club", request.url));
    }

    if (pathname === "/club" || pathname === "/club/") {
      return NextResponse.redirect(new URL("/", request.url), 301);
    }

    if (shouldPassThrough(pathname)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301);
  }

  if (
    (host === MAIN_HOST || host === WWW_HOST) &&
    (pathname === "/club" || pathname === "/club/")
  ) {
    return NextResponse.redirect(`https://${CLUB_HOST}/`, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};
