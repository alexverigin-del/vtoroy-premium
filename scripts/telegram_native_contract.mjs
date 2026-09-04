// Real Directus services and policies, disposable DB only; never contacts Telegram.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandlers } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js';
import { telegramSql } from './setup_directus_telegram_sql.mjs';

if (process.env.TELEGRAM_DISPOSABLE_FIXTURE !== 'true' || process.env.DB_HOST !== 'db' || process.env.DB_DATABASE !== 'telegram_test') throw new Error('DISPOSABLE_FIXTURE_REQUIRED');
const api = '/directus/node_modules/@directus/api/dist';
const { default: getDatabase } = await import(`${api}/database/index.js`);
const { ItemsService } = await import(`${api}/services/items.js`);
const { getSchema } = await import(`${api}/utils/get-schema.js`);
const db = getDatabase();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const worker = id(1), workerRole = id(2), store = id(3), route = id(4), manager = id(5), noComment = id(6), noField = id(7), noRow = id(8), leader = id(9), secondManager = id(10);
const identity = { bot_id: '123456', worker_id: leader };
const req = body => ({ accountability: { user: worker, admin: false }, body: { ...identity, ...body } });
const env = { ISVOI_TELEGRAM_ENABLED: true, ISVOI_TELEGRAM_BOT_ID: '123456', ISVOI_TELEGRAM_WORKER_USER_ID: worker, ISVOI_TELEGRAM_MODE: 'test', PUBLIC_URL: 'https://api.example.test' };
const handlers = createHandlers({ database: db, services: { ItemsService }, getSchema: () => getSchema({ bypassCache: true }), env });
const callback = (delivery, number, telegramUser) => req({ update: { update_id: number, callback_query: {
  id: `native-${number}`, data: `take:${delivery.id}`, from: { id: telegramUser, is_bot: false },
  message: { message_id: 8, message_thread_id: 7, chat: { id: -1001234567890, type: 'supergroup' } },
} } });
async function leadWithCard(number) {
  await db('leads').insert({ id: id(number), store_location_id: store, is_test: true, kind: 'purchase', reference_code: `NATIVE-${number}` });
  const delivery = await db('telegram_deliveries').where({ lead_id: id(number) }).first();
  await db('telegram_deliveries').where({ id: delivery.id }).update({ topic_id: 7, message_id: 8, state: 'done', sent_revision: 1 });
  return delivery;
}
async function unchanged(delivery) {
  const lead = await db('leads').where({ id: delivery.lead_id }).first();
  assert.equal(lead.assigned_to, null);
  assert.equal(lead.status, 'new');
  assert.equal(Number((await db('telegram_deliveries').where({ id: delivery.id }).first()).revision), 1);
  assert.equal(Number((await db('lead_comments').where({ lead: delivery.lead_id }).count('* as n').first()).n), 0);
  assert.equal(Number((await db('directus_activity').where({ collection: 'leads', item: delivery.lead_id }).count('* as n').first()).n), 0);
}

try {
  // Keep the actual Directus bootstrap schema; use only custom fixture tables.
  const fixture = (await readFile(new URL('./fixtures/telegram_schema.sql', import.meta.url), 'utf8'))
    .split('\n').filter(line => !line.startsWith('CREATE TABLE directus_')).join('\n');
  await db.raw(fixture);
  for (const collection of ['store_locations', 'leads', 'lead_comments']) {
    await db('directus_collections').insert({ collection, accountability: 'all' });
    await db('directus_fields').insert({ collection, field: 'id', special: 'uuid' });
  }
  await db.raw(telegramSql);
  await db('directus_roles').insert({ id: workerRole, name: 'Fixture worker' });
  await db('directus_users').insert({ id: worker, role: workerRole, status: 'active' });
  const staff = [manager, noComment, noField, noRow, secondManager];
  for (const [index, user] of staff.entries()) {
    const role = id(30 + index), policy = id(40 + index);
    await db('directus_roles').insert({ id: role, name: `Fixture staff ${index}` });
    await db('directus_policies').insert({ id: policy, name: `Fixture policy ${index}`, admin_access: false, app_access: true });
    await db('directus_access').insert({ id: id(50 + index), role, policy });
    await db('directus_users').insert({ id: user, role, status: 'active', first_name: `Fixture ${index}` });
    const permission = (collection, action, fields, filter = {}, validation = {}) => ({ policy, collection, action, fields, permissions: JSON.stringify(filter), validation: JSON.stringify(validation) });
    const permissions = [
      permission('leads', 'read', '*'),
      permission('leads', 'update', user === noField ? 'status' : 'assigned_to,status', user === noRow ? { store_location_id: { _eq: id(999) } } : { is_test: { _eq: true } }),
    ];
    if (user !== noComment) permissions.push(permission('lead_comments', 'create', 'id,lead,created_by,outcome,comment', {}, { created_by: { _eq: '$CURRENT_USER' } }));
    await db('directus_permissions').insert(permissions);
  }
  await db('store_locations').insert({ id: store, city: 'Fixture' });
  await db('telegram_routes').insert({ id: route, store_id: store, bot_id: 123456, chat_id: -1001234567890, is_test: true, enabled: true });
  await db('telegram_staff').insert(staff.map((user, index) => ({ route_id: route, telegram_user_id: 501 + index, directus_user: user, enabled: true })));
  await handlers.session(req({}));
  const good = await leadWithCard(100);
  assert.equal((await handlers.update(callback(good, 1, 501))).result, 'claimed');
  const lead = await db('leads').where({ id: good.lead_id }).first();
  assert.equal(lead.assigned_to, manager);
  assert.equal(lead.status, 'in_progress');
  assert.equal((await db('lead_comments').where({ lead: good.lead_id }).first()).created_by, manager);
  assert.equal((await db('directus_activity').where({ collection: 'leads', item: good.lead_id, action: 'update' }).first()).user, manager);
  assert.equal((await handlers.update(callback(good, 1, 501))).result, 'claimed');
  assert.equal(Number((await db('lead_comments').where({ lead: good.lead_id }).count('* as n').first()).n), 1);
  console.log('PASS: native Directus allowed claim, staff audit identity and replay');
  for (const [offset, telegramUser, label] of [[0, 502, 'comment-create denial'], [1, 503, 'field denial'], [2, 504, 'row denial']]) {
    const delivery = await leadWithCard(110 + offset);
    assert.equal((await handlers.update(callback(delivery, 10 + offset, telegramUser))).result, 'forbidden', label);
    await unchanged(delivery);
    console.log(`PASS: native Directus ${label}, lead/queue/audit rollback`);
  }
  const raced = await leadWithCard(120);
  const race = await Promise.all([handlers.update(callback(raced, 20, 501)), handlers.update(callback(raced, 21, 505))]);
  assert.deepEqual(race.map(result => result.result).sort(), ['already_assigned', 'claimed']);
  assert.equal(Number((await db('lead_comments').where({ lead: raced.lead_id }).count('* as n').first()).n), 1);
  const revoked = await leadWithCard(121);
  await db('directus_users').where({ id: manager }).update({ status: 'suspended' });
  assert.equal((await handlers.update(callback(revoked, 22, 501))).result, 'forbidden');
  await unchanged(revoked);
  const schema = await getSchema({ bypassCache: true });
  const workerService = new ItemsService('leads', { knex: db, schema, accountability: { user: worker, role: workerRole, roles: [workerRole], admin: false } });
  await assert.rejects(workerService.readByQuery({ fields: ['id'], limit: 1 }), error => error.code === 'FORBIDDEN');
  const publicService = new ItemsService('leads', { knex: db, schema, accountability: { user: null, role: null, roles: [], admin: false } });
  await assert.rejects(publicService.readByQuery({ fields: ['id'], limit: 1 }), error => error.code === 'FORBIDDEN');
  console.log('PASS: native Directus race, suspended staff, worker and public collection access denied');
} finally { await db.destroy(); }
