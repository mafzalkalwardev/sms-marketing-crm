const { MESSAGE_STATUSES } = require('./ProviderAdapter');

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^\d+]/g, '');
}

function isMockMode() {
  return String(process.env.VONAGE_MOCK_MODE || 'true').toLowerCase() !== 'false';
}

function isConfigured() {
  return Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET);
}

function configuredForLive() {
  return !isMockMode() && isConfigured();
}

function mapVonageStatus(status) {
  const value = String(status ?? '').toLowerCase();
  if (value === '0' || value === 'accepted' || value === 'submitted') return MESSAGE_STATUSES.ACCEPTED;
  if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
  if (value === 'rejected') return MESSAGE_STATUSES.REJECTED;
  if (value === 'failed' || value === 'undeliverable') return MESSAGE_STATUSES.FAILED;
  if (value === 'sent') return MESSAGE_STATUSES.SENT;
  return value || MESSAGE_STATUSES.ACCEPTED;
}

async function sendSms({ to, from, text }) {
  try {
    const sdk = require('@vonage/server-sdk');
    const Vonage = sdk.Vonage || sdk;
    const vonage = new Vonage({
      apiKey: process.env.VONAGE_API_KEY,
      apiSecret: process.env.VONAGE_API_SECRET,
    });

    const response = await vonage.sms.send({ to, from, text });
    const message = response?.messages?.[0] || response;
    const status = mapVonageStatus(message?.status || message?.messageStatus);
    const providerMessageId = message?.['message-id'] || message?.messageId || message?.message_uuid || null;

    if (message?.status && String(message.status) !== '0') {
      return {
        ok: false,
        provider: 'vonage',
        mode: 'live',
        providerMessageId,
        status: MESSAGE_STATUSES.FAILED,
        error: message['error-text'] || message.errorText || `Vonage status ${message.status}`,
        raw: response,
      };
    }

    return {
      ok: true,
      provider: 'vonage',
      mode: 'live',
      providerMessageId,
      status,
      raw: response,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'vonage',
      mode: 'live',
      error: error.message || 'Vonage send failed',
      raw: error.response?.data || null,
    };
  }
}

function verifySignedWebhook(req) {
  const jwt = require('jsonwebtoken');
  const secret = process.env.VONAGE_SIGNATURE_SECRET;
  if (!secret) {
    return { ok: process.env.NODE_ENV !== 'production', reason: 'missing_secret' };
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false, reason: 'missing_bearer_token' };
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return { ok: true, decoded };
  } catch {
    return { ok: false, reason: 'invalid_signature' };
  }
}

module.exports = {
  id: 'vonage',
  lane: 'api',
  normalizePhone,
  configuredForLive,
  isConfigured,
  isMockMode,
  mapVonageStatus,
  sendSms,
  verifySignedWebhook,
};
