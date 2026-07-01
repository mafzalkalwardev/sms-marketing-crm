const { query, queryOne, queryAll } = require('../config/database');
const { logAudit } = require('./auditService');
const {
  MESSAGE_STATUSES,
  MESSAGE_TRANSITIONS,
  assertTransition,
  isMessageTerminal,
} = require('../domain/states');

async function auditMessageStatus(messageId, fromStatus, toStatus, source, metadata = {}) {
  const message = await queryOne(
    'SELECT user_id, provider, to_number, from_number, campaign_id FROM messages WHERE id = $1',
    [messageId]
  );
  if (!message) return;

  await logAudit({
    actorUserId: metadata.actorUserId || null,
    targetUserId: message.user_id,
    action: 'message_status_changed',
    details: {
      messageId,
      fromStatus,
      toStatus,
      source,
      provider: message.provider,
      campaignId: message.campaign_id || null,
    },
  });
}

async function logStatusEvent(messageId, fromStatus, toStatus, source, metadata = {}) {
  await query(
    `INSERT INTO message_status_events (message_id, from_status, to_status, source, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [messageId, fromStatus, toStatus, source, JSON.stringify(metadata)]
  );

  try {
    await auditMessageStatus(messageId, fromStatus, toStatus, source, metadata);
  } catch (error) {
    console.error(`Message status audit failed for #${messageId}:`, error.message);
  }
}

async function getMessage(messageId) {
  return queryOne('SELECT * FROM messages WHERE id = $1', [messageId]);
}

async function getStatusTimeline(messageId) {
  return queryAll(
    `SELECT id, from_status, to_status, source, metadata, created_at
     FROM message_status_events
     WHERE message_id = $1
     ORDER BY created_at ASC, id ASC`,
    [messageId]
  );
}

async function transitionMessage(messageId, toStatus, {
  source = 'system',
  errorMessage = null,
  internalErrorCode = null,
  providerMessageId = null,
  metadata = {},
  allowTerminalOverride = false,
} = {}) {
  const message = await getMessage(messageId);
  if (!message) {
    const error = new Error('Message not found');
    error.status = 404;
    throw error;
  }

  const fromStatus = message.status;
  if (fromStatus === toStatus) {
    return message;
  }

  if (isMessageTerminal(fromStatus) && !allowTerminalOverride) {
    const error = new Error(`Message is in terminal state: ${fromStatus}`);
    error.status = 409;
    throw error;
  }

  assertTransition(MESSAGE_TRANSITIONS, fromStatus, toStatus, 'message');

  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = [toStatus];
  let idx = 2;

  if (providerMessageId) {
    updates.push(`provider_message_id = $${idx}`);
    values.push(providerMessageId);
    idx += 1;
  }
  if (errorMessage) {
    updates.push(`error_message = $${idx}`);
    values.push(errorMessage);
    idx += 1;
  }
  if (internalErrorCode) {
    updates.push(`internal_error_code = $${idx}`);
    values.push(internalErrorCode);
    idx += 1;
  }
  if (toStatus === MESSAGE_STATUSES.DELIVERED) {
    updates.push('delivered_at = NOW()');
  }
  if ([MESSAGE_STATUSES.SENT, MESSAGE_STATUSES.ACCEPTED, MESSAGE_STATUSES.SENT_MOCK].includes(toStatus)) {
    updates.push('sent_at = COALESCE(sent_at, NOW())');
  }

  values.push(messageId);
  const updated = await queryOne(
    `UPDATE messages SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  await logStatusEvent(messageId, fromStatus, toStatus, source, metadata);
  return updated;
}

async function createOutboundMessage({
  userId,
  workspaceId,
  organizationId,
  contactId,
  conversationId,
  campaignId = null,
  toNumber,
  fromNumber,
  messageBody,
  provider,
  providerId,
  segments,
  costEstimate,
  isTest = false,
  idempotencyKey = null,
  actorUserId = null,
}) {
  const insert = await queryOne(
    `INSERT INTO messages (
      user_id, workspace_id, organization_id, contact_id, conversation_id, campaign_id,
      direction, to_number, from_number, message_body, provider, provider_id,
      status, segments, cost_estimate, is_test, idempotency_key, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,'outbound',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
    RETURNING *`,
    [
      userId,
      workspaceId,
      organizationId,
      contactId,
      conversationId,
      campaignId,
      toNumber,
      fromNumber,
      messageBody,
      provider || 'mock',
      providerId,
      MESSAGE_STATUSES.QUEUED,
      segments,
      costEstimate,
      isTest,
      idempotencyKey,
    ]
  );

  await logStatusEvent(insert.id, null, MESSAGE_STATUSES.QUEUED, 'api_create', { actorUserId });
  return insert;
}

async function applyProviderResult(messageId, providerResult, { source = 'api_send', actorUserId = null } = {}) {
  const auditMeta = { actorUserId };
  await transitionMessage(messageId, MESSAGE_STATUSES.SENDING, { source, metadata: auditMeta });

  if (!providerResult.ok) {
    return transitionMessage(messageId, MESSAGE_STATUSES.FAILED, {
      source,
      errorMessage: providerResult.error || 'Send failed',
      internalErrorCode: providerResult.internalErrorCode || 'send_failed',
      providerMessageId: providerResult.providerMessageId || null,
      metadata: { raw: providerResult.raw || null, actorUserId },
    });
  }

  const mode = providerResult.mode || 'live';
  const nextStatus = mode === 'mock'
    ? MESSAGE_STATUSES.SENT_MOCK
    : (providerResult.status || MESSAGE_STATUSES.ACCEPTED);

  return transitionMessage(messageId, nextStatus, {
    source,
    providerMessageId: providerResult.providerMessageId || null,
    metadata: { mode, raw: providerResult.raw || null, actorUserId },
  });
}

module.exports = {
  MESSAGE_STATUSES,
  getMessage,
  getStatusTimeline,
  transitionMessage,
  createOutboundMessage,
  applyProviderResult,
  logStatusEvent,
};
