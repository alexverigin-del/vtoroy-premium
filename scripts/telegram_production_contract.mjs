// Disposable acceptance gate for the exact production policy, including admin-role staff.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { telegramSql } from './setup_directus_telegram_sql.mjs';
import { productionIdentitySql, productionTelegram as p } from './setup_directus_telegram_production_sql.mjs';
import { createHandlers } from '../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js';
import { conversationsContract } from './telegram_conversations_contract.mjs';
if(process.env.TELEGRAM_DISPOSABLE_FIXTURE!=='true' || process.env.DB_HOST!=='db' || process.env.DB_DATABASE!=='telegram_test') throw new Error('DISPOSABLE_FIXTURE_REQUIRED');
const api='/directus/node_modules/@directus/api/dist';
const {default:getDatabase}=await import(`${api}/database/index.js`);
const {ItemsService}=await import(`${api}/services/items.js`);
const {getSchema}=await import(`${api}/utils/get-schema.js`);
const db=getDatabase();
const id=n=>`55555555-5555-4555-8555-${String(n).padStart(12,'0')}`;
const adminRole=id(1), adminPolicy=id(2);
const identity={bot_id:p.botId,worker_id:id(3)};
const req=body=>({accountability:{user:p.worker,admin:false},body:{...identity,...body}});
try {
 const fixture=(await readFile(new URL('./fixtures/telegram_schema.sql',import.meta.url),'utf8')).split('\n').filter(line=>!line.startsWith('CREATE TABLE directus_')).join('\n');
 await db.raw(fixture);
 await db.raw(`ALTER TABLE leads ADD FOREIGN KEY(assigned_to) REFERENCES directus_users(id); ALTER TABLE lead_comments ADD FOREIGN KEY(lead) REFERENCES leads(id); ALTER TABLE lead_comments ADD FOREIGN KEY(created_by) REFERENCES directus_users(id);`);
 for(const collection of ['leads','lead_comments','store_locations']) {
  await db('directus_collections').insert({collection,accountability:'all'});
  await db('directus_fields').insert({collection,field:'id',special:'uuid'});
 }
 await db('directus_roles').insert({id:adminRole,name:'Administrator fixture'});
 await db('directus_policies').insert({id:adminPolicy,name:'Administrator fixture',admin_access:true,app_access:true});
 await db('directus_access').insert({id:id(4),role:adminRole,policy:adminPolicy});
 await db('directus_users').insert({id:p.staff,role:adminRole,status:'active'});
 await db('store_locations').insert({id:p.store,city:'Белгород'});
 await db.raw(telegramSql);
 await db.raw(productionIdentitySql('a'.repeat(64)));
 assert.equal((await db('telegram_routes').where({id:p.route}).first()).enabled,false);
 assert.equal(Number((await db('directus_permissions').where({policy:p.policy}).count('* as n').first()).n),3);
 assert.equal(Number((await db('directus_access').where({role:p.role}).count('* as n').first()).n),0);
 await db('telegram_routes').where({id:p.route}).update({enabled:true});
 const handlers=createHandlers({database:db,services:{ItemsService},getSchema:()=>getSchema({bypassCache:true}),env:{ISVOI_TELEGRAM_ENABLED:true,ISVOI_TELEGRAM_BOT_ID:p.botId,ISVOI_TELEGRAM_WORKER_USER_ID:p.worker,ISVOI_TELEGRAM_MODE:'production',PUBLIC_URL:'https://api.example.test'}});
 await handlers.session(req({}));
 async function card(n,store=p.store) {
  await db('leads').insert({id:id(n),store_location_id:store,is_test:false});
  const d=await db('telegram_deliveries').where({lead_id:id(n)}).first();
  await db('telegram_deliveries').where({id:d.id}).update({topic_id:7,message_id:8,state:'done',sent_revision:1});return d;
 }
 const click=(d,n)=>req({update:{update_id:n,callback_query:{id:`prod-${n}`,data:`take:${d.id}`,from:{id:Number(p.telegramUserId),is_bot:false},message:{message_id:8,message_thread_id:7,chat:{id:Number(p.chatId),type:'supergroup'}}}}});
 for(const [n,store] of [[10,p.store],[11,null]]) {
  const d=await card(n,store);
  assert.equal((await handlers.update(click(d,n))).result,'claimed');
  assert.equal((await db('leads').where({id:d.lead_id}).first()).assigned_to,p.staff);
  assert.equal((await db('lead_comments').where({lead:d.lead_id}).first()).created_by,p.staff);
  assert.equal((await db('directus_activity').where({collection:'leads',item:d.lead_id,action:'update'}).first()).user,p.staff);
 }
 await db('leads').insert({id:id(12),store_location_id:p.store,is_test:true});
 assert.equal(Number((await db('telegram_deliveries').where({lead_id:id(12)}).count('* as n').first()).n),0);
 const schema=await getSchema({bypassCache:true});
 const service=new ItemsService('leads',{knex:db,schema,accountability:{user:p.staff,role:adminRole,roles:[adminRole],admin:false,app:true}});
 await assert.rejects(service.updateOne(id(10),{device:'disallowed'}),error=>error.code==='FORBIDDEN');
 console.log('PASS: exact production policy with admin-role staff, real foreign keys, scoped/unscoped claims, audit identity, forbidden field and test isolation.');
 await conversationsContract({db,ItemsService,getSchema,p,adminRole});
} finally {await db.destroy();}
