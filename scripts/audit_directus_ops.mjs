#!/usr/bin/env node
/**
 * Audit production Directus operational guardrails without printing secrets.
 */

import { spawnSync } from "node:child_process";

const sshKey = process.env.DIRECTUS_AUDIT_SSH_KEY || "C:\\Users\\1\\.ssh\\isvoi_beget_ed25519";
const sshTarget = process.env.DIRECTUS_AUDIT_SSH_TARGET || "deploy@217.114.14.32";
const stackDir = process.env.DIRECTUS_AUDIT_STACK_DIR || "/opt/isvoi/infra/directus-beget";

function ssh(command) {
  const result = spawnSync("ssh", ["-i", sshKey, sshTarget, command], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `ssh command failed: ${command}`);
  }
  return result.stdout;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function expectIncludes(label, value, expected) {
  if (!value.includes(expected)) fail(`${label}: expected to include ${expected}`);
  else console.log(`${label}: ok`);
}

const ps = ssh(`cd ${stackDir} && docker compose ps`);
expectIncludes("directus.port.localhost", ps, "127.0.0.1:8055->8055/tcp");
expectIncludes("directus.container.up", ps, "directus-beget-directus-1");
expectIncludes("redis.container.up", ps, "directus-beget-cache-1");
expectIncludes("postgres.container.healthy", ps, "directus-beget-database-1");

const images = ssh(`cd ${stackDir} && docker compose images`);
expectIncludes("directus.image.pinned", images, "directus/directus");
expectIncludes("directus.image.version", images, "11.17.4");
expectIncludes("redis.image", images, "redis");
expectIncludes("postgres.image", images, "postgres");

const envOutput = ssh(
  `cd ${stackDir} && grep -E '^(PUBLIC_URL|CORS_ORIGIN|CACHE_ENABLED|CACHE_TTL|CACHE_AUTO_PURGE|CACHE_NAMESPACE|MARKETPLACE_TRUST|FILES_MAX_UPLOAD_SIZE|FILES_MIME_TYPE_ALLOW_LIST|IMPORT_IP_DENY_LIST|WEBSOCKETS_ENABLED)=' .env`,
);
const env = Object.fromEntries(
  envOutput
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const expectedEnv = {
  PUBLIC_URL: "https://api.isvoi.ru",
  CORS_ORIGIN: "https://isvoi.ru,https://www.isvoi.ru,https://api.isvoi.ru",
  CACHE_ENABLED: "true",
  CACHE_TTL: "5m",
  CACHE_AUTO_PURGE: "true",
  CACHE_NAMESPACE: "isvoi-directus-",
  MARKETPLACE_TRUST: "sandbox",
  FILES_MAX_UPLOAD_SIZE: "100mb",
  IMPORT_IP_DENY_LIST:
    "0.0.0.0,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10",
  WEBSOCKETS_ENABLED: "true",
};

for (const [key, expected] of Object.entries(expectedEnv)) {
  if (env[key] !== expected) fail(`${key}: expected ${expected}, got ${env[key] || "<unset>"}`);
  else console.log(`${key}: ok`);
}

const mime = env.FILES_MIME_TYPE_ALLOW_LIST || "";
for (const type of [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]) {
  expectIncludes("FILES_MIME_TYPE_ALLOW_LIST", mime, type);
}

const backupStatus = ssh(
  `if [ -d /opt/isvoi/backups/directus ]; then find /opt/isvoi/backups/directus -maxdepth 2 -name SHA256SUMS | sort | tail -1; fi`,
).trim();
if (!backupStatus) {
  fail("backup.latest_sha256: missing local backup SHA256SUMS under /opt/isvoi/backups/directus");
} else {
  console.log(`backup.latest_sha256: ${backupStatus}`);
}

const revalidationSecret = ssh(
  `if grep -Eq '^SITE_REVALIDATION_SECRET=.{32,}$' /opt/isvoi/apps/web/.env.local; then echo configured; fi`,
).trim();
if (revalidationSecret !== "configured") {
  fail("site_revalidation.secret: missing or shorter than 32 characters");
} else {
  console.log("site_revalidation.secret: configured");
}

if (process.exitCode) {
  console.error("Directus ops audit failed.");
  process.exit(process.exitCode);
}

console.log("Directus ops audit passed.");
