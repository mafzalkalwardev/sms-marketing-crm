const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');

function isConfigured(credentials = {}) {
  return Boolean(credentials.apiKey);
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, error: 'Missing Telnyx API key' };
  }
  if (isSandboxMode()) {
    return { ok: true, mode: 'sandbox', note: 'Telnyx credentials stored; sandbox active' };
  }
  try {
    await fetchJson('https://api.telnyx.com/v2/balance', {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
    });
    return { ok: true, mode: 'live' };
  } catch (error) {
    return { ok: false, mode: 'live', error: error.message };
  }
}

const mockProvider = require('./mockProvider');

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'telnyx' });
  }
  try {
    const data = await fetchJson('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      body: JSON.stringify({ from, to, text }),
    });
    const record = data.data || data;
    return {
      ok: true,
      provider: 'telnyx',
      mode: 'live',
      providerMessageId: record.id || null,
      status: mapGenericStatus(record.to?.[0]?.status || 'accepted'),
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'telnyx',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
      raw: error.response || null,
    };
  }
}

function normalizeInbound(body) {
  const payload = body.data?.payload || body.data || body;
  return {
    from: normalizePhone(payload.from?.phone_number || payload.from),
    to: normalizePhone(payload.to?.[0]?.phone_number || payload.to),
    text: payload.text || payload.body || '',
    providerMessageId: payload.id || body.id || null,
  };
}

function normalizeStatus(body) {
  const payload = body.data?.payload || body.data || body;
  return {
    providerMessageId: payload.id || body.id || null,
    status: mapGenericStatus(payload.to?.[0]?.status || payload.status),
    errorMessage: payload.errors?.[0]?.detail || null,
  };
}

module.exports = {
  id: 'telnyx',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapGenericStatus,
};
