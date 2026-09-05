// This module can only run inside the disposable pilot database container network.
import { readFile } from 'node:fs/promises';
import { telegramSql } from './setup_directus_telegram_sql.mjs';
import { conversationsSql } from './setup_directus_telegram_conversations_sql.mjs';
import { randomBytes, createHash } from 'node:crypto';
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
    if(process.env.ISVOI_TELEGRAM_CONVERSATIONS_ENABLED==='true') {
      await db.raw(conversationsSql);
      await db.raw('ALTER TABLE leads ADD contact text, ADD contact_channel text, ADD message text, ADD source text, ADD source_path text');
    }
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
      if(process.env.ISVOI_TELEGRAM_CONVERSATIONS_ENABLED==='true') {
        await trx('directus_roles').insert({id:id(20),name:'Pilot conversation intake'});
        await trx('directus_users').insert({id:id(21),role:id(20),status:'active'});
        await trx('directus_policies').insert({id:id(22),name:'Pilot create test lead',admin_access:false,app_access:false});
        await trx('directus_access').insert({id:id(23),role:id(20),policy:id(22)});
        await trx('directus_permissions').insert({policy:id(22),collection:'leads',action:'create',fields:'id,kind,status,contact_channel,contact,source,source_path,message,store_location_id,is_test,reference_code',permissions:{},validation:{status:{_eq:'new'},is_test:{_eq:true}}});
        await trx('telegram_routes').where({id:route}).update({accept_unscoped:true});
        await trx('directus_permissions').where({policy,collection:'lead_comments',action:'create'}).update({validation:{lead:{_nnull:true},created_by:{_eq:'$CURRENT_USER'},outcome:{_eq:'note'}}});
      }
    });
    console.log('PILOT_SCHEMA_READY');
  } else if (action === 'enqueue') {
    // Stable fixture ID makes repeating this command harmless; it cannot resend old cards.
    await db('leads').insert({ id: lead, status: 'new', is_test: true, store_location_id: store, kind: 'purchase', device: 'Проверка кнопки «Взять в работу»', reference_code: 'TG-PILOT-001' }).onConflict('id').ignore();
    console.log('PILOT_LEAD_READY');
  } else if (action === 'conversation-link') {
    if(process.env.ISVOI_TELEGRAM_CONVERSATIONS_ENABLED!=='true') throw new Error('PILOT_CONVERSATIONS_DISABLED');
    if(!await db('leads').where({id:lead,is_test:true}).first()) throw new Error('PILOT_LEAD_REQUIRED');
    if(await db('lead_conversations').where({lead_id:lead}).first()) throw new Error('PILOT_ALREADY_LINKED');
    const token=randomBytes(32).toString('base64url');
    await db('telegram_link_tokens').insert({token_hash:createHash('sha256').update(token).digest('hex'),lead_id:lead,bot_id:'8908725708',expires_at:db.raw("now()+interval '15 minutes'")});
    console.log(`https://t.me/isvoi_test_bot?start=${token}`);
  } else if (action === 'status') {
    const item = await db('leads').where({ id: lead }).first('id', 'status', 'assigned_to');
    const delivery = await db('telegram_deliveries').where({ lead_id: lead }).first('state', 'topic_id', 'message_id', 'revision', 'sent_revision', 'error_code');
    const comments = await db('lead_comments').where({ lead }).select('created_by', 'outcome');
    const activity = await db('directus_activity').where({ collection: 'leads', item: lead, action: 'update' }).select('user');
    let conversation=null;
    if(process.env.ISVOI_TELEGRAM_CONVERSATIONS_ENABLED==='true') {
      const c=await db('lead_conversations').where({lead_id:lead}).first('id');
      if(c) conversation={id:c.id,messages:await db('lead_messages').where({conversation_id:c.id}).select('id','direction','created_by'),
        outbox:await db('telegram_message_outbox').where({conversation_id:c.id}).select('id','purpose','destination','state','error_code')};
    }
    console.log(JSON.stringify({ lead: item ?? null, delivery: delivery ?? null, comments, activity, conversation }));
  } else throw new Error('PILOT_ACTION_INVALID');
} finally { await db.destroy(); }
