import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isValidPhoneNumber } from "@/lib/phone";
import { getTradeQuote, TradeApiError, validateTradeExchangeSelection } from "@/lib/trade-server";
import { isTradeQaRequest } from "@/lib/trade-qa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeadRequest = {
  kind?: unknown;
  scenario?: unknown;
  name?: unknown;
  contact?: unknown;
  product?: unknown;
  product_id?: unknown;
  product_type?: unknown;
  device?: unknown;
  device_id?: unknown;
  quote_id?: unknown;
  target_product_id?: unknown;
  target_offer_id?: unknown;
  store_location_id?: unknown;
  preferred_visit_date?: unknown;
  preferred_visit_period?: unknown;
  contact_channel?: unknown;
  idempotency_key?: unknown;
  club_offer?: unknown;
  club_plan?: unknown;
  club_term_months?: unknown;
  club_budget_text?: unknown;
  club_device_request?: unknown;
  club_consent_accepted?: unknown;
  club_consent_version?: unknown;
  message?: unknown;
  source?: unknown;
  source_path?: unknown;
  source_url?: unknown;
  page_title?: unknown;
  referrer?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  utm_term?: unknown;
  website?: unknown;
  turnstile_token?: unknown;
  "cf-turnstile-response"?: unknown;
};

type StoredLead = {
  created_at: string;
  kind: string;
  status: "new";
  priority: "normal";
  contact_channel: string;
  name: string;
  contact: string;
  product: string;
  product_id: string;
  product_type: string;
  device: string;
  device_id: string;
  quote_id: string;
  target_product_id: string;
  target_offer_id: string;
  store_location_id: string;
  preferred_visit_date: string;
  preferred_visit_period: string;
  idempotency_key: string;
  reference_code: string;
  club_offer: string;
  club_plan: string;
  club_term_months: string;
  club_budget_text: string;
  club_device_request: string;
  club_consent_version: string;
  club_consent_at: string;
  scenario: string;
  message: string;
  source: string;
  source_path: string;
  source_url: string;
  page_title: string;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  user_agent: string;
  is_test: boolean;
};

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const rateLimitBuckets = new Map<string, number[]>();
const TRADE_SCENARIOS = new Set([
  "sale",
  "commission_consultation",
  "exchange",
  "manual_evaluation",
  "stock_notification",
]);

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(value: string): string | null {
  return value || null;
}

function accepted(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "on";
}

function inferKind(kind: string, scenario: string): string {
  const explicit = kind.toLowerCase();
  if (["purchase", "selection", "trade", "club", "upgrade", "support"].includes(explicit)) {
    return explicit;
  }

  const value = scenario.toLowerCase();
  if (value.includes("trade") || value.includes("оцен") || value.includes("передать"))
    return "trade";
  if (value.includes("club")) return "club";
  if (value.includes("обнов")) return "upgrade";
  if (
    value.includes("забронировать") ||
    value.includes("купить") ||
    value.includes("брон") ||
    value.includes("лист ожидания")
  )
    return "purchase";
  if (value.includes("похож") || value.includes("альтернатив")) return "selection";
  return "selection";
}

function inferContactChannel(contact: string): string {
  const value = contact.toLowerCase();
  if (value.includes("@") && !value.includes("t.me/") && !value.includes("telegram"))
    return "email";
  if (value.includes("telegram") || value.includes("t.me/") || value.startsWith("@"))
    return "telegram";
  if (value.includes("whatsapp") || value.includes("wa.me/")) return "whatsapp";
  if (/[0-9][0-9\s()+-]{5,}/.test(value)) return "phone";
  return "unknown";
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return firstForwarded || request.headers.get("x-real-ip") || "unknown";
}

function rateLimitKey(request: NextRequest): string {
  return clientIp(request).slice(0, 80);
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitBuckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);

  if (rateLimitBuckets.size > 1000) {
    for (const [bucketKey, timestamps] of rateLimitBuckets.entries()) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length === 0) rateLimitBuckets.delete(bucketKey);
      else rateLimitBuckets.set(bucketKey, active);
    }
  }

  return false;
}

async function parseLeadRequest(request: NextRequest): Promise<LeadRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as LeadRequest;
    } catch {
      return {};
    }
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const form = await request.formData();
    return Object.fromEntries(form.entries()) as LeadRequest;
  }

  return {};
}

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

function turnstileToken(body: LeadRequest): string {
  return text(body.turnstile_token, 2048) || text(body["cf-turnstile-response"], 2048);
}

async function verifyTurnstile(body: LeadRequest, request: NextRequest): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!secret) return true;

  const token = turnstileToken(body);
  if (!token) return false;

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: clientIp(request),
      }),
      cache: "no-store",
    });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileResponse;
    return result.success === true;
  } catch {
    return false;
  }
}

async function postToDirectus(lead: StoredLead): Promise<boolean> {
  const directusUrl = (
    process.env.DIRECTUS_URL ??
    process.env.NEXT_PUBLIC_DIRECTUS_URL ??
    ""
  ).replace(/\/+$/, "");
  const token = process.env.DIRECTUS_LEADS_TOKEN ?? "";
  if (!directusUrl || !token) return false;

  async function postPayload(payload: Record<string, unknown>): Promise<Response | null> {
    try {
      return await fetch(`${directusUrl}/items/leads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } catch {
      return null;
    }
  }

  try {
    const directusLead = {
      kind: lead.kind,
      status: lead.status,
      priority: lead.priority,
      contact_channel: lead.contact_channel,
      name: optionalText(lead.name),
      contact: lead.contact,
      product: optionalText(lead.product_id),
      product_type: optionalText(lead.product_type),
      device: optionalText(lead.device),
      device_id: optionalText(lead.device_id),
      quote_id: optionalText(lead.quote_id),
      target_product_id: optionalText(lead.target_product_id),
      target_offer_id: optionalText(lead.target_offer_id),
      store_location_id: optionalText(lead.store_location_id),
      preferred_visit_date: optionalText(lead.preferred_visit_date),
      preferred_visit_period: optionalText(lead.preferred_visit_period),
      idempotency_key: optionalText(lead.idempotency_key),
      reference_code: lead.reference_code,
      club_offer: optionalText(lead.club_offer),
      club_plan: optionalText(lead.club_plan),
      club_term_months: optionalText(lead.club_term_months),
      club_budget_text: optionalText(lead.club_budget_text),
      club_device_request: optionalText(lead.club_device_request),
      club_consent_version: optionalText(lead.club_consent_version),
      club_consent_at: optionalText(lead.club_consent_at),
      scenario: optionalText(lead.scenario),
      message: optionalText(lead.message),
      source: lead.source,
      source_path: lead.source_path,
      source_url: optionalText(lead.source_url),
      page_title: optionalText(lead.page_title),
      referrer: optionalText(lead.referrer),
      utm_source: optionalText(lead.utm_source),
      utm_medium: optionalText(lead.utm_medium),
      utm_campaign: optionalText(lead.utm_campaign),
      utm_content: optionalText(lead.utm_content),
      utm_term: optionalText(lead.utm_term),
      user_agent: optionalText(lead.user_agent),
      is_test: lead.is_test,
    };
    let response = await postPayload(directusLead);
    if (response?.ok) return true;
    if (response && [400, 409].includes(response.status)) {
      const failure = await response
        .clone()
        .text()
        .catch(() => "");
      if (/reference_code|leads_reference_code_unique/i.test(failure)) {
        lead.reference_code = tradeReference(lead.is_test);
        directusLead.reference_code = lead.reference_code;
        response = await postPayload(directusLead);
        if (response?.ok) return true;
      }
    }

    const fallbackMessage = [
      lead.scenario ? `Сценарий: ${lead.scenario}` : "",
      lead.message ? `Комментарий: ${lead.message}` : "",
      lead.device_id ? `Device ID: ${lead.device_id}` : "",
      lead.quote_id ? `Trade quote: ${lead.quote_id}` : "",
      lead.target_product_id ? `Target product: ${lead.target_product_id}` : "",
      lead.target_offer_id ? `Target offer: ${lead.target_offer_id}` : "",
      lead.store_location_id ? `Store: ${lead.store_location_id}` : "",
      lead.preferred_visit_date ? `Preferred date: ${lead.preferred_visit_date}` : "",
      lead.preferred_visit_period ? `Preferred period: ${lead.preferred_visit_period}` : "",
      `Reference: ${lead.reference_code}`,
      lead.club_offer ? `Club offer: ${lead.club_offer}` : "",
      lead.club_plan ? `Club plan: ${lead.club_plan}` : "",
      lead.club_term_months ? `Club term: ${lead.club_term_months}` : "",
      lead.club_budget_text ? `Club budget: ${lead.club_budget_text}` : "",
      lead.club_device_request ? `Club device request: ${lead.club_device_request}` : "",
      lead.club_consent_version ? `Club consent: ${lead.club_consent_version}` : "",
      lead.source_url ? `URL: ${lead.source_url}` : "",
      lead.page_title ? `Page title: ${lead.page_title}` : "",
      lead.referrer ? `Referrer: ${lead.referrer}` : "",
      lead.utm_source ? `UTM source: ${lead.utm_source}` : "",
      lead.utm_medium ? `UTM medium: ${lead.utm_medium}` : "",
      lead.utm_campaign ? `UTM campaign: ${lead.utm_campaign}` : "",
      lead.utm_content ? `UTM content: ${lead.utm_content}` : "",
      lead.utm_term ? `UTM term: ${lead.utm_term}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const legacyResponse = await postPayload({
      kind: lead.kind,
      status: lead.status,
      name: lead.name,
      contact: lead.contact,
      device: lead.device,
      message: fallbackMessage || lead.message,
      source: lead.source_path || lead.source,
      source_path: lead.source_path,
      source_url: optionalText(lead.source_url),
      referrer: optionalText(lead.referrer),
      utm_source: optionalText(lead.utm_source),
      utm_medium: optionalText(lead.utm_medium),
      utm_campaign: optionalText(lead.utm_campaign),
      utm_content: optionalText(lead.utm_content),
      utm_term: optionalText(lead.utm_term),
      is_test: lead.is_test,
    });

    return Boolean(legacyResponse?.ok);
  } catch {
    return false;
  }
}

function directusConnection() {
  return {
    url: (process.env.DIRECTUS_URL ?? process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "").replace(
      /\/+$/,
      "",
    ),
    token:
      process.env.DIRECTUS_TRADE_TOKEN ??
      process.env.DIRECTUS_LEADS_TOKEN ??
      process.env.DIRECTUS_TOKEN ??
      "",
  };
}

async function existingTradeReference(idempotencyKey: string, isTest: boolean): Promise<string> {
  if (!idempotencyKey) return "";
  const directus = directusConnection();
  if (!directus.url || !directus.token) return "";
  const params = new URLSearchParams({
    "filter[idempotency_key][_eq]": idempotencyKey,
    "filter[is_test][_eq]": String(isTest),
    fields: "reference_code",
    limit: "1",
  });
  try {
    const response = await fetch(`${directus.url}/items/leads?${params}`, {
      headers: { Authorization: `Bearer ${directus.token}` },
      cache: "no-store",
    });
    if (!response.ok) return "";
    const payload = (await response.json()) as { data?: Array<{ reference_code?: string }> };
    return payload.data?.[0]?.reference_code?.trim() ?? "";
  } catch {
    return "";
  }
}

function tradeReference(isTest: boolean, now = new Date()): string {
  const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const date = [
    String(moscow.getUTCFullYear()).slice(-2),
    String(moscow.getUTCMonth() + 1).padStart(2, "0"),
    String(moscow.getUTCDate()).padStart(2, "0"),
  ].join("");
  const suffix = String(Math.floor(100 + Math.random() * 900));
  return `${isTest ? "QA" : "TR"}-${date}-${suffix}`;
}

function validVisitDate(value: string): boolean {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function validateTradeSubmission(input: {
  scenario: string;
  quoteId: string;
  productId: string;
  offerId: string;
  storeId: string;
  isTest: boolean;
}): Promise<string | null> {
  if (!TRADE_SCENARIOS.has(input.scenario)) return "validation_error";
  if (["manual_evaluation", "stock_notification"].includes(input.scenario)) return null;
  if (!input.quoteId) return "validation_error";
  try {
    await getTradeQuote(input.quoteId, { testMode: input.isTest ? "only" : "exclude" });
    if (input.scenario === "exchange") {
      if (!input.productId || !input.offerId) return "product_unavailable";
      const available = await validateTradeExchangeSelection(
        input.quoteId,
        input.productId,
        input.offerId,
        input.storeId || undefined,
        { allowDraft: input.isTest },
      );
      if (!available) return "product_unavailable";
    }
    return null;
  } catch (error) {
    if (error instanceof TradeApiError) return error.code;
    return "pricing_unavailable";
  }
}

async function appendLeadLog(lead: StoredLead): Promise<void> {
  const logPath = process.env.LEADS_LOG_PATH || path.join(process.cwd(), "var", "leads.jsonl");
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(lead)}\n`, "utf8");
}

export async function POST(request: NextRequest) {
  const body = await parseLeadRequest(request);

  // Honeypot: real users never fill this hidden field.
  if (text(body.website, 200)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  if (isRateLimited(rateLimitKey(request))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  if (!(await verifyTurnstile(body, request))) {
    return NextResponse.json({ ok: false, error: "turnstile_failed" }, { status: 400 });
  }

  const scenario = text(body.scenario, 160);
  const contact = text(body.contact, 180);
  const sourcePath = text(body.source_path, 255) || text(body.source, 255) || "site";
  const sourceUrl = text(body.source_url, 800) || text(request.headers.get("referer"), 800);
  const kind = inferKind(text(body.kind, 64), scenario);
  const idempotencyKey = text(body.idempotency_key, 120);
  const isTest = kind === "trade" && isTradeQaRequest(request);

  if (!contact) {
    return NextResponse.json({ ok: false, error: "contact_required" }, { status: 400 });
  }

  if (kind === "trade" && idempotencyKey) {
    const existingReference = await existingTradeReference(idempotencyKey, isTest);
    if (existingReference) {
      return NextResponse.json({
        ok: true,
        storage: "directus",
        reference_code: existingReference,
      });
    }
  }

  const quoteId = text(body.quote_id, 80);
  const targetProductId = text(body.target_product_id, 255);
  const targetOfferId = text(body.target_offer_id, 80);
  const storeLocationId = text(body.store_location_id, 80);
  const preferredVisitDate = text(body.preferred_visit_date, 10);
  const preferredVisitPeriod = text(body.preferred_visit_period, 24);
  const requestedContactChannel = text(body.contact_channel, 24);
  const contactChannel = ["phone", "telegram"].includes(requestedContactChannel)
    ? requestedContactChannel
    : inferContactChannel(contact);

  if (kind === "trade" && contactChannel === "phone" && !isValidPhoneNumber(contact)) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  if (!validVisitDate(preferredVisitDate)) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  if (preferredVisitPeriod && !["morning", "day", "evening"].includes(preferredVisitPeriod)) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  if (kind === "trade") {
    const tradeError = await validateTradeSubmission({
      scenario,
      quoteId,
      productId: targetProductId,
      offerId: targetOfferId,
      storeId: storeLocationId,
      isTest,
    });
    if (tradeError) {
      const status =
        tradeError === "quote_expired" || tradeError === "product_unavailable" ? 409 : 400;
      return NextResponse.json({ ok: false, error: tradeError }, { status });
    }
  }

  if (kind === "club" && !accepted(body.club_consent_accepted)) {
    return NextResponse.json({ ok: false, error: "club_consent_required" }, { status: 400 });
  }

  const clubOffer = text(body.club_offer, 255);
  const clubDeviceRequest = text(body.club_device_request, 255);
  if (kind === "club" && !clubOffer && !clubDeviceRequest) {
    return NextResponse.json({ ok: false, error: "club_device_required" }, { status: 400 });
  }

  const lead: StoredLead = {
    created_at: new Date().toISOString(),
    kind,
    status: "new",
    priority: "normal",
    contact_channel: contactChannel,
    name: text(body.name, 160),
    contact,
    product: text(body.product, 255),
    product_id: text(body.product_id, 255),
    product_type: ["device", "accessory"].includes(text(body.product_type, 32))
      ? text(body.product_type, 32)
      : "",
    device: text(body.device, 255),
    device_id: text(body.device_id, 255),
    quote_id: quoteId,
    target_product_id: targetProductId,
    target_offer_id: targetOfferId,
    store_location_id: storeLocationId,
    preferred_visit_date: preferredVisitDate,
    preferred_visit_period: preferredVisitPeriod,
    idempotency_key: idempotencyKey,
    reference_code: tradeReference(isTest),
    club_offer: clubOffer,
    club_plan: text(body.club_plan, 255),
    club_term_months: text(body.club_term_months, 32),
    club_budget_text: text(body.club_budget_text, 160),
    club_device_request: clubDeviceRequest,
    club_consent_version: text(body.club_consent_version, 120),
    club_consent_at: kind === "club" ? new Date().toISOString() : "",
    scenario,
    message: text(body.message, 2000),
    source: sourcePath,
    source_path: sourcePath,
    source_url: sourceUrl,
    page_title: text(body.page_title, 255),
    referrer: text(body.referrer, 800),
    utm_source: text(body.utm_source, 128),
    utm_medium: text(body.utm_medium, 128),
    utm_campaign: text(body.utm_campaign, 128),
    utm_content: text(body.utm_content, 128),
    utm_term: text(body.utm_term, 128),
    user_agent: text(request.headers.get("user-agent"), 800),
    is_test: isTest,
  };

  let savedToDirectus = await postToDirectus(lead);
  if (!savedToDirectus && idempotencyKey) {
    const existingReference = await existingTradeReference(idempotencyKey, isTest);
    if (existingReference) {
      lead.reference_code = existingReference;
      savedToDirectus = true;
    }
  }
  if (!savedToDirectus) {
    await appendLeadLog(lead);
  }

  return NextResponse.json({
    ok: true,
    storage: savedToDirectus ? "directus" : "log",
    reference_code: lead.reference_code,
  });
}
