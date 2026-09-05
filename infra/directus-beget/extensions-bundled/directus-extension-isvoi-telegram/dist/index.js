import { randomUUID } from 'node:crypto';
import { createConversations } from './conversations.js';
import { UUID, validId, failure, parseUpdate, routeMatches, renderCard, nextOperation, deliveryFailure, RESULT_TEXT } from './protocol.js';

export function createHandlers({ database, services, getSchema, env }) {
  const botId = String(env.ISVOI_TELEGRAM_BOT_ID || '');
  const mode = env.ISVOI_TELEGRAM_MODE || 'test';
  const workerUser = env.ISVOI_TELEGRAM_WORKER_USER_ID || '';
  const studioUrl = String(env.PUBLIC_URL || '').replace(/\/+$/, '');
  const enabled = env.ISVOI_TELEGRAM_ENABLED === true || env.ISVOI_TELEGRAM_ENABLED === 'true';
  const configValid = validId(botId) && UUID.test(workerUser) && ['test', 'production'].includes(mode) &&
    /^https:\/\/[^/?#]+$/.test(studioUrl);

  async function authorized(req) {
    if (!enabled) throw failure('TELEGRAM_DISABLED', 503);
    if (!configValid) throw failure('TELEGRAM_NOT_CONFIGURED', 503);
    if (req.accountability?.user !== workerUser || req.accountability?.admin === true) throw failure('FORBIDDEN', 403);
    const user = await database('directus_users').where({ id: workerUser, status: 'active' }).first('id', 'role');
    if (!user?.role) throw failure('FORBIDDEN', 403);
    if (String(req.body?.bot_id) !== botId || !UUID.test(req.body?.worker_id || '')) throw failure('INVALID_WORKER');
  }
  async function locked(req, action, acquire = false) {
    await authorized(req);
    return database.transaction(async (trx) => {
      if (acquire) await trx('telegram_runtime').insert({ bot_id: botId }).onConflict('bot_id').ignore();
      // A database lease serializes both Telegram polling and all delivery operations.
      const query = trx('telegram_runtime').where({ bot_id: botId });
      if (acquire) query.andWhere(q => q.where('lease_until', '<=', trx.fn.now()).orWhere({ worker_id: req.body.worker_id }));
      else query.andWhere({ worker_id: req.body.worker_id }).andWhere('lease_until', '>', trx.fn.now());
      const runtime = await query.forUpdate().first();
      if (!runtime) throw failure('WORKER_LEASE_UNAVAILABLE', 409);
      await trx('telegram_runtime').where({ bot_id: botId }).update({ worker_id: req.body.worker_id, lease_until: trx.raw("now() + interval '90 seconds'") });
      return action(trx, runtime);
    });
  }

  const conversations = createConversations({database,services,getSchema,env,botId,mode,staffAccountability});
  const session = req => locked(req, async (_trx, runtime) => ({ update_offset: Number(runtime.update_offset), mode, conversations: conversations.enabled }), true);

  const next = req => locked(req, async (trx, runtime) => {
    await conversations.maintenance(trx);
    const routes = trx('telegram_routes').where({ bot_id: botId, is_test: mode === 'test' }).select('id');
    // Creation is not retried after an unknown outcome: Telegram has no idempotency key.
    await trx('telegram_deliveries').whereIn('route_id', routes).where({ state: 'in_flight' })
      .where('operation_deadline', '<', trx.fn.now()).update({
        state: trx.raw("CASE WHEN operation_kind='editMessageText' THEN 'pending' ELSE 'uncertain' END"),
        due_at: trx.fn.now(), error_code: 'WORKER_INTERRUPTED',
      });
    if (new Date(runtime.send_after).getTime() > Date.now()) return { job: null, update_offset: Number(runtime.update_offset) };
    const delivery = await trx('telegram_deliveries as d').join('telegram_routes as r', 'r.id', 'd.route_id')
      .where({ 'r.bot_id': botId, 'r.is_test': mode === 'test', 'r.enabled': true, 'd.state': 'pending' })
      .where('d.due_at', '<=', trx.fn.now()).orderBy('d.created_at').select('d.*').forUpdate('d').skipLocked().first();
    if (!delivery) {
      const job = await conversations.next(trx);
      if (job) await trx('telegram_runtime').where({bot_id:botId}).update({send_after:trx.raw("now()+interval '3.2 seconds'")});
      return { job, update_offset: Number(runtime.update_offset) };
    }
    const route = await trx('telegram_routes as r').join('store_locations as s', 's.id', 'r.store_id').where('r.id', delivery.route_id).select('r.*', 's.city').first();
    const lead = await trx('leads').where({ id: delivery.lead_id }).first('id', 'status', 'assigned_to', 'kind', 'device', 'reference_code', 'store_location_id', 'is_test');
    const validRoute = routeMatches(lead, route);
    if (!validRoute && !delivery.message_id) {
      await trx('telegram_deliveries').where({ id: delivery.id }).update({ state: 'failed', error_code: 'ROUTE_CHANGED' });
      return { job: null, update_offset: Number(runtime.update_offset) };
    }
    const staff = lead.assigned_to ? await trx('directus_users').where({ id: lead.assigned_to }).first('first_name', 'last_name') : null;
    const studioLink = env.ISVOI_TELEGRAM_STUDIO_LINK_ENABLED !== false && env.ISVOI_TELEGRAM_STUDIO_LINK_ENABLED !== 'false';
    const card = renderCard(lead, route, delivery, [staff?.first_name, staff?.last_name].filter(Boolean).join(' '), studioUrl, { studioLink });
    const method = nextOperation(delivery);
    const payload = method === 'createForumTopic' ? { chat_id: String(route.chat_id), name: card.title } : {
      chat_id: String(route.chat_id), text: validRoute ? card.text : 'Заявка больше не обслуживается в этой группе.',
      reply_markup: validRoute ? card.reply_markup : { inline_keyboard: [] },
      link_preview_options: { is_disabled: true },
      ...(method === 'sendMessage' ? { message_thread_id: Number(delivery.topic_id) } : { message_id: Number(delivery.message_id) }),
    };
    const operationId = randomUUID();
    await trx('telegram_deliveries').where({ id: delivery.id }).update({
      state: 'in_flight', operation_id: operationId, operation_kind: method,
      operation_revision: delivery.revision, operation_deadline: trx.raw("now() + interval '60 seconds'"),
      attempts: delivery.attempts + 1, error_code: null,
    });
    await trx('telegram_runtime').where({ bot_id: botId }).update({ send_after: trx.raw("now() + interval '3.2 seconds'") });
    return { job: { id: delivery.id, operation_id: operationId, method, payload }, update_offset: Number(runtime.update_offset) };
  });

  const complete = req => locked(req, async (trx) => {
    const { id, operation_id: operationId, outcome } = req.body;
    if (!UUID.test(id || '') || !UUID.test(operationId || '') || !outcome ||
      !['ok', 'unknown', 'rate_limit', 'permanent', 'not_modified'].includes(outcome.type)) throw failure('INVALID_OUTCOME');
    if (req.body.channel === 'conversation') return conversations.complete(trx,req.body);
    const delivery = await trx('telegram_deliveries as d').join('telegram_routes as r', 'r.id', 'd.route_id')
      .where({ 'd.id': id, 'r.bot_id': botId, 'r.is_test': mode === 'test' }).select('d.*').forUpdate('d').first();
    if (!delivery || delivery.operation_id !== operationId) throw failure('STALE_OPERATION', 409);
    if (delivery.state !== 'in_flight') return { ok: true }; // Retried acknowledgement, not a repeated Telegram call.
    let patch;
    const noChange = outcome.type === 'not_modified' && delivery.operation_kind === 'editMessageText';
    if (outcome.type === 'ok' || noChange) {
      patch = { state: 'pending', attempts: 0, error_code: null, due_at: trx.fn.now() };
      if (delivery.operation_kind === 'createForumTopic') {
        if (!validId(outcome.topic_id)) throw failure('INVALID_TOPIC_ID');
        patch.topic_id = String(outcome.topic_id);
      } else {
        if (delivery.operation_kind === 'sendMessage') {
          if (!validId(outcome.message_id)) throw failure('INVALID_MESSAGE_ID');
          patch.message_id = String(outcome.message_id);
        }
        patch.sent_revision = delivery.operation_revision;
        patch.state = String(delivery.revision) === String(delivery.operation_revision) ? 'done' : 'pending';
      }
    } else {
      const disposition = deliveryFailure(delivery.operation_kind, outcome, delivery.attempts);
      patch = { state: disposition.state, error_code: disposition.code, due_at: trx.raw("now() + (? * interval '1 second')", [disposition.delay]) };
      if (outcome.type === 'rate_limit') await trx('telegram_runtime').where({ bot_id: botId })
        .update({ send_after: trx.raw("now() + (? * interval '1 second')", [disposition.delay]) });
    }
    await trx('telegram_deliveries').where({ id }).update(patch);
    return { ok: true };
  });

  async function staffAccountability(trx, user) {
    const roles = [];
    let role = user.role;
    while (role) {
      if (roles.includes(role) || roles.length >= 32) throw failure('INVALID_ROLE_TREE', 403);
      roles.push(role);
      role = (await trx('directus_roles').where({ id: role }).first('parent'))?.parent;
    }
    // Deliberately no admin bypass. The mapped staff user needs normal lead permissions.
    return { user: user.id, role: user.role || null, roles, admin: false, app: true };
  }

  async function claim(trx, callback) {
    if (!callback.supported) return 'ignored';
    const delivery = await trx('telegram_deliveries').where({ id: callback.deliveryId }).first();
    if (!delivery) return 'stale';
    const route = await trx('telegram_routes').where({ id: delivery.route_id, bot_id: botId, is_test: mode === 'test', enabled: true }).forShare().first();
    if (!route || String(route.chat_id) !== callback.chatId || String(delivery.message_id) !== callback.messageId || String(delivery.topic_id) !== callback.topicId) return 'stale';
    const staff = await trx('telegram_staff').where({ route_id: route.id, telegram_user_id: callback.userId, enabled: true }).forShare().first();
    if (!staff) return 'forbidden';
    const user = await trx('directus_users').where({ id: staff.directus_user, status: 'active' }).forShare().first('id', 'role');
    if (!user?.role) return 'forbidden';
    const lead = await trx('leads').where({ id: delivery.lead_id }).forUpdate().first();
    if (!lead || !routeMatches(lead, route)) return 'forbidden';
    if (!['new', 'in_progress', 'waiting'].includes(lead.status)) return 'closed';
    if (lead.assigned_to) return lead.assigned_to === user.id ? 'already_yours' : 'already_assigned';
    const accountability = await staffAccountability(trx, user);
    const schema = await getSchema();
    try {
      // Savepoint: a denied comment or lead update rolls both writes back.
      await trx.transaction(async (writeTrx) => {
        const options = { schema, knex: writeTrx, accountability };
        const leads = new services.ItemsService('leads', options);
        const comments = new services.ItemsService('lead_comments', options);
        await leads.updateOne(lead.id, { assigned_to: user.id, status: 'in_progress' });
        await comments.createOne({ lead: lead.id, created_by: user.id, outcome: 'note', comment: 'Принял заявку в работу через Telegram.' });
      });
    } catch (error) {
      if (error?.code === 'FORBIDDEN' || error?.status === 403) return 'forbidden';
      throw error;
    }
    return 'claimed';
  }

  const update = req => locked(req, async (trx, runtime) => {
    const parsed = parseUpdate(req.body.update);
    let receipt = await trx('telegram_receipts').where({ bot_id: botId }).andWhere(q => {
      q.where({ update_id: parsed.updateId });
      if (parsed.callback) q.orWhere({ callback_id: parsed.callback.id });
    }).first();
    if (!receipt) {
      const conversationResult = await conversations.update(trx,req.body.update);
      const result = conversationResult ?? (parsed.callback ? await claim(trx, parsed.callback) : 'ignored');
      [receipt] = await trx('telegram_receipts').insert({
        bot_id: botId, update_id: parsed.updateId, callback_id: parsed.callback?.id || null, result_code: result,
      }).returning('*');
    }
    const offset = Math.max(Number(runtime.update_offset), parsed.updateId + 1);
    await trx('telegram_runtime').where({ bot_id: botId }).update({ update_offset: offset });
    return { update_offset: offset, callback_id: parsed.callback?.id || null, text: RESULT_TEXT[receipt.result_code] || RESULT_TEXT.ignored, result: receipt.result_code };
  });
  return { session, next, complete, update, intake: conversations.intake, 'intake-check': conversations.intakeCheck };
}

export default {
  id: 'isvoi-telegram',
  handler: (router, context) => {
    const handlers = createHandlers(context);
    for (const [path, handler] of Object.entries(handlers)) {
      router.post(`/${path}`, async (req, res) => {
        try { res.json({ data: await handler(req) }); }
        catch (error) {
          // No raw exception, request body, token, URL or client data in logs/responses.
          res.status(error.publicCode ? error.status : 500).json({ errors: [{ message: error.publicCode || 'TELEGRAM_OPERATION_FAILED' }] });
        }
      });
    }
  },
};
