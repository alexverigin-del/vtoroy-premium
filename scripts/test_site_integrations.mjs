import assert from "node:assert/strict";

import {
  allConsentCategories,
  DEFAULT_INTEGRATION_CONSENT_SETTINGS,
  emptyConsentCategories,
  matchesIntegrationTarget,
  normalizeSiteIntegration,
  parseConsentChoice,
  serializeConsentChoice,
} from "../apps/web/lib/site-integrations.ts";

const metrikaRow = {
  id: "metrika",
  name: "Яндекс Метрика",
  provider: "yandex_metrika",
  consent_category: "analytics",
  load_strategy: "after_interactive",
  provider_settings: {
    counterId: "123456",
    webvisor: false,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
  },
  hostnames: ["isvoi.ru"],
  include_paths: ["/catalog"],
  exclude_paths: ["/catalog/private"],
  sort: 10,
};

const normalized = normalizeSiteIntegration(metrikaRow);
assert.ok(normalized.integration, normalized.reason);
assert.equal(normalized.integration.provider, "yandex_metrika");
assert.equal(matchesIntegrationTarget(normalized.integration, "isvoi.ru", "/catalog"), true);
assert.equal(matchesIntegrationTarget(normalized.integration, "isvoi.ru", "/catalog/iphone"), true);
assert.equal(matchesIntegrationTarget(normalized.integration, "isvoi.ru", "/catalogue"), false);
assert.equal(
  matchesIntegrationTarget(normalized.integration, "isvoi.ru", "/catalog/private/item"),
  false,
);
assert.equal(matchesIntegrationTarget(normalized.integration, "club.isvoi.ru", "/catalog"), false);

assert.match(
  normalizeSiteIntegration({ ...metrikaRow, provider_settings: { counterId: "" } }).reason,
  /counter settings/,
);
assert.match(
  normalizeSiteIntegration({
    ...metrikaRow,
    provider: "custom",
    script_url: "http://example.com/chat.js",
    bootstrap_code: "window.chat = true",
    include_paths: [],
    exclude_paths: [],
  }).reason,
  /HTTPS/,
);
assert.match(
  normalizeSiteIntegration({
    ...metrikaRow,
    provider: "custom",
    script_url: "https://user:secret@example.com/chat.js",
    bootstrap_code: "window.chat = true",
    include_paths: [],
    exclude_paths: [],
  }).reason,
  /HTTPS/,
);
assert.match(
  normalizeSiteIntegration({
    ...metrikaRow,
    provider: "custom",
    script_url: "https://example.com/chat.js",
    bootstrap_code: "window.chat = true",
    include_paths: ["/catalog"],
    exclude_paths: [],
  }).reason,
  /cleanup/,
);
assert.ok(
  normalizeSiteIntegration({
    ...metrikaRow,
    provider: "custom",
    consent_category: "support",
    script_url: "https://example.com/chat.js",
    bootstrap_code: "window.chat = true",
    cleanup_code: "delete window.chat",
  }).integration,
);

const now = new Date("2026-09-01T12:00:00.000Z");
const choice = {
  version: DEFAULT_INTEGRATION_CONSENT_SETTINGS.version,
  updatedAt: now.toISOString(),
  categories: { ...emptyConsentCategories(), analytics: true },
};
const serialized = serializeConsentChoice(choice);
assert.deepEqual(parseConsentChoice(serialized, DEFAULT_INTEGRATION_CONSENT_SETTINGS, now), choice);
assert.equal(
  parseConsentChoice(
    serialized,
    { ...DEFAULT_INTEGRATION_CONSENT_SETTINGS, version: "new-version" },
    now,
  ),
  null,
);
assert.equal(
  parseConsentChoice(
    serializeConsentChoice({ ...choice, updatedAt: "2026-09-01T13:00:00.000Z" }),
    DEFAULT_INTEGRATION_CONSENT_SETTINGS,
    now,
  ),
  null,
);
assert.equal(
  parseConsentChoice(
    serialized,
    { ...DEFAULT_INTEGRATION_CONSENT_SETTINGS, retentionDays: 1 },
    new Date("2026-09-03T12:00:00.000Z"),
  ),
  null,
);
assert.deepEqual(allConsentCategories(), {
  analytics: true,
  marketing: true,
  support: true,
});

console.log("Site integrations contract tests passed.");
