const enabledFlag = value => value === true || value === 'true';

const DEFAULT_WELCOME = 'Здравствуйте! Это бот I СВОИ. Здесь можно подобрать устройство, продать или обменять технику, задать вопрос менеджеру и продолжить действующую заявку.';
const DEFAULT_HELP = 'Бот передаёт обращения менеджерам I СВОИ и сохраняет переписку в заявке. Информационные сообщения приходят только по выбранным подпискам. Управлять ими можно командой /news.';

const mainKeyboard = { inline_keyboard: [
  [{ text: 'Купить / подобрать', callback_data: 'kind:selection' }],
  [{ text: 'Продать / обменять', callback_data: 'kind:trade' }],
  [{ text: 'Задать вопрос', callback_data: 'kind:support' }],
  [{ text: 'Мои заявки', callback_data: 'dialogs' }],
  [{ text: 'Подписки', callback_data: 'news' }],
] };

function safeUrl(raw) {
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname !== 'isvoi.ru' && !url.hostname.endsWith('.isvoi.ru')) return null;
  return url;
}

export function campaignPayload(campaign, photoFile) {
  const text = String(campaign.message_text || '').trim();
  if (!text || text.length > 3500) throw new Error('CAMPAIGN_TEXT_INVALID');
  if (photoFile && text.length > 1024) throw new Error('CAMPAIGN_CAPTION_INVALID');
  const payload = photoFile
    ? { photo: photoFile, caption: text }
    : { text, link_preview_options: { is_disabled: true } };
  if (campaign.cta_label || campaign.cta_url) {
    const url = safeUrl(campaign.cta_url);
    if (!url || !String(campaign.cta_label || '').trim() || String(campaign.cta_label).length > 64) throw new Error('CAMPAIGN_CTA_INVALID');
    for (const [key, value] of [['utm_source', campaign.utm_source], ['utm_medium', campaign.utm_medium], ['utm_campaign', campaign.utm_campaign]]) {
      if (value) url.searchParams.set(key, String(value).slice(0, 100));
    }
    payload.reply_markup = { inline_keyboard: [[{ text: String(campaign.cta_label).trim(), url: url.toString() }]] };
  }
  return payload;
}

export function createNotifications({ env, botId, queue, tell, edit }) {
  const runtimeEnabled = enabledFlag(env.ISVOI_TELEGRAM_NOTIFICATIONS_ENABLED);

  async function getSettings(trx) {
    if (!runtimeEnabled) return null;
    return trx('telegram_bot_settings').where({bot_id:botId}).first();
  }

  function pilotAllowed(settings, userId) {
    if (!settings?.notifications_enabled) return false;
    if (!settings.pilot_mode) return true;
    return (settings.pilot_user_ids || []).some(id => String(id) === String(userId));
  }

  async function welcome(trx, session, source = null) {
    if (source) await trx('telegram_client_sessions').where({id:session.id}).update({entry_source:String(source).slice(0,64)});
    const settings = await getSettings(trx);
    await tell(trx, session, settings?.welcome_text || DEFAULT_WELCOME, mainKeyboard);
  }

  async function help(trx, session) {
    const settings = await getSettings(trx);
    await tell(trx, session, settings?.help_text || DEFAULT_HELP, mainKeyboard);
  }

  async function renderNews(trx, session, notice = '', editMessageId = null) {
    const settings = await getSettings(trx);
    if (!pilotAllowed(settings, session.user_id)) {
      await (editMessageId?edit(trx,session,editMessageId,'Подписки пока работают в закрытом пилоте. Обращения и переписка с менеджером доступны без ограничений.',mainKeyboard):tell(trx, session, 'Подписки пока работают в закрытом пилоте. Обращения и переписка с менеджером доступны без ограничений.', mainKeyboard));
      return 'unavailable';
    }
    const topics = await trx('telegram_notification_topics').where({active:true}).orderBy('sort');
    const active = await trx('telegram_subscriptions').where({bot_id:botId,session_id:session.id,status:'active'}).pluck('topic_key');
    let draft = session.subscription_draft;
    if (!Array.isArray(draft)) draft = active;
    draft = draft.filter(key => topics.some(topic => topic.key === key));
    await trx('telegram_client_sessions').where({id:session.id}).update({subscription_draft:JSON.stringify(draft)});
    const rows = topics.map(topic => [{text:`${draft.includes(topic.key) ? '✓' : '○'} ${topic.label}`,callback_data:`news:toggle:${topic.key}`}]);
    rows.push([{text:'Сохранить подписку',callback_data:'news:save'}]);
    rows.push([{text:'Отключить всё',callback_data:'news:off'}]);
    rows.push([{text:'Главное меню',callback_data:'main'}]);
    const state = topics.map(topic => `${draft.includes(topic.key) ? '✓' : '○'} ${topic.label}`).join('\n');
    const text=`${notice ? `${notice}\n\n` : ''}Выберите темы:\n${state}\n\n${settings.consent_text}\nВерсия согласия: ${settings.consent_version}.`;
    await (editMessageId?edit(trx,session,editMessageId,text,{inline_keyboard:rows}):tell(trx,session,text,{inline_keyboard:rows}));
    return 'shown';
  }

  async function recordChoice(trx, session, desired, source) {
    const settings = await getSettings(trx);
    if (!pilotAllowed(settings, session.user_id)) return 'unavailable';
    const topics = await trx('telegram_notification_topics').where({active:true}).pluck('key');
    const selected = new Set(desired.filter(key => topics.includes(key)));
    for (const key of topics) {
      const existing = await trx('telegram_subscriptions').where({bot_id:botId,session_id:session.id,topic_key:key}).forUpdate().first();
      const status = selected.has(key) ? 'active' : 'unsubscribed';
      if (existing?.status === status) continue;
      const values = status === 'active'
        ? {status,consent_version:settings.consent_version,consented_at:trx.fn.now(),revoked_at:null,source}
        : {status,revoked_at:trx.fn.now(),source};
      let subscriptionId = existing?.id;
      if (existing) await trx('telegram_subscriptions').where({id:existing.id}).update(values);
      else if(status==='active') {const [created]=await trx('telegram_subscriptions').insert({bot_id:botId,session_id:session.id,topic_key:key,...values}).returning('id');subscriptionId=created.id;}
      else continue;
      await trx('telegram_subscription_events').insert({subscription_id:subscriptionId,event:status === 'active' ? 'subscribed' : 'unsubscribed',consent_version:settings.consent_version,source});
      if (status !== 'active') {
        await trx('telegram_message_outbox as o').where({session_id:session.id,state:'pending'}).whereNotNull('campaign_id')
          .whereIn('campaign_id',trx('telegram_campaigns').where({topic_key:key}).select('id')).update({state:'cancelled',error_code:'UNSUBSCRIBED'});
      }
    }
    await trx('telegram_client_sessions').where({id:session.id}).update({subscription_draft:null});
    return 'saved';
  }

  async function callback(trx, session, data, messageId = null) {
    if (data === 'news') { await renderNews(trx,session,'',messageId); return 'selected'; }
    if (data === 'main') { await welcome(trx,session); return 'selected'; }
    const toggle = /^news:toggle:([a-z][a-z0-9_]{1,48})$/.exec(data || '');
    if (toggle) {
      const settings=await getSettings(trx); if(!pilotAllowed(settings,session.user_id)) {await renderNews(trx,session,'',messageId);return 'selected';}
      const exists=await trx('telegram_notification_topics').where({key:toggle[1],active:true}).first(); if(!exists) return 'stale';
      let draft=Array.isArray(session.subscription_draft)?session.subscription_draft:await trx('telegram_subscriptions').where({bot_id:botId,session_id:session.id,status:'active'}).pluck('topic_key');
      draft=draft.includes(toggle[1])?draft.filter(key=>key!==toggle[1]):[...draft,toggle[1]];
      await trx('telegram_client_sessions').where({id:session.id}).update({subscription_draft:JSON.stringify(draft)});
      await renderNews(trx,{...session,subscription_draft:draft},'',messageId); return 'selected';
    }
    if (data === 'news:save') {
      const draft=Array.isArray(session.subscription_draft)?session.subscription_draft:[];
      await recordChoice(trx,session,draft,'bot_menu');
      await renderNews(trx,{...session,subscription_draft:null},'Подписки сохранены. Изменения применяются сразу.',messageId); return 'selected';
    }
    if (data === 'news:off') {
      await recordChoice(trx,session,[],'bot_menu');
      await renderNews(trx,{...session,subscription_draft:null},'Все подписки отключены. Неотправленные сообщения отменены.',messageId); return 'selected';
    }
    return null;
  }

  async function resolvePhoto(trx, campaign) {
    if (!campaign.photo_file) return null;
    const file=await trx('directus_files').where({id:campaign.photo_file}).first('id','type');
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('CAMPAIGN_PHOTO_INVALID');
    const base=String(env.PUBLIC_URL || '').replace(/\/+$/,'');
    if(!/^https:\/\/[^/?#]+$/.test(base)) throw new Error('PUBLIC_URL_INVALID');
    return `${base}/assets/${file.id}`;
  }

  async function prepareTest(trx, settings) {
    const campaign=await trx('telegram_campaigns').whereNotNull('test_requested_at')
      .where(q=>q.whereNull('test_sent_at').orWhereRaw('test_sent_at < test_requested_at')).orderBy('test_requested_at').forUpdate().first();
    if(!campaign) return;
    const staff=await trx('telegram_staff').where({directus_user:campaign.test_requested_by,enabled:true}).first();
    const session=staff?await trx('telegram_client_sessions').where({bot_id:botId,user_id:String(staff.telegram_user_id)}).first():null;
    if(!session || !pilotAllowed(settings,session.user_id)) {await trx('telegram_campaigns').where({id:campaign.id}).update({last_error:'TEST_RECIPIENT_NOT_ALLOWED',test_sent_at:trx.fn.now()});return;}
    const payload=campaignPayload(campaign,await resolvePhoto(trx,campaign));
    await queue(trx,{session_id:session.id,destination:'client',purpose:'campaign_test',campaign_id:campaign.id,is_test:true},payload);
    await trx('telegram_campaigns').where({id:campaign.id}).update({test_sent_at:trx.fn.now(),last_error:null});
  }

  async function prepareApproved(trx, settings) {
    const campaign=await trx('telegram_campaigns').where({bot_id:botId,status:'approved'}).whereNull('content_snapshot').orderBy('approved_at').forUpdate().skipLocked().first();
    if(!campaign) return;
    if(campaign.destination_type!=='bot_subscribers') {await trx('telegram_campaigns').where({id:campaign.id}).update({status:'failed',last_error:'CHANNEL_NOT_ENABLED'});return;}
    const topic=await trx('telegram_notification_topics').where({key:campaign.topic_key,active:true}).first();
    if(!topic) {await trx('telegram_campaigns').where({id:campaign.id}).update({status:'failed',last_error:'TOPIC_DISABLED'});return;}
    let payload;
    try {payload=campaignPayload(campaign,await resolvePhoto(trx,campaign));}
    catch(error) {await trx('telegram_campaigns').where({id:campaign.id}).update({status:'failed',last_error:String(error.message).slice(0,120)});return;}
    const subscriptions=await trx('telegram_subscriptions as s').join('telegram_client_sessions as cs','cs.id','s.session_id')
      .where({'s.bot_id':botId,'s.topic_key':campaign.topic_key,'s.status':'active'}).select('s.id as subscription_id','cs.id as session_id','cs.user_id');
    let recipients=0,suppressed=0;
    for(const sub of subscriptions) {
      if(!pilotAllowed(settings,sub.user_id)) continue;
      const sent=await trx('telegram_message_outbox').where({session_id:sub.session_id,state:'done',is_test:false}).whereNotNull('campaign_id').where('created_at','>',trx.raw("now()-interval '7 days'")).count('* as n').first();
      const state=Number(sent.n)>=Number(settings.weekly_limit)?'suppressed_frequency':'pending';
      await trx('telegram_message_outbox').insert({bot_id:botId,session_id:sub.session_id,subscription_id:sub.subscription_id,campaign_id:campaign.id,destination:'client',purpose:'campaign',payload:JSON.stringify(payload),state,error_code:state==='pending'?null:'WEEKLY_LIMIT'}).onConflict().ignore();
      state==='pending'?recipients++:suppressed++;
    }
    const snapshot={topic_key:campaign.topic_key,destination_type:campaign.destination_type,message_text:campaign.message_text,photo_file:campaign.photo_file,cta_label:campaign.cta_label,cta_url:campaign.cta_url,utm_source:campaign.utm_source,utm_medium:campaign.utm_medium,utm_campaign:campaign.utm_campaign,approved_at:campaign.approved_at};
    await trx('telegram_campaigns').where({id:campaign.id}).update({content_snapshot:JSON.stringify(snapshot),recipient_snapshot_at:trx.fn.now(),recipient_count:recipients,suppressed_count:suppressed,status:recipients?'sending':'completed',started_at:trx.fn.now(),completed_at:recipients?null:trx.fn.now(),last_error:null});
  }

  async function prepare(trx) {
    const settings=await getSettings(trx); if(!settings?.notifications_enabled) return;
    await prepareTest(trx,settings);
    await prepareApproved(trx,settings);
  }

  async function allowDelivery(trx,row) {
    if(!row.campaign_id) return true;
    const settings=await getSettings(trx); if(!settings?.notifications_enabled) {await trx('telegram_message_outbox').where({id:row.id}).update({state:'cancelled',error_code:'NOTIFICATIONS_DISABLED'});return false;}
    const inside=await trx.raw("select ((now() at time zone ?)::time >= ?::time and (now() at time zone ?)::time < ?::time) ok",[settings.timezone,settings.quiet_start,settings.timezone,settings.quiet_end]);
    if(inside.rows[0].ok) return true;
    await trx('telegram_message_outbox').where({id:row.id}).update({due_at:trx.raw("case when (now() at time zone ?)::time < ?::time then ((now() at time zone ?)::date + ?::time) at time zone ? else (((now() at time zone ?)::date + 1) + ?::time) at time zone ? end",[settings.timezone,settings.quiet_start,settings.timezone,settings.quiet_start,settings.timezone,settings.timezone,settings.quiet_start,settings.timezone])});
    return false;
  }

  async function completed(trx,row,state,errorCode) {
    if(!row.campaign_id) return;
    if(state==='blocked' && errorCode==='TELEGRAM_403' && row.subscription_id) {
      const subscription=await trx('telegram_subscriptions').where({id:row.subscription_id}).forUpdate().first();
      if(subscription?.status==='active') {
        await trx('telegram_subscriptions').where({id:subscription.id}).update({status:'blocked',revoked_at:trx.fn.now()});
        await trx('telegram_subscription_events').insert({subscription_id:subscription.id,event:'blocked',consent_version:subscription.consent_version,source:'telegram_delivery'});
      }
    }
    const counts=await trx('telegram_message_outbox').where({campaign_id:row.campaign_id,is_test:false}).select('state').count('* as n').groupBy('state');
    const latency=(await trx.raw("select round(percentile_cont(0.5) within group(order by delivery_latency_ms))::int p50,round(percentile_cont(0.95) within group(order by delivery_latency_ms))::int p95 from telegram_message_outbox where campaign_id=? and is_test=false and state='done' and delivery_latency_ms is not null",[row.campaign_id])).rows[0];
    const values=Object.fromEntries(counts.map(item=>[item.state,Number(item.n)]));
    const active=(values.pending||0)+(values.in_flight||0);
    await trx('telegram_campaigns').where({id:row.campaign_id}).update({delivered_count:values.done||0,blocked_count:values.blocked||0,failed_count:(values.failed||0)+(values.uncertain||0),suppressed_count:values.suppressed_frequency||0,latency_p50_ms:latency.p50,latency_p95_ms:latency.p95,...(!active?{status:'completed',completed_at:trx.fn.now()}:{})});
  }

  return {enabled:runtimeEnabled,welcome,help,news:renderNews,callback,prepare,allowDelivery,completed};
}
