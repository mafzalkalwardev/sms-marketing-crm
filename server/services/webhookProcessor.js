const crypto = require('crypto');
const { query, queryOne } = require('../config/database');
const { MESSAGE_STATUSES, isMessageTerminal } = require('../domain/states');
const messageStateService = require('./messageStateService');
const { recordDeadLetter } = require('./webhookDeadLetterService');
const { getAdapter, API_WEBHOOK_PROVIDERS } = require('./providers/providerRegistry');

function buildEventId(provider, body, type) {
  const explicit = body.eventId || body.event_id || body.EventId;
  if (explicit) return String(explicit);

  const adapter = getAdapter(provider);
  const normalized = adapter?.normalizeStatus?.(body);
  const messageId = normalized?.providerMessageId ||
    body.messageId ||
    body['message-id'] ||
    body.message_uuid ||
    body.MessageSid ||
    body.SmsSid ||
    body.id ||
    '';
  const status = normalized?.status || body.status || body.MessageStatus || body.SmsStatus || '';
  const payload = JSON.stringify({ provider, type, messageId, status, body });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 64);
}

async function isDuplicateWebhook(provider, eventId) {
  const existing = await queryOne(
    'SELECT id FROM webhook_deliveries WHERE provider = $1 AND event_id = $2',
    [provider, eventId]
  );
  return Boolean(existing);
}

async function recordWebhookDelivery(provider, eventId, providerMessageId) {
  await query(
    `INSERT INTO webhook_deliveries (provider, event_id, provider_message_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, event_id) DO NOTHING`,
    [provider, eventId, providerMessageId || null]
  );
}

function normalizeProviderStatus(provider, body) {
  const adapter = getAdapter(provider);
  if (adapter?.normalizeStatus) {
    return adapter.normalizeStatus(body).status;
  }
  if (adapter?.mapStatus) {
    return adapter.mapStatus(body.status || body.MessageStatus);
  }
  const raw = String(body.status || body.MessageStatus || 'unknown').toLowerCase();
  if (raw === 'delivered') return MESSAGE_STATUSES.DELIVERED;
  if (['failed', 'undeliverable', 'undelivered'].includes(raw)) return MESSAGE_STATUSES.FAILED;
  if (['sent', 'accepted', 'queued', 'sending'].includes(raw)) return MESSAGE_STATUSES.SENT;
  return raw;
}

function providerMessageIdFromBody(provider, body) {
  const adapter = getAdapter(provider);
  if (adapter?.normalizeStatus) {
    return adapter.normalizeStatus(body).providerMessageId;
  }
  return (
    body.messageId ||
    body['message-id'] ||
    body.message_uuid ||
    body.MessageSid ||
    body.SmsSid ||
    body.id ||
    null
  );
}

async function processStatusWebhook(provider, body, { verified = false, userId = null, forceRetry = false } = {}) {
  const eventId = buildEventId(provider, body, 'status');
  if (!forceRetry && await isDuplicateWebhook(provider, eventId)) {
    return { ok: true, duplicate: true };
  }

  const providerMessageId = providerMessageIdFromBody(provider, body);

  try {
    const message = providerMessageId
      ? await queryOne('SELECT * FROM messages WHERE provider_message_id = $1', [providerMessageId])
      : null;

    await query(
      'INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [message?.user_id || userId || null, provider, 'status', JSON.stringify(body), message?.id || null, verified]
    );

    if (!message) {
      await recordWebhookDelivery(provider, eventId, providerMessageId);
      return { ok: true, unmatched: true };
    }

    if (isMessageTerminal(message.status)) {
      await recordWebhookDelivery(provider, eventId, providerMessageId);
      return { ok: true, messageId: message.id, status: message.status, terminal: true };
    }

    const nextStatus = normalizeProviderStatus(provider, body);
    if (message.status === nextStatus) {
      await recordWebhookDelivery(provider, eventId, providerMessageId);
      return { ok: true, messageId: message.id, status: nextStatus, unchanged: true };
    }

    const adapter = getAdapter(provider);
    const normalized = adapter?.normalizeStatus?.(body) || {};

    const updated = await messageStateService.transitionMessage(message.id, nextStatus, {
      source: `webhook:${provider}`,
      errorMessage: normalized.errorMessage || body.errorMessage || body.ErrorMessage || null,
      internalErrorCode: body.errorCode || body.ErrorCode || null,
      metadata: { webhook: body },
      allowTerminalOverride: false,
    });

    await recordWebhookDelivery(provider, eventId, providerMessageId);
    return { ok: true, messageId: message.id, status: updated.status };
  } catch (error) {
    await recordDeadLetter({
      provider,
      eventType: 'status',
      eventId,
      payload: body,
      errorMessage: error.message,
      verified,
    });
    return { ok: false, deadLetter: true, error: error.message };
  }
}

module.exports = {
  API_WEBHOOK_PROVIDERS,
  buildEventId,
  isDuplicateWebhook,
  processStatusWebhook,
  normalizeProviderStatus,
  recordWebhookDelivery,
};
