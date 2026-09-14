import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import {
  providerJSON,
  sendOperation,
  downloadMedia,
  readBounded,
} from "../packages/communications/dist/index.js";

const mode = process.argv[2];
if (!["receive", "process", "send", "media"].includes(mode))
  throw Error("Use receive | process | send | media");
const origin = new URL(process.env.COMM_DIRECTUS_URL || "http://127.0.0.1:8055");
if (origin.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(origin.hostname))
  throw Error("HTTPS_REQUIRED");
const connection = process.env.COMM_CONNECTION_ID,
  access = process.env.COMM_WORKER_TOKEN,
  platform = process.env.COMM_PLATFORM,
  token = process.env.COMM_PLATFORM_TOKEN;
if (
  !connection ||
  !access ||
  !["telegram", "max", "vk"].includes(platform) ||
  (["receive", "send", "media"].includes(mode) && !token)
)
  throw Error("WORKER_CONFIGURATION_REQUIRED");
if (mode === "receive" && platform !== "telegram") throw Error("USE_WEBHOOK_INGRESS");
const base = new URL(`/isvoi-communications/v1/workers/${connection}/`, origin),
  instance = randomUUID();
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
async function api(path, body, method = "POST", binary = false) {
  const r = await fetch(new URL(path, base), {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      ...(body !== undefined
        ? { "Content-Type": binary ? "application/octet-stream" : "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
    redirect: "error",
  });
  if (!r.ok) throw Error(`COMM_API_${r.status}`);
  if (binary && method === "GET") return r;
  return (await r.json()).data;
}
if (mode === "receive") {
  const { data } = await providerJSON("telegram", token, "getWebhookInfo", {});
  if (!data.ok || data.result?.url) throw Error("POLLING_REQUIRES_EMPTY_WEBHOOK");
}
while (running) {
  try {
    if (mode === "receive") {
      const lease = await api("poll", { instance_id: instance });
      const result = await providerJSON("telegram", token, "getUpdates", {
        offset: lease.offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query", "edited_message", "my_chat_member"],
      });
      if (!result.data.ok) throw Error("POLL_FAILED");
      for (const update of result.data.result) {
        await api("poll-result", { instance_id: instance, update });
        if (update.callback_query)
          await providerJSON("telegram", token, "answerCallbackQuery", {
            callback_query_id: update.callback_query.id,
          }).catch(() => {});
      }
    } else if (mode === "process") {
      const processed = await api("process", {});
      if (!processed) await pause(750);
    } else if (mode === "send") {
      const op = await api("next", {});
      if (!op) {
        await pause(500);
        continue;
      }
      let file;
      if (op.method === "attachment") {
        const r = await api(
          `media/${op.payload.attachment_id}?attempt_id=${op.attempt_id}`,
          undefined,
          "GET",
          true,
        );
        file = {
          bytes: await readBounded(r.body, r.headers.get("content-length")),
          kind: r.headers.get("x-media-kind"),
          name: decodeURIComponent(r.headers.get("x-media-name")),
          mime: r.headers.get("content-type"),
        };
      }
      const outcome = await sendOperation(platform, token, op, file);
      // Retry acknowledgement, never the platform operation. A process crash leaves an uncertain lease.
      let recorded = false;
      for (let i = 0; i < 5 && running; i++) {
        try {
          await api("complete", {
            attempt_id: op.attempt_id,
            lease_version: op.lease_version,
            outcome,
          });
          recorded = true;
          break;
        } catch {
          await pause(1000 * (i + 1));
        }
      }
      if (!recorded) console.error("COMM_RECEIPT_PENDING_RECONCILIATION");
    } else {
      const f = await api("media", undefined, "GET");
      if (f) {
        try {
          if (!["image", "voice", "audio", "video"].includes(f.kind))
            throw Error("FILE_FORMAT_NOT_ALLOWED");
          let url, hosts;
          if (platform === "telegram") {
            if (f.external_ref.size > 20000000) throw Error("FILE_TOO_LARGE");
            const r = await providerJSON(platform, token, "getFile", {
              file_id: f.external_ref.externalId,
            });
            if (!r.data.ok) throw Error("MEDIA_UNAVAILABLE");
            if (r.data.result.file_size > 20000000) throw Error("FILE_TOO_LARGE");
            const path = r.data.result.file_path;
            if (typeof path !== "string" || !/^[-\w/\.]+$/.test(path) || path.includes(".."))
              throw Error("MEDIA_URL_FORBIDDEN");
            url = `https://api.telegram.org/file/bot${token}/${path}`;
            hosts = ["api.telegram.org"];
          } else {
            url = f.external_ref.url;
            hosts = (process.env.COMM_MEDIA_HOSTS || "").split(",").filter(Boolean);
            if (!url) throw Error("MEDIA_URL_FORBIDDEN");
            // MAX and VK do not publish a stable exhaustive list of download CDN hosts.
            // Keep the provider object pending until a host observed in the live pilot has
            // been reviewed and explicitly allowed. Rejecting here would lose the chance to
            // process the attachment after configuration is corrected.
            if (!hosts.length) throw Error("MEDIA_HOSTS_REQUIRED");
          }
          const bytes = await downloadMedia(url, hosts, f.external_ref.size);
          await api(`media/${f.id}`, bytes, "POST", true);
        } catch (e) {
          if ((e.code || e.message) === "MEDIA_HOSTS_REQUIRED") {
            console.error("COMM_MEDIA_HOSTS_REQUIRED");
            await pause(5000);
          } else {
            const code = [
              "FILE_TOO_LARGE",
              "FILE_FORMAT_NOT_ALLOWED",
              "MEDIA_URL_FORBIDDEN",
              "MEDIA_ADDRESS_FORBIDDEN",
            ].includes(e.code || e.message)
              ? e.code || e.message
              : "MEDIA_UNAVAILABLE";
            await api(`media/${f.id}`, { error_code: code });
          }
        }
      }
      const scanned = await api("scan", {});
      if ((!f && !scanned) || scanned?.error_code) await pause(5000);
    }
  } catch {
    console.error(`COMM_WORKER_${mode.toUpperCase()}_RETRY`);
    await pause(3000);
  }
}
