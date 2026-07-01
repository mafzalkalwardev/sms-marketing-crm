const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const mockProvider = require('./mockProvider');

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^\d+]/g, '');
}

function isMockMode() {
  return isSandboxMode();
}

function isConfigured(credentials = {}) {
  const apiKey = credentials.apiKey || process.env.VONAGE_API_KEY;
  const apiSecret = credentials.apiSecret || process.env.VONAGE_API_SECRET;
  return Boolean(apiKey && apiSecret);
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
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

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, mode: 'sandbox', error: 'Missing API key or secret' };
  }
  if (isSandboxMode()) {
    return {
      ok: true,
      mode: 'sandbox',
      connected: true,
      note: 'Credentials stored; sandbox mode active',
    };
  }
  try {
    const sdk = require('@vonage/server-sdk');
    const Vonage = sdk.Vonage || sdk;
    const vonage = new Vonage({
      apiKey: credentials.apiKey || process.env.VONAGE_API_KEY,
      apiSecret: credentials.apiSecret || process.env.VONAGE_API_SECRET,
    });
    const balance = await vonage.account.getBalance();
    return { ok: true, mode: 'live', connected: true, balance: balance?.value ?? balance };
  } catch (error) {
    return { ok: false, mode: 'live', connected: false, error: error.message || 'Vonage connection failed' };
  }
}

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'vonage' });
  }
  try {
    const sdk = require('@vonage/server-sdk');
    const Vonage = sdk.Vonage || sdk;
    const vonage = new Vonage({
      apiKey: credentials.apiKey || process.env.VONAGE_API_KEY,
      apiSecret: credentials.apiSecret || process.env.VONAGE_API_SECRET,
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

function normalizeInbound(body) {
  return {
    from: normalizePhone(body.from || body.msisdn),
    to: normalizePhone(body.to),
    text: body.text || body.message || body.body || '',
    providerMessageId: body.messageId || body['message-id'] || body.message_uuid || null,
  };
}

function normalizeStatus(body) {
  return {
    providerMessageId: body.messageId || body['message-id'] || body.message_uuid || null,
    status: mapVonageStatus(body.status || body.messageStatus || 'unknown'),
    errorMessage: body.error || body['error-text'] || null,
  };
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
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  verifySignedWebhook,
};
