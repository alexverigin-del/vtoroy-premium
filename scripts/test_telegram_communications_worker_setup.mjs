import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { telegramCommunicationsEnv } from "./prepare_telegram_communications_env.mjs";

const fakeToken = `8694946838:${"A".repeat(40)}`;
const fakeWorker = "worker_" + "b".repeat(40);

test("Telegram communications env is isolated from MAX and contains no legacy group settings", () => {
  const result = telegramCommunicationsEnv(`
    TELEGRAM_BOT_TOKEN=${fakeToken}
    TELEGRAM_DIRECTUS_TOKEN=${fakeWorker}
    TELEGRAM_DIRECTUS_URL=https://api.isvoi.ru/
    TELEGRAM_CHAT_ID=-100000000
  `);
  assert.match(result, /COMM_CONNECTION_ID=7c4123ea-3330-4c56-9b14-bdf72f49ae7f/);
  assert.match(result, /COMM_PLATFORM=telegram/);
  assert.match(result, /COMM_DIRECTUS_URL=https:\/\/api\.isvoi\.ru/);
  assert.doesNotMatch(result, /MAX|CHAT_ID/);
  assert.throws(
    () => telegramCommunicationsEnv(`
      TELEGRAM_BOT_TOKEN=1:${"A".repeat(40)}
      TELEGRAM_DIRECTUS_TOKEN=${fakeWorker}
      TELEGRAM_DIRECTUS_URL=https://api.isvoi.ru/
    `),
    /TELEGRAM_BOT_ID_MISMATCH/,
  );
  assert.match(
    telegramCommunicationsEnv(`
      TELEGRAM_BOT_TOKEN=${fakeToken}
      TELEGRAM_DIRECTUS_TOKEN=${fakeWorker}
      TELEGRAM_DIRECTUS_URL=http://127.0.0.1:8055/
    `),
    /COMM_DIRECTUS_URL=http:\/\/127\.0\.0\.1:8055/,
  );
  assert.throws(
    () => telegramCommunicationsEnv(`
      TELEGRAM_BOT_TOKEN=${fakeToken}
      TELEGRAM_DIRECTUS_TOKEN=${fakeWorker}
      TELEGRAM_DIRECTUS_URL=http://api.isvoi.ru/
    `),
    /TELEGRAM_DIRECTUS_URL_INVALID/,
  );
});

test("Telegram systemd unit uses a dedicated closed environment", async () => {
  const [unit, installer] = await Promise.all([
    readFile(new URL("../infra/communications/isvoi-communications-telegram@.service", import.meta.url), "utf8"),
    readFile(new URL("./install_telegram_communications_worker_on_host.sh", import.meta.url), "utf8"),
  ]);
  assert.match(unit, /EnvironmentFile=\/etc\/isvoi\/communications-telegram\.env/);
  assert.match(unit, /run_communications_worker\.mjs %i/);
  assert.match(unit, /User=deploy/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.doesNotMatch(unit, /communications\.env\s*$/m);
  assert.match(installer, /systemctl disable/);
  assert.doesNotMatch(installer, /systemctl enable|systemctl start/);
});
