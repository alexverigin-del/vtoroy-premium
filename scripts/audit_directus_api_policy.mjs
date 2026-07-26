#!/usr/bin/env node
/**
 * Audit public API ownership policy. ISVOI keeps editable content reads on the
 * server side through a least-privilege token; anonymous API access should stay
 * fail-closed except health/assets handled by Directus/Nginx.
 */

import fs from "node:fs";
import path from "node:path";

function envValue(name) {
  if (process.env[name]) return process.env[name];

  const envPath = path.join(process.cwd(), "apps", "web", ".env.local");
  if (!fs.existsSync(envPath)) return "";

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${name}=`));
  if (!line) return "";

  const value = line.slice(name.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

const baseUrl = (process.env.DIRECTUS_PUBLIC_URL || "https://api.isvoi.ru").replace(/\/+$/, "");
const serviceUrl = (envValue("DIRECTUS_URL") || baseUrl).replace(/\/+$/, "");
const serviceToken = envValue("DIRECTUS_TOKEN");

const checks = [
  { name: "health", path: "/server/health", expected: 200 },
  { name: "anonymous.devices", path: "/items/devices?limit=1", expected: 403 },
  { name: "anonymous.site_settings", path: "/items/site_settings?limit=1", expected: 403 },
  { name: "anonymous.navigation_items", path: "/items/navigation_items?limit=1", expected: 403 },
  { name: "anonymous.blog_posts", path: "/items/blog_posts?limit=1", expected: 403 },
  { name: "anonymous.system_users", path: "/items/directus_users?limit=1", expected: 403 },
];

let failed = false;

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: "manual" });
  const status = response.status;
  if (status !== check.expected) {
    console.error(`${check.name}: expected ${check.expected}, got ${status}`);
    failed = true;
  } else {
    console.log(`${check.name}: ${status}`);
  }
}

if (serviceToken) {
  const serviceChecks = [
    {
      name: "service.club_page_settings",
      path: "/items/club_page_settings?fields=publication_mode,hero_title,form_device_label,consent_version,privacy_url&limit=1",
      validate(data) {
        return (
          data &&
          ["pilot_noindex", "public_index", "paused"].includes(data.publication_mode) &&
          Boolean(data.hero_title) &&
          Boolean(data.form_device_label) &&
          Boolean(data.consent_version)
        );
      },
    },
    {
      name: "service.club_plans",
      path: "/items/club_plans?fields=id,slug,support_level,service_response_text,diagnostics_text,replacement_text,early_exit_text,damage_text&filter[status][_eq]=published&limit=10",
      validate(data) {
        return (
          Array.isArray(data) &&
          data.length >= 2 &&
          data.every((plan) => plan.id && plan.slug && plan.support_level)
        );
      },
    },
  ];

  for (const check of serviceChecks) {
    const response = await fetch(`${serviceUrl}${check.path}`, {
      headers: { Authorization: `Bearer ${serviceToken}` },
      redirect: "manual",
    });
    const payload = await response.json().catch(() => null);
    const valid = response.status === 200 && check.validate(payload?.data);
    if (!valid) {
      console.error(`${check.name}: expected readable current Club fields, got ${response.status}`);
      failed = true;
    } else {
      console.log(`${check.name}: ${response.status}`);
    }
  }
} else {
  console.log("service.club_fields: skipped (DIRECTUS_TOKEN unavailable in this environment)");
}

if (failed) {
  console.error(
    "Directus API policy audit failed. Anonymous API must stay fail-closed and the server token must read current managed fields.",
  );
  process.exit(1);
}

console.log("Directus API policy audit passed.");
