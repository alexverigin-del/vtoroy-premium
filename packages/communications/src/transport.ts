import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classify, fail, MAX_FILE_BYTES } from "./policy.js";
import { readBounded } from "./attachments.js";
import type { Platform, Outcome } from "./types.js";

export function publicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function validateMediaURL(value: string, hosts: string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("MEDIA_URL_FORBIDDEN");
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    isIP(url.hostname) ||
    !hosts.some((h) => url.hostname === h)
  )
    return fail("MEDIA_URL_FORBIDDEN");
  return url;
}
/** Exact allowlist plus DNS pinning, no redirects, no arbitrary proxy and bounded download. */
export async function downloadMedia(
  value: string,
  hosts: string[],
  expectedSize?: number | null,
): Promise<Buffer> {
  if (expectedSize !== null && expectedSize !== undefined && expectedSize > MAX_FILE_BYTES)
    return fail("FILE_TOO_LARGE", 413);
  const url = validateMediaURL(value, hosts),
    addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((a) => !publicIPv4(a.address)))
    return fail("MEDIA_ADDRESS_FORBIDDEN");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: (_hostname: any, options: any, cb: any) =>
          options?.all ? cb(null, [addresses[0]]) : cb(null, addresses[0].address, 4),
      },
      async (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          return reject(new Error("MEDIA_DOWNLOAD_REJECTED"));
        }
        try {
          const bytes = await readBounded(res, res.headers["content-length"]);
          resolve(bytes);
        } catch (e) {
          res.destroy();
          reject(e);
        }
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("MEDIA_DOWNLOAD_TIMEOUT")), 30000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(new Error("MEDIA_DOWNLOAD_FAILED")));
    req.end();
  });
}
export async function providerJSON(
  platform: Platform,
  token: string,
  method: string,
  payload: any,
): Promise<any> {
  let url: string, body: BodyInit, headers: Record<string, string>;
  if (platform === "telegram") {
    if (
      ![
        "createForumTopic",
        "sendMessage",
        "sendPhoto",
        "sendVoice",
        "sendAudio",
        "sendVideo",
        "sendDocument",
        "getFile",
        "getUpdates",
        "getWebhookInfo",
        "answerCallbackQuery",
      ].includes(method)
    )
      return fail("UNSUPPORTED_METHOD");
    url = `https://api.telegram.org/bot${token}/${method}`;
    body = JSON.stringify(payload);
    headers = { "content-type": "application/json" };
  } else if (platform === "max") {
    if (!["messages", "answers", "uploads"].includes(method)) return fail("UNSUPPORTED_METHOD");
    const { chat_id, ...rest } = payload;
    url = `https://platform-api2.max.ru/${method}${chat_id ? `?chat_id=${encodeURIComponent(chat_id)}` : ""}`;
    body = JSON.stringify(rest);
    headers = { "content-type": "application/json", Authorization: token };
  } else {
    if (!["messages.send", "messages.sendMessageEventAnswer", "wall.post"].includes(method))
      return fail("UNSUPPORTED_METHOD");
    url = `https://api.vk.ru/method/${method}`;
    body = new URLSearchParams({ ...payload, access_token: token, v: "5.199" });
    headers = { "content-type": "application/x-www-form-urlencoded" };
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(method === "getUpdates" ? 40000 : 30000),
  });
  const data = await response.json();
  return { status: response.status, data };
}
export async function sendOperation(
  platform: Platform,
  token: string,
  op: any,
  file?: { bytes: Buffer; mime: string; kind: string; name: string },
): Promise<Outcome> {
  // All local validation occurs before the external API call. No token-bearing errors escape.
  if (!["text", "attachment", "topic"].includes(op.method))
    return { type: "rejected", code: "UNSUPPORTED_OPERATION" };
  if (op.method === "attachment" && !file) return { type: "rejected", code: "FILE_NOT_AVAILABLE" };
  if (file && platform !== "telegram")
    return { type: "rejected", code: "MEDIA_ADAPTER_NOT_VERIFIED" };
  try {
    let result;
    if (file) {
      const field =
        file.kind === "image" && ["image/jpeg", "image/png"].includes(file.mime)
          ? "photo"
          : file.kind === "voice" &&
              ["audio/ogg", "audio/ogg; codecs=opus", "audio/opus", "audio/mpeg"].includes(
                file.mime,
              )
            ? "voice"
            : file.kind === "audio" && ["audio/mpeg", "audio/mp4"].includes(file.mime)
              ? "audio"
              : file.kind === "video" && file.mime === "video/mp4"
                ? "video"
                : "document";
      const form = new FormData();
      form.append("chat_id", String(op.payload.peer_id));
      form.append(field, new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.name);
      const r = await fetch(
        `https://api.telegram.org/bot${token}/send${field[0].toUpperCase() + field.slice(1)}`,
        { method: "POST", body: form, signal: AbortSignal.timeout(60000), redirect: "error" },
      );
      result = { status: r.status, data: await r.json() };
    } else
      result = await providerJSON(
        platform,
        token,
        platform === "telegram"
          ? op.method === "topic"
            ? "createForumTopic"
            : "sendMessage"
          : platform === "max"
            ? "messages"
            : "messages.send",
        op.payload,
      );
    const { status, data } = result;
    const external =
      platform === "telegram" && data.ok
        ? op.method === "topic"
          ? data.result?.message_thread_id
          : data.result?.message_id
        : platform === "max"
          ? data.message?.body?.mid
          : typeof data.response === "number"
            ? data.response
            : data.response?.message_id;
    if (status >= 200 && status < 300 && external !== undefined && external !== null)
      return { type: "accepted", externalId: String(external) };
    if (status >= 200 && status < 300 && !data.error && data.ok !== false && !data.code)
      return { type: "unknown", code: "MISSING_PROVIDER_RECEIPT" };
    return classify(platform, status, data);
  } catch {
    return { type: "unknown", code: "NETWORK_OUTCOME_UNKNOWN" };
  }
}
