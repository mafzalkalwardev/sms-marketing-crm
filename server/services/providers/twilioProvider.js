const crypto = require('crypto');
const { MESSAGE_STATUSES } = require('./ProviderAdapter');

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^\d+]/g, '');
}

function getClient(credentials) {
  const twilio = require('twilio');
  const sid = credentials?.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const token = credentials?.authToken || process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

function isConfigured(credentials) {
  const sid = credentials?.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const token = credentials?.authToken || process.env.TWILIO_AUTH_TOKEN;
  return Boolean(sid && token);
}

function mapTwilioStatus(status) {
  const value = String(status ?? '').toLowerCase();
  if (['queued', 'accepted', 'sending', 'sent'].includes(value)) return MESSAGE_STATUSES.SENT;
  if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
  if (['failed', 'undelivered'].includes(value)) return MESSAGE_STATUSES.FAILED;
  return value || MESSAGE_STATUSES.UNKNOWN;
}

async function sendSms({ to, from, text, credentials }) {
  const client = getClient(credentials);
  if (!client) {
    return { ok: false, provider: 'twilio', mode: 'live', error: 'Twilio not configured' };
  }
  try {
    const message = await client.messages.create({ to, from, body: text });
    return {
      ok: true,
      provider: 'twilio',
      mode: 'live',
      providerMessageId: message.sid,
      status: mapTwilioStatus(message.status),
      raw: message,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'twilio',
      mode: 'live',
      error: error.message || 'Twilio send failed',
      raw: error,
    };
  }
}

function verifyWebhook(req, authToken) {
  const token = authToken || process.env.TWILIO_AUTH_TOKEN;
  if (!token) return { ok: process.env.NODE_ENV !== 'production', reason: 'missing_token' };
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return { ok: false, reason: 'missing_signature' };
  const url = `${process.env.PUBLIC_BACKEND_URL || ''}${req.originalUrl}`.replace(/\/$/, '');
  const params = req.body || {};
  const twilio = require('twilio');
  const valid = twilio.validateRequest(token, signature, url, params);
  return valid ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}

function normalizeInbound(body) {
  return {
    from: normalizePhone(body.From || body.from),
    to: normalizePhone(body.To || body.to),
    text: body.Body || body.body || '',
    providerMessageId: body.MessageSid || body.SmsSid || null,
  };
}

function normalizeStatus(body) {
  return {
    providerMessageId: body.MessageSid || body.SmsSid,
    status: mapTwilioStatus(body.MessageStatus || body.SmsStatus),
    errorMessage: body.ErrorMessage || null,
  };
}

module.exports = {
  id: 'twilio',
  lane: 'api',
  normalizePhone,
  isConfigured,
  mapTwilioStatus,
  sendSms,
  verifyWebhook,
  normalizeInbound,
  normalizeStatus,
};
