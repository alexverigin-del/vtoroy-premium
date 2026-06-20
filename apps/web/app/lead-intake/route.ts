import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeadRequest = {
  kind?: unknown;
  scenario?: unknown;
  name?: unknown;
  contact?: unknown;
  device?: unknown;
  device_id?: unknown;
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
};

type StoredLead = {
  created_at: string;
  kind: string;
  status: "new";
  priority: "normal";
  name: string;
  contact: string;
  device: string;
  device_id: string;
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
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function inferKind(kind: string, scenario: string): string {
  const explicit = kind.toLowerCase();
  if (["purchase", "selection", "trade", "club", "upgrade", "support"].includes(explicit)) {
    return explicit;
  }

  const value = scenario.toLowerCase();
  if (value.includes("trade") || value.includes("оцен") || value.includes("передать")) return "trade";
  if (value.includes("club")) return "club";
  if (value.includes("обнов")) return "upgrade";
  if (
    value.includes("забронировать")
    || value.includes("купить")
    || value.includes("брон")
    || value.includes("лист ожидания")
  ) return "purchase";
  if (value.includes("похож") || value.includes("альтернатив")) return "selection";
  return "selection";
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

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries()) as LeadRequest;
  }

  return {};
}

async function postToDirectus(lead: StoredLead): Promise<boolean> {
  const directusUrl = (process.env.DIRECTUS_URL ?? process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "").replace(/\/+$/, "");
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
    const directusLead: Omit<StoredLead, "created_at"> = {
      kind: lead.kind,
      status: lead.status,
      priority: lead.priority,
      name: lead.name,
      contact: lead.contact,
      device: lead.device,
      device_id: lead.device_id,
      scenario: lead.scenario,
      message: lead.message,
      source: lead.source,
      source_path: lead.source_path,
      source_url: lead.source_url,
      page_title: lead.page_title,
      referrer: lead.referrer,
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_content: lead.utm_content,
      utm_term: lead.utm_term,
      user_agent: lead.user_agent,
    };
    const response = await postPayload(directusLead);
    if (response?.ok) return true;

    const fallbackMessage = [
      lead.scenario ? `Сценарий: ${lead.scenario}` : "",
      lead.message ? `Комментарий: ${lead.message}` : "",
      lead.device_id ? `Device ID: ${lead.device_id}` : "",
      lead.source_url ? `URL: ${lead.source_url}` : "",
      lead.page_title ? `Page title: ${lead.page_title}` : "",
      lead.referrer ? `Referrer: ${lead.referrer}` : "",
      lead.utm_source ? `UTM source: ${lead.utm_source}` : "",
      lead.utm_medium ? `UTM medium: ${lead.utm_medium}` : "",
      lead.utm_campaign ? `UTM campaign: ${lead.utm_campaign}` : "",
      lead.utm_content ? `UTM content: ${lead.utm_content}` : "",
      lead.utm_term ? `UTM term: ${lead.utm_term}` : "",
    ].filter(Boolean).join("\n");

    const legacyResponse = await postPayload({
      kind: lead.kind,
      status: lead.status,
      name: lead.name,
      contact: lead.contact,
      device: lead.device,
      message: fallbackMessage || lead.message,
      source: lead.source_path || lead.source,
    });

    return Boolean(legacyResponse?.ok);
  } catch {
    return false;
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

  const scenario = text(body.scenario, 160);
  const contact = text(body.contact, 180);
  const sourcePath = text(body.source_path, 255) || text(body.source, 255) || "site";
  const sourceUrl = text(body.source_url, 800) || text(request.headers.get("referer"), 800);

  if (!contact) {
    return NextResponse.json(
      { ok: false, error: "contact_required" },
      { status: 400 },
    );
  }

  const lead: StoredLead = {
    created_at: new Date().toISOString(),
    kind: inferKind(text(body.kind, 64), scenario),
    status: "new",
    priority: "normal",
    name: text(body.name, 160),
    contact,
    device: text(body.device, 255),
    device_id: text(body.device_id, 255),
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
  };

  const savedToDirectus = await postToDirectus(lead);
  if (!savedToDirectus) {
    await appendLeadLog(lead);
  }

  return NextResponse.json({
    ok: true,
    storage: savedToDirectus ? "directus" : "log",
  });
}
