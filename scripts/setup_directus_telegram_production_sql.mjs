// Generated only in memory on the deployment host; never print SQL with a token.
export const productionTelegram = Object.freeze({
  botId: '8694946838', chatId: '-1004317825276', telegramUserId: '65092546',
  staff: '1a612dfb-8f1c-455b-a8cd-b57ea60afc24', store: '4d5ded0b-1b6f-4eee-b7ea-d8a5e0ccad1f',
  worker: '7449da36-9451-48c7-8577-c159b9554110', role: '7449da36-9451-48c7-8577-c159b9554111',
  policy: '7449da36-9451-48c7-8577-c159b9554112', access: '7449da36-9451-48c7-8577-c159b9554113',
  route: '7449da36-9451-48c7-8577-c159b9554114', staffBinding: '7449da36-9451-48c7-8577-c159b9554115',
});
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export function productionIdentitySql(workerToken) {
  if (!/^[a-f0-9]{64}$/.test(workerToken)) throw new Error('INVALID_WORKER_TOKEN');
  const p = productionTelegram;
  const scope = { _and: [{ is_test: { _eq: false } }, { _or: [{ store_location_id: { _eq: p.store } }, { store_location_id: { _null: true } }] }] };
  const permissions = [
    ['leads','read','id,status,assigned_to,kind,device,reference_code,store_location_id,is_test',scope,{}],
    ['leads','update','assigned_to,status',{_and:[scope,{_or:[{assigned_to:{_null:true}},{assigned_to:{_eq:'$CURRENT_USER'}}]}]}, {assigned_to:{_eq:'$CURRENT_USER'},status:{_eq:'in_progress'}}],
    ['lead_comments','create','id,lead,created_by,outcome,comment',{}, {created_by:{_eq:'$CURRENT_USER'},outcome:{_eq:'note'},lead:{_nnull:true}}],
  ].map(([collection,action,fields,filter,validation]) => `(${literal(p.policy)},${literal(collection)},${literal(action)},${literal(fields)},${literal(JSON.stringify(filter))}::json,${literal(JSON.stringify(validation))}::json)`).join(',\n');
  return `BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM directus_users WHERE id='${p.staff}' AND status='active') THEN RAISE EXCEPTION 'Active staff missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM store_locations WHERE id='${p.store}' AND city='Белгород') THEN RAISE EXCEPTION 'Store mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM telegram_routes) THEN RAISE EXCEPTION 'Existing routes require reviewed update'; END IF;
 IF EXISTS(SELECT 1 FROM directus_roles WHERE id='${p.role}' OR name='ISVOI Telegram Worker') OR EXISTS(SELECT 1 FROM directus_policies WHERE id='${p.policy}' OR name='ISVOI Telegram Staff') OR EXISTS(SELECT 1 FROM directus_users WHERE id='${p.worker}') THEN RAISE EXCEPTION 'Identity already exists'; END IF;
END $$;
INSERT INTO directus_roles(id,name,description) VALUES('${p.role}','ISVOI Telegram Worker','Only the authenticated Telegram endpoint; no collection permissions.');
INSERT INTO directus_users(id,role,status,first_name,token) VALUES('${p.worker}','${p.role}','active','Telegram Worker',${literal(workerToken)});
INSERT INTO directus_policies(id,name,admin_access,app_access) VALUES('${p.policy}','ISVOI Telegram Staff',false,false);
INSERT INTO directus_access(id,"user",policy) VALUES('${p.access}','${p.staff}','${p.policy}');
INSERT INTO directus_permissions(policy,collection,action,fields,permissions,validation) VALUES ${permissions};
INSERT INTO telegram_routes(id,store_id,bot_id,chat_id,is_test,enabled,accept_unscoped) VALUES('${p.route}','${p.store}',${p.botId},${p.chatId},false,false,true);
INSERT INTO telegram_staff(id,route_id,telegram_user_id,directus_user,enabled) VALUES('${p.staffBinding}','${p.route}',${p.telegramUserId},'${p.staff}',true);
COMMIT;`;
}
