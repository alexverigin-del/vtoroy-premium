import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workerConfig, createClients, workerTick, runWorker, deliveryDelayMs, recoverableWorkerError, recoveryDelayMs } from './lib/telegram-worker.mjs';
import { inspectTelegram } from './telegram_preflight.mjs';
import endpoint, { createHandlers } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js';
import { parseUpdate, routeMatches, renderCard, deliveryFailure, nextOperation } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/protocol.js';
import { createConversations, messageContent } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/conversations.js';
import { createNotifications, campaignPayload } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/notifications.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = '123456:TEST_ONLY_abcdefghijklmnopqrstuvwxyz';
const CHAT = '-1001234567890';
const config = { enabled: true, token: TOKEN, directusToken: 'FAKE_DIRECTUS_SECRET', chatId: CHAT, botId: '123456', mode: 'test', directusUrl: 'https://api.example.test' };
const env = { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_DIRECTUS_TOKEN: config.directusToken, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_DIRECTUS_URL: config.directusUrl };
const callback = () => ({ update_id: 7, callback_query: { id: 'callback-7', data: `take:${ID}`, from: { id: 321, is_bot: false }, message: { message_id: 8, message_thread_id: 4, chat: { id: Number(CHAT), type: 'supergroup' } } } });

test('private destinations require an explicit conversation job; photos cannot fetch arbitrary URLs', async () => {
  let calls=0;
  const client=createClients(config,async()=>{calls++;return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200});});
  await assert.rejects(client.telegram('sendMessage',{chat_id:'123',text:'private'}),/DESTINATION_MISMATCH/);
  await assert.rejects(client.telegram('sendMessage',{chat_id:'-999',text:'other group'},{channel:'conversation',destination:'client'}),/DESTINATION_MISMATCH/);
  await client.telegram('sendMessage',{chat_id:'123',text:'explicit private reply'},{channel:'conversation',destination:'client'});
  await client.telegram('editMessageText',{chat_id:'123',message_id:1,text:'updated menu'},{channel:'conversation',destination:'client'});
  assert.equal(calls,2);
  assert.equal(messageContent({photo:[{file_id:'https://example.test/private'}]}),null);
  assert.equal(messageContent({caption:'Caption',document:{file_id:'file'}}),null);
  assert.equal(messageContent({text:'a'.repeat(3501)}),null);
});

test('service messages drain quickly while campaigns keep conservative pacing', () => {
  assert.equal(deliveryDelayMs('service'),1100);
  assert.equal(deliveryDelayMs('campaign'),3200);
  assert.equal(deliveryDelayMs(null),1000);
});

test('worker keeps one identity through lease conflicts and transient poll failures', async () => {
  assert.equal(recoverableWorkerError(new Error('DIRECTUS_HTTP_409')),true);
  assert.equal(recoverableWorkerError(new Error('TELEGRAM_POLL_FAILED')),true);
  assert.equal(recoverableWorkerError(new Error('TELEGRAM_MODE_MISMATCH')),false);
  assert.equal(recoveryDelayMs(new Error('DIRECTUS_HTTP_409'),1),5000);
  const controller=new AbortController();
  const identities=[];let sessions=0,polls=0;
  const clients={
    directus:async(path,data)=>{
      identities.push(data.worker_id);
      if(path==='session'&&sessions++===0) throw new Error('DIRECTUS_HTTP_409');
      if(path==='session') return {mode:'test',update_offset:0,conversations:false};
      if(path==='next') {controller.abort();return {job:null};}
      throw new Error('UNEXPECTED_DIRECTUS_CALL');
    },
    telegram:async method=>{assert.equal(method,'getUpdates');polls++;return polls===1?{type:'unknown'}:{type:'ok',result:[]};},
  };
  await runWorker(env,{signal:controller.signal,sleep:async()=>{},log:()=>{},inspect:async()=>({ready:true,webhookConfigured:false}),clientsFactory:()=>clients});
  assert.ok(sessions>=3);
  assert.equal(new Set(identities).size,1);
  assert.equal(polls,2);
});

test('campaign payload accepts one verified photo and only a first-party CTA', () => {
  const payload=campaignPayload({message_text:'Новое поступление',cta_label:'Открыть',cta_url:'https://isvoi.ru/catalog',utm_campaign:'arrival'},'https://api.isvoi.ru/assets/11111111-1111-4111-8111-111111111111');
  assert.equal(payload.photo,'https://api.isvoi.ru/assets/11111111-1111-4111-8111-111111111111');
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url,'https://isvoi.ru/catalog?utm_campaign=arrival');
  assert.throws(()=>campaignPayload({message_text:'Текст',cta_label:'Открыть',cta_url:'https://example.com'},null),/CAMPAIGN_CTA_INVALID/);
  assert.throws(()=>campaignPayload({message_text:'а'.repeat(1025)},'https://api.isvoi.ru/assets/11111111-1111-4111-8111-111111111111'),/CAMPAIGN_CAPTION_INVALID/);
});

test('conversation pilot rejects non-allowlisted clients before accessing storage', async () => {
  const module=createConversations({env:{ISVOI_TELEGRAM_ENABLED:true,ISVOI_TELEGRAM_CONVERSATIONS_ENABLED:true,ISVOI_TELEGRAM_TEST_CLIENT_IDS:'321'},botId:'123456',mode:'test'});
  const update={message:{message_id:1,chat:{type:'private',id:999},from:{id:999,is_bot:false},text:'/start'}};
  assert.equal(await module.update(()=>assert.fail('Unapproved client reached database'),update),'forbidden');
});

test('message polling is enabled only by the authenticated session capability', async () => {
  for(const enabled of [false,true]) {
    const calls=[];
    await workerTick({conversations:enabled,offset:0,identity:{},clients:{
      telegram:async(method,payload)=>{calls.push(payload);return {type:'ok',result:[]};},
      directus:async()=>({job:null}),
    }});
    assert.deepEqual(calls[0].allowed_updates,enabled?['callback_query','message']:['callback_query']);
  }
});

test('disabled worker makes no requests, even if credentials exist', async () => {
  await runWorker({ ...env, TELEGRAM_ENABLED: 'false' }, { once: true, log() {}, fetchImpl() { assert.fail('Unexpected network'); } });
  assert.equal(workerConfig({}).enabled, false);
});

test('Telegram preflight retries transient network failures without exposing credentials', async () => {
  let calls=0,sleeps=0;
  const result=await inspectTelegram({...env,TELEGRAM_BOT_USERNAME:'isvoi_help_bot',TELEGRAM_GROUP_TITLE:'I СВОИ · Заявки · Белгород'}, {
    sleep:async()=>{sleeps++;},
    fetchImpl:async url=>{
      calls++;
      if(calls===1) throw new Error(`transient ${url}`);
      const method=new URL(url).pathname.split('/').pop();
      const responses={
        getMe:{id:123456,is_bot:true,username:'isvoi_help_bot'},
        getWebhookInfo:{url:'',pending_update_count:0},
        getChat:{id:Number(CHAT),type:'supergroup',title:'I СВОИ · Заявки · Белгород',is_forum:true},
        getChatMember:{status:'administrator',can_manage_topics:true,can_pin_messages:true},
      };
      return new Response(JSON.stringify({ok:true,result:responses[method]}),{status:200});
    },
  });
  assert.equal(result.ready,true);
  assert.equal(calls,5);
  assert.equal(sleeps,1);
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
    for (const name of ['session','next','complete','update']) await assert.rejects(handlers[name]({ accountability, body: {} }), error => error.publicCode === code);
    await assert.rejects(handlers.intake({accountability,body:{}}),error=>error.publicCode==='CONVERSATIONS_DISABLED');
    await assert.rejects(handlers['intake-check']({accountability,body:{}}),error=>error.publicCode==='CONVERSATIONS_DISABLED');
  }
});

test('active intake users with a direct policy do not need a role', async () => {
  const database=()=>({where:()=>({first:async()=>({id:ID,role:null})})});
  const conversations=createConversations({
    database,botId:'123456',mode:'production',
    env:{ISVOI_TELEGRAM_ENABLED:'true',ISVOI_TELEGRAM_CONVERSATIONS_ENABLED:'true',ISVOI_TELEGRAM_INTAKE_USER_ID:ID},
  });
  assert.deepEqual(await conversations.intakeCheck({accountability:{user:ID,role:null,admin:false}}),{ok:true});
});

test('runtime contains only the scoped endpoint and built files match sources', async () => {
  const paths = [];
  endpoint.handler({ post(path) { paths.push(path); } }, { env: {} });
  assert.deepEqual(paths, ['/session', '/next', '/complete', '/update', '/intake', '/intake-check']);
  const root = new URL('../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/', import.meta.url);
  assert.equal(typeof createNotifications,'function');
  for (const file of ['index.js', 'protocol.js', 'conversations.js', 'notifications.js']) {
    assert.equal(await readFile(new URL(`src/${file}`, root), 'utf8'), await readFile(new URL(`dist/${file}`, root), 'utf8'));
  }
});

test('production conversation release is pinned, reversible and secret-safe', async () => {
  const release=await readFile(new URL('./release_telegram_conversations_production.mjs',import.meta.url),'utf8');
  const compose=await readFile(new URL('../infra/directus-beget/docker-compose.yml',import.meta.url),'utf8');
  assert.match(release,/expectedBase='2bee9ed328fe85d65fd270211c99e7147c9efb1d'/);
  assert.match(release,/pg_restore','--list/);
  assert.match(release,/git',\['reset','--hard',expectedBase\]/);
  assert.match(release,/PUBLIC_INTAKE_NOT_DENIED/);
  assert.match(release,/SCOPED_INTAKE_PREFLIGHT_FAILED/);
  assert.match(release,/\['127\.0\.0\.1','localhost','::1'\]/);
  assert.match(release,/target\.protocol==='http:'&&loopback/);
  assert.match(release,/target\.username\|\|target\.password/);
  assert.match(release,/effective_policies\(policy\)/);
  assert.match(release,/q\.name='ISVOI Lead Intake' AND NOT q\.admin_access/);
  assert.match(release,/CONVERSATIONS_SCHEMA_PARTIAL/);
  assert.match(release,/CONVERSATIONS_SCHEMA_NOT_EMPTY/);
  const stopped=release.indexOf("cmd('pm2',['stop','isvoi-telegram'])");
  const expired=release.indexOf('UPDATE telegram_runtime SET lease_until=now()');
  const acquired=release.indexOf("endpoint('session',workerToken,identity)");
  assert.ok(stopped>=0&&stopped<expired&&expired<acquired);
  assert.match(release,/STAGE1_ROUTE_CHANGED/);
  assert.match(release,/retentionMonths:6/);
  assert.doesNotMatch(release,/console\.(?:log|error)\([^\n]*(?:TELEGRAM_BOT_TOKEN|DIRECTUS_LEADS_TOKEN|workerToken)/);
  for(const key of ['ISVOI_TELEGRAM_CONVERSATIONS_ENABLED','ISVOI_TELEGRAM_BOT_USERNAME','ISVOI_TELEGRAM_INTAKE_USER_ID']) assert.match(compose,new RegExp(`${key}: \\$\\{${key}:-`));
});

test('notification release gates schema, pilot activation, profile and rollback', async () => {
  const release=await readFile(new URL('./release_telegram_notifications_production.mjs',import.meta.url),'utf8');
  const prepare=await readFile(new URL('./prepare_telegram_notifications_release.mjs',import.meta.url),'utf8');
  const compose=await readFile(new URL('../infra/directus-beget/docker-compose.yml',import.meta.url),'utf8');
  assert.match(release,/expectedBase='9bc0a592338bbb9bba13b6dfb08ad30e7409eac9'/);
  assert.match(prepare,/RELEASE_BASE_NOT_ANCESTOR/);
  assert.ok(release.indexOf("rehearse_telegram.mjs','--production") < release.indexOf("sql(notificationsSql)"));
  assert.ok(release.indexOf("sql(notificationsSql)") < release.indexOf("ISVOI_TELEGRAM_NOTIFICATIONS_ENABLED:true"));
  assert.match(release,/configure_telegram_bot_profile\.mjs','--apply/);
  assert.match(release,/pilot_user_ids='\[\\"65092546\\"\]'::jsonb/);
  assert.match(release,/state='cancelled',error_code='NOTIFICATIONS_DISABLED'/);
  assert.match(compose,/ISVOI_TELEGRAM_NOTIFICATIONS_ENABLED: \$\{ISVOI_TELEGRAM_NOTIFICATIONS_ENABLED:-false\}/);
});

test('notification schema exposes delivery timestamps and p50/p95 metrics', async () => {
  const schema=await readFile(new URL('./setup_directus_telegram_notifications_sql.mjs',import.meta.url),'utf8');
  assert.match(schema,/ADD COLUMN IF NOT EXISTS sent_at timestamptz/);
  assert.match(schema,/ADD COLUMN IF NOT EXISTS delivery_latency_ms integer/);
  assert.match(schema,/ALTER TABLE telegram_deliveries ADD COLUMN IF NOT EXISTS sent_at/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS telegram_delivery_metrics/);
  assert.match(schema,/isvoi_refresh_telegram_delivery_metrics/);
});

test('explicit pilot test delivery bypasses marketing quiet hours', async () => {
  const source=await readFile(new URL('../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/notifications.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('if(row.is_test) return true') < source.indexOf('const inside=await trx.raw'));
});

test('speed release is pinned, backed up, rehearsed and reversible', async () => {
  const release=await readFile(new URL('./release_telegram_speed_production.mjs',import.meta.url),'utf8');
  const prepare=await readFile(new URL('./prepare_telegram_speed_release.mjs',import.meta.url),'utf8');
  assert.match(release,/expectedBase='94d44f7799b7e8e640859ffab2909f15db84055c'/);
  assert.match(prepare,/RELEASE_BASE_NOT_ANCESTOR/);
  assert.match(release,/pg_restore','--list/);
  assert.ok(release.indexOf("pm2',['stop','isvoi-telegram'") < release.indexOf("sql(notificationsSql)"));
  assert.ok(release.indexOf("rehearse_telegram.mjs','--production") < release.indexOf("sql(notificationsSql)"));
  assert.match(release,/git',\['reset','--hard',expectedBase\]/);
  assert.match(release,/serviceDelayMs:1100,campaignDelayMs:3200/);
});
