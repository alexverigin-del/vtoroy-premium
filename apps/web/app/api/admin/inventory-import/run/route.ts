import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type DirectusFile = {
  id: string;
  filename_download?: string;
  title?: string;
};

type InventoryBatch = {
  id: string;
  batch_name?: string;
  source_system?: string;
  inventory_workbook?: string | DirectusFile;
  receipts_workbook?: string | DirectusFile | null;
  confirm_missing_deactivation?: boolean;
};

type PipelineSummary = {
  inventory?: { rows?: number; units?: number };
  receipts?: { rows?: number };
  issues?: { blockers?: number; warnings?: number };
};

const BATCH_FIELDS = [
  "id",
  "batch_name",
  "source_system",
  "confirm_missing_deactivation",
  "inventory_workbook.id",
  "inventory_workbook.filename_download",
  "inventory_workbook.title",
  "receipts_workbook.id",
  "receipts_workbook.filename_download",
  "receipts_workbook.title",
].join(",");

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return typeof value === "string" && ["1", "true", "yes", "apply"].includes(value.toLowerCase());
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^-+|-+$/g, "") || "inventory-batch";
}

function fileId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value)
    return String((value as DirectusFile).id || "");
  return "";
}

function filename(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const file = value as DirectusFile;
    return safeName(file.filename_download || file.title || fallback);
  }
  return fallback;
}

function sameSecret(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorized(request: NextRequest, expected: string): boolean {
  const header = (request.headers.get("x-isvoi-import-secret") || "").trim();
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return sameSecret(header, expected) || sameSecret(bearer, expected);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function truncate(value: string, max = 16000): string {
  return value.length > max ? value.slice(value.length - max) : value;
}

function assertInside(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("unsafe_inventory_path");
}

function extractBatchId(body: Record<string, unknown>, request: NextRequest): string {
  const candidates: unknown[] = [
    body.batch_id,
    body.id,
    body.key,
    body.primary_key,
    body.item,
    body.keys,
    (body.$trigger as Record<string, unknown> | undefined)?.key,
    (body.$trigger as Record<string, unknown> | undefined)?.keys,
  ];
  const query = text(request.nextUrl.searchParams.get("batch_id"));
  if (query) return query;
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return text(candidate[0]);
    const value = text(candidate);
    if (value && !value.includes("{{")) return value;
  }
  return "";
}

async function resolveRepoRoot(): Promise<string> {
  if (process.env.INVENTORY_IMPORT_REPO_ROOT) return process.env.INVENTORY_IMPORT_REPO_ROOT;
  for (const candidate of [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ]) {
    try {
      await fs.access(path.join(candidate, "scripts", "inventory_pipeline.py"));
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return process.cwd();
}

async function readEnvFile(repoRoot: string): Promise<Record<string, string>> {
  for (const candidate of [
    path.join(repoRoot, "apps", "web", ".env.local"),
    path.join(process.cwd(), ".env.local"),
  ]) {
    try {
      const values: Record<string, string> = {};
      for (const line of (await fs.readFile(candidate, "utf8")).split(/\r?\n/)) {
        if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
        const [key, ...parts] = line.split("=");
        values[key.trim()] = parts.join("=").trim();
      }
      return values;
    } catch {
      // Try the next candidate.
    }
  }
  return {};
}

async function config() {
  const repoRoot = await resolveRepoRoot();
  const fileEnv = await readEnvFile(repoRoot);
  const directusUrl = text(
    process.env.DIRECTUS_URL ||
      fileEnv.DIRECTUS_URL ||
      process.env.NEXT_PUBLIC_DIRECTUS_URL ||
      fileEnv.NEXT_PUBLIC_DIRECTUS_URL,
  ).replace(/\/+$/, "");
  const token = text(
    process.env.INVENTORY_IMPORT_DIRECTUS_TOKEN ||
      fileEnv.INVENTORY_IMPORT_DIRECTUS_TOKEN ||
      process.env.CATALOG_IMPORT_DIRECTUS_TOKEN ||
      fileEnv.CATALOG_IMPORT_DIRECTUS_TOKEN ||
      process.env.DIRECTUS_TOKEN,
  );
  const secret = text(
    process.env.INVENTORY_IMPORT_WEBHOOK_SECRET ||
      fileEnv.INVENTORY_IMPORT_WEBHOOK_SECRET ||
      process.env.CATALOG_IMPORT_WEBHOOK_SECRET ||
      fileEnv.CATALOG_IMPORT_WEBHOOK_SECRET,
  );
  const workRoot = text(
    process.env.INVENTORY_IMPORT_WORKDIR || fileEnv.INVENTORY_IMPORT_WORKDIR,
    "/opt/isvoi/imports/inventory",
  );
  if (!directusUrl || !token) throw new Error("inventory_directus_not_configured");
  if (!secret) throw new Error("inventory_webhook_not_configured");
  return { repoRoot, directusUrl, token, secret, workRoot };
}

type Config = Awaited<ReturnType<typeof config>>;

async function directusRequest<T>(
  cfg: Config,
  method: string,
  endpoint: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${cfg.directusUrl}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Directus ${method} failed: ${response.status}`);
  return json.data as T;
}

async function patchBatch(
  cfg: Config,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await directusRequest(
    cfg,
    "PATCH",
    `/items/inventory_import_batches/${encodeURIComponent(id)}`,
    payload,
  );
}

async function downloadFile(cfg: Config, id: string, target: string): Promise<void> {
  const response = await fetch(`${cfg.directusUrl}/assets/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`inventory_file_download_failed:${response.status}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function runPipeline(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout, stderr } = await execFileAsync("bash", ["-lc", command], {
    cwd,
    env,
    timeout: 1000 * 60 * 10,
    maxBuffer: 1024 * 1024 * 8,
  });
  if (stderr.trim()) throw new Error(stderr.trim());
  return stdout.trim();
}

export async function POST(request: NextRequest) {
  let cfg: Config;
  try {
    cfg = await config();
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
  if (!authorized(request, cfg.secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const batchId = extractBatchId(body, request);
  const apply = bool(body.apply ?? request.nextUrl.searchParams.get("apply"));
  if (!batchId)
    return NextResponse.json({ ok: false, error: "batch_id_required" }, { status: 400 });

  try {
    const batches = await directusRequest<InventoryBatch[]>(
      cfg,
      "GET",
      `/items/inventory_import_batches?filter[id][_eq]=${encodeURIComponent(batchId)}&limit=1&fields=${BATCH_FIELDS}`,
    );
    const batch = batches[0];
    if (!batch) return NextResponse.json({ ok: false, error: "batch_not_found" }, { status: 404 });
    const inventoryId = fileId(batch.inventory_workbook);
    const receiptsId = fileId(batch.receipts_workbook);
    if (!inventoryId) throw new Error("inventory_workbook_required");

    const batchName = safeName(batch.batch_name || `inventory-${batch.id}`);
    const targetDir = path.resolve(cfg.workRoot, batchName);
    assertInside(path.resolve(cfg.workRoot), targetDir);
    await patchBatch(cfg, batch.id, {
      status: "running",
      last_run_mode: apply ? "apply" : "dry_run",
      last_run_status: "running",
      last_run_at: new Date().toISOString(),
      last_run_log: "Preparing inventory files...",
    });

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });
    const inventoryPath = path.join(
      targetDir,
      filename(batch.inventory_workbook, "inventory.xlsx"),
    );
    const receiptsPath = receiptsId
      ? path.join(targetDir, filename(batch.receipts_workbook, "receipts.xlsx"))
      : "";
    await downloadFile(cfg, inventoryId, inventoryPath);
    if (receiptsId) await downloadFile(cfg, receiptsId, receiptsPath);

    const command = [
      "set -euo pipefail",
      "if [ -d .venv ]; then . .venv/bin/activate; fi",
      [
        "python scripts/inventory_pipeline.py",
        `--inventory ${shellQuote(inventoryPath)}`,
        receiptsPath ? `--receipts ${shellQuote(receiptsPath)}` : "",
        `--batch ${shellQuote(batchName)}`,
        `--batch-id ${shellQuote(batch.id)}`,
        `--source-system ${shellQuote(text(batch.source_system, "store_inventory"))}`,
        batch.confirm_missing_deactivation ? "--confirm-missing-deactivation" : "",
        apply ? "--apply" : "",
      ]
        .filter(Boolean)
        .join(" "),
    ].join(" && ");
    const output = await runPipeline(command, cfg.repoRoot, {
      ...process.env,
      DIRECTUS_URL: cfg.directusUrl,
      INVENTORY_IMPORT_DIRECTUS_TOKEN: cfg.token,
    });
    const summary = JSON.parse(output) as PipelineSummary;
    const blockers = Number(summary.issues?.blockers || 0);
    await patchBatch(cfg, batch.id, {
      status: apply ? (blockers > 0 ? "applied_with_blocks" : "applied") : "checked",
      inventory_rows: Number(summary.inventory?.rows || 0),
      inventory_units: Number(summary.inventory?.units || 0),
      receipt_rows: Number(summary.receipts?.rows || 0),
      blocker_count: blockers,
      warning_count: Number(summary.issues?.warnings || 0),
      last_run_status: "success",
      last_run_log: truncate(output),
      last_run_at: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      batch_id: batch.id,
      mode: apply ? "apply" : "dry_run",
      summary,
    });
  } catch (error) {
    const message = (error as Error).message;
    await patchBatch(cfg, batchId, {
      status: "failed",
      last_run_status: "failed",
      last_run_log: truncate(message),
      last_run_at: new Date().toISOString(),
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, batch_id: batchId, error: message }, { status: 500 });
  }
}
