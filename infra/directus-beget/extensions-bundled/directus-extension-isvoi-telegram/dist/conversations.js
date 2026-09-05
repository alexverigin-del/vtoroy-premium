import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { UUID, validId, failure, routeMatches } from './protocol.js';

const active = lead => lead && ['new','in_progress','waiting'].includes(lead.status);
const enabledFlag = value => value === true || value === 'true';
export const linkHash = token => createHash('sha256').update(token).digest('hex');
export function messageContent(message) {
  if(['document','voice','video','video_note','audio','sticker','animation','contact','location'].some(key=>message[key])) return null;
  const text = message.text ?? message.caption ?? '';
  if (typeof text !== 'string' || text.length > 3500) return null;
  const photo = Array.isArray(message.photo) ? message.photo.at(-1)?.file_id : null;
  if (photo && (typeof photo !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(photo))) return null;
  if (photo && text.length > 1000) return null;
  if (!photo && !text.trim()) return null;
  return { text, photo_file_id: photo || null, album_id: typeof message.media_group_id === 'string' ? message.media_group_id.slice(0,128) : null };
}
const contentPayload = (content, prefix = '') => content.photo_file_id
  ? { photo: content.photo_file_id, caption: `${prefix}${content.text}`.slice(0,1024) }
  : { text: `${prefix}${content.text}`.slice(0,4096), link_preview_options: { is_disabled: true } };
const replyButton = (id, text = 'Ответить клиенту') => ({ inline_keyboard: [[{text,callback_data:`reply:${id}`}]] });

export function createConversations({ database, services, getSchema, env, botId, mode, staffAccountability }) {
  const enabled = enabledFlag(env.ISVOI_TELEGRAM_ENABLED) && enabledFlag(env.ISVOI_TELEGRAM_CONVERSATIONS_ENABLED) && validId(botId) && ['test','production'].includes(mode);
  const intakeUser = env.ISVOI_TELEGRAM_INTAKE_USER_ID;
  const username = String(env.ISVOI_TELEGRAM_BOT_USERNAME || '').replace(/^@/,'');
  const testUsers = String(env.ISVOI_TELEGRAM_TEST_CLIENT_IDS || '').split(',').map(s=>s.trim()).filter(Boolean);
  const clientAllowed = id => mode !== 'test' || testUsers.includes(String(id));
  async function intakeIdentity(req,connection=database) {
    if(!enabled) throw failure('CONVERSATIONS_DISABLED',503);
    if(!UUID.test(intakeUser || '') || req.accountability?.user!==intakeUser || req.accountability?.admin===true) throw failure('FORBIDDEN',403);
    const user=await connection('directus_users').where({id:intakeUser,status:'active'}).first();
    if(!user) throw failure('FORBIDDEN',403);
    return user;
  }
  async function queue(trx, values, payload) {
    const [row] = await trx('telegram_message_outbox').insert({bot_id:botId,...values,payload:JSON.stringify(payload)}).returning('*');
    return row;
  }
  async function retention(trx) {
    await trx('telegram_retention_settings').insert({bot_id:botId}).onConflict('bot_id').ignore();
    const settings=await trx('telegram_retention_settings').where({bot_id:botId}).where('next_run_at','<=',trx.fn.now()).forUpdate().first();
    if(!settings) return;
    // The accepted policy is fixed in schema and code. Changing it requires a reviewed release.
    if(Number(settings.retention_months)!==6) throw failure('RETENTION_POLICY_INVALID',503);
    const conversations=await trx('lead_conversations').where({bot_id:botId}).whereNotNull('closed_at')
      .whereRaw("closed_at <= now() - interval '6 months'").delete();
    const sessions=await trx('telegram_client_sessions').where({bot_id:botId}).whereNull('conversation_id')
      .whereRaw("updated_at <= now() - interval '6 months'").delete();
    const tokens=await trx('telegram_link_tokens').where({bot_id:botId}).whereRaw("expires_at <= now() - interval '1 day'").delete();
    const receipts=await trx('telegram_receipts').where({bot_id:botId}).whereRaw("created_at <= now() - interval '6 months'").delete();
    await trx('telegram_retention_settings').where({bot_id:botId}).update({
      last_run_at:trx.fn.now(),next_run_at:trx.raw("now()+interval '1 day'"),
      last_conversations_deleted:conversations,last_sessions_deleted:sessions,
      last_tokens_deleted:tokens,last_receipts_deleted:receipts,
    });
  }
  const tell = (trx, session, text, reply_markup) => queue(trx,{session_id:session.id,destination:'client'}, {text,...(reply_markup?{reply_markup}:{})});
  async function context(trx, id) {
    const c = await trx('lead_conversations').where({id,bot_id:botId}).first();
    if (!c) return null;
    const route = await trx('telegram_routes').where({id:c.route_id,bot_id:botId,is_test:mode==='test',enabled:true}).forShare().first();
    const lead = await trx('leads').where({id:c.lead_id}).forUpdate().first();
    if (!route || !lead || !routeMatches(lead,route)) return null;
    const delivery = await trx('telegram_deliveries').where({lead_id:c.lead_id,route_id:c.route_id}).first();
    return {c,route,lead,delivery};
  }
  async function permitted(trx, ctx, telegramUserId) {
    if (!ctx || !active(ctx.lead)) return null;
    const staff = await trx('telegram_staff').where({route_id:ctx.route.id,telegram_user_id:telegramUserId,enabled:true}).forShare().first();
    if (!staff || staff.directus_user !== ctx.lead.assigned_to) return null;
    const user = await trx('directus_users').where({id:staff.directus_user,status:'active'}).forShare().first();
    if (!user?.role) return null;
    const accountability = await staffAccountability(trx,user);
    try {
      await new services.ItemsService('leads',{knex:trx,schema:await getSchema(),accountability})
        .readOne(ctx.lead.id,{fields:['id','status','assigned_to']});
    } catch(error) { if(error.code==='FORBIDDEN' || error.status===403) return null; throw error; }
    return {user,accountability};
  }
  async function choose(trx, session) {
    const list = await trx('lead_conversations as c').join('leads as l','l.id','c.lead_id')
      .join('telegram_routes as r','r.id','c.route_id')
      .where({'c.bot_id':botId,'c.client_user_id':session.user_id,'r.enabled':true,'r.is_test':mode==='test'})
      .whereIn('l.status',['new','in_progress','waiting']).orderBy('c.created_at','desc')
      .select('c.id','l.reference_code').limit(20);
    await trx('telegram_client_sessions').where({id:session.id}).update({conversation_id:null,pending_kind:null});
    const buttons=list.map(c=>[{text:c.reference_code || 'Заявка',callback_data:`conv:${c.id}`}]);
    buttons.push([{text:'Новое обращение',callback_data:'new'}]);
    await tell(trx,session,list.length?'Выберите заявку для переписки. Сообщения до выбора не отправляются менеджеру.':'Здравствуйте! Это бот I СВОИ. Здесь отвечает менеджер. Для обращения нажмите кнопку ниже.',{inline_keyboard:buttons});
  }
  async function categories(trx,session) {
    await trx('telegram_client_sessions').where({id:session.id}).update({conversation_id:null,pending_kind:null});
    await tell(trx,session,'С чем помочь? Отправленные сообщения увидят сотрудники I СВОИ, которые обрабатывают вашу заявку.',{inline_keyboard:[
      [{text:'Купить / подобрать',callback_data:'kind:selection'}],
      [{text:'Продать / обменять',callback_data:'kind:trade'}],
      [{text:'Другой вопрос',callback_data:'kind:support'}],
      [{text:'Мои заявки',callback_data:'dialogs'}],
    ]});
  }
  async function bind(trx,session,token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return 'invalid_link';
    const row=await trx('telegram_link_tokens').where({token_hash:linkHash(token),bot_id:botId}).whereNull('used_at').where('expires_at','>',trx.fn.now()).forUpdate().first();
    if(!row) return 'invalid_link';
    const lead=await trx('leads').where({id:row.lead_id}).forUpdate().first();
    const route=await trx('telegram_routes').where({bot_id:botId,is_test:mode==='test',enabled:true}).andWhere(q=>q.where({store_id:lead?.store_location_id}).orWhere(function(){this.where({accept_unscoped:true}).whereRaw('?::uuid IS NULL',[lead?.store_location_id || null]);})).first();
    if(!active(lead)||!route||!routeMatches(lead,route)) return 'invalid_link';
    const existing=await trx('lead_conversations').where({lead_id:lead.id,bot_id:botId}).first();
    if(existing) return 'invalid_link';
    const [c]=await trx('lead_conversations').insert({lead_id:lead.id,route_id:route.id,bot_id:botId,client_user_id:session.user_id,client_chat_id:session.chat_id}).returning('*');
    await trx('telegram_link_tokens').where({token_hash:row.token_hash}).update({used_at:trx.fn.now()});
    await trx('telegram_client_sessions').where({id:session.id}).update({conversation_id:c.id,pending_kind:null});
    await queue(trx,{conversation_id:c.id,route_id:route.id,destination:'group'}, {text:'Клиент подключил Telegram к этой заявке.',reply_markup:replyButton(c.id)});
    await tell(trx,session,`Заявка ${lead.reference_code || ''} подключена. Напишите сообщение — его получит менеджер I СВОИ. Чтобы выбрать другую заявку: /dialogs.`);
    return 'linked';
  }
  async function intake(req) {
    await intakeIdentity(req);
    if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) throw failure('BOT_USERNAME_REQUIRED',503);
    return database.transaction(async trx=>{
      const user=await intakeIdentity(req,trx);
      const accountability=await staffAccountability(trx,user);
      const id=await new services.ItemsService('leads',{knex:trx,schema:await getSchema(),accountability}).createOne(req.body);
      const lead=await trx('leads').where({id}).first();
      const routes=await trx('telegram_routes').where({bot_id:botId,is_test:mode==='test',enabled:true});
      const route=routes.find(r=>routeMatches(lead,r));
      let telegramUrl=null;
      if(route&&active(lead)) {
        const token=randomBytes(32).toString('base64url');
        await trx('telegram_link_tokens').insert({token_hash:linkHash(token),lead_id:id,bot_id:botId,expires_at:trx.raw("now()+interval '15 minutes'")});
        telegramUrl=`https://t.me/${username}?start=${token}`;
      }
      // The capability is returned only in the successful creation response; no lookup/reissue endpoint.
      return {id,telegram_url:telegramUrl};
    });
  }
  const intakeCheck=async req=>{await intakeIdentity(req);return {ok:true};};
  async function createDirectLead(trx,session,content) {
    const route=await trx('telegram_routes').where({bot_id:botId,is_test:mode==='test',enabled:true,accept_unscoped:true}).first();
    const user=UUID.test(intakeUser || '')?await trx('directus_users').where({id:intakeUser,status:'active'}).first():null;
    if(!route||!user) {await tell(trx,session,'Приём новых обращений временно недоступен. Оставьте заявку на isvoi.ru.');return null;}
    const service=new services.ItemsService('leads',{knex:trx,schema:await getSchema(),accountability:await staffAccountability(trx,user)});
    const leadId=await service.createOne({kind:session.pending_kind,status:'new',contact_channel:'telegram',contact:`telegram:${session.user_id}`,
      source:'telegram',source_path:'telegram',message:content.text,store_location_id:route.store_id,is_test:mode==='test',
      reference_code:`TG-${randomBytes(6).toString('hex').toUpperCase()}`});
    const [c]=await trx('lead_conversations').insert({lead_id:leadId,route_id:route.id,bot_id:botId,client_user_id:session.user_id,client_chat_id:session.chat_id}).returning('*');
    await trx('telegram_client_sessions').where({id:session.id}).update({conversation_id:c.id,pending_kind:null});
    await tell(trx,session,'Обращение принято. Здесь вам ответит менеджер. Для выбора другой заявки: /dialogs.');
    return c.id;
  }
  async function privateUpdate(trx,update,message,from) {
    if(!clientAllowed(from.id)) return 'forbidden';
    await trx('telegram_client_sessions').insert({bot_id:botId,user_id:String(from.id),chat_id:String(message.chat.id)}).onConflict(['bot_id','user_id']).ignore();
    const session=await trx('telegram_client_sessions').where({bot_id:botId,user_id:String(from.id)}).forUpdate().first();
    // Bound input rate prevents repeated /start or category clicks from growing an unbounded queue.
    const count=await trx('telegram_message_outbox').where({session_id:session.id}).where('created_at','>',trx.raw("now()-interval '1 minute'")).count('* as n').first();
    if(Number(count.n)>=15) return 'rate_limited';
    await trx('telegram_client_sessions').where({id:session.id}).update({updated_at:trx.fn.now()});
    const data=update.callback_query?.data;
    if(data) {
      // Only buttons from a successfully sent bot menu in this private session are actionable.
      const sent=await trx('telegram_message_outbox').where({bot_id:botId,session_id:session.id,telegram_message_id:message.message_id,state:'done'}).first();
      if(!sent || !sent.payload.reply_markup?.inline_keyboard?.flat().some(b=>b.callback_data===data)) return 'stale';
      if(data==='new') {await categories(trx,session);return 'selected';}
      if(data==='dialogs') {await choose(trx,session);return 'selected';}
      if(/^kind:(selection|trade|support)$/.test(data)) {
        await trx('telegram_client_sessions').where({id:session.id}).update({conversation_id:null,pending_kind:data.slice(5)});
        await tell(trx,session,data==='kind:trade'?'Напишите, что хотите продать или обменять, либо отправьте фото. Предварительная оценка также доступна на https://isvoi.ru/trade.':'Опишите, что вам нужно, или отправьте фото. Заявка появится после этого сообщения.');
        return 'selected';
      }
      if(data.startsWith('conv:')&&UUID.test(data.slice(5))) {
        const ctx=await context(trx,data.slice(5));
        if(!ctx || String(ctx.c.client_user_id)!==String(from.id)||!active(ctx.lead)) return 'stale';
        await trx('telegram_client_sessions').where({id:session.id}).update({conversation_id:ctx.c.id,pending_kind:null});
        await tell(trx,session,`Выбрана заявка ${ctx.lead.reference_code || ''}. Теперь сообщения отправляются её менеджеру.`);return 'selected';
      }
      return 'ignored';
    }
    const text=message.text || '';
    if(/^\/start(?:\s|$)/.test(text)) {
      const token=text.trim().split(/\s+/)[1];
      if(token) {const result=await bind(trx,session,token);if(result==='invalid_link') await tell(trx,session,'Ссылка уже использована, истекла или заявка недоступна. Ваше сообщение не привязано к заявке. Откройте /dialogs или создайте новое обращение через /new.');return result;}
      await choose(trx,session);return 'selected';
    }
    if(text==='/new') {await categories(trx,session);return 'selected';}
    if(text==='/dialogs'||text==='/cancel') {await choose(trx,session);return 'selected';}
    if(text.startsWith('/')) {await tell(trx,session,'Доступны /dialogs — выбор заявки, /new — новое обращение.');return 'ignored';}
    const content=messageContent(message);
    if(!content) {await tell(trx,session,'Пока можно отправить текст до 3500 знаков или фото с подписью до 1000 знаков. Для документов и голосовых попросите менеджера согласовать другой способ.');return 'unsupported';}
    let conversationId=session.conversation_id;
    if(!conversationId&&session.pending_kind) conversationId=await createDirectLead(trx,session,content);
    if(!conversationId) {await choose(trx,session);return 'select_required';}
    const ctx=await context(trx,conversationId);
    if(!ctx||!active(ctx.lead)) {await choose(trx,session);return 'closed';}
    const [saved]=await trx('lead_messages').insert({conversation_id:conversationId,direction:'in',...content,telegram_message_id:message.message_id}).returning('*');
    await queue(trx,{conversation_id:conversationId,route_id:ctx.route.id,message_id:saved.id,destination:'group'},
      {...contentPayload(content,content.album_id?'Клиент · альбом\n':'Клиент\n'),reply_markup:replyButton(conversationId)});
    await trx('leads').where({id:ctx.lead.id}).update({
      telegram_unread:true,telegram_last_message_at:saved.created_at,
      ...(ctx.lead.status==='waiting'?{status:'in_progress'}:{}),
    });
    return 'received';
  }
  async function groupUpdate(trx,update,message,from) {
    const data=update.callback_query?.data;
    if(data?.startsWith('reply:')&&UUID.test(data.slice(6))) {
      const ctx=await context(trx,data.slice(6));
      if(!ctx||String(ctx.route.chat_id)!==String(message.chat.id)||String(ctx.delivery?.topic_id)!==String(message.message_thread_id)) return 'stale';
      const source=await trx('telegram_message_outbox').where({conversation_id:ctx.c.id,destination:'group',state:'done',telegram_message_id:message.message_id}).first();
      if(!source) return 'stale';
      const staff=await permitted(trx,ctx,String(from.id));
      if(!staff) return 'forbidden';
      await trx('telegram_reply_drafts').where({telegram_user_id:String(from.id),conversation_id:ctx.c.id}).whereIn('state',['awaiting','preview']).update({state:'cancelled'});
      const [draft]=await trx('telegram_reply_drafts').insert({conversation_id:ctx.c.id,staff_user:staff.user.id,telegram_user_id:String(from.id)}).returning('*');
      await queue(trx,{conversation_id:ctx.c.id,route_id:ctx.route.id,draft_id:draft.id,destination:'group',purpose:'prompt'},
        {text:'Черновик ответа клиенту. Ответьте именно на это сообщение текстом или одним фото. Затем проверьте и нажмите «Отправить клиенту». Срок — 10 минут.',reply_markup:{force_reply:true,input_field_placeholder:'Черновик ответа клиенту'}});
      return 'draft_started';
    }
    const match=typeof data==='string'?/^(send|cancel):([0-9a-f-]{36})$/.exec(data):null;
    if(match&&UUID.test(match[2])) {
      const draft=await trx('telegram_reply_drafts').where({id:match[2],telegram_user_id:String(from.id)}).forUpdate().first();
      const ctx=draft?await context(trx,draft.conversation_id):null;
      if(!ctx||String(ctx.route.chat_id)!==String(message.chat.id)||String(ctx.delivery?.topic_id)!==String(message.message_thread_id)||String(draft.preview_message_id)!==String(message.message_id)) return 'stale';
      if(draft.state!=='preview'||new Date(draft.expires_at).getTime()<=Date.now()) return 'stale';
      const staff=await permitted(trx,ctx,String(from.id));
      if(!staff||staff.user.id!==draft.staff_user) return 'forbidden';
      if(match[1]==='cancel') {await trx('telegram_reply_drafts').where({id:draft.id}).update({state:'cancelled'});return 'cancelled';}
      // Savepoint: denied audit write means neither history nor outbox can be committed.
      try {
        await trx.transaction(async writeTrx=>{
          await new services.ItemsService('lead_comments',{knex:writeTrx,schema:await getSchema(),accountability:staff.accountability})
            .createOne({lead:ctx.lead.id,created_by:staff.user.id,outcome:'note',comment:'Подтвердил отправку ответа клиенту через Telegram. Текст — в истории диалога.'});
          const [saved]=await writeTrx('lead_messages').insert({conversation_id:ctx.c.id,direction:'out',text:draft.text,photo_file_id:draft.photo_file_id,created_by:staff.user.id}).returning('*');
          await queue(writeTrx,{conversation_id:ctx.c.id,route_id:ctx.route.id,message_id:saved.id,draft_id:draft.id,destination:'client',purpose:'reply'},contentPayload(draft));
          await writeTrx('telegram_reply_drafts').where({id:draft.id}).update({state:'confirmed'});
        });
      } catch(error) {if(error.code==='FORBIDDEN'||error.status===403) return 'forbidden';throw error;}
      return 'queued';
    }
    if(data) return null;
    // Ordinary group text is never a draft. Require a reply to the exact bot prompt.
    if(!validId(message.reply_to_message?.message_id)) return 'internal';
    const route=await trx('telegram_routes').where({bot_id:botId,chat_id:String(message.chat.id),is_test:mode==='test',enabled:true}).first();
    if(!route) return 'ignored';
    const drafts=await trx('telegram_reply_drafts as d').join('lead_conversations as c','c.id','d.conversation_id')
      .where({'c.route_id':route.id,'d.telegram_user_id':String(from.id),'d.prompt_message_id':message.reply_to_message.message_id,'d.state':'awaiting'})
      .where('d.expires_at','>',trx.fn.now()).select('d.*').forUpdate('d');
    const draft=drafts[0];
    if(!draft) return 'internal';
    const ctx=await context(trx,draft.conversation_id);
    if(!ctx||String(ctx.delivery?.topic_id)!==String(message.message_thread_id)||!await permitted(trx,ctx,String(from.id))) return 'forbidden';
    const content=messageContent(message);
    if(!content||content.album_id) {
      await queue(trx,{conversation_id:ctx.c.id,route_id:ctx.route.id,destination:'group'}, {text:'Черновик не сохранён. Ответьте на приглашение одним текстом или одним фото с подписью. Альбомы менеджера пока не отправляются.'});
      return 'unsupported';
    }
    await trx('telegram_reply_drafts').where({id:draft.id}).update({state:'preview',text:content.text,photo_file_id:content.photo_file_id});
    await queue(trx,{conversation_id:ctx.c.id,route_id:ctx.route.id,draft_id:draft.id,destination:'group',purpose:'preview'},
      {...contentPayload(content,'К отправке клиенту:\n'),reply_markup:{inline_keyboard:[[{text:'Отправить клиенту',callback_data:`send:${draft.id}`}],[{text:'Отмена',callback_data:`cancel:${draft.id}`}]]}});
    return 'draft_ready';
  }
  async function update(trx,update) {
    if(!enabled) return null;
    const q=update.callback_query;
    if(q?.data?.startsWith('take:')) return null;
    const message=q?.message || update.message;
    const from=q?.from || message?.from;
    if(!message||from?.is_bot!==false||!validId(from.id)||message.sender_chat||!validId(message.message_id)) return 'ignored';
    if(q && message.from && (message.from.is_bot!==true||String(message.from.id)!==botId)) return 'ignored';
    if(message.chat?.type==='private'&&validId(message.chat.id)&&String(message.chat.id)===String(from.id)) return privateUpdate(trx,update,message,from);
    if(message.chat?.type==='supergroup'&&Number.isSafeInteger(message.chat.id)&&message.chat.id<0&&validId(message.message_thread_id)) return groupUpdate(trx,update,message,from);
    return 'ignored';
  }
  async function next(trx) {
    if(!enabled) return null;
    await trx('telegram_message_outbox').where({bot_id:botId,state:'in_flight'}).where('operation_deadline','<',trx.fn.now()).update({state:'uncertain',error_code:'WORKER_INTERRUPTED'});
    const rows=await trx('telegram_message_outbox').where({bot_id:botId,state:'pending'}).where('due_at','<=',trx.fn.now()).orderBy('created_at').limit(20).forUpdate().skipLocked();
    for(const row of rows) {
      let chatId,topicId;
      const ctx=row.conversation_id?await context(trx,row.conversation_id):null;
      if(row.conversation_id&&!ctx) {await trx('telegram_message_outbox').where({id:row.id}).update({state:'failed',error_code:'ROUTE_CHANGED'});continue;}
      if(row.destination==='group') {
        if(!ctx?.delivery?.topic_id||!ctx.delivery.message_id) continue;
        chatId=String(ctx.route.chat_id);topicId=Number(ctx.delivery.topic_id);
      } else {
        if(ctx) chatId=String(ctx.c.client_chat_id);
        else {const s=await trx('telegram_client_sessions').where({id:row.session_id,bot_id:botId}).first();chatId=s?String(s.chat_id):null;}
        if(!chatId||!clientAllowed(chatId)) {await trx('telegram_message_outbox').where({id:row.id}).update({state:'failed',error_code:'CLIENT_NOT_ALLOWED'});continue;}
        if(row.purpose==='reply') {
          const draft=await trx('telegram_reply_drafts').where({id:row.draft_id,state:'confirmed'}).first();
          const staff=draft?await permitted(trx,ctx,String(draft.telegram_user_id)):null;
          if(!staff||staff.user.id!==draft.staff_user||new Date(draft.expires_at).getTime()<=Date.now()) {
            await trx('telegram_message_outbox').where({id:row.id}).update({state:'failed',error_code:'REPLY_PERMISSION_EXPIRED'});continue;
          }
        }
      }
      const operation_id=randomUUID();
      await trx('telegram_message_outbox').where({id:row.id}).update({state:'in_flight',operation_id,operation_deadline:trx.raw("now()+interval '60 seconds'")});
      return {id:row.id,channel:'conversation',operation_id,destination:row.destination,method:row.payload.photo?'sendPhoto':'sendMessage',payload:{...row.payload,chat_id:chatId,...(topicId?{message_thread_id:topicId}:{})}};
    }
    return null;
  }
  async function complete(trx,body) {
    if(!enabled) throw failure('CONVERSATIONS_DISABLED',503);
    const row=await trx('telegram_message_outbox').where({id:body.id,bot_id:botId}).forUpdate().first();
    if(!row||row.operation_id!==body.operation_id) throw failure('STALE_OPERATION',409);
    if(row.state!=='in_flight') return {ok:true};
    const outcome=body.outcome;
    let patch;
    if(outcome.type==='ok') {
      if(!validId(outcome.message_id)) throw failure('INVALID_MESSAGE_ID');
      patch={state:'done',telegram_message_id:String(outcome.message_id),error_code:null};
      if(['prompt','preview'].includes(row.purpose)) await trx('telegram_reply_drafts').where({id:row.draft_id}).update({[row.purpose==='prompt'?'prompt_message_id':'preview_message_id']:String(outcome.message_id)});
    } else if(outcome.type==='rate_limit') {
      const delay=Math.max(1,Math.min(86400,Number(outcome.retryAfter)||60));
      patch={state:'pending',error_code:'TELEGRAM_429',due_at:trx.raw("now()+(?*interval '1 second')",[delay])};
      await trx('telegram_runtime').where({bot_id:botId}).update({send_after:patch.due_at});
    } else patch={state:outcome.type==='permanent'?'failed':'uncertain',error_code:outcome.type==='permanent'?`TELEGRAM_${[400,401,403,404].includes(outcome.status)?outcome.status:'ERROR'}`:'DELIVERY_UNKNOWN'};
    await trx('telegram_message_outbox').where({id:row.id}).update(patch);
    if(row.purpose==='reply'&&patch.state==='done') {
      const message=await trx('lead_messages').where({id:row.message_id}).first('created_at');
      await trx('leads').whereIn('id',trx('lead_conversations').where({id:row.conversation_id}).select('lead_id'))
        .update({telegram_unread:false,telegram_last_message_at:message?.created_at || trx.fn.now()});
    }
    if(row.purpose==='reply'&&patch.state!=='pending') await queue(trx,{conversation_id:row.conversation_id,route_id:row.route_id,destination:'group'},
      {text:patch.state==='done'?'Ответ передан Telegram. Это не подтверждение прочтения клиентом.':patch.state==='uncertain'?'Результат отправки ответа неизвестен. Не отправляйте его повторно до ручной сверки.':'Ответ не доставлен. Клиент мог заблокировать бота; проверьте карточку доставки.',
        ...(patch.state==='done'?{reply_markup:replyButton(row.conversation_id,'Написать ещё')}:{})});
    return {ok:true};
  }
  const maintenance=async trx=>{if(enabled) await retention(trx);};
  return {enabled,intake,intakeCheck,update,next,complete,maintenance};
}
