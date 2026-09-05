import assert from 'node:assert/strict';

export async function notificationsContract({db,h,req,p,next,complete,sequenceState}) {
  const client=223456700;
  const privateMessage=(text,extra={})=>({update_id:++sequenceState.update,message:{message_id:++sequenceState.message,chat:{type:'private',id:client},from:{id:client,is_bot:false},text,...extra}});
  const apply=update=>h.update(req({update}));
  const leadsBefore=Number((await db('leads').count('* as n').first()).n);
  assert.equal((await apply(privateMessage('/start site'))).result,'selected');
  assert.equal(Number((await db('leads').count('* as n').first()).n),leadsBefore);
  let session=await db('telegram_client_sessions').where({bot_id:p.botId,user_id:client}).first();
  assert.equal(session.entry_source,'site');
  let welcome=await db('telegram_message_outbox').where({session_id:session.id}).orderBy('created_at','desc').first();
  assert.deepEqual(welcome.payload.reply_markup.inline_keyboard.flat().map(button=>button.callback_data),['kind:selection','kind:trade','kind:support','dialogs','news']);
  assert.equal((await apply(privateMessage('Вопрос без выбора категории'))).result,'received');
  const support=await db('leads').where({contact:`telegram:${client}`}).first();
  assert.equal(support.kind,'support');
  assert.equal((await db('lead_messages').whereIn('conversation_id',db('lead_conversations').where({lead_id:support.id}).select('id')).first()).text,'Вопрос без выбора категории');

  await db('telegram_bot_settings').insert({bot_id:p.botId,notifications_enabled:true,pilot_mode:true,pilot_user_ids:JSON.stringify([client]),quiet_start:'00:00',quiet_end:'23:59',weekly_limit:2});
  while(true){const job=await next();if(!job)break;await complete(job);}
  assert.equal((await apply(privateMessage('/news'))).result,'selected');
  while(true){const job=await next();if(!job)break;await complete(job);}
  session=await db('telegram_client_sessions').where({bot_id:p.botId,user_id:client}).first();
  const news=await db('telegram_message_outbox').where({session_id:session.id,state:'done'}).orderBy('created_at','desc').first();
  const click=(data,messageId)=>({update_id:++sequenceState.update,callback_query:{id:`notify-${sequenceState.update}`,data,from:{id:client,is_bot:false},message:{message_id:Number(messageId),chat:{type:'private',id:client},from:{id:Number(p.botId),is_bot:true}}}});
  assert.equal((await apply(click('news:toggle:new_arrivals',news.telegram_message_id))).result,'selected');
  while(true){const job=await next();if(!job)break;await complete(job);}
  const latest=await db('telegram_message_outbox').where({session_id:session.id,state:'done'}).orderBy('created_at','desc').first();
  assert.equal((await apply(click('news:save',latest.telegram_message_id))).result,'selected');
  const subscription=await db('telegram_subscriptions').where({session_id:session.id,topic_key:'new_arrivals'}).first();
  assert.equal(subscription.status,'active');
  assert.equal(Number((await db('telegram_subscription_events').where({subscription_id:subscription.id,event:'subscribed'}).count('* as n').first()).n),1);

  const campaignId='77777777-7777-4777-8777-000000000001';
  await db('telegram_campaigns').insert({id:campaignId,bot_id:p.botId,internal_title:'Пилот: поступление',topic_key:'new_arrivals',message_text:'Поступил iPhone 15',cta_label:'Посмотреть',cta_url:'https://isvoi.ru/catalog',utm_campaign:'pilot-arrival'});
  await db('telegram_campaigns').where({id:campaignId}).update({status:'approved',approved_by:p.staff,approved_at:db.fn.now()});
  await apply(privateMessage('/help'));
  let serviceJob=await next();
  assert.equal(serviceJob.campaign_id,null);
  assert.equal(serviceJob.purpose,'notice');
  await complete(serviceJob);
  const campaignJob=await next();
  assert.equal(campaignJob.campaign_id,campaignId);
  assert.equal(campaignJob.destination,'client');
  assert.equal(campaignJob.payload.chat_id,String(client));
  assert.equal(campaignJob.payload.reply_markup.inline_keyboard[0][0].url,'https://isvoi.ru/catalog?utm_source=telegram&utm_medium=bot&utm_campaign=pilot-arrival');
  await complete(campaignJob);
  assert.equal((await db('telegram_campaigns').where({id:campaignId}).first()).status,'completed');
  await assert.rejects(db('telegram_campaigns').where({id:campaignId}).update({message_text:'Подмена после запуска'}),/Started campaign content is immutable/);
  await assert.rejects(db('telegram_message_outbox').where({id:campaignJob.id}).update({payload:{text:'Подмена получателя'}}),/Campaign recipient snapshot is immutable/);
  await db('telegram_campaigns').where({id:campaignId}).update({status:'approved'});
  assert.equal(await next(),null);
  assert.equal(Number((await db('telegram_message_outbox').where({campaign_id:campaignId,is_test:false}).count('* as n').first()).n),1);

  const blockedCampaign='77777777-7777-4777-8777-000000000002';
  await db('telegram_campaigns').insert({id:blockedCampaign,bot_id:p.botId,internal_title:'Пилот: блокировка',status:'sending',topic_key:'new_arrivals',message_text:'Проверка',content_snapshot:{message_text:'Проверка'}});
  await db('telegram_message_outbox').insert({bot_id:p.botId,session_id:session.id,subscription_id:subscription.id,campaign_id:blockedCampaign,destination:'client',purpose:'campaign',payload:{text:'Проверка'},state:'pending'});
  const blockedJob=await next(); await complete(blockedJob,{type:'permanent',status:403});
  assert.equal((await db('telegram_message_outbox').where({id:blockedJob.id}).first()).state,'blocked');
  assert.equal((await db('telegram_subscriptions').where({id:subscription.id}).first()).status,'blocked');

  await db('telegram_subscriptions').where({id:subscription.id}).update({status:'active',revoked_at:null});
  await db('telegram_bot_settings').where({bot_id:p.botId}).update({weekly_limit:0});
  const frequencyCampaign='77777777-7777-4777-8777-000000000004';
  await db('telegram_campaigns').insert({id:frequencyCampaign,bot_id:p.botId,internal_title:'Пилот: лимит',topic_key:'new_arrivals',message_text:'Лимит частоты'});
  await db('telegram_campaigns').where({id:frequencyCampaign}).update({status:'approved',approved_by:p.staff,approved_at:db.fn.now()});
  assert.equal(await next(),null);
  assert.equal((await db('telegram_message_outbox').where({campaign_id:frequencyCampaign}).first()).state,'suppressed_frequency');
  assert.equal((await db('telegram_campaigns').where({id:frequencyCampaign}).first()).status,'completed');
  await db('telegram_bot_settings').where({bot_id:p.botId}).update({weekly_limit:2});

  const currentHour=Number((await db.raw("select extract(hour from now() at time zone 'Europe/Moscow')::int h")).rows[0].h);
  const quietHour=(currentHour+2)%23;
  await db('telegram_bot_settings').where({bot_id:p.botId}).update({quiet_start:`${String(quietHour).padStart(2,'0')}:00`,quiet_end:`${String(quietHour+1).padStart(2,'0')}:00`});
  const quietCampaign='77777777-7777-4777-8777-000000000005';
  await db('telegram_campaigns').insert({id:quietCampaign,bot_id:p.botId,internal_title:'Пилот: тихие часы',status:'sending',topic_key:'new_arrivals',message_text:'Отложить',content_snapshot:{message_text:'Отложить'}});
  await db('telegram_message_outbox').insert({bot_id:p.botId,session_id:session.id,subscription_id:subscription.id,campaign_id:quietCampaign,destination:'client',purpose:'campaign',payload:{text:'Отложить'},state:'pending'});
  assert.equal(await next(),null);
  const quietRow=await db('telegram_message_outbox').where({campaign_id:quietCampaign}).first();
  assert.ok(new Date(quietRow.due_at).getTime()>Date.now());
  await db('telegram_message_outbox').where({id:quietRow.id}).update({state:'cancelled'});
  await db('telegram_bot_settings').where({bot_id:p.botId}).update({quiet_start:'00:00',quiet_end:'23:59'});

  const retryCampaign='77777777-7777-4777-8777-000000000006';
  await db('telegram_campaigns').insert({id:retryCampaign,bot_id:p.botId,internal_title:'Пилот: 429',status:'sending',topic_key:'new_arrivals',message_text:'Повторить позднее',content_snapshot:{message_text:'Повторить позднее'}});
  await db('telegram_message_outbox').insert({bot_id:p.botId,session_id:session.id,subscription_id:subscription.id,campaign_id:retryCampaign,destination:'client',purpose:'campaign',payload:{text:'Повторить позднее'},state:'pending'});
  const retryJob=await next();await complete(retryJob,{type:'rate_limit',retryAfter:30});
  assert.equal((await db('telegram_message_outbox').where({id:retryJob.id}).first()).state,'pending');
  await db('telegram_message_outbox').where({id:retryJob.id}).update({state:'cancelled'});

  const uncertainCampaign='77777777-7777-4777-8777-000000000007';
  await db('telegram_campaigns').insert({id:uncertainCampaign,bot_id:p.botId,internal_title:'Пилот: неизвестно',status:'sending',topic_key:'new_arrivals',message_text:'Не повторять',content_snapshot:{message_text:'Не повторять'}});
  await db('telegram_message_outbox').insert({bot_id:p.botId,session_id:session.id,subscription_id:subscription.id,campaign_id:uncertainCampaign,destination:'client',purpose:'campaign',payload:{text:'Не повторять'},state:'pending'});
  await db('telegram_runtime').where({bot_id:p.botId}).update({send_after:db.fn.now()});
  const uncertainJob=await next();await complete(uncertainJob,{type:'unknown'});
  assert.equal((await db('telegram_message_outbox').where({id:uncertainJob.id}).first()).state,'uncertain');

  const cancelCampaign='77777777-7777-4777-8777-000000000003';
  await db('telegram_campaigns').insert({id:cancelCampaign,bot_id:p.botId,internal_title:'Пилот: отказ',status:'sending',topic_key:'new_arrivals',message_text:'Не должно уйти',content_snapshot:{message_text:'Не должно уйти'}});
  await db('telegram_message_outbox').insert({bot_id:p.botId,session_id:session.id,subscription_id:subscription.id,campaign_id:cancelCampaign,destination:'client',purpose:'campaign',payload:{text:'Не должно уйти'},state:'pending',due_at:db.raw("now()+interval '1 hour'")});
  await apply(privateMessage('/news'));while(true){const job=await next();if(!job)break;await complete(job);}
  const offMenu=await db('telegram_message_outbox').where({session_id:session.id,state:'done'}).orderBy('created_at','desc').first();
  const off={update_id:++sequenceState.update,callback_query:{id:`notify-${sequenceState.update}`,data:'news:off',from:{id:client,is_bot:false},message:{message_id:Number(offMenu.telegram_message_id),chat:{type:'private',id:client},from:{id:Number(p.botId),is_bot:true}}}};
  assert.equal((await apply(off)).result,'selected');
  assert.equal((await db('telegram_message_outbox').where({campaign_id:cancelCampaign}).first()).state,'cancelled');
  assert.equal((await db('telegram_subscriptions').where({id:subscription.id}).first()).status,'unsubscribed');
  const event=await db('telegram_subscription_events').where({subscription_id:subscription.id}).first();
  await assert.rejects(db('telegram_subscription_events').where({id:event.id}).update({source:'tampered'}),/Subscription events are immutable/);

  console.log('PASS: notifications: site welcome, first-message support, explicit consent, immutable event log, campaign snapshot/dedup, service priority, CTA UTM, quiet hours, weekly limit, 429, blocked/uncertain delivery and immediate opt-out cancellation.');
}
