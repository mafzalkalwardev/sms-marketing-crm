const { query, queryOne } = require('../config/database');
const {
  findOrCreateContact,
  findOrCreateConversation,
  isSuppressed,
} = require('../lib/conversations');
const vonageProvider = require('./providers/vonageProvider');
const twilioProvider = require('./providers/twilioProvider');
const providerRouter = require('./providers/providerRouter');
const messageStateService = require('./messageStateService');
const { MESSAGE_STATUSES } = require('../domain/states');

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

function estimateCost(segments, country = 'US', providerKey = 'mock') {
  const providerRates = {
    mock: 0,
    vonage: 0.008,
    twilio: 0.0079,
    telnyx: 0.007,
    bandwidth: 0.0075,
    zoom: 0.008,
    ringox: 0.008,
    '3cx': 0.008,
    browser: 0,
  };
  const countryRates = { US: 0.008, UK: 0.045, CA: 0.0075, AU: 0.04 };
  const base = providerRates[providerKey] ?? countryRates[country] ?? countryRates.US;
  return Number((segments * base).toFixed(4));
}

function getProviderStatus() {
  const vonageLive = vonageProvider.configuredForLive({});
  const twilioLive = twilioProvider.configuredForLive({});
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

async function getUsageSummary(userId) {
  const user = await queryOne('SELECT message_limit_monthly FROM users WHERE id = $1', [userId]);
  const used = await monthlyMessageCount(userId);
  const limit = Number(user?.message_limit_monthly || 0);
  return {
    messagesUsedThisMonth: used,
    messageLimitMonthly: limit || null,
    messagesRemaining: limit > 0 ? Math.max(0, limit - used) : null,
  };
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

  if (user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date()) {
    const error = new Error('Subscription has expired. Contact your administrator.');
    error.status = 403;
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
  providerId = null,
  campaignId = null,
  idempotencyKey = null,
}) {
  const toNorm = normalizePhone(to);
  const defaultNumber = await defaultSenderForUser(user.id);
  const requestedFrom = normalizePhone(
    from || defaultNumber?.phone_number || (allowEnvSender ? process.env.VONAGE_DEFAULT_FROM : '')
  );
  const text = String(message || '').trim();

  if (idempotencyKey) {
    const existing = await queryOne('SELECT * FROM messages WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing) {
      return {
        ok: existing.status !== MESSAGE_STATUSES.FAILED,
        mode: 'idempotent',
        provider: existing.provider,
        providerMessageId: existing.provider_message_id,
        status: existing.status,
        message: existing,
        conversation: existing.conversation_id
          ? await queryOne('SELECT * FROM conversations WHERE id = $1', [existing.conversation_id])
          : null,
        contact: existing.contact_id
          ? await queryOne('SELECT * FROM contacts WHERE id = $1', [existing.contact_id])
          : null,
        error: existing.error_message,
      };
    }
  }

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

  const resolved = providerId
    ? await providerRouter.resolveForProviderId(providerId)
    : await providerRouter.resolveForNumber(requestedFrom);

  const cost = estimateCost(segments, contact.country || country, resolved.providerKey || 'mock');

  const saved = await messageStateService.createOutboundMessage({
    userId: user.id,
    workspaceId,
    organizationId: user.organization_id || organizationId,
    contactId: contact.id,
    conversationId: conversation.id,
    campaignId,
    toNumber: toNorm,
    fromNumber: requestedFrom,
    messageBody: text,
    provider: resolved.providerKey || 'mock',
    providerId: resolved.providerId,
    segments,
    costEstimate: cost,
    isTest,
    idempotencyKey,
    actorUserId: user.id,
  });

  const { getOrgDeliveryMode } = require('./tenancyService');
  const organizationDeliveryMode = await getOrgDeliveryMode(user.organization_id || organizationId);

  const providerResult = await providerRouter.sendViaResolved(resolved, {
    to: toNorm,
    from: requestedFrom,
    text,
    organizationDeliveryMode,
    userStatus: user.status,
  });

  const mode = providerResult.mode || 'mock';
  const provider = providerResult.provider || (mode === 'mock' ? 'mock' : resolved.providerKey);

  const finalMessage = await messageStateService.applyProviderResult(saved.id, {
    ...providerResult,
    provider,
    mode,
  }, { actorUserId: user.id });

  await query(
    'UPDATE conversations SET phone = $1, last_message_preview = $2, last_message_at = NOW(), updated_at = NOW() WHERE id = $3',
    [toNorm, text.slice(0, 120), conversation.id]
  );

  return {
    ok: Boolean(providerResult.ok),
    mode,
    provider,
    providerMessageId: finalMessage.provider_message_id,
    status: finalMessage.status,
    message: finalMessage,
    conversation,
    contact,
    error: providerResult.error,
  };
}

module.exports = {
  countSegments,
  estimateCost,
  getProviderStatus,
  getUsageSummary,
  isValidPhone,
  normalizePhone,
  sendTextMessage,
};
