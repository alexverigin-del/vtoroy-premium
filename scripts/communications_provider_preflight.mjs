#!/usr/bin/env node
/** Read-only MAX/VK resource check. It never changes subscriptions or callback settings. */
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";

export const MAX_REQUIRED_EVENTS = [
  "message_created",
  "message_callback",
  "message_edited",
  "bot_started",
  "bot_stopped",
];
export const VK_REQUIRED_EVENTS = ["message_new", "message_allow", "message_deny", "message_edit"];
export const VK_REQUIRED_PERMISSIONS = ["messages", "photos", "docs"];

const MAX_API = "https://platform-api2.max.ru";
const VK_API = "https://api.vk.ru/method";
const VK_VERSION = "5.199";
const VK_READ_METHODS = new Set([
  "groups.getById",
  "groups.getTokenPermissions",
  "groups.getCallbackServers",
  "groups.getCallbackSettings",
  "groups.getCallbackConfirmationCode",
]);

function required(config, key) {
  const value = String(config[key] ?? "").trim();
  if (!value) throw new Error(`Заполните ${key} в закрытом env-файле. Значение не выводится.`);
  return value;
}

function webhookUrl(config, key) {
  const value = required(config, key);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} должен быть корректным HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    parsed.hash
  ) {
    throw new Error(`${key} должен использовать HTTPS на стандартном порту без credentials и fragment.`);
  }
  return parsed.href;
}

function secret(config, key, pattern, hint) {
  const value = required(config, key);
  if (!pattern.test(value)) throw new Error(`${key}: ${hint}. Значение не выводится.`);
  return value;
}

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

async function requestJson(label, url, init, { fetchImpl, sleep }) {
  let response;
  let body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetchImpl(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      body = await response.json();
      break;
    } catch {
      if (attempt < 2) {
        await sleep(1_000 * (attempt + 1));
        continue;
      }
      throw new Error(`${label}: сеть или JSON-ответ недоступны; секретные детали скрыты.`);
    }
  }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}. Текст API скрыт.`);
  return body;
}

function enabledNames(values) {
  if (!values || typeof values !== "object") return [];
  if (Array.isArray(values)) {
    return values
      .filter((item) => item && typeof item.name === "string" && Number(item.setting) > 0)
      .map((item) => item.name);
  }
  return Object.entries(values)
    .filter(([, value]) => value === true || Number(value) > 0)
    .map(([name]) => name);
}

export async function inspectMax(config, { fetchImpl = fetch, sleep = pause } = {}) {
  const token = required(config, "MAX_BOT_TOKEN");
  if (/\s/.test(token) || token.length < 20) throw new Error("MAX_BOT_TOKEN имеет неверный формат.");
  const expectedId = required(config, "MAX_BOT_ID");
  if (!/^\d+$/.test(expectedId)) throw new Error("MAX_BOT_ID должен быть положительным числовым ID.");
  const expectedUsername = required(config, "MAX_BOT_USERNAME").replace(/^@/, "");
  const expectedUrl = webhookUrl(config, "MAX_WEBHOOK_URL");
  secret(
    config,
    "MAX_WEBHOOK_SECRET",
    /^[A-Za-z0-9_-]{16,256}$/,
    "нужно 16–256 символов A-Z, a-z, 0-9, _ или -",
  );

  const get = (path) => requestJson(`MAX GET ${path}`, `${MAX_API}${path}`, {
    method: "GET",
    headers: { Authorization: token, Accept: "application/json" },
  }, { fetchImpl, sleep });
  const bot = await get("/me");
  const subscriptionsBody = await get("/subscriptions");
  const subscriptions = Array.isArray(subscriptionsBody)
    ? subscriptionsBody
    : Array.isArray(subscriptionsBody?.subscriptions)
      ? subscriptionsBody.subscriptions
      : null;
  if (!subscriptions) throw new Error("MAX GET /subscriptions: получен неизвестный формат ответа.");

  const identityMatches =
    bot?.is_bot === true &&
    String(bot?.user_id) === expectedId &&
    String(bot?.username ?? "").replace(/^@/, "").toLowerCase() === expectedUsername.toLowerCase();
  const matches = subscriptions.filter((item) => item?.url === expectedUrl);
  const subscription = matches.length === 1 ? matches[0] : null;
  const enabledEvents = Array.isArray(subscription?.update_types) ? subscription.update_types : [];
  const missingEvents = MAX_REQUIRED_EVENTS.filter((event) => !enabledEvents.includes(event));
  const ready = identityMatches && matches.length === 1 && missingEvents.length === 0;
  const next = [];
  if (!identityMatches) next.push("Проверьте MAX_BOT_ID/MAX_BOT_USERNAME: токен принадлежит другому ресурсу.");
  if (matches.length === 0) next.push("Создайте MAX webhook-подписку на точный MAX_WEBHOOK_URL.");
  if (matches.length > 1) next.push("Удалите дублирующиеся MAX webhook-подписки для этого URL.");
  if (missingEvents.length) next.push(`Добавьте события MAX: ${missingEvents.join(", ")}.`);
  next.push("Секрет MAX подтверждается только подписанным тестовым webhook; GET API его не раскрывает.");

  return {
    platform: "max",
    checkedAt: new Date().toISOString(),
    api: "platform-api2.max.ru",
    resource: { id: String(bot?.user_id ?? ""), username: String(bot?.username ?? "") },
    identityMatches,
    webhook: {
      url: expectedUrl,
      matches: matches.length,
      enabledEvents: [...enabledEvents].sort(),
      requiredEvents: MAX_REQUIRED_EVENTS,
      missingEvents,
      localSecretConfigured: true,
      secretVerification: "live_webhook_required",
    },
    livePilotRequired: true,
    ready,
    next,
  };
}

export async function inspectVk(config, { fetchImpl = fetch, sleep = pause } = {}) {
  const token = required(config, "VK_GROUP_TOKEN");
  if (/\s/.test(token) || token.length < 20) throw new Error("VK_GROUP_TOKEN имеет неверный формат.");
  const groupId = required(config, "VK_GROUP_ID");
  if (!/^\d+$/.test(groupId) || groupId === "0") throw new Error("VK_GROUP_ID должен быть положительным числовым ID.");
  const expectedUrl = webhookUrl(config, "VK_WEBHOOK_URL");
  const expectedSecret = secret(
    config,
    "VK_WEBHOOK_SECRET",
    /^.{16,50}$/u,
    "нужно 16–50 символов без перевода строки",
  );
  if (/\r|\n/.test(expectedSecret)) throw new Error("VK_WEBHOOK_SECRET не должен содержать перевод строки.");
  const expectedConfirmation = required(config, "VK_CONFIRMATION");
  const requestedServerId = String(config.VK_CALLBACK_SERVER_ID ?? "").trim();
  if (requestedServerId && !/^\d+$/.test(requestedServerId)) {
    throw new Error("VK_CALLBACK_SERVER_ID должен быть числовым ID.");
  }

  async function api(method, params = {}) {
    if (!VK_READ_METHODS.has(method)) throw new Error("Метод не разрешён проверкой подключения.");
    const body = await requestJson(`VK ${method}`, `${VK_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...params, access_token: token, v: VK_VERSION }),
    }, { fetchImpl, sleep });
    if (body?.error) {
      const code = Number.isInteger(body.error.error_code) ? body.error.error_code : "unknown";
      throw new Error(`VK ${method}: ошибка API ${code}. Текст API скрыт.`);
    }
    if (!("response" in (body || {}))) throw new Error(`VK ${method}: получен неизвестный формат ответа.`);
    return body.response;
  }

  const groupResponse = await api("groups.getById", { group_id: groupId });
  const groups = Array.isArray(groupResponse) ? groupResponse : groupResponse?.groups;
  const group = Array.isArray(groups) ? groups[0] : null;
  const identityMatches = String(group?.id ?? "") === groupId;
  const permissionResponse = await api("groups.getTokenPermissions");
  const permissions = enabledNames(permissionResponse?.permissions);
  const missingPermissions = VK_REQUIRED_PERMISSIONS.filter((permission) => !permissions.includes(permission));
  const serversResponse = await api("groups.getCallbackServers", { group_id: groupId });
  const servers = Array.isArray(serversResponse?.items) ? serversResponse.items : [];
  const candidates = requestedServerId
    ? servers.filter((item) => String(item?.id) === requestedServerId)
    : servers.filter((item) => item?.url === expectedUrl);
  const server = candidates.length === 1 ? candidates[0] : null;

  let settings = null;
  let confirmationMatches = false;
  if (server) {
    settings = await api("groups.getCallbackSettings", { group_id: groupId, server_id: String(server.id) });
    const confirmation = await api("groups.getCallbackConfirmationCode", { group_id: groupId });
    confirmationMatches = sameSecret(String(confirmation?.code ?? ""), expectedConfirmation);
  }
  const enabledEvents = enabledNames(settings?.events);
  const missingEvents = VK_REQUIRED_EVENTS.filter((event) => !enabledEvents.includes(event));
  const urlMatches = server?.url === expectedUrl;
  const secretMatches = sameSecret(String(server?.secret_key ?? ""), expectedSecret);
  const statusOk = server?.status === "ok";
  const apiVersionMatches = settings?.api_version === VK_VERSION;
  const ready =
    identityMatches &&
    missingPermissions.length === 0 &&
    candidates.length === 1 &&
    urlMatches &&
    secretMatches &&
    confirmationMatches &&
    statusOk &&
    apiVersionMatches &&
    missingEvents.length === 0;
  const next = [];
  if (!identityMatches) next.push("Проверьте VK_GROUP_ID: токен не подтвердил ожидаемое сообщество.");
  if (missingPermissions.length) next.push(`Добавьте права токена VK: ${missingPermissions.join(", ")}.`);
  if (candidates.length === 0) next.push("Создайте callback-сервер VK для точного VK_WEBHOOK_URL.");
  if (candidates.length > 1) next.push("Укажите однозначный VK_CALLBACK_SERVER_ID.");
  if (server && !urlMatches) next.push("Исправьте URL выбранного callback-сервера VK.");
  if (server && !secretMatches) next.push("Секрет callback-сервера VK не совпадает с локальной настройкой.");
  if (server && !confirmationMatches) next.push("VK_CONFIRMATION не совпадает с кодом сообщества.");
  if (server && !statusOk) next.push("Добейтесь состояния callback-сервера VK status=ok.");
  if (server && !apiVersionMatches) next.push(`Установите версию Callback API VK ${VK_VERSION}.`);
  if (missingEvents.length) next.push(`Включите события VK: ${missingEvents.join(", ")}.`);
  next.push("Событие message_event и фактический ответ бота подтверждаются закрытым живым пилотом.");

  return {
    platform: "vk",
    checkedAt: new Date().toISOString(),
    api: "api.vk.ru",
    apiVersion: VK_VERSION,
    resource: {
      id: String(group?.id ?? ""),
      name: String(group?.name ?? ""),
      screenName: String(group?.screen_name ?? ""),
    },
    identityMatches,
    token: { enabledPermissions: permissions.sort(), requiredPermissions: VK_REQUIRED_PERMISSIONS, missingPermissions },
    webhook: {
      url: expectedUrl,
      selectedServerId: server ? String(server.id) : null,
      candidates: candidates.length,
      status: server?.status ?? null,
      urlMatches,
      secretMatches,
      confirmationMatches,
      apiVersion: settings?.api_version ?? null,
      apiVersionMatches,
      enabledEvents: enabledEvents.sort(),
      requiredEvents: VK_REQUIRED_EVENTS,
      missingEvents,
      runtimeEventChecks: ["message_event"],
    },
    livePilotRequired: true,
    ready,
    next,
  };
}

function redact(output, values) {
  return values.filter(Boolean).reduce((result, value) => result.split(value).join("[REDACTED]"), output);
}

async function main() {
  const args = process.argv.slice(2);
  let platform = "";
  let envPath = "work/private/communications-providers.env";
  let outputPath = "";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--platform" && args[index + 1]) platform = args[++index];
    else if (args[index] === "--env" && args[index + 1]) envPath = args[++index];
    else if (args[index] === "--output" && args[index + 1]) outputPath = args[++index];
    else throw new Error("Использование: node scripts/communications_provider_preflight.mjs --platform max|vk [--env путь] [--output путь]");
  }
  if (!["max", "vk"].includes(platform)) throw new Error("Укажите --platform max или --platform vk.");
  let config;
  try {
    config = parseEnv(await readFile(resolve(envPath), "utf8"));
  } catch {
    throw new Error("Не удалось прочитать закрытый env-файл. Его содержимое не выводится.");
  }
  const report = platform === "max" ? await inspectMax(config) : await inspectVk(config);
  const sensitive = platform === "max"
    ? [config.MAX_BOT_TOKEN, config.MAX_WEBHOOK_SECRET]
    : [config.VK_GROUP_TOKEN, config.VK_WEBHOOK_SECRET, config.VK_CONFIRMATION];
  const output = redact(`${JSON.stringify(report, null, 2)}\n`, sensitive);
  if (outputPath) {
    const target = resolve(outputPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output, { encoding: "utf8", mode: 0o600 });
    console.log(`Безопасный отчёт записан: ${target}`);
  } else {
    process.stdout.write(output);
  }
  if (!report.ready) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
