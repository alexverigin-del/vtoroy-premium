import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_REQUIRED_EVENTS,
  VK_REQUIRED_EVENTS,
  inspectMax,
  inspectVk,
} from "./communications_provider_preflight.mjs";

const maxConfig = {
  MAX_BOT_TOKEN: "fixture_max_token_not_valid_000000",
  MAX_BOT_ID: "778899",
  MAX_BOT_USERNAME: "isvoi_max_bot",
  MAX_WEBHOOK_URL: "https://api.example.test/isvoi-communications/v1/webhooks/max-id",
  MAX_WEBHOOK_SECRET: "fixture_max_secret_0000",
};

const vkConfig = {
  VK_GROUP_TOKEN: "fixture_vk_token_not_valid_000000",
  VK_GROUP_ID: "556677",
  VK_WEBHOOK_URL: "https://api.example.test/isvoi-communications/v1/webhooks/vk-id",
  VK_WEBHOOK_SECRET: "fixture_vk_secret_0000",
  VK_CONFIRMATION: "fixture-confirmation",
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function maxFetch(subscriptions) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/me")) {
      return json({ user_id: 778899, username: "isvoi_max_bot", is_bot: true });
    }
    if (url.endsWith("/subscriptions")) return json(subscriptions);
    throw new Error("unexpected request");
  };
  return { calls, fetchImpl };
}

function vkFixture({ permissions = ["messages", "photos", "docs"], events = VK_REQUIRED_EVENTS,
  servers = null, confirmation = "fixture-confirmation", apiVersion = "5.199" } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = url.split("/").at(-1);
    const body = Object.fromEntries(init.body);
    calls.push({ url, method, init, body });
    assert.equal(body.access_token, vkConfig.VK_GROUP_TOKEN);
    assert.equal(body.v, "5.199");
    if (method === "groups.getById") {
      return json({ response: { groups: [{ id: 556677, name: "I СВОИ", screen_name: "isvoi" }], profiles: [] } });
    }
    if (method === "groups.getTokenPermissions") {
      return json({ response: { mask: 0, permissions: permissions.map((name) => ({ name, setting: 1 })) } });
    }
    if (method === "groups.getCallbackServers") {
      return json({ response: { count: 1, items: servers ?? [{
        id: 44,
        title: "ISVOI test",
        creator_id: 1,
        url: vkConfig.VK_WEBHOOK_URL,
        secret_key: vkConfig.VK_WEBHOOK_SECRET,
        status: "ok",
      }] } });
    }
    if (method === "groups.getCallbackSettings") {
      return json({ response: { api_version: apiVersion, events: Object.fromEntries(events.map((name) => [name, 1])) } });
    }
    if (method === "groups.getCallbackConfirmationCode") {
      return json({ response: { code: confirmation } });
    }
    throw new Error("unexpected request");
  };
  return { calls, fetchImpl };
}

test("MAX preflight is read-only and reports complete resource readiness", async () => {
  const fixture = maxFetch({ subscriptions: [{
    url: maxConfig.MAX_WEBHOOK_URL,
    update_types: MAX_REQUIRED_EVENTS,
  }] });
  const report = await inspectMax(maxConfig, { fetchImpl: fixture.fetchImpl, sleep: async () => {} });

  assert.equal(report.ready, true);
  assert.equal(report.identityMatches, true);
  assert.deepEqual(report.webhook.missingEvents, []);
  assert.equal(report.webhook.secretVerification, "live_webhook_required");
  assert.deepEqual(fixture.calls.map(({ url }) => url), [
    "https://platform-api2.max.ru/me",
    "https://platform-api2.max.ru/subscriptions",
  ]);
  for (const call of fixture.calls) {
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.headers.Authorization, maxConfig.MAX_BOT_TOKEN);
  }
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(maxConfig.MAX_BOT_TOKEN), false);
  assert.equal(serialized.includes(maxConfig.MAX_WEBHOOK_SECRET), false);
});

test("MAX preflight blocks wrong URL and missing events without mutating provider", async () => {
  const fixture = maxFetch({ subscriptions: [{
    url: "https://wrong.example.test/hook",
    update_types: ["message_created"],
  }] });
  const report = await inspectMax(maxConfig, { fetchImpl: fixture.fetchImpl, sleep: async () => {} });
  assert.equal(report.ready, false);
  assert.equal(report.webhook.matches, 0);
  assert.ok(report.next.some((item) => item.includes("подписку")));
  assert.deepEqual(fixture.calls.map(({ init }) => init.method), ["GET", "GET"]);
});

test("VK preflight uses only read methods and verifies callback contract", async () => {
  const fixture = vkFixture();
  const report = await inspectVk(vkConfig, { fetchImpl: fixture.fetchImpl, sleep: async () => {} });

  assert.equal(report.ready, true);
  assert.equal(report.identityMatches, true);
  assert.deepEqual(report.token.missingPermissions, []);
  assert.deepEqual(report.webhook.missingEvents, []);
  assert.equal(report.webhook.secretMatches, true);
  assert.equal(report.webhook.confirmationMatches, true);
  assert.deepEqual(fixture.calls.map(({ method }) => method), [
    "groups.getById",
    "groups.getTokenPermissions",
    "groups.getCallbackServers",
    "groups.getCallbackSettings",
    "groups.getCallbackConfirmationCode",
  ]);
  assert.ok(fixture.calls.every(({ init }) => init.method === "POST"));
  assert.ok(fixture.calls.every(({ url }) => !url.includes(vkConfig.VK_GROUP_TOKEN)));
  const serialized = JSON.stringify(report);
  for (const value of [vkConfig.VK_GROUP_TOKEN, vkConfig.VK_WEBHOOK_SECRET, vkConfig.VK_CONFIRMATION]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("VK preflight reports permission, event, version, and secret mismatches", async () => {
  const fixture = vkFixture({
    permissions: ["messages"],
    events: ["message_new"],
    apiVersion: "5.131",
    confirmation: "wrong-confirmation",
    servers: [{
      id: 44,
      url: vkConfig.VK_WEBHOOK_URL,
      secret_key: "wrong-secret-value",
      status: "failed",
    }],
  });
  const report = await inspectVk(vkConfig, { fetchImpl: fixture.fetchImpl, sleep: async () => {} });
  assert.equal(report.ready, false);
  assert.deepEqual(report.token.missingPermissions, ["photos", "docs"]);
  assert.deepEqual(report.webhook.missingEvents, ["message_allow", "message_deny", "message_edit"]);
  assert.equal(report.webhook.secretMatches, false);
  assert.equal(report.webhook.confirmationMatches, false);
  assert.equal(report.webhook.apiVersionMatches, false);
  assert.equal(report.webhook.status, "failed");
});

test("VK preflight does not probe settings when callback server is ambiguous", async () => {
  const duplicate = {
    id: 1,
    url: vkConfig.VK_WEBHOOK_URL,
    secret_key: vkConfig.VK_WEBHOOK_SECRET,
    status: "ok",
  };
  const fixture = vkFixture({ servers: [duplicate, { ...duplicate, id: 2 }] });
  const report = await inspectVk(vkConfig, { fetchImpl: fixture.fetchImpl, sleep: async () => {} });
  assert.equal(report.ready, false);
  assert.equal(report.webhook.candidates, 2);
  assert.deepEqual(fixture.calls.map(({ method }) => method), [
    "groups.getById",
    "groups.getTokenPermissions",
    "groups.getCallbackServers",
  ]);
});

test("provider errors never expose tokens or provider error text", async () => {
  await assert.rejects(
    inspectMax(maxConfig, {
      fetchImpl: async () => { throw new Error(`network ${maxConfig.MAX_BOT_TOKEN}`); },
      sleep: async () => {},
    }),
    (error) => !error.message.includes(maxConfig.MAX_BOT_TOKEN) && error.message.includes("скрыты"),
  );
  await assert.rejects(
    inspectVk(vkConfig, {
      fetchImpl: async () => json({ error: { error_code: 5, error_msg: vkConfig.VK_WEBHOOK_SECRET } }),
      sleep: async () => {},
    }),
    (error) => !error.message.includes(vkConfig.VK_WEBHOOK_SECRET) && error.message.includes("ошибка API 5"),
  );
});
