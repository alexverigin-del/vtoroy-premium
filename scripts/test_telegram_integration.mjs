import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workerConfig, createClients, workerTick, runWorker } from './lib/telegram-worker.mjs';
import endpoint, { createHandlers } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js';
import { parseUpdate, routeMatches, renderCard, deliveryFailure, nextOperation } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/protocol.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = '123456:TEST_ONLY_abcdefghijklmnopqrstuvwxyz';
const CHAT = '-1001234567890';
const config = { enabled: true, token: TOKEN, directusToken: 'FAKE_DIRECTUS_SECRET', chatId: CHAT, botId: '123456', mode: 'test', directusUrl: 'https://api.example.test' };
const env = { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_DIRECTUS_TOKEN: config.directusToken, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_DIRECTUS_URL: config.directusUrl };
const callback = () => ({ update_id: 7, callback_query: { id: 'callback-7', data: `take:${ID}`, from: { id: 321, is_bot: false }, message: { message_id: 8, message_thread_id: 4, chat: { id: Number(CHAT), type: 'supergroup' } } } });

test('disabled worker makes no requests, even if credentials exist', async () => {
  await runWorker({ ...env, TELEGRAM_ENABLED: 'false' }, { once: true, log() {}, fetchImpl() { assert.fail('Unexpected network'); } });
  assert.equal(workerConfig({}).enabled, false);
});

test('worker rejects unsafe Directus destinations and incomplete configuration', () => {
  for (const url of ['http://api.example.test', 'https://name:secret@api.example.test', 'https://api.example.test/path', 'https://api.example.test/?token=secret']) {
    assert.throws(() => workerConfig({ ...env, TELEGRAM_DIRECTUS_URL: url }));
  }
  assert.throws(() => workerConfig({ ...env, TELEGRAM_DIRECTUS_TOKEN: '' }));
  assert.equal(workerConfig({ ...env, TELEGRAM_DIRECTUS_URL: 'http://127.0.0.1:8055' }).enabled, true);
});

test('forged, anonymous, private and incomplete callbacks cannot claim a lead', () => {
  assert.equal(parseUpdate(callback()).callback.supported, true);
  for (const change of [
    q => { delete q.from; }, q => { q.from.is_bot = true; },
    q => { q.message.chat.type = 'private'; }, q => { delete q.message.message_thread_id; },
    q => { q.data = 'take:not-a-uuid'; }, q => { q.from.id = 1.5; },
  ]) {
    const update = callback(); change(update.callback_query);
    assert.equal(parseUpdate(update).callback.supported, false);
  }
  assert.throws(() => parseUpdate({ update_id: -1 }));
});

test('test isolation and store routing fail closed', () => {
  const route = { enabled: true, store_id: ID, is_test: false, accept_unscoped: false };
  assert.equal(routeMatches({ is_test: true, store_location_id: ID }, route), false);
  assert.equal(routeMatches({ is_test: false, store_location_id: OTHER }, route), false);
  assert.equal(routeMatches({ is_test: false, store_location_id: null }, route), false);
  assert.equal(routeMatches({ is_test: false, store_location_id: ID }, route), true);
});

test('cards omit contacts and client comments; take button disappears after assignment or closure', () => {
  const lead = { id: ID, status: 'new', kind: 'purchase', device: '<b>Phone</b>', contact: 'PRIVATE_PHONE', message: 'PRIVATE_MESSAGE' };
  const card = renderCard(lead, { city: 'Белгород', is_test: true }, { id: OTHER }, '', 'https://api.example.test');
  assert.ok(!JSON.stringify(card).includes('PRIVATE'));
  assert.ok(card.text.includes('<b>Phone</b>')); // Sent without parse_mode; never interpreted as markup.
  assert.ok(Buffer.byteLength(card.reply_markup.inline_keyboard[0][0].callback_data) <= 64);
  const pilot = renderCard(lead, { city: 'Тест', is_test: true }, { id: OTHER }, '', 'https://pilot.invalid', { studioLink: false });
  assert.equal(pilot.reply_markup.inline_keyboard.length, 1);
  assert.equal(pilot.reply_markup.inline_keyboard[0][0].callback_data, `take:${OTHER}`);
  assert.ok(!JSON.stringify(pilot).includes('https://pilot.invalid'));
  for (const patch of [{ assigned_to: OTHER }, { status: 'won' }, { status: 'closed' }]) {
    const updated = renderCard({ ...lead, ...patch }, { city: 'Белгород' }, { id: OTHER }, 'Менеджер', 'https://api.example.test');
    assert.equal(updated.reply_markup.inline_keyboard.length, 1);
  }
});

test('unknown creation outcomes stop retries; edits and rate limits follow explicit rules', () => {
  assert.equal(nextOperation({}), 'createForumTopic');
  assert.equal(nextOperation({ topic_id: 4 }), 'sendMessage');
  assert.equal(nextOperation({ topic_id: 4, message_id: 8 }), 'editMessageText');
  for (const method of ['createForumTopic', 'sendMessage']) assert.equal(deliveryFailure(method, { type: 'unknown' }, 1).state, 'uncertain');
  assert.equal(deliveryFailure('editMessageText', { type: 'unknown' }, 1).state, 'pending');
  assert.equal(deliveryFailure('editMessageText', { type: 'unknown' }, 8).state, 'failed');
  assert.equal(deliveryFailure('sendMessage', { type: 'rate_limit', retryAfter: 90 }, 1).delay, 90);
  assert.equal(deliveryFailure('sendMessage', { type: 'permanent', status: 403 }, 1).state, 'failed');
});

test('network errors and API errors cannot expose tokens; destinations are pinned', async () => {
  const clients = createClients(config, async () => { throw new Error(`URL ${TOKEN} ${config.directusToken}`); });
  assert.deepEqual(await clients.telegram('sendMessage', { chat_id: CHAT, text: 'test' }), { type: 'unknown' });
  await assert.rejects(clients.directus('session', {}), error => !error.message.includes(TOKEN) && !error.message.includes(config.directusToken));
  await assert.rejects(clients.telegram('sendMessage', { chat_id: '-1009876543210' }), /DESTINATION_MISMATCH/);
  await assert.rejects(clients.telegram('setWebhook', {}), /INVALID_TELEGRAM_OPERATION/);
});

test('a failed DB acknowledgement does not repeat the Telegram send', async () => {
  const calls = []; let attempts = 0;
  const clients = {
    telegram: async method => { calls.push(method); return { type: 'ok', result: method === 'getUpdates' ? [] : { message_id: 9 } }; },
    directus: async path => {
      calls.push(path);
      if (path === 'next') return { job: { id: ID, operation_id: OTHER, method: 'sendMessage', payload: { chat_id: CHAT } } };
      if (path === 'complete' && ++attempts < 3) throw new Error('DB unavailable');
      return { ok: true };
    },
  };
  await workerTick({ clients, identity: {}, offset: 0, sleep: async () => {} });
  assert.equal(calls.filter(x => x === 'sendMessage').length, 1);
  assert.equal(calls.filter(x => x === 'complete').length, 3);
});

test('incoming callback is committed before Telegram answer and cursor advances only after storage', async () => {
  const calls = [];
  const clients = {
    telegram: async (method, payload) => { calls.push(method); if (method === 'getUpdates') { assert.equal(payload.offset, 7); return { type: 'ok', result: [callback()] }; } return { type: 'ok', result: true }; },
    directus: async path => { calls.push(path); return path === 'update' ? { update_offset: 8, callback_id: 'callback-7', text: 'OK', result: 'claimed' } : { job: null }; },
  };
  assert.equal((await workerTick({ clients, identity: {}, offset: 7 })).offset, 8);
  assert.deepEqual(calls, ['getUpdates', 'update', 'answerCallbackQuery', 'next']);
  calls.length = 0;
  clients.directus = async () => { throw new Error('database unavailable'); };
  await assert.rejects(workerTick({ clients, identity: {}, offset: 7 }));
  assert.deepEqual(calls, ['getUpdates']);
});

test('endpoint refuses disabled, public, admin and mismatched worker identities before mutation', async () => {
  const base = { ISVOI_TELEGRAM_ENABLED: 'true', ISVOI_TELEGRAM_BOT_ID: '123456', ISVOI_TELEGRAM_WORKER_USER_ID: ID, ISVOI_TELEGRAM_MODE: 'test', PUBLIC_URL: 'https://api.example.test' };
  const neverDb = () => assert.fail('Database should not be reached');
  for (const [envOverride, accountability, code] of [
    [{ ISVOI_TELEGRAM_ENABLED: 'false' }, { user: ID }, 'TELEGRAM_DISABLED'],
    [{}, null, 'FORBIDDEN'], [{}, { user: OTHER }, 'FORBIDDEN'], [{}, { user: ID, admin: true }, 'FORBIDDEN'],
    [{ ISVOI_TELEGRAM_ENABLED: true }, { user: OTHER }, 'FORBIDDEN'],
  ]) {
    const handlers = createHandlers({ env: { ...base, ...envOverride }, database: neverDb });
    for (const handler of Object.values(handlers)) await assert.rejects(handler({ accountability, body: {} }), error => error.publicCode === code);
  }
});

test('runtime contains only the scoped endpoint and built files match sources', async () => {
  const paths = [];
  endpoint.handler({ post(path) { paths.push(path); } }, { env: {} });
  assert.deepEqual(paths, ['/session', '/next', '/complete', '/update']);
  const root = new URL('../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/', import.meta.url);
  for (const file of ['index.js', 'protocol.js']) {
    assert.equal(await readFile(new URL(`src/${file}`, root), 'utf8'), await readFile(new URL(`dist/${file}`, root), 'utf8'));
  }
});
