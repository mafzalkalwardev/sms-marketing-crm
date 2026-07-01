const { query, queryOne, queryAll } = require('../config/database');

async function recordDeadLetter({
  provider,
  eventType,
  eventId,
  payload,
  errorMessage,
  verified = false,
}) {
  const existing = await queryOne(
    `SELECT id FROM webhook_dead_letters
     WHERE provider = $1 AND event_type = $2 AND event_id = $3 AND resolved_at IS NULL`,
    [provider, eventType, eventId]
  );
  if (existing) {
    await query(
      `UPDATE webhook_dead_letters
       SET error_message = $1, retry_count = retry_count + 1, last_retry_at = NOW()
       WHERE id = $2`,
      [errorMessage, existing.id]
    );
    return existing.id;
  }

  const row = await queryOne(
    `INSERT INTO webhook_dead_letters (provider, event_type, event_id, payload, error_message, verified)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id`,
    [provider, eventType, eventId, JSON.stringify(payload), errorMessage, verified]
  );
  return row.id;
}

async function listDeadLetters({ limit = 50, provider = null } = {}) {
  const capped = Math.min(Number(limit) || 50, 200);
  if (provider) {
    return queryAll(
      `SELECT id, provider, event_type, event_id, error_message, verified, retry_count, last_retry_at, created_at
       FROM webhook_dead_letters
       WHERE resolved_at IS NULL AND provider = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [provider, capped]
    );
  }
  return queryAll(
    `SELECT id, provider, event_type, event_id, error_message, verified, retry_count, last_retry_at, created_at
     FROM webhook_dead_letters
     WHERE resolved_at IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [capped]
  );
}

async function resolveDeadLetter(id) {
  await query(
    'UPDATE webhook_dead_letters SET resolved_at = NOW() WHERE id = $1',
    [id]
  );
}

async function retryDeadLetter(id) {
  const row = await queryOne('SELECT * FROM webhook_dead_letters WHERE id = $1', [id]);
  if (!row) {
    const error = new Error('Dead letter not found');
    error.status = 404;
    throw error;
  }
  if (row.resolved_at) {
    return { ok: true, alreadyResolved: true };
  }

  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  let result;

  if (row.event_type === 'status') {
    const webhookProcessor = require('./webhookProcessor');
    result = await webhookProcessor.processStatusWebhook(row.provider, payload, {
      verified: row.verified,
      forceRetry: true,
    });
  } else if (row.event_type === 'inbound') {
    const inboundProcessor = require('./inboundProcessor');
    const inbound = await inboundProcessor.processInboundWebhook(row.provider, payload, {
      verified: row.verified,
      forceRetry: true,
    });
    result = inbound.body;
  } else {
    const error = new Error(`Unsupported event type: ${row.event_type}`);
    error.status = 400;
    throw error;
  }

  if (result?.ok !== false && !result?.deadLetter) {
    await resolveDeadLetter(id);
    return { ok: true, result };
  }

  await query(
    `UPDATE webhook_dead_letters
     SET retry_count = retry_count + 1, last_retry_at = NOW(), error_message = $1
     WHERE id = $2`,
    [result?.error || 'Retry failed', id]
  );

  return { ok: false, result };
}

module.exports = {
  recordDeadLetter,
  listDeadLetters,
  resolveDeadLetter,
  retryDeadLetter,
};
