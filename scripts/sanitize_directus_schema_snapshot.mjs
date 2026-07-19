#!/usr/bin/env node
/**
 * Redact sensitive query parameter values from a Directus schema snapshot.
 * Use this before committing snapshots that contain Live Preview URLs.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/sanitize_directus_schema_snapshot.mjs <input.json> <output.json>");
  process.exit(1);
}

const sensitiveQueryValue = /([?&](?:secret|token|api_key)=)[^&"'\s]*/gi;
const unredactedSensitiveQueryValue =
  /[?&](?:secret|token|api_key)=(?!__REDACTED__(?:&|["'\s]|$))[^&"'\s]+/i;
let replacements = 0;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  }
  if (typeof value !== "string") return value;

  return value.replace(sensitiveQueryValue, (_match, prefix) => {
    replacements += 1;
    return `${prefix}__REDACTED__`;
  });
}

const input = path.resolve(inputArg);
const output = path.resolve(outputArg);
const snapshot = JSON.parse(await readFile(input, "utf8"));
const sanitized = sanitize(snapshot);
const json = `${JSON.stringify(sanitized, null, 2)}\n`;

if (unredactedSensitiveQueryValue.test(json)) {
  throw new Error("Sensitive query parameter values remain after sanitization.");
}

await writeFile(output, json, "utf8");
console.log(`Directus snapshot sanitized: ${replacements} sensitive query value(s) redacted.`);
