import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeadRequest = {
  scenario?: unknown;
  device?: unknown;
  contact?: unknown;
  source?: unknown;
  website?: unknown;
};

type StoredLead = {
  created_at: string;
  kind: string;
  contact: string;
  message: string;
  source: string;
  status: "new";
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function inferKind(scenario: string): string {
  const value = scenario.toLowerCase();
  if (value.includes("trade") || value.includes("оцен") || value.includes("передать")) {
    return "trade";
  }
  if (value.includes("club")) return "club";
  if (value.includes("обнов")) return "upgrade";
  return "selection";
}

async function parseLeadRequest(request: NextRequest): Promise<LeadRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as LeadRequest;
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

  try {
    const directusLead = {
      kind: lead.kind,
      contact: lead.contact,
      message: lead.message,
      source: lead.source,
      status: lead.status,
    };
    const response = await fetch(`${directusUrl}/items/leads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(directusLead),
      cache: "no-store",
    });

    return response.ok;
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

  const scenario = text(body.scenario, 120);
  const device = text(body.device, 240);
  const contact = text(body.contact, 160);
  const source = text(body.source, 160) || text(request.headers.get("referer"), 160) || "site";

  if (!contact) {
    return NextResponse.json(
      { ok: false, error: "contact_required" },
      { status: 400 },
    );
  }

  const lead: StoredLead = {
    created_at: new Date().toISOString(),
    kind: inferKind(scenario),
    contact,
    message: [
      scenario ? `Сценарий: ${scenario}` : "",
      device ? `Интерес: ${device}` : "",
    ].filter(Boolean).join("\n"),
    source,
    status: "new",
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
