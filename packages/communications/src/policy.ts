import { createHash, timingSafeEqual } from "node:crypto";
import type { Handling, Outcome, Platform } from "./types.js";
export const MAX_FILE_BYTES = 20_000_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class CommunicationError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export const fail = (code: string, status = 400): never => {
  throw new CommunicationError(code, status);
};
export const flag = (value: unknown) => value === true || value === "true";
export function identifier(value: unknown): string {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "number" && !Number.isSafeInteger(value))
  )
    return fail("INVALID_EXTERNAL_ID");
  const id = String(value);
  if (!/^-?[0-9A-Za-z_.:-]{1,180}$/.test(id)) return fail("INVALID_EXTERNAL_ID");
  return id;
}
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}
export function verifySecret(actual: unknown, expected: unknown): boolean {
  if (
    typeof actual !== "string" ||
    typeof expected !== "string" ||
    !expected ||
    expected.length < 16
  )
    return false;
  return timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(digest(expected)));
}
export function validText(value: unknown, limit = 3500): string {
  if (typeof value !== "string" || value.length > limit || value.includes("\u0000"))
    return fail("INVALID_TEXT");
  return value.trim();
}
export function nextHandling(current: Handling, next: unknown): Handling {
  const edges: Record<Handling, Handling[]> = {
    bot: ["queued", "agent", "closed"],
    queued: ["agent", "closed"],
    agent: ["queued", "waiting", "closed"],
    waiting: ["queued", "agent", "closed"],
    closed: [],
  };
  if (next === current) return current;
  if (!edges[current]?.includes(next as Handling)) return fail("INVALID_HANDLING_TRANSITION", 409);
  return next as Handling;
}
export function marketingWindow(now: Date): { allowed: boolean; next: Date } {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour >= 10 && hour < 20) return { allowed: true, next: now };
  const next = new Date(now);
  next.setUTCHours(7, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return { allowed: false, next };
}
export function classify(platform: Platform, status: number, body: any): Outcome {
  const code = String(body?.error?.error_code ?? body?.error_code ?? body?.code ?? status);
  const description = String(
    body?.description ?? body?.message ?? body?.error?.error_msg ?? "",
  ).toLowerCase();
  if (status === 429 || (platform === "vk" && code === "6"))
    return {
      type: "rate_limited",
      retryAfter: Math.min(
        86400,
        Math.max(1, Number(body?.parameters?.retry_after ?? body?.retry_after) || 60),
      ),
    };
  if (platform === "max" && code === "attachment.not.ready")
    return { type: "retryable", code: "ATTACHMENT_NOT_READY" };
  if (
    (platform === "telegram" &&
      status === 403 &&
      /blocked by the user|user is deactivated/.test(description)) ||
    (platform === "vk" && code === "901")
  )
    return { type: "blocked", code: "RECIPIENT_UNAVAILABLE" };
  if (
    status === 401 ||
    status === 403 ||
    (platform === "vk" && ["5", "7", "15", "27"].includes(code))
  )
    return { type: "connection_error", code: "CONNECTION_PERMISSION" };
  if (status >= 500) return { type: "unknown", code: "PROVIDER_OUTCOME_UNKNOWN" };
  return { type: "rejected", code: `PROVIDER_${code.replace(/[^a-z0-9_]/gi, "").slice(0, 40)}` };
}
export function safeFirstPartyUrl(value: unknown): string {
  if (typeof value !== "string") return fail("INVALID_LINK");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("INVALID_LINK");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (url.hostname !== "isvoi.ru" && !url.hostname.endsWith(".isvoi.ru"))
  )
    return fail("INVALID_LINK");
  return url.toString();
}
