// Executed only by rehearse_telegram.mjs inside a disposable isolated Docker network.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHandlers } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js';
import { telegramSql } from './setup_directus_telegram_sql.mjs';

if (process.env.TELEGRAM_DISPOSABLE_FIXTURE !== 'true' || process.env.DB_HOST !== 'db') throw new Error('DISPOSABLE_FIXTURE_REQUIRED');
const require = createRequire(import.meta.url);
const base = '/directus/node_modules/.pnpm';
const packages = readdirSync(base);
const findPackage = name => {
  const entry = packages.find(item => item.startsWith(`${name}@`));
  if (!entry) throw new Error(`Fixture runtime missing ${name}`);
  return `${base}/${entry}/node_modules/${name}`;
};
const knexRoot = findPackage('knex');
const knex = require(knexRoot);
const pg = require(findPackage('pg'));
const PgClient = require(`${knexRoot}/lib/dialects/postgres/index.js`);
class FixturePgClient extends PgClient { _driver() { return pg; } }
const db = knex({ client: FixturePgClient, connection: { host: 'db', user: 'postgres', password: 'fixture', database: 'telegram_test' }, pool: { min: 0, max: 5 } });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const worker = id(1), role = id(2), store = id(3), route = id(4), manager1 = id(5), manager2 = id(6), denied = id(7), leader = id(8);
const identity = { bot_id: '123456', worker_id: leader };
const req = body => ({ accountability: { user: worker, admin: false }, body: { ...identity, ...body } });
const env = { ISVOI_TELEGRAM_ENABLED: 'true', ISVOI_TELEGRAM_BOT_ID: '123456', ISVOI_TELEGRAM_WORKER_USER_ID: worker, ISVOI_TELEGRAM_MODE: 'test', PUBLIC_URL: 'https://api.example.test' };
// Services emulate permission denial while writes use actual PostgreSQL transactions.
// Real Directus policy evaluation remains a separate staging acceptance gate.
class FixtureItemsService {
  constructor(collection, options) { this.collection = collection; this.options = options; }
  async updateOne(key, patch) { await this.options.knex(this.collection).where({ id: key }).update(patch); }
  async createOne(payload) {
    if (this.options.accountability.user === denied) throw Object.assign(new Error('denied'), { code: 'FORBIDDEN', status: 403 });
    await this.options.knex(this.collection).insert(payload);
  }
}
const handlers = createHandlers({ database: db, env, services: { ItemsService: FixtureItemsService }, getSchema: async () => ({}) });
const callback = (delivery, number, user = 501, chat = -1001234567890) => req({ update: { update_id: number, callback_query: {
  id: `cb-${number}`, data: `take:${delivery.id}`, from: { id: user, is_bot: false },
  message: { message_id: 8, message_thread_id: 7, chat: { id: chat, type: 'supergroup' } },
} } });
async function leadWithCard(number) {
  const lead = id(number);
  await db('leads').insert({ id: lead, store_location_id: store, is_test: true, kind: 'purchase', device: 'Fixture phone' });
  const delivery = await db('telegram_deliveries').where({ lead_id: lead }).first();
  await db('telegram_deliveries').where({ id: delivery.id }).update({ topic_id: 7, message_id: 8, state: 'done', sent_revision: 1 });
  return delivery;
}

try {
  await db('directus_roles').insert({ id: role });
  await db('directus_users').insert([worker, manager1, manager2, denied].map(user => ({ id: user, role, status: 'active' })));
  await db('store_locations').insert({ id: store, city: 'Белгород' });
  await db('telegram_routes').insert({ id: route, store_id: store, bot_id: 123456, chat_id: -1001234567890, is_test: true, enabled: true });
  await db('telegram_staff').insert([manager1, manager2, denied].map((user, i) => ({ route_id: route, telegram_user_id: 501 + i, directus_user: user, enabled: true })));
  await db.raw(telegramSql);
  assert.equal((await db('telegram_routes').where({ id: route }).first()).enabled, true);
  assert.equal(Number((await db('telegram_staff').where({ enabled: true }).count('* as total').first()).total), 3);
  await handlers.session(req({}));
  await assert.rejects(handlers.session(req({ worker_id: id(90) })), error => error.publicCode === 'WORKER_LEASE_UNAVAILABLE');

  const delivery = await leadWithCard(10);
  const results = await Promise.all([handlers.update(callback(delivery, 1, 501)), handlers.update(callback(delivery, 2, 502))]);
  assert.deepEqual(results.map(row => row.result).sort(), ['already_assigned', 'claimed']);
  assert.equal(Number((await db('lead_comments').where({ lead: delivery.lead_id }).count('* as total').first()).total), 1);
  const owner = (await db('leads').where({ id: delivery.lead_id }).first()).assigned_to;
  assert.ok([manager1, manager2].includes(owner));
  const replay = await handlers.update(callback(delivery, 1, 501));
  assert.equal(replay.result, results[0].result);
  assert.equal(Number((await db('lead_comments').where({ lead: delivery.lead_id }).count('* as total').first()).total), 1);

  const deniedDelivery = await leadWithCard(11);
  assert.equal((await handlers.update(callback(deniedDelivery, 3, 503))).result, 'forbidden');
  assert.equal((await db('leads').where({ id: deniedDelivery.lead_id }).first()).assigned_to, null);
  assert.equal((await db('leads').where({ id: deniedDelivery.lead_id }).first()).status, 'new');
  assert.equal(Number((await db('telegram_deliveries').where({ id: deniedDelivery.id }).first()).revision), 1);
  assert.equal((await handlers.update(callback(deniedDelivery, 4, 501, -1009999999999))).result, 'stale');
  await db('telegram_staff').where({ directus_user: manager1 }).update({ enabled: false });
  assert.equal((await handlers.update(callback(deniedDelivery, 5, 501))).result, 'forbidden');

  // The trigger must neither mix real/test leads nor enqueue before activation.
  await db('leads').insert([{ id: id(20), store_location_id: store, is_test: false }, { id: id(21), store_location_id: null, is_test: true }, { id: id(22), store_location_id: store, is_test: true, created_at: '2000-01-01' }]);
  assert.equal(Number((await db('telegram_deliveries').whereIn('lead_id', [id(20), id(21), id(22)]).count('* as total').first()).total), 0);
  await db.transaction(async trx => {
    await trx('leads').insert({ id: id(23), store_location_id: store, is_test: true });
    throw new Error('rollback-fixture');
  }).catch(error => { assert.equal(error.message, 'rollback-fixture'); });
  assert.equal(Number((await db('telegram_deliveries').where({ lead_id: id(23) }).count('* as total').first()).total), 0);

  // Finish existing refreshes before checking a fresh uncertain topic creation.
  await db('telegram_deliveries').update({ state: 'done' });
  await db('leads').insert({ id: id(30), store_location_id: store, is_test: true });
  await db('telegram_runtime').update({ send_after: new Date(0) });
  const { job } = await handlers.next(req({}));
  assert.equal(job.method, 'createForumTopic');
  await handlers.complete(req({ id: job.id, operation_id: job.operation_id, outcome: { type: 'unknown' } }));
  assert.equal((await db('telegram_deliveries').where({ id: job.id }).first()).state, 'uncertain');
  await db('telegram_runtime').update({ send_after: new Date(0) });
  assert.equal((await handlers.next(req({}))).job, null);
  console.log('PASS: actual PostgreSQL race, receipts, permission rollback, route/test isolation, transactional queue, worker lease and uncertain delivery.');
} finally { await db.destroy(); }
