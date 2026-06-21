import { execFile } from "node:child_process";
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
  type?: string;
};

type ImportBatch = {
  id: string;
  batch_name?: string;
  workbook?: string | DirectusFile;
  photos_archive?: string | DirectusFile | null;
  default_status?: string | null;
};

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "yes", "apply", "import"].includes(value.toLowerCase());
  return false;
}

function safeName(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^-+|-+$/g, "");
  return clean || "catalog-batch";
}

function fileId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as DirectusFile).id || "");
  return "";
}

function filename(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const file = value as DirectusFile;
    return safeName(file.filename_download || file.title || fallback);
  }
  return fallback;
}

function extractBatchId(body: Record<string, unknown>, request: NextRequest): string {
  const fromQuery = text(request.nextUrl.searchParams.get("batch_id"));
  if (fromQuery) return fromQuery;

  const candidates: unknown[] = [
    body.batch_id,
    body.id,
    body.key,
    body.primary_key,
    body.item,
    body.keys,
    (body.$trigger as Record<string, unknown> | undefined)?.key,
    (body.$trigger as Record<string, unknown> | undefined)?.keys,
    (body.trigger as Record<string, unknown> | undefined)?.key,
    (body.trigger as Record<string, unknown> | undefined)?.keys,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return text(candidate[0]);
    const value = text(candidate);
    if (value && !value.includes("{{")) return value;
  }

  return "";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function truncate(value: string, max = 16000): string {
  return value.length > max ? value.slice(value.length - max) : value;
}

function assertInside(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe import path: ${child}`);
  }
}

async function resolveRepoRoot(): Promise<string> {
  if (process.env.CATALOG_IMPORT_REPO_ROOT) return process.env.CATALOG_IMPORT_REPO_ROOT;
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "scripts", "run_catalog_import_batch.sh"));
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return process.cwd();
}

async function readEnvFile(repoRoot: string): Promise<Record<string, string>> {
  const candidates = [
    path.join(repoRoot, "apps", "web", ".env.local"),
    path.join(process.cwd(), ".env.local"),
  ];
  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, "utf8");
      const values: Record<string, string> = {};
      for (const line of content.split(/\r?\n/)) {
        if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
        const [key, ...parts] = line.split("=");
        values[key.trim()] = parts.join("=").trim();
      }
      return values;
    } catch {
      // Try next candidate.
    }
  }
  return {};
}

async function config() {
  const repoRoot = await resolveRepoRoot();
  const fileEnv = await readEnvFile(repoRoot);
  const directusUrl = (
    process.env.DIRECTUS_URL
    || fileEnv.DIRECTUS_URL
    || process.env.NEXT_PUBLIC_DIRECTUS_URL
    || fileEnv.NEXT_PUBLIC_DIRECTUS_URL
    || ""
  ).replace(/\/+$/, "");
  const directusToken = process.env.CATALOG_IMPORT_DIRECTUS_TOKEN || fileEnv.CATALOG_IMPORT_DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
  const secret = process.env.CATALOG_IMPORT_WEBHOOK_SECRET || fileEnv.CATALOG_IMPORT_WEBHOOK_SECRET || "";
  const workRoot = process.env.CATALOG_IMPORT_WORKDIR || fileEnv.CATALOG_IMPORT_WORKDIR || "/opt/isvoi/imports/studio";

  if (!directusUrl || !directusToken) throw new Error("Directus URL/token is not configured.");
  if (!secret) throw new Error("Catalog import webhook secret is not configured.");
  return { directusUrl, directusToken, secret, workRoot, repoRoot };
}

type CatalogImportConfig = Awaited<ReturnType<typeof config>>;

function authorized(request: NextRequest, secret: string): boolean {
  const expected = secret.trim();
  const headerSecret = (request.headers.get("x-isvoi-import-secret") || "").trim();
  const bearerSecret = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const querySecret = (request.nextUrl.searchParams.get("secret") || "").trim();
  return headerSecret === expected || bearerSecret === expected || querySecret === expected;
}

async function directusRequest<T>(
  cfg: CatalogImportConfig,
  method: string,
  endpoint: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${cfg.directusUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.directusToken}`,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data as T;
}

async function patchBatch(cfg: CatalogImportConfig, id: string, payload: Record<string, unknown>): Promise<void> {
  await directusRequest(cfg, "PATCH", `/items/catalog_import_batches/${encodeURIComponent(id)}`, payload);
}

async function downloadDirectusFile(cfg: CatalogImportConfig, id: string, target: string): Promise<void> {
  const res = await fetch(`${cfg.directusUrl}/assets/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${cfg.directusToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Download file ${id} failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(target, bytes);
}

async function runCommand(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout, stderr } = await execFileAsync("bash", ["-lc", command], {
    cwd,
    env,
    timeout: 1000 * 60 * 20,
    maxBuffer: 1024 * 1024 * 8,
  });
  return [stdout, stderr].filter(Boolean).join("\n");
}

export async function POST(request: NextRequest) {
  let cfg: CatalogImportConfig;
  try {
    cfg = await config();
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }

  if (!authorized(request, cfg.secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const batchId = extractBatchId(body, request);
  const apply = bool(body.apply ?? request.nextUrl.searchParams.get("apply"));
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "batch_id_required" }, { status: 400 });
  }

  try {
    const batches = await directusRequest<ImportBatch[]>(
      cfg,
      "GET",
      `/items/catalog_import_batches?filter[id][_eq]=${encodeURIComponent(batchId)}&limit=1&fields=*,workbook.*,photos_archive.*`,
    );
    const batch = batches[0];
    if (!batch) {
      return NextResponse.json({ ok: false, batch_id: batchId, error: "batch_not_found" }, { status: 404 });
    }

    const workbookId = fileId(batch.workbook);
    const archiveId = fileId(batch.photos_archive);
    if (!workbookId) throw new Error("Batch workbook is required.");
    if (!archiveId) throw new Error("Batch photos_archive ZIP is required.");

    const batchName = safeName(batch.batch_name || `batch-${batch.id}`);
    const mode = apply ? "apply" : "dry_run";
    const targetDir = path.resolve(cfg.workRoot, batchName);
    assertInside(path.resolve(cfg.workRoot), targetDir);

    await patchBatch(cfg, batch.id, {
      status: "running",
      last_run_mode: mode,
      last_run_status: "running",
      last_run_at: new Date().toISOString(),
      last_run_log: "Preparing batch files...",
    });

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });
    const workbookPath = path.join(targetDir, filename(batch.workbook, "stock.xlsx"));
    const archivePath = path.join(targetDir, filename(batch.photos_archive, "photos.zip"));
    const incomingPath = path.join(targetDir, "incoming");
    const optimizedPath = path.join(targetDir, "optimized");

    await downloadDirectusFile(cfg, workbookId, workbookPath);
    await downloadDirectusFile(cfg, archiveId, archivePath);
    await fs.mkdir(incomingPath, { recursive: true });

    const unzipLog = await runCommand(
      `unzip -q -o ${shellQuote(archivePath)} -d ${shellQuote(incomingPath)}`,
      cfg.repoRoot,
      process.env,
    );
    const command = [
      "set -euo pipefail",
      "if [ -d .venv ]; then . .venv/bin/activate; fi",
      `python scripts/optimize_images.py --src ${shellQuote(incomingPath)} --out ${shellQuote(optimizedPath)} --max 2400 --quality 88`,
      [
        "bash scripts/run_catalog_import_batch.sh",
        `--file ${shellQuote(workbookPath)}`,
        `--assets-root ${shellQuote(optimizedPath)}`,
        `--batch ${shellQuote(batchName)}`,
        `--default-status ${shellQuote(text(batch.default_status, "draft"))}`,
        apply ? "--apply" : "",
      ].filter(Boolean).join(" "),
    ].join(" && ");

    const output = await runCommand(command, cfg.repoRoot, {
      ...process.env,
      DIRECTUS_URL: cfg.directusUrl,
      DIRECTUS_TOKEN: cfg.directusToken,
    });
    const log = truncate([unzipLog, output].filter(Boolean).join("\n"));

    await patchBatch(cfg, batch.id, {
      status: apply ? "imported" : "checked",
      last_run_status: "success",
      last_run_log: log || "Done.",
      last_run_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, batch_id: batch.id, mode, log });
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
