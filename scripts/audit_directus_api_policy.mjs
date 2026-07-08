#!/usr/bin/env node
/**
 * Audit public API ownership policy. ISVOI keeps editable content reads on the
 * server side through a least-privilege token; anonymous API access should stay
 * fail-closed except health/assets handled by Directus/Nginx.
 */

const baseUrl = (process.env.DIRECTUS_PUBLIC_URL || "https://api.isvoi.ru").replace(/\/+$/, "");

const checks = [
  { name: "health", path: "/server/health", expected: 200 },
  { name: "anonymous.devices", path: "/items/devices?limit=1", expected: 403 },
  { name: "anonymous.site_settings", path: "/items/site_settings?limit=1", expected: 403 },
  { name: "anonymous.navigation_items", path: "/items/navigation_items?limit=1", expected: 403 },
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

if (failed) {
  console.error(
    "Directus API policy audit failed. Anonymous content API should remain fail-closed.",
  );
  process.exit(1);
}

console.log("Directus API policy audit passed.");
