const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');
const mockProvider = require('./mockProvider');

function authHeader(credentials = {}) {
  const username = credentials.apiKey || credentials.username || process.env.CLICKSEND_USERNAME;
  const apiKey = credentials.apiSecret || credentials.password || process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return null;
  const token = Buffer.from(`${username}:${apiKey}`).toString('base64');
  return `Basic ${token}`;
}

function isConfigured(credentials = {}) {
  return Boolean(authHeader(credentials));
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

function mapClickSendStatus(status, statusCode) {
  const code = String(statusCode || '').trim();
  if (code === '201' || code === '200') return MESSAGE_STATUSES.DELIVERED;
  if (['301', '302', '400', '401', '402', '500', '501'].includes(code)) return MESSAGE_STATUSES.FAILED;

  const value = String(status || '').toLowerCase();
  if (['success', 'queued', 'completed', 'sent'].includes(value)) return MESSAGE_STATUSES.SENT;
  if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
  if (['failed', 'undeliverable', 'rejected', 'bounced', 'error'].includes(value)) return MESSAGE_STATUSES.FAILED;
  return mapGenericStatus(status);
}

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, error: 'Missing ClickSend username or API key' };
  }
  if (isSandboxMode()) {
    return { ok: true, mode: 'sandbox', note: 'ClickSend credentials stored; sandbox active' };
  }
  try {
    const data = await fetchJson('https://rest.clicksend.com/v3/account', {
      headers: { Authorization: authHeader(credentials) },
    });
    return {
      ok: data.response_code === 'SUCCESS' || data.http_code === 200,
      mode: 'live',
      account: data.data?.username || data.data?.user_id || null,
      balance: data.data?.balance ?? null,
    };
  } catch (error) {
    return { ok: false, mode: 'live', error: error.message };
  }
}

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'clicksend' });
  }

  try {
    const payload = {
      messages: [
        {
          source: 'signalmint',
          from: from || undefined,
          to,
          body: text,
        },
      ],
    };

    const data = await fetchJson('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: { Authorization: authHeader(credentials) },
      body: JSON.stringify(payload),
    });

    const message = data.data?.messages?.[0] || {};
    const status = String(message.status || data.response_code || '').toUpperCase();
    const blockedStatuses = new Set([
      'FAILED',
      'REJECTED',
      'INACTIVE',
      'REGISTRATION_NEEDED',
      'ALREADY_EXISTS',
      'INVALID_RECIPIENT',
      'INVALID_SENDER_ID',
    ]);
    const ok = data.response_code === 'SUCCESS' && !blockedStatuses.has(status);

    return {
      ok,
      provider: 'clicksend',
      mode: 'live',
      providerMessageId: message.message_id || null,
      status: ok ? mapClickSendStatus(status) : MESSAGE_STATUSES.FAILED,
      error: ok
        ? null
        : (status === 'REGISTRATION_NEEDED'
          ? 'US number registration required (buy + register a dedicated 10DLC or toll-free number in ClickSend)'
          : (message.status || data.response_msg || 'ClickSend send failed')),
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'clicksend',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
      raw: error.response || null,
    };
  }
}

function normalizeInbound(body) {
  const payload = body?.data || body || {};
  return {
    from: normalizePhone(payload.from || payload.From),
    to: normalizePhone(payload.to || payload.To),
    text: payload.body || payload.message || payload.text || '',
    providerMessageId: payload.message_id || payload.messageId || payload.id || null,
  };
}

function normalizeStatus(body) {
  const payload = body?.data || body || {};
  return {
    providerMessageId: payload.message_id || payload.messageId || payload.id || null,
    status: mapClickSendStatus(payload.status_text || payload.status, payload.status_code || payload.statusCode),
    errorMessage: payload.error_text || payload.error_code || payload.error || null,
  };
}

module.exports = {
  id: 'clicksend',
  label: 'ClickSend',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapClickSendStatus,
  authHeader,
};
