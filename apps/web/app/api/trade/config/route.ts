import { NextRequest, NextResponse } from "next/server";
import {
  authenticateTradeQaSecret,
  isTradeQaRequest,
  issueTradeQaSession,
  TRADE_QA_COOKIE,
  tradeQaEnabled,
} from "@/lib/trade-qa";
import { TRADE_QA_SESSION_SECONDS } from "@/lib/trade-qa-session";
import { getTradePublicConfig } from "@/lib/trade-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const buckets = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function protectedHeaders(result: NextResponse): NextResponse {
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

function response(body: Record<string, unknown>, status: number) {
  return protectedHeaders(NextResponse.json(body, { status }));
}

function redirect(error?: string) {
  const location = error ? `/trade/qa?error=${encodeURIComponent(error)}` : "/trade/qa";
  return protectedHeaders(new NextResponse(null, { status: 303, headers: { Location: location } }));
}

function clearSession(result: NextResponse): NextResponse {
  result.cookies.set(TRADE_QA_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return result;
}

function limited(request: NextRequest): boolean {
  const key = (request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").slice(0, 80);
  const now = Date.now();
  const active = (buckets.get(key) ?? []).filter((time) => time > now - WINDOW_MS);
  if (active.length >= MAX_ATTEMPTS) return true;
  active.push(now);
  buckets.set(key, active);
  return false;
}

export async function GET(request: NextRequest) {
  const allowDraft = isTradeQaRequest(request);
  const config = await getTradePublicConfig({ allowDraft });
  return NextResponse.json(config, {
    status: config.active ? 200 : 503,
    headers: allowDraft
      ? { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }
      : { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
  });
}

export async function POST(request: NextRequest) {
  const formRequest = (request.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
  const body = formRequest
    ? Object.fromEntries(await request.formData())
    : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (body.intent === "logout") {
    return clearSession(formRequest ? redirect() : response({ ok: true }, 200));
  }
  if (!tradeQaEnabled()) {
    return formRequest ? redirect("not_found") : response({ ok: false, error: "not_found" }, 404);
  }
  if (limited(request)) {
    return formRequest
      ? redirect("rate_limited")
      : response({ ok: false, error: "rate_limited" }, 429);
  }
  const candidate = typeof body.secret === "string" ? body.secret : "";
  if (!authenticateTradeQaSecret(candidate)) {
    return formRequest
      ? redirect("unauthorized")
      : response({ ok: false, error: "unauthorized" }, 401);
  }

  const result = formRequest ? redirect() : response({ ok: true }, 200);
  result.cookies.set(TRADE_QA_COOKIE, issueTradeQaSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TRADE_QA_SESSION_SECONDS,
  });
  return result;
}

export async function DELETE() {
  return clearSession(response({ ok: true }, 200));
}
