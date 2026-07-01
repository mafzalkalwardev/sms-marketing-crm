const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');

function isConfigured(credentials = {}) {
  return Boolean(credentials.apiKey && credentials.apiSecret && credentials.accountId);
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

async function getAccessToken(credentials) {
  const params = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: credentials.accountId,
  });
  const auth = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64');
  const data = await fetchJson(`https://zoom.us/oauth/token?${params}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
  });
  return data.access_token;
}

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, error: 'Missing Zoom client ID, secret, or account ID' };
  }
  if (isSandboxMode()) {
    return { ok: true, mode: 'sandbox', note: 'Zoom Phone credentials stored; sandbox active' };
  }
  try {
    await getAccessToken(credentials);
    return { ok: true, mode: 'live' };
  } catch (error) {
    return { ok: false, mode: 'live', error: error.message };
  }
}

const mockProvider = require('./mockProvider');

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'zoom' });
  }
  try {
    const token = await getAccessToken(credentials);
    const data = await fetchJson('https://api.zoom.us/v2/phone/sms/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sender_phone_number: from,
        receiver_phone_number: to,
        message: text,
      }),
    });
    return {
      ok: true,
      provider: 'zoom',
      mode: 'live',
      providerMessageId: data.message_id || data.id || null,
      status: MESSAGE_STATUSES.ACCEPTED,
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'zoom',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
      raw: error.response || null,
    };
  }
}

function normalizeInbound(body) {
  const payload = body.payload?.object || body.payload || body;
  return {
    from: normalizePhone(payload.sender_phone_number || payload.from),
    to: normalizePhone(payload.receiver_phone_number || payload.to),
    text: payload.message || payload.text || '',
    providerMessageId: payload.message_id || payload.id || null,
  };
}

function normalizeStatus(body) {
  const payload = body.payload?.object || body.payload || body;
  return {
    providerMessageId: payload.message_id || payload.id || null,
    status: mapGenericStatus(payload.status),
    errorMessage: payload.error_message || null,
  };
}

module.exports = {
  id: 'zoom',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapGenericStatus,
};
