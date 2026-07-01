const { query, queryOne } = require('../config/database');
const { findOrCreateContact, findOrCreateConversation } = require('../lib/conversations');
const { normalizePhone } = require('../services/smsService');
const { MESSAGE_STATUSES } = require('../domain/states');
const messageStateService = require('./messageStateService');
const webhookProcessor = require('./webhookProcessor');
const { recordDeadLetter } = require('./webhookDeadLetterService');
const { getAdapter } = require('./providers/providerRegistry');

const stopKeywords = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO', "DON'T TEXT ME", 'PLEASE REMOVE ME'];

function isStop(text) {
  const clean = String(text || '').trim().toUpperCase();
  return stopKeywords.includes(clean) || clean.startsWith('STOP ');
}

async function findUserByInboundLine(to) {
  const number = await queryOne(
    "SELECT user_id FROM numbers WHERE phone_number = $1 AND status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1",
    [to]
  );
  if (number?.user_id) {
    return queryOne('SELECT id FROM users WHERE id = $1', [number.user_id]);
  }
  return null;
}

async function handleInbound(userId, from, to, text, messageId, provider) {
  const contact = await findOrCreateContact({ userId, phone: from });
  const conversation = await findOrCreateConversation({ userId, contactId: contact.id, inbound: true });
  const stopped = isStop(text);
  const inboundStatus = stopped ? MESSAGE_STATUSES.UNSUBSCRIBED : MESSAGE_STATUSES.DELIVERED;

  if (stopped) {
    await query(
      `INSERT INTO suppression_list (user_id, workspace_id, phone, reason, source)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM suppression_list WHERE user_id = $1 AND phone = $3)`,
      [userId, 1, from, text.trim().toUpperCase(), 'inbound']
    );
    await query(
      "UPDATE contacts SET is_unsubscribed = TRUE, consent_status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [contact.id]
    );
  }

  const insert = await queryOne(
    `INSERT INTO messages (
      user_id, workspace_id, contact_id, conversation_id, direction, to_number, from_number,
      message_body, provider, provider_message_id, status, delivered_at, created_at
    ) VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
    [userId, 1, contact.id, conversation.id, to, from, text, provider, messageId, inboundStatus]
  );

  await messageStateService.logStatusEvent(insert.id, null, inboundStatus, `webhook:${provider}`);

  await query(
    'UPDATE conversations SET phone = $1, last_message_preview = $2, last_message_at = NOW(), unread_count = unread_count + 1, updated_at = NOW() WHERE id = $3',
    [from, text.slice(0, 120), conversation.id]
  );

  return { ok: true, unsubscribed: stopped, conversationId: conversation.id, messageId: insert.id };
}

async function processInboundWebhook(provider, body, { verified = false, forceRetry = false } = {}) {
  const adapter = getAdapter(provider);
  const normalized = adapter?.normalizeInbound?.(body) || {
    from: normalizePhone(body.from || body.From),
    to: normalizePhone(body.to || body.To),
    text: body.text || body.message || body.body || body.Body || '',
    providerMessageId: body.messageId || body.id || body.MessageSid || null,
  };

  const { from, to, text, providerMessageId } = normalized;
  if (!from || !to) return { status: 400, body: { error: 'Missing from or to' } };

  const eventId = webhookProcessor.buildEventId(provider, body, 'inbound');
  if (!forceRetry && await webhookProcessor.isDuplicateWebhook(provider, eventId)) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  try {
    const user = await findUserByInboundLine(to);
    if (!user) {
      await query(
        'INSERT INTO webhook_logs (provider, event_type, payload, verified) VALUES ($1, $2, $3::jsonb, $4)',
        [provider, 'inbound_unmatched', JSON.stringify(body), verified]
      );
      await webhookProcessor.recordWebhookDelivery(provider, eventId, providerMessageId);
      return { status: 200, body: { ok: true, unmatched: true } };
    }

    const result = await handleInbound(user.id, from, to, text, providerMessageId, provider);
    await query(
      'INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [user.id, provider, 'inbound', JSON.stringify(body), result.messageId, verified]
    );
    await webhookProcessor.recordWebhookDelivery(provider, eventId, providerMessageId);
    return { status: 200, body: result };
  } catch (error) {
    await recordDeadLetter({
      provider,
      eventType: 'inbound',
      eventId,
      payload: body,
      errorMessage: error.message,
      verified,
    });
    return { status: 500, body: { ok: false, deadLetter: true, error: error.message } };
  }
}

module.exports = { processInboundWebhook };
