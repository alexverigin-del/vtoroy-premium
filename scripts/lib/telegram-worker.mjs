import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { inspectTelegram } from '../telegram_preflight.mjs';

export function workerConfig(env) {
  if (env.TELEGRAM_ENABLED !== 'true') return { enabled: false };
  const token = env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const directusToken = env.TELEGRAM_DIRECTUS_TOKEN?.trim() || '';
  const chatId = env.TELEGRAM_CHAT_ID?.trim() || '';
  const mode = env.TELEGRAM_MODE || 'test';
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token) || !directusToken || !/^-\d+$/.test(chatId) || !['test', 'production'].includes(mode)) {
    throw new Error('TELEGRAM_WORKER_CONFIG_INVALID');
  }
  let url;
  try { url = new URL(env.TELEGRAM_DIRECTUS_URL); } catch { throw new Error('TELEGRAM_DIRECTUS_URL_INVALID'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('TELEGRAM_DIRECTUS_URL_INVALID');
  }
  return { enabled: true, token, directusToken, chatId, mode, botId: token.split(':')[0], directusUrl: url.origin };
}

export function createClients(config, fetchImpl = fetch) {
  const telegramMethods = new Set(['getUpdates', 'createForumTopic', 'sendMessage', 'sendPhoto', 'editMessageText', 'answerCallbackQuery']);
  const directusMethods = new Set(['session', 'next', 'complete', 'update']);
  async function directus(path, data) {
    if (!directusMethods.has(path)) throw new Error('INVALID_DIRECTUS_OPERATION');
    let response, body;
    try {
      response = await fetchImpl(`${config.directusUrl}/isvoi-telegram/${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.directusToken}` },
        body: JSON.stringify(data),
      });
      body = await response.json();
    } catch { throw new Error('DIRECTUS_NETWORK_ERROR'); }
    if (!response.ok || !body?.data) throw new Error(`DIRECTUS_HTTP_${response.status}`);
    return body.data;
  }
  async function telegram(method, payload, destination) {
    if (!telegramMethods.has(method)) throw new Error('INVALID_TELEGRAM_OPERATION');
    const privateDelivery = destination?.channel === 'conversation' && destination?.destination === 'client' &&
      ['sendMessage','sendPhoto','editMessageText'].includes(method) && /^[1-9][0-9]{0,15}$/.test(String(payload.chat_id)) && !payload.message_thread_id;
    if (['createForumTopic', 'sendMessage', 'sendPhoto', 'editMessageText'].includes(method) && String(payload.chat_id) !== config.chatId && !privateDelivery) {
      throw new Error('TELEGRAM_DESTINATION_MISMATCH');
    }
    let response, body;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${config.token}/${method}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      body = await response.json();
    } catch { return { type: 'unknown' }; }
    if (response.ok && body?.ok === true) return { type: 'ok', result: body.result };
    const status = Number(body?.error_code || response.status);
    if (status === 429) return { type: 'rate_limit', retryAfter: Math.max(1, Number(body?.parameters?.retry_after) || 60) };
    if (status === 400 && method === 'editMessageText' && /message is not modified/i.test(body?.description || '')) return { type: 'not_modified' };
    if ([400,401,403,404].includes(status)) return { type: 'permanent', status };
    return { type: 'unknown' };
  }
  return { directus, telegram };
}

// One tick is independently testable. Cursor advancement occurs only in the database.
export async function workerTick({ clients, identity, offset, conversations = false, sleep = pause, pollTimeout = 10 }) {
  const poll = await clients.telegram('getUpdates', { offset, timeout: pollTimeout, limit: 20, allowed_updates: conversations ? ['callback_query','message'] : ['callback_query'] });
  if (poll.type !== 'ok' || !Array.isArray(poll.result)) {
    if (poll.type === 'rate_limit') await sleep(Math.min(86400000, poll.retryAfter * 1000));
    throw new Error('TELEGRAM_POLL_FAILED');
  }
  let nextOffset = offset;
  for (const update of poll.result) {
    const saved = await clients.directus('update', { ...identity, update });
    nextOffset = saved.update_offset;
    if (saved.callback_id) {
      // Failure to dismiss Telegram's spinner must not undo a committed assignment.
      await clients.telegram('answerCallbackQuery', { callback_query_id: saved.callback_id, text: saved.text, show_alert: saved.result === 'forbidden' });
    }
  }
  const { job } = await clients.directus('next', identity);
  if (job) {
    if(job.channel === 'conversation' && !conversations) throw new Error('CONVERSATIONS_NOT_ENABLED');
    const outcome = await clients.telegram(job.method, job.payload, job.channel === 'conversation' ? {channel:job.channel,destination:job.destination} : undefined);
    const acknowledgement = outcome.type === 'ok' ? {
      type: 'ok', topic_id: outcome.result?.message_thread_id,
      message_id: outcome.result?.message_id,
    } : outcome;
    // Only retry the DB acknowledgement. Never repeat the Telegram send here.
    let recorded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await clients.directus('complete', { ...identity, id: job.id, operation_id: job.operation_id, ...(job.channel?{channel:job.channel}:{}), outcome: acknowledgement });
        recorded = true;
        break;
      } catch {
        if (attempt < 2) await sleep(1000 * (attempt + 1));
      }
    }
    if (!recorded) throw new Error('DELIVERY_ACKNOWLEDGEMENT_PENDING');
  }
  return { offset: nextOffset, delivered: Boolean(job), deliveryClass:job?.campaign_id?'campaign':job?'service':null };
}

export const deliveryDelayMs=deliveryClass=>deliveryClass==='campaign'?3200:deliveryClass==='service'?1100:1000;

export async function runWorker(env, { once = false, fetchImpl = fetch, sleep = pause, signal, log = console.log } = {}) {
  const config = workerConfig(env);
  if (!config.enabled) { log('Telegram worker disabled. No network requests made.'); return; }
  const readiness = await inspectTelegram(env, { fetchImpl });
  if (!readiness.ready || readiness.webhookConfigured) throw new Error('TELEGRAM_NOT_READY_FOR_POLLING');
  const clients = createClients(config, fetchImpl);
  const identity = { bot_id: config.botId, worker_id: randomUUID() };
  log(`Telegram worker starting (${config.mode}); message content and credentials are not logged.`);
  let drainQueue=false;
  do {
    // Acquire/refresh before polling. A different worker cannot poll concurrently while leased.
    const session = await clients.directus('session', identity);
    if (session.mode !== config.mode) throw new Error('TELEGRAM_MODE_MISMATCH');
    const tick=await workerTick({ clients, identity, offset: session.update_offset, conversations: session.conversations === true, sleep, pollTimeout: once||drainQueue?0:2 });
    drainQueue=tick.delivered;
    if (!once && !signal?.aborted) await sleep(deliveryDelayMs(tick.deliveryClass));
  } while (!once && !signal?.aborted);
}
