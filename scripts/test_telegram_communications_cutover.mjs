import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cutover = await readFile(
  new URL("./cutover_telegram_communications_on_host.sh", import.meta.url),
  "utf8",
);
const compose = await readFile(
  new URL("../infra/directus-beget/docker-compose.yml", import.meta.url),
  "utf8",
);
const example = await readFile(
  new URL("../infra/directus-beget/.env.example", import.meta.url),
  "utf8",
);

test("Telegram production cutover is explicit, bounded and keeps MAX workers isolated", () => {
  assert.match(cutover, /Use preflight \| apply \| rollback-before-ingress/);
  assert.doesNotMatch(cutover, /systemctl start isvoi-communications-backup\.service/);
  assert.match(cutover, /isvoi-communications-backup-health/);
  assert.match(cutover, /source \/etc\/isvoi\/communications-backup\.env/);
  assert.match(cutover, /TELEGRAM_CUTOVER_ABORTED_BEFORE_LEGACY_STOP/);
  assert.match(cutover, /COMM_REQUIRE_DATA_READY=true/);
  assert.match(cutover, /pm2_deploy stop isvoi-telegram/);
  assert.match(cutover, /ISVOI_TELEGRAM_USE_COMMUNICATIONS true/);
  assert.match(cutover, /isvoi-communications-telegram@receive\.service/);
  assert.match(cutover, /ROLLBACK_REFUSED_AFTER_NEW_WORK/);
  assert.match(cutover, /systemctl stop isvoi-communications-telegram@receive\.service/);
  assert.match(cutover, /comm_inbound WHERE connection_id/);
  assert.match(cutover, /comm_outbox WHERE connection_id/);
  assert.match(cutover, /TELEGRAM_CUTOVER_REQUIRES_FIX_FORWARD/);
  assert.doesNotMatch(cutover, /disable --now isvoi-communications@(process|send|media)/);
  assert.doesNotMatch(cutover, /UPDATE comm_runtime SET sending_enabled=false/);
});

test("Directus receives the cutover switch with a safe false default", () => {
  assert.match(
    compose,
    /ISVOI_TELEGRAM_USE_COMMUNICATIONS: \$\{ISVOI_TELEGRAM_USE_COMMUNICATIONS:-false\}/,
  );
  assert.match(example, /^ISVOI_TELEGRAM_USE_COMMUNICATIONS=false$/m);
});
