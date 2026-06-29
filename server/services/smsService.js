const { query, queryOne } = require('../config/database');
const {
  findOrCreateContact,
  findOrCreateConversation,
  isSuppressed,
} = require('../lib/conversations');
const vonageProvider = require('./providers/vonageProvider');
const twilioProvider = require('./providers/twilioProvider');
const providerRouter = require('./providers/providerRouter');

function normalizePhone(phone) {
  return vonageProvider.normalizePhone(phone);
}

function isValidPhone(phone) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(phone));
}

function countSegments(text) {
  const message = String(text || '');
  const isUnicode = /[^\x00-\x7F]/.test(message);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;
  if (message.length <= singleLimit) return 1;
  return Math.ceil(message.length / multiLimit);
}

function estimateCost(segments, country = 'US') {
  const rates = { US: 0.008, UK: 0.045, CA: 0.0075, AU: 0.04 };
  return Number((segments * (rates[country] || rates.US)).toFixed(4));
}

function getProviderStatus() {
  const vonageLive = vonageProvider.configuredForLive();
  const twilioLive = twilioProvider.isConfigured({});
  const liveReady = Boolean(vonageLive || twilioLive);
  const sandbox = vonageProvider.isMockMode() && !twilioLive;

  return {
    provider: 'internal',
    configured: vonageProvider.isConfigured() || twilioLive,
    mockMode: !liveReady,
    mode: liveReady ? 'live' : 'sandbox',
    deliveryMode: liveReady ? 'live' : 'sandbox',
    liveProviders: [
      vonageLive ? 'vonage' : null,
      twilioLive ? 'twilio' : null,
    ].filter(Boolean),
    signatureSecretConfigured: Boolean(process.env.VONAGE_SIGNATURE_SECRET),
    signedWebhookVerificationActive: Boolean(process.env.VONAGE_SIGNATURE_SECRET) || process.env.NODE_ENV === 'production',
    sandboxReason: liveReady
      ? null
      : (sandbox
        ? 'Sandbox mode is on (VONAGE_MOCK_MODE=true). Add provider credentials and disable sandbox for real delivery.'
        : 'No live provider credentials configured yet.'),
  };
}

async function defaultSenderForUser(userId) {
  return queryOne(
    "SELECT * FROM numbers WHERE user_id = $1 AND status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1",
    [userId]
  );
}

async function senderOwnedByUser(userId, phone) {
  return queryOne(
    "SELECT * FROM numbers WHERE user_id = $1 AND phone_number = $2 AND status = 'active'",
    [userId, phone]
  );
}

async function monthlyMessageCount(userId) {
  const row = await queryOne(
    "SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND direction = 'outbound' AND created_at >= date_trunc('month', NOW())",
    [userId]
  );
  return row?.n || 0;
}

async function assertCanSend({ user, to, from, text, allowEnvSender = false }) {
  if (!user || user.status !== 'active') {
    const error = new Error('Account is temporarily unavailable. Contact support.');
    error.status = 403;
    throw error;
  }

  if (!isValidPhone(to)) {
    const error = new Error('Recipient must be a valid E.164 number, for example +15551234567');
    error.status = 400;
    throw error;
  }

  if (!String(text || '').trim()) {
    const error = new Error('Message is required');
    error.status = 400;
    throw error;
  }

  const limit = Number(user.message_limit_monthly || 0);
  if (limit > 0 && (await monthlyMessageCount(user.id)) >= limit) {
    const error = new Error(`Monthly message limit reached (${limit}).`);
    error.status = 403;
    throw error;
  }

  if (await isSuppressed(user.id, to)) {
    const error = new Error('This contact is unsubscribed or suppressed.');
    error.status = 403;
    throw error;
  }

  if (!from) {
    const error = new Error('A sender number is required.');
    error.status = 400;
    throw error;
  }

  if (!allowEnvSender && !(await senderOwnedByUser(user.id, from))) {
    const error = new Error('Sender number is not assigned to this user.');
    error.status = 403;
    throw error;
  }
}

async function sendTextMessage({
  user,
  to,
  from,
  message,
  contactName = '',
  country = 'US',
  workspaceId = 1,
  organizationId = 1,
  allowEnvSender = false,
  isTest = false,
}) {
  const toNorm = normalizePhone(to);
  const defaultNumber = await defaultSenderForUser(user.id);
  const requestedFrom = normalizePhone(
    from || defaultNumber?.phone_number || (allowEnvSender ? process.env.VONAGE_DEFAULT_FROM : '')
  );
  const text = String(message || '').trim();

  await assertCanSend({ user, to: toNorm, from: requestedFrom, text, allowEnvSender });

  const contact = await findOrCreateContact({
    userId: user.id,
    workspaceId,
    organizationId: user.organization_id || organizationId,
    phone: toNorm,
    name: contactName || toNorm,
    country,
  });
  const conversation = await findOrCreateConversation({
    userId: user.id,
    workspaceId,
    organizationId: user.organization_id || organizationId,
    contactId: contact.id,
  });
  const segments = countSegments(text);
  const cost = estimateCost(segments, contact.country || country);

  const resolved = await providerRouter.resolveForNumber(requestedFrom);
  const providerResult = await providerRouter.sendViaResolved(resolved, {
    to: toNorm,
    from: requestedFrom,
    text,
  });

  const mode = providerResult.mode || 'mock';
  const provider = providerResult.provider || (mode === 'mock' ? 'mock' : resolved.providerKey);
  const status = mode === 'mock'
    ? 'sent_mock'
    : (providerResult.ok ? (providerResult.status || 'accepted') : 'failed');
  const providerMessageId = providerResult.providerMessageId || null;
  const metadata = JSON.stringify({
    providerMode: mode,
    raw: providerResult.raw || null,
  });

  const insert = await query(
    `INSERT INTO messages (
      user_id, workspace_id, organization_id, contact_id, conversation_id, direction, to_number, from_number,
      message_body, provider, provider_id, provider_message_id, status, segments, cost_estimate,
      error_message, internal_error_code, sent_at, is_test, metadata
    ) VALUES ($1,$2,$3,$4,$5,'outbound',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17,$18::jsonb)
    RETURNING *`,
    [
      user.id,
      workspaceId,
      user.organization_id || organizationId,
      contact.id,
      conversation.id,
      toNorm,
      requestedFrom,
      text,
      provider,
      resolved.providerId,
      providerMessageId,
      status,
      segments,
      cost,
      providerResult.error || null,
      providerResult.error ? 'send_failed' : null,
      isTest,
      metadata,
    ]
  );

  await query(
    'UPDATE conversations SET phone = $1, last_message_preview = $2, last_message_at = NOW(), updated_at = NOW() WHERE id = $3',
    [toNorm, text.slice(0, 120), conversation.id]
  );

  const saved = insert.rows[0];
  return {
    ok: Boolean(providerResult.ok),
    mode,
    provider,
    providerMessageId,
    status,
    message: saved,
    conversation,
    contact,
    error: providerResult.error,
  };
}

module.exports = {
  countSegments,
  estimateCost,
  getProviderStatus,
  isValidPhone,
  normalizePhone,
  sendTextMessage,
};
