export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const POSITIVE_ID = /^[1-9][0-9]{0,15}$/;
export const RESULT_TEXT = {
  claimed: 'Заявка закреплена за вами.',
  already_yours: 'Заявка уже у вас в работе.',
  already_assigned: 'Заявку уже принял другой менеджер.',
  closed: 'Заявка уже завершена.',
  forbidden: 'Нет доступа к этой заявке.',
  stale: 'Кнопка устарела. Откройте актуальную карточку.',
  ignored: 'Действие не поддерживается.',
  selected: 'Выбор сохранён.', linked: 'Заявка подключена.',
  draft_started: 'Ответьте на приглашение бота в этой теме.',
  draft_ready: 'Проверьте черновик и подтвердите отправку.',
  queued: 'Ответ поставлен в очередь.', cancelled: 'Отправка отменена.',
  rate_limited: 'Слишком много действий. Подождите минуту.',
};
export function failure(code, status = 400) {
  return Object.assign(new Error(code), { publicCode: code, status });
}
export function validId(value) {
  return (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))) &&
    POSITIVE_ID.test(String(value));
}
export function parseUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) throw failure('INVALID_UPDATE');
  const q = update.callback_query;
  if (!q) return { updateId: update.update_id, callback: null };
  if (typeof q.id !== 'string' || q.id.length < 1 || q.id.length > 128) throw failure('INVALID_CALLBACK');
  // Never accept anonymous/channel authors, inline messages, foreign bots or arbitrary text.
  const match = typeof q.data === 'string' ? /^take:([0-9a-f-]{36})$/i.exec(q.data) : null;
  const supported = match && UUID.test(match[1]) && q.from?.is_bot === false && validId(q.from?.id) &&
    q.message?.chat?.type === 'supergroup' && Number.isSafeInteger(q.message.chat.id) && q.message.chat.id < 0 &&
    validId(q.message.message_id) && validId(q.message.message_thread_id);
  return { updateId: update.update_id, callback: {
    id: q.id, supported: Boolean(supported), deliveryId: supported ? match[1] : null,
    userId: supported ? String(q.from.id) : null,
    chatId: supported ? String(q.message.chat.id) : null,
    messageId: supported ? String(q.message.message_id) : null,
    topicId: supported ? String(q.message.message_thread_id) : null,
  } };
}
export function routeMatches(lead, route) {
  return route.enabled === true && Boolean(lead.is_test) === route.is_test &&
    (lead.store_location_id === route.store_id || (!lead.store_location_id && route.accept_unscoped));
}
const trim = (text, limit) => String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
export function renderCard(lead, route, delivery, staffName, studioUrl, { studioLink = true } = {}) {
  const kinds = { purchase: 'Покупка', selection: 'Подбор', trade: 'Trade-in', club: 'Club', upgrade: 'Обновление', support: 'Вопрос' };
  const statuses = { new: 'Новая', in_progress: 'В работе', waiting: 'Ждём ответа', won: 'Успешная', closed: 'Закрыта' };
  const reference = trim(lead.reference_code || lead.id.slice(0, 8), 36);
  const kind = kinds[lead.kind] || 'Заявка';
  const available = !lead.assigned_to && ['new', 'in_progress', 'waiting'].includes(lead.status);
  const buttons = [];
  if (available) buttons.push([{ text: 'Взять в работу', callback_data: `take:${delivery.id}` }]);
  if (studioLink) buttons.push([{ text: 'Открыть в Directus', url: `${studioUrl}/admin/content/leads/${lead.id}` }]);
  return {
    title: trim(`${route.is_test ? 'ТЕСТ · ' : ''}${reference} · ${kind}`, 128),
    text: [
      `${route.is_test ? 'ТЕСТОВАЯ ЗАЯВКА · ' : 'Заявка · '}${reference}`,
      `${kind} · ${trim(lead.device || 'Товар уточняется', 180)}`,
      `Магазин: ${trim(route.city || 'Уточняется', 80)}`,
      `Статус: ${statuses[lead.status] || 'Уточняется'}`,
      `Ответственный: ${lead.assigned_to ? trim(staffName || 'Назначен', 100) : 'не назначен'}`,
      'Контакт и подробности — в карточке Directus.',
    ].join('\n'),
    reply_markup: { inline_keyboard: buttons },
  };
}
export function nextOperation(delivery) {
  if (!delivery.topic_id) return 'createForumTopic';
  if (!delivery.message_id) return 'sendMessage';
  return 'editMessageText';
}
export function deliveryFailure(kind, outcome, attempts) {
  if (outcome.type === 'rate_limit') return { state: 'pending', delay: Math.max(1, Math.min(86400, Number(outcome.retryAfter) || 60)), code: 'TELEGRAM_429' };
  if (outcome.type === 'not_modified' && kind === 'editMessageText') return { state: 'done', delay: 0, code: null };
  if (outcome.type === 'permanent') return { state: 'failed', delay: 0, code: `TELEGRAM_${[400,401,403,404].includes(outcome.status) ? outcome.status : 'ERROR'}` };
  if (kind !== 'editMessageText') return { state: 'uncertain', delay: 0, code: 'DELIVERY_UNKNOWN' };
  return { state: attempts >= 8 ? 'failed' : 'pending', delay: Math.min(3600, 5 * 2 ** Math.min(attempts, 9)), code: 'RETRYABLE_EDIT' };
}
