#!/usr/bin/env node
/**
 * Export the running Directus schema snapshot through the Directus API.
 *
 * Usage:
 *   DIRECTUS_URL=https://api.isvoi.ru DIRECTUS_TOKEN=... npm run directus:schema:snapshot
 *   npm run directus:schema:snapshot -- --out directus/schema/snapshots/current.json
 *   npm run directus:schema:snapshot -- --stdout
 *
 * The token must be allowed to read schema metadata. Do not commit admin tokens.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUT = "directus/schema/snapshots/current.json";

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    stdout: false,
    pretty: true,
    url: "",
    token: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdout") {
      args.stdout = true;
    } else if (arg === "--compact") {
      args.pretty = false;
    } else if (arg === "--out") {
      args.out = argv[++index] ?? "";
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else if (arg === "--url") {
      args.url = argv[++index] ?? "";
    } else if (arg.startsWith("--url=")) {
      args.url = arg.slice("--url=".length);
    } else if (arg === "--token") {
      args.token = argv[++index] ?? "";
    } else if (arg.startsWith("--token=")) {
      args.token = arg.slice("--token=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Export Directus schema snapshot.

Options:
  --out <path>     Output file. Default: ${DEFAULT_OUT}
  --stdout         Print JSON to stdout instead of writing a file.
  --compact        Minify JSON output.
  --url <url>      Directus URL. Falls back to DIRECTUS_URL/NEXT_PUBLIC_DIRECTUS_URL.
  --token <token>  Directus token. Falls back to DIRECTUS_TOKEN.
`);
}

async function loadEnvFile(file) {
  try {
    const text = await readFile(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      value = value.replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] == null) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function loadEnv() {
  await loadEnvFile(".env");
  await loadEnvFile("scripts/.env");
  await loadEnvFile("apps/web/.env.local");
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])]),
  );
}

async function requestSnapshot(url, token) {
  const res = await fetch(`${url}/schema/snapshot`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint = res.status === 401 || res.status === 403
      ? "Token is not allowed to read schema metadata. Use a temporary admin/schema token, then remove it from your shell history/env."
      : "Directus schema snapshot request failed.";
    throw new Error(`${hint} HTTP ${res.status}. ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  return json?.data ?? json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnv();

  const url = normalizeUrl(args.url || process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_DIRECTUS_URL);
  const token = args.token || process.env.DIRECTUS_TOKEN || "";
  if (!url) throw new Error("DIRECTUS_URL is required.");
  if (!token) throw new Error("DIRECTUS_TOKEN is required.");
  if (!args.stdout && !args.out) throw new Error("--out path is required unless --stdout is used.");

  const snapshot = sortObject(await requestSnapshot(url, token));
  const json = `${JSON.stringify(snapshot, null, args.pretty ? 2 : 0)}\n`;

  if (args.stdout) {
    process.stdout.write(json);
    return;
  }

  const out = path.resolve(args.out);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, json, "utf8");
  console.log(`Directus schema snapshot written: ${path.relative(process.cwd(), out)}`);
}

main().catch((error) => {
  console.error(`Schema snapshot error: ${error.message}`);
  process.exit(1);
});
