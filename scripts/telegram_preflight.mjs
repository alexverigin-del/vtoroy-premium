#!/usr/bin/env node
/** Read-only Telegram setup check. Never sends messages or changes the webhook. */
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

const READ_METHODS = new Set(["getMe", "getWebhookInfo", "getUpdates", "getChat", "getChatMember"]);

export async function inspectTelegram(config, { discover = false, fetchImpl = fetch, sleep = pause } = {}) {
  const token = (config.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error("Заполните TELEGRAM_BOT_TOKEN в локальном env-файле. Значение не выводится.");
  }
  const expectedUsername = (config.TELEGRAM_BOT_USERNAME || "isvoi_help_bot").replace(/^@/, "");
  const expectedTitle = config.TELEGRAM_GROUP_TITLE || "I СВОИ · Заявки · Белгород";
  let chatId = (config.TELEGRAM_CHAT_ID ?? "").trim();
  if (chatId && !/^-\d+$/.test(chatId)) {
    throw new Error("TELEGRAM_CHAT_ID должен быть отрицательным числовым ID группы.");
  }

  async function api(method, payload = {}) {
    if (!READ_METHODS.has(method)) throw new Error("Метод не разрешён проверкой подключения.");
    let response;
    let body;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        body = await response.json();
        break;
      } catch {
        if (attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        // Fetch exceptions can contain the URL, which contains the bot token.
        throw new Error(`Telegram ${method}: сеть или ответ недоступны; секретные детали скрыты.`);
      }
    }
    if (!response.ok || body?.ok !== true) {
      const code = Number.isInteger(body?.error_code) ? body.error_code : response.status;
      throw new Error(`Telegram ${method}: ошибка ${code}. Текст API не выводится для защиты токена.`);
    }
    return body.result;
  }

  const bot = await api("getMe");
  if (!bot?.is_bot || bot.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new Error("Токен принадлежит другому боту. Проверьте ожидаемый username и токен.");
  }
  const webhook = await api("getWebhookInfo");
  const report = {
    bot: { id: bot.id, username: bot.username },
    webhookConfigured: Boolean(webhook?.url),
    pendingUpdates: webhook?.pending_update_count ?? null,
    group: null,
    ready: false,
    next: [],
  };

  if (!chatId && discover) {
    if (report.webhookConfigured) {
      report.next.push("Webhook уже настроен. Укажите TELEGRAM_CHAT_ID явно; webhook не изменён.");
      return report;
    }
    // No offset, no negative offset, no allowed_updates: do not acknowledge/drop
    // pending updates or change the bot's update subscription.
    const updates = await api("getUpdates", { timeout: 0, limit: 100 });
    if (!Array.isArray(updates)) throw new Error("Telegram вернул некорректный список событий.");
    const candidates = new Map();
    for (const update of updates) {
      const chats = [update.message?.chat, update.edited_message?.chat, update.my_chat_member?.chat];
      for (const chat of chats) {
        if (chat && ["group", "supergroup"].includes(chat.type) && chat.title === expectedTitle) {
          candidates.set(String(chat.id), chat);
        }
      }
      if (update.message?.chat?.title === expectedTitle && update.message.migrate_to_chat_id) {
        candidates.delete(String(update.message.chat.id));
        candidates.set(String(update.message.migrate_to_chat_id), { id: update.message.migrate_to_chat_id });
      }
    }
    // A group can be upgraded to a supergroup after the bot is added.
    for (const update of updates) {
      if (update.message?.migrate_from_chat_id) candidates.delete(String(update.message.migrate_from_chat_id));
    }
    if (candidates.size > 1) {
      report.next.push("Найдено несколько групп с одинаковым названием; укажите нужный TELEGRAM_CHAT_ID явно.");
      report.candidateChatIds = [...candidates.keys()];
      return report;
    }
    chatId = [...candidates.keys()][0] || "";
  }

  if (!chatId) {
    report.next.push(discover
      ? "Группа не найдена среди ожидающих событий. Добавьте бота в группу и отправьте /setup@isvoi_help_bot, затем повторите проверку."
      : "Укажите TELEGRAM_CHAT_ID или запустите проверку с --discover-group до подключения webhook.");
    return report;
  }
  const chat = await api("getChat", { chat_id: chatId });
  if (!["group", "supergroup"].includes(chat?.type) || chat.title !== expectedTitle) {
    throw new Error("ID не соответствует ожидаемой рабочей группе. Проверьте ID и название.");
  }
  const member = await api("getChatMember", { chat_id: chatId, user_id: bot.id });
  const canManageTopics = member?.status === "creator" ||
    (member?.status === "administrator" && member.can_manage_topics === true);
  report.group = {
    id: String(chat.id), title: chat.title, type: chat.type,
    topicsEnabled: chat.is_forum === true,
    botStatus: member?.status ?? "unknown",
    canManageTopics,
    canPinMessages: member?.can_pin_messages === true,
  };
  report.ready = report.group.topicsEnabled && canManageTopics;
  if (!report.group.topicsEnabled) report.next.push("Включите темы в рабочей группе.");
  if (!canManageTopics) report.next.push("Дайте боту административное право управления темами.");
  if (!config.TELEGRAM_CHAT_ID?.trim()) report.next.push(`Сохраните TELEGRAM_CHAT_ID=${chat.id} в локальном env-файле.`);
  report.next.push("Это проверка Telegram-ресурсов; обработчик и интеграция с Directus ещё не подключены.");
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let envPath = "work/private/telegram.env";
  let discover = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--discover-group") discover = true;
    else if (args[index] === "--env" && args[index + 1] && !args[index + 1].startsWith("--")) envPath = args[++index];
    else throw new Error("Использование: node scripts/telegram_preflight.mjs [--env путь] [--discover-group]");
  }
  let config;
  try {
    config = parseEnv(await readFile(resolve(envPath), "utf8"));
  } catch {
    throw new Error("Не удалось прочитать локальный env-файл. Его содержимое не выводится.");
  }
  const report = await inspectTelegram(config, { discover });
  // Even user-controlled group names should never echo a configured secret.
  const output = JSON.stringify(report, null, 2);
  console.log(output.split(config.TELEGRAM_BOT_TOKEN.trim()).join("[REDACTED]"));
  if (!report.ready) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
