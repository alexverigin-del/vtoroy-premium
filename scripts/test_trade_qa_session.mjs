#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  createTradeQaSessionToken,
  matchesTradeQaSecret,
  TRADE_QA_SESSION_SECONDS,
  validateTradeQaSessionToken,
} from "../apps/web/lib/trade-qa-session.ts";

const secret = "a".repeat(64);
const otherSecret = "b".repeat(64);
const now = Date.parse("2026-08-29T17:00:00.000Z");
const token = createTradeQaSessionToken(secret, now);

assert.equal(matchesTradeQaSecret(secret, secret), true);
assert.equal(matchesTradeQaSecret(otherSecret, secret), false);
assert.equal(matchesTradeQaSecret("short", "short"), false);
assert.equal(validateTradeQaSessionToken(token, secret, now), true);
assert.equal(validateTradeQaSessionToken(token, secret, now + 60_000), true);
assert.equal(
  validateTradeQaSessionToken(token, secret, now + TRADE_QA_SESSION_SECONDS * 1000),
  false,
);
assert.equal(validateTradeQaSessionToken(token, otherSecret, now), false);
assert.equal(validateTradeQaSessionToken(`${token}x`, secret, now), false);

const [version, expiresAt, tokenSignature] = token.split(".");
assert.equal(
  validateTradeQaSessionToken(`${version}.${Number(expiresAt) + 1}.${tokenSignature}`, secret, now),
  false,
);
assert.equal(validateTradeQaSessionToken("", secret, now), false);

process.stdout.write("trade QA session tests: ok\n");
