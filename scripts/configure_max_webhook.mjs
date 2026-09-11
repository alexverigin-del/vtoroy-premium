#!/usr/bin/env node
/** Explicit MAX webhook registration. Unknown POST outcomes are never retried automatically. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { createMaxApiFetch } from "../packages/communications/max-api-fetch.mjs";
import { inspectMax, MAX_REQUIRED_EVENTS } from "./communications_provider_preflight.mjs";

const MAX_SUBSCRIPTIONS = "https://platform-api2.max.ru/subscriptions";

async function register(config, events, fetchImpl) {
  let response;
  let body;
  try {
    response = await fetchImpl(MAX_SUBSCRIPTIONS, {
      method: "POST",
      headers: {
        Authorization: String(config.MAX_BOT_TOKEN).trim(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: String(config.MAX_WEBHOOK_URL).trim(),
        update_types: events,
        secret: String(config.MAX_WEBHOOK_SECRET).trim(),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    body = await response.json();
  } catch {
    throw new Error(
      "MAX POST /subscriptions: результат неизвестен. Повторите read-only preflight; POST автоматически не повторяется.",
    );
  }
  if (!response.ok || body?.success !== true) {
    const code = response.ok ? "API_REJECTED" : `HTTP_${response.status}`;
    throw new Error(`MAX POST /subscriptions: ${code}. Текст API и секреты скрыты.`);
  }
}

export async function configureMaxWebhook(
  config,
  {
    apply = false,
    confirmation = "",
    fetchImpl = createMaxApiFetch(config.MAX_CA_CERT_PATH),
    sleep = pause,
  } = {},
) {
  const before = await inspectMax(config, { fetchImpl, sleep });
  if (before.ready) return { changed: false, before, after: before };
  if (!apply) return { changed: false, before, after: null };
  const expectedUrl = String(config.MAX_WEBHOOK_URL ?? "").trim();
  if (confirmation !== expectedUrl) throw new Error("WEBHOOK_CONFIRMATION_REQUIRED");
  if (!before.identityMatches) throw new Error("MAX_IDENTITY_MISMATCH");
  if (before.webhook.matches > 1) throw new Error("MAX_DUPLICATE_SUBSCRIPTIONS");

  const events = [...new Set([...before.webhook.enabledEvents, ...MAX_REQUIRED_EVENTS])].sort();
  await register(config, events, fetchImpl);
  const after = await inspectMax(config, { fetchImpl, sleep });
  if (!after.ready) throw new Error("MAX_WEBHOOK_VERIFICATION_FAILED");
  return { changed: true, before, after };
}

async function main() {
  const args = process.argv.slice(2);
  let envPath = "work/private/communications-providers.env";
  let apply = false;
  let confirmation = "";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--env" && args[index + 1]) envPath = args[++index];
    else if (args[index] === "--apply") apply = true;
    else if (args[index] === "--confirm-webhook" && args[index + 1]) confirmation = args[++index];
    else
      throw new Error(
        "Использование: node scripts/configure_max_webhook.mjs [--env путь] [--apply --confirm-webhook URL]",
      );
  }
  let config;
  try {
    config = parseEnv(await readFile(resolve(envPath), "utf8"));
  } catch {
    throw new Error("Не удалось прочитать закрытый env-файл. Его содержимое не выводится.");
  }
  const result = await configureMaxWebhook(config, { apply, confirmation });
  process.stdout.write(
    `${JSON.stringify(
      {
        platform: "max",
        changed: result.changed,
        readyBefore: result.before.ready,
        readyAfter: result.after?.ready ?? false,
        webhookUrl: result.before.webhook.url,
        missingEventsBefore: result.before.webhook.missingEvents,
        livePilotRequired: true,
      },
      null,
      2,
    )}\n`,
  );
  if (!apply && !result.before.ready) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const code = /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
      ? error.message
      : error.message.startsWith("MAX POST /subscriptions:")
        ? error.message
        : "MAX_WEBHOOK_CONFIGURATION_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}
