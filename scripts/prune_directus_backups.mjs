#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, lstat, rm } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const BACKUP_NAME = /^(\d{8}T\d{6}Z)(?:-.+)?$/;

function parseStamp(name) {
  const match = BACKUP_NAME.exec(name);
  if (!match) return null;
  const value = match[1];
  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`,
  );
  return Number.isNaN(date.valueOf()) ? null : date;
}

function isoWeekKey(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value - yearStart) / DAY_MS + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function selectRetention(entries, now = new Date()) {
  const recognized = entries
    .map((entry) => ({ ...entry, stamp: parseStamp(entry.name) }))
    .filter((entry) => entry.stamp)
    .sort((a, b) => a.stamp - b.stamp || a.name.localeCompare(b.name));
  const keep = new Set(entries.filter((entry) => !parseStamp(entry.name)).map((entry) => entry.name));
  const daily = new Map();
  const weekly = new Map();
  const monthly = new Map();

  for (const entry of recognized) {
    const ageDays = (now - entry.stamp) / DAY_MS;
    if (ageDays < 0 || ageDays <= 7) {
      keep.add(entry.name);
    } else if (ageDays <= 30) {
      daily.set(entry.stamp.toISOString().slice(0, 10), entry.name);
    } else if (ageDays <= 84) {
      weekly.set(isoWeekKey(entry.stamp), entry.name);
    } else if (ageDays <= 365) {
      monthly.set(entry.stamp.toISOString().slice(0, 7), entry.name);
    }
  }
  for (const name of [...daily.values(), ...weekly.values(), ...monthly.values()]) keep.add(name);
  if (recognized.length) keep.add(recognized.at(-1).name);

  return {
    keep: entries.filter((entry) => keep.has(entry.name)).map((entry) => entry.name).sort(),
    remove: recognized.filter((entry) => !keep.has(entry.name)).map((entry) => entry.name).sort(),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rootArgument = process.argv.find((value) => value.startsWith("--root="));
  const root = resolve(rootArgument?.slice("--root=".length) || process.env.BACKUP_DIR || "/opt/isvoi/backups/directus");
  const now = process.env.BACKUP_RETENTION_NOW ? new Date(process.env.BACKUP_RETENTION_NOW) : new Date();
  if (Number.isNaN(now.valueOf())) throw new Error("BACKUP_RETENTION_NOW must be an ISO timestamp");
  const dirents = await readdir(root, { withFileTypes: true });
  const entries = dirents.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => ({ name: entry.name }));
  const selection = selectRetention(entries, now);
  const manifest = `${selection.remove.map((name) => resolve(root, name)).join("\n")}${selection.remove.length ? "\n" : ""}`;
  const manifestSha256 = createHash("sha256").update(manifest).digest("hex");

  if (apply) {
    for (const name of selection.remove) {
      if (!BACKUP_NAME.test(name)) throw new Error(`Refusing unexpected backup name: ${name}`);
      const target = resolve(root, name);
      if (dirname(target) !== root || basename(target) !== name) throw new Error(`Refusing path outside backup root: ${target}`);
      const stats = await lstat(target);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Refusing non-directory backup: ${target}`);
      await rm(target, { recursive: true, force: false });
    }
  }

  console.log(`DIRECTUS_BACKUP_RETENTION mode=${apply ? "apply" : "dry-run"} keep=${selection.keep.length} remove=${selection.remove.length} manifest_sha256=${manifestSha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
