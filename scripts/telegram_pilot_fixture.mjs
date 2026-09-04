// This module can only run inside the disposable pilot database container network.
import { readFile } from 'node:fs/promises';
import { telegramSql } from './setup_directus_telegram_sql.mjs';
if (process.env.TELEGRAM_DISPOSABLE_FIXTURE !== 'true' || process.env.DB_HOST !== 'db' || process.env.DB_DATABASE !== 'telegram_pilot') throw new Error('PILOT_DATABASE_REQUIRED');
const { default: getDatabase } = await import('/directus/node_modules/@directus/api/dist/database/index.js');
const db = getDatabase();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const worker = id(1), workerRole = id(2), store = id(3), route = id(4), staffRole = id(5), policy = id(6), lead = id(100);
const action = process.argv[2];
try {
  if (action === 'setup') {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    const config = JSON.parse(input);
    if (config.botId !== '8908725708' || config.chatId !== '-1004431327377' || config.telegramUserId !== '65092546' || config.directusUserId !== '1a612dfb-8f1c-455b-a8cd-b57ea60afc24' || !/^[a-f0-9]{64}$/.test(config.workerToken)) throw new Error('PILOT_CONFIG_INVALID');
    const fixture = (await readFile(new URL('./fixtures/telegram_schema.sql', import.meta.url), 'utf8')).split('\n').filter(line => !line.startsWith('CREATE TABLE directus_')).join('\n');
    await db.raw(fixture);
    for (const collection of ['store_locations', 'leads', 'lead_comments']) {
      await db('directus_collections').insert({ collection, accountability: 'all' });
      await db('directus_fields').insert({ collection, field: 'id', special: 'uuid' });
    }
    await db.raw(telegramSql);
    await db.transaction(async trx => {
      await trx('directus_roles').insert([{ id: workerRole, name: 'Telegram pilot worker' }, { id: staffRole, name: 'Telegram pilot staff' }]);
      await trx('directus_policies').insert({ id: policy, name: 'Test leads only', admin_access: false, app_access: false });
      await trx('directus_access').insert({ id: id(7), role: staffRole, policy });
      const permission = (collection, action, fields, permissions = {}, validation = {}) => ({ policy, collection, action, fields, permissions: JSON.stringify(permissions), validation: JSON.stringify(validation) });
      await trx('directus_permissions').insert([
        permission('leads', 'read', 'id,status,assigned_to,kind,device,reference_code,store_location_id,is_test', { is_test: { _eq: true } }),
        permission('leads', 'update', 'assigned_to,status', { is_test: { _eq: true }, store_location_id: { _eq: store } }, { assigned_to: { _eq: '$CURRENT_USER' }, status: { _eq: 'in_progress' } }),
        permission('lead_comments', 'create', 'id,lead,created_by,outcome,comment', {}, { lead: { _eq: lead }, created_by: { _eq: '$CURRENT_USER' }, outcome: { _eq: 'note' } }),
      ]);
      await trx('directus_users').insert([
        { id: worker, role: workerRole, status: 'active', token: config.workerToken },
        { id: config.directusUserId, role: staffRole, status: 'active', first_name: 'AVerigin (тест)' },
      ]);
      await trx('store_locations').insert({ id: store, city: 'Белгород · тест' });
      await trx('telegram_routes').insert({ id: route, store_id: store, bot_id: config.botId, chat_id: config.chatId, is_test: true, enabled: true });
      await trx('telegram_staff').insert({ route_id: route, telegram_user_id: config.telegramUserId, directus_user: config.directusUserId, enabled: true });
    });
    console.log('PILOT_SCHEMA_READY');
  } else if (action === 'enqueue') {
    // Stable fixture ID makes repeating this command harmless; it cannot resend old cards.
    await db('leads').insert({ id: lead, status: 'new', is_test: true, store_location_id: store, kind: 'purchase', device: 'Проверка кнопки «Взять в работу»', reference_code: 'TG-PILOT-001' }).onConflict('id').ignore();
    console.log('PILOT_LEAD_READY');
  } else if (action === 'status') {
    const item = await db('leads').where({ id: lead }).first('id', 'status', 'assigned_to');
    const delivery = await db('telegram_deliveries').where({ lead_id: lead }).first('state', 'topic_id', 'message_id', 'revision', 'sent_revision', 'error_code');
    const comments = await db('lead_comments').where({ lead }).select('created_by', 'outcome');
    const activity = await db('directus_activity').where({ collection: 'leads', item: lead, action: 'update' }).select('user');
    console.log(JSON.stringify({ lead: item ?? null, delivery: delivery ?? null, comments, activity }));
  } else throw new Error('PILOT_ACTION_INVALID');
} finally { await db.destroy(); }
