const { db } = require('../config/database');
const {
  findOrCreateContact,
  findOrCreateConversation,
  isSuppressed,
} = require('../lib/conversations');
const vonageProvider = require('./providers/vonageProvider');

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

function mockSend() {
  return {
    ok: true,
    provider: 'mock',
    mode: 'mock',
    providerMessageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'sent_mock',
  };
}

function getProviderStatus() {
  const liveReady = vonageProvider.configuredForLive();
  return {
    provider: 'vonage',
    configured: vonageProvider.isConfigured(),
    mockMode: vonageProvider.isMockMode(),
    mode: liveReady ? 'live' : 'mock',
    signatureSecretConfigured: Boolean(process.env.VONAGE_SIGNATURE_SECRET),
    signedWebhookVerificationActive: Boolean(process.env.VONAGE_SIGNATURE_SECRET) || process.env.NODE_ENV === 'production',
  };
}

function defaultSenderForUser(userId) {
  return db.prepare(
    "SELECT * FROM numbers WHERE user_id = ? AND status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1"
  ).get(userId);
}

function senderOwnedByUser(userId, phone) {
  return db.prepare(
    "SELECT * FROM numbers WHERE user_id = ? AND phone_number = ? AND status = 'active'"
  ).get(userId, phone);
}

function monthlyMessageCount(userId) {
  return db.prepare(
    "SELECT COUNT(*) as n FROM messages WHERE user_id = ? AND direction = 'outbound' AND datetime(created_at) >= datetime('now', 'start of month')"
  ).get(userId).n;
}

function assertCanSend({ user, to, from, text, allowEnvSender = false }) {
  if (!user || user.status !== 'active') {
    const error = new Error('Account is inactive or suspended');
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
  if (limit > 0 && monthlyMessageCount(user.id) >= limit) {
    const error = new Error(`Monthly message limit reached (${limit}).`);
    error.status = 403;
    throw error;
  }

  if (isSuppressed(user.id, to)) {
    const error = new Error('This contact is unsubscribed or suppressed.');
    error.status = 403;
    throw error;
  }

  if (!from) {
    const error = new Error('A sender number is required.');
    error.status = 400;
    throw error;
  }

  if (!allowEnvSender && !senderOwnedByUser(user.id, from)) {
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
  allowEnvSender = false,
  isTest = false,
}) {
  const toNorm = normalizePhone(to);
  const defaultNumber = defaultSenderForUser(user.id);
  const requestedFrom = normalizePhone(from || defaultNumber?.phone_number || (allowEnvSender ? process.env.VONAGE_DEFAULT_FROM : ''));
  const text = String(message || '').trim();

  assertCanSend({ user, to: toNorm, from: requestedFrom, text, allowEnvSender });

  const contact = findOrCreateContact({
    userId: user.id,
    workspaceId,
    phone: toNorm,
    name: contactName || toNorm,
    country,
  });
  const conversation = findOrCreateConversation({ userId: user.id, workspaceId, contactId: contact.id });
  const segments = countSegments(text);
  const cost = estimateCost(segments, contact.country || country);

  const providerResult = vonageProvider.configuredForLive()
    ? await vonageProvider.sendSms({ to: toNorm, from: requestedFrom, text })
    : mockSend();

  const mode = providerResult.mode || 'mock';
  const provider = providerResult.provider || (mode === 'mock' ? 'mock' : 'vonage');
  const status = mode === 'mock' ? 'sent_mock' : (providerResult.ok ? (providerResult.status || 'accepted') : 'failed');
  const providerMessageId = providerResult.providerMessageId || providerResult.messageId || null;
  const metadata = JSON.stringify({
    providerMode: mode,
    raw: providerResult.raw || null,
  });

  const insert = db.prepare(
    `INSERT INTO messages (
      user_id, workspace_id, contact_id, conversation_id, direction, to_number, from_number,
      message_body, provider, provider_message_id, status, segments, cost_estimate,
      error_message, sent_at, is_test, metadata
    ) VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`
  ).run(
    user.id,
    workspaceId,
    contact.id,
    conversation.id,
    toNorm,
    requestedFrom,
    text,
    provider,
    providerMessageId,
    status,
    segments,
    cost,
    providerResult.error || null,
    isTest ? 1 : 0,
    metadata
  );

  db.prepare(
    "UPDATE conversations SET phone = ?, last_message_preview = ?, last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(toNorm, text.slice(0, 120), conversation.id);

  const saved = db.prepare('SELECT * FROM messages WHERE id = ?').get(insert.lastInsertRowid);
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
