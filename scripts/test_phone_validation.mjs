#!/usr/bin/env node

import assert from "node:assert/strict";
import { isValidPhoneNumber, sanitizePhoneInput } from "../apps/web/lib/phone.ts";

for (const value of ["+7 999 123-45-67", "8 (999) 123-45-67", "79991234567", "+44 20 7946 0958"]) {
  assert.equal(isValidPhoneNumber(value), true, `${value} must be accepted`);
}

for (const value of [
  "Иван",
  "позвоните мне",
  "@username",
  "+7 999 TEST",
  "12345",
  "+1234567890123456",
]) {
  assert.equal(isValidPhoneNumber(value), false, `${value} must be rejected`);
}

assert.equal(sanitizePhoneInput("Иван +7 (999) 123-45-67"), "+7 (999) 123-45-67");
assert.equal(sanitizePhoneInput("+7 999 TEST"), "+7 999 ");
assert.equal(sanitizePhoneInput("7+999+1234567"), "79991234567");

process.stdout.write("phone validation tests: ok\n");
