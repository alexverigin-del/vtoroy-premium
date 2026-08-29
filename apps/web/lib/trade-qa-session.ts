import { createHmac, timingSafeEqual } from "node:crypto";

export const TRADE_QA_SESSION_SECONDS = 8 * 60 * 60;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function matchesTradeQaSecret(candidate: string, expected: string): boolean {
  return expected.length >= 32 && safeEqual(candidate, expected);
}

export function createTradeQaSessionToken(secret: string, now = Date.now()): string {
  const expiresAt = now + TRADE_QA_SESSION_SECONDS * 1000;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function validateTradeQaSessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (secret.length < 32) return false;
  const [version, rawExpiresAt, candidateSignature, extra] = token.split(".");
  if (version !== "v1" || extra || !candidateSignature || !/^\d{13}$/.test(rawExpiresAt)) {
    return false;
  }
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  if (expiresAt > now + TRADE_QA_SESSION_SECONDS * 1000) return false;
  const payload = `${version}.${rawExpiresAt}`;
  return safeEqual(candidateSignature, signature(payload, secret));
}
