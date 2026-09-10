import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classify, digest, fail, MAX_FILE_BYTES } from "./policy.js";
import { readBounded } from "./attachments.js";
import type { MediaKind, Platform, Outcome, ProviderResume } from "./types.js";

type OutgoingFile = { bytes: Buffer; mime: string; kind: MediaKind; name: string };
type ProviderResponse = { status: number; data: any };

class PreparationError extends Error {
  constructor(public outcome: Outcome) {
    super(
      outcome.type === "rate_limited"
        ? "RATE_LIMITED"
        : outcome.type === "accepted"
          ? "UNEXPECTED_ACCEPTED_PREPARATION"
          : outcome.code,
    );
  }
}

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

const maxUploadHosts: Record<string, string[]> = {
  image: ["iu.oneme.ru"],
  video: ["omub.okcdn.ru"],
  audio: ["omu.okcdn.ru"],
  file: ["fu.oneme.ru"],
};
const vkUploadDomains = ["vk.com", "vk.ru", "userapi.com"];

/** Upload URLs are provider-issued capabilities. Keep them away from arbitrary hosts and credentials. */
export function validateProviderUploadURL(
  platform: Exclude<Platform, "telegram">,
  value: string,
  mediaType?: string,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("MEDIA_UPLOAD_URL_FORBIDDEN");
  }
  const host = url.hostname.toLowerCase();
  const allowed =
    platform === "max"
      ? (maxUploadHosts[mediaType || ""] || []).includes(host)
      : vkUploadDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    isIP(host) ||
    !allowed
  )
    return fail("MEDIA_UPLOAD_URL_FORBIDDEN");
  return url;
}

export function mediaRoute(
  platform: Exclude<Platform, "telegram">,
  file: Pick<OutgoingFile, "kind" | "mime">,
) {
  if (platform === "max") {
    if (file.kind === "image") return "image";
    if (file.kind === "video") return "video";
    if (file.kind === "voice" || file.kind === "audio") return "audio";
    return "file";
  }
  if (file.kind === "image" && ["image/jpeg", "image/png", "image/gif"].includes(file.mime))
    return "photo";
  if (
    file.kind === "voice" &&
    ["audio/ogg", "audio/ogg; codecs=opus", "audio/opus"].includes(file.mime)
  )
    return "audio_message";
  return "doc";
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
    const { chat_id, type, ...rest } = payload;
    const query = new URLSearchParams();
    if (chat_id !== undefined && chat_id !== null) query.set("chat_id", String(chat_id));
    if (method === "uploads" && type) query.set("type", String(type));
    url = `https://platform-api2.max.ru/${method}${query.size ? `?${query}` : ""}`;
    body = method === "uploads" ? "" : JSON.stringify(rest);
    headers = {
      ...(method === "uploads" ? {} : { "content-type": "application/json" }),
      Authorization: token,
    };
  } else {
    if (
      ![
        "messages.send",
        "messages.sendMessageEventAnswer",
        "wall.post",
        "photos.getMessagesUploadServer",
        "photos.saveMessagesPhoto",
        "docs.getMessagesUploadServer",
        "docs.save",
      ].includes(method)
    )
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

function safeName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").trim().slice(0, 128) || "attachment";
}

function preparationResponse(platform: Platform, response: ProviderResponse) {
  const { status, data } = response;
  if (
    status < 200 ||
    status >= 300 ||
    data?.error ||
    data?.ok === false ||
    (platform === "max" && data?.code)
  ) {
    const outcome = classify(platform, status, data);
    throw new PreparationError(
      outcome.type === "unknown"
        ? { type: "retryable", code: "MEDIA_PREPARATION_PROVIDER_UNAVAILABLE" }
        : outcome,
    );
  }
  return data;
}

async function uploadMultipart(
  platform: Exclude<Platform, "telegram">,
  uploadURL: string,
  mediaType: string,
  field: string,
  file: OutgoingFile,
): Promise<ProviderResponse> {
  const url = validateProviderUploadURL(platform, uploadURL, mediaType);
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(file.bytes)], { type: file.mime }), safeName(file.name));
  const response = await fetch(url, {
    method: "POST",
    body: form,
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  let data: any = {};
  try {
    data = JSON.parse(await response.text());
  } catch {
    if (response.ok)
      throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_RECEIPT_INVALID" });
  }
  return { status: response.status, data };
}

async function prepareMaxAttachment(token: string, file: OutgoingFile) {
  const type = mediaRoute("max", file);
  const slot = preparationResponse("max", await providerJSON("max", token, "uploads", { type }));
  if (typeof slot?.url !== "string")
    throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_SLOT_MISSING" });
  const uploaded = preparationResponse(
    "max",
    await uploadMultipart("max", slot.url, type, "data", file),
  );
  const mediaToken = uploaded?.token ?? slot?.token;
  if (typeof mediaToken !== "string" || !mediaToken)
    throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_TOKEN_MISSING" });
  return { type, payload: { token: mediaToken } };
}

function vkAttachmentId(prefix: "photo" | "doc", value: any) {
  if (!Number.isInteger(value?.owner_id) || !Number.isInteger(value?.id))
    throw new PreparationError({ type: "retryable", code: "MEDIA_SAVE_RECEIPT_MISSING" });
  const access = typeof value.access_key === "string" && value.access_key ? `_${value.access_key}` : "";
  return `${prefix}${value.owner_id}_${value.id}${access}`;
}

async function prepareVkAttachment(token: string, peerId: string, file: OutgoingFile) {
  const route = mediaRoute("vk", file);
  if (route === "photo") {
    const slot = preparationResponse(
      "vk",
      await providerJSON("vk", token, "photos.getMessagesUploadServer", { peer_id: peerId }),
    );
    if (typeof slot?.response?.upload_url !== "string")
      throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_SLOT_MISSING" });
    const uploaded = preparationResponse(
      "vk",
      await uploadMultipart("vk", slot.response.upload_url, route, "photo", file),
    );
    if (
      typeof uploaded?.photo !== "string" ||
      !Number.isInteger(uploaded?.server) ||
      typeof uploaded?.hash !== "string"
    )
      throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_RECEIPT_INVALID" });
    const saved = preparationResponse(
      "vk",
      await providerJSON("vk", token, "photos.saveMessagesPhoto", {
        photo: uploaded.photo,
        server: uploaded.server,
        hash: uploaded.hash,
      }),
    );
    return vkAttachmentId("photo", saved?.response?.[0]);
  }

  const slot = preparationResponse(
    "vk",
    await providerJSON("vk", token, "docs.getMessagesUploadServer", {
      peer_id: peerId,
      type: route,
    }),
  );
  if (typeof slot?.response?.upload_url !== "string")
    throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_SLOT_MISSING" });
  const uploaded = preparationResponse(
    "vk",
    await uploadMultipart("vk", slot.response.upload_url, route, "file", file),
  );
  if (typeof uploaded?.file !== "string" || !uploaded.file)
    throw new PreparationError({ type: "retryable", code: "MEDIA_UPLOAD_RECEIPT_INVALID" });
  const saved = preparationResponse(
    "vk",
    await providerJSON("vk", token, "docs.save", {
      file: uploaded.file,
      title: safeName(file.name),
    }),
  );
  return vkAttachmentId("doc", saved?.response?.audio_message ?? saved?.response?.doc);
}

function stableVkRandomId(op: any) {
  const value = parseInt(digest(String(op.id || op.outbox_id || op.attempt_id)).slice(0, 8), 16) & 0x7fffffff;
  return value || 1;
}

function resumedMaxAttachment(value: unknown) {
  const attachment = value as any;
  if (
    !attachment ||
    !["image", "video", "audio", "file"].includes(attachment.type) ||
    typeof attachment.payload?.token !== "string" ||
    !attachment.payload.token ||
    attachment.payload.token.length > 2000
  )
    return null;
  return { type: attachment.type, payload: { token: attachment.payload.token } };
}

function resumedVkAttachment(value: unknown) {
  return typeof value === "string" && /^(?:photo|doc)-?\d+_\d+(?:_[A-Za-z0-9_-]+)?$/.test(value)
    ? value
    : null;
}

export async function sendOperation(
  platform: Platform,
  token: string,
  op: any,
  file?: OutgoingFile,
): Promise<Outcome> {
  // All local validation occurs before the external API call. No token-bearing errors escape.
  if (!["text", "attachment", "topic"].includes(op.method))
    return { type: "rejected", code: "UNSUPPORTED_OPERATION" };
  if (op.method === "attachment" && !file) return { type: "rejected", code: "FILE_NOT_AVAILABLE" };
  let userVisibleRequestStarted = false;
  let resume: ProviderResume | undefined;
  try {
    let result;
    if (file && platform === "telegram") {
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
      userVisibleRequestStarted = true;
      const r = await fetch(
        `https://api.telegram.org/bot${token}/send${field[0].toUpperCase() + field.slice(1)}`,
        { method: "POST", body: form, signal: AbortSignal.timeout(60000), redirect: "error" },
      );
      result = { status: r.status, data: await r.json() };
    } else if (file && platform === "max") {
      const attachment =
        resumedMaxAttachment(op.payload.provider_attachment) ??
        (await prepareMaxAttachment(token, file));
      resume = { platform: "max", attachment };
      userVisibleRequestStarted = true;
      result = await providerJSON("max", token, "messages", {
        chat_id: op.payload.chat_id ?? op.payload.peer_id,
        ...(op.payload.text ? { text: op.payload.text } : {}),
        attachments: [attachment],
      });
    } else if (file && platform === "vk") {
      const attachment =
        resumedVkAttachment(op.payload.provider_attachment) ??
        (await prepareVkAttachment(token, String(op.payload.peer_id), file));
      resume = { platform: "vk", attachment };
      userVisibleRequestStarted = true;
      result = await providerJSON("vk", token, "messages.send", {
        peer_id: op.payload.peer_id,
        random_id: op.payload.random_id ?? stableVkRandomId(op),
        attachment,
        ...(op.payload.message ? { message: op.payload.message } : {}),
      });
    } else {
      userVisibleRequestStarted = true;
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
    }
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
    const outcome = classify(platform, status, data);
    return resume && (outcome.type === "retryable" || outcome.type === "rate_limited")
      ? { ...outcome, resume }
      : outcome;
  } catch (error) {
    if (error instanceof PreparationError) return error.outcome;
    return userVisibleRequestStarted
      ? { type: "unknown", code: "NETWORK_OUTCOME_UNKNOWN" }
      : { type: "retryable", code: "MEDIA_PREPARATION_FAILED" };
  }
}
