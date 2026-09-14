import { chmod, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const CONNECTION_ID = "7c4123ea-3330-4c56-9b14-bdf72f49ae7f";
const BOT_ID = "8694946838";

function safeSecret(value, name) {
  const clean = String(value || "").trim();
  if (!/^[A-Za-z0-9._~+/=-]{20,1000}$/.test(clean)) throw Error(`${name}_INVALID`);
  return clean;
}

export function telegramCommunicationsEnv(source) {
  const legacy = parseEnv(source);
  const platformToken = String(legacy.TELEGRAM_BOT_TOKEN || "").trim();
  const workerToken = safeSecret(legacy.TELEGRAM_DIRECTUS_TOKEN, "TELEGRAM_DIRECTUS_TOKEN");
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(platformToken)) throw Error("TELEGRAM_BOT_TOKEN_INVALID");
  if (platformToken.split(":", 1)[0] !== BOT_ID) throw Error("TELEGRAM_BOT_ID_MISMATCH");
  let directus;
  try {
    directus = new URL(legacy.TELEGRAM_DIRECTUS_URL);
  } catch {
    throw Error("TELEGRAM_DIRECTUS_URL_INVALID");
  }
  if (
    directus.protocol !== "https:" ||
    directus.hostname !== "api.isvoi.ru" ||
    directus.username ||
    directus.password ||
    directus.search ||
    directus.hash ||
    directus.pathname !== "/"
  ) throw Error("TELEGRAM_DIRECTUS_URL_INVALID");
  return [
    `COMM_CONNECTION_ID=${CONNECTION_ID}`,
    `COMM_DIRECTUS_URL=${directus.origin}`,
    `COMM_WORKER_TOKEN=${workerToken}`,
    "COMM_PLATFORM=telegram",
    `COMM_PLATFORM_TOKEN=${platformToken}`,
    "",
  ].join("\n");
}

if (process.argv[1]?.endsWith("prepare_telegram_communications_env.mjs")) {
  const [sourcePath, targetPath] = process.argv.slice(2);
  if (!sourcePath || !targetPath) throw Error("USE_SOURCE_AND_TARGET_PATH");
  const output = telegramCommunicationsEnv(await readFile(sourcePath, "utf8"));
  await writeFile(targetPath, output, { mode: 0o600 });
  await chmod(targetPath, 0o600);
  console.log("TELEGRAM_COMMUNICATIONS_ENV_READY");
}
