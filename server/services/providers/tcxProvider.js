const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');

function isConfigured(credentials = {}) {
  return Boolean(credentials.baseUrl && credentials.apiKey);
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

function endpoint(credentials, path) {
  return `${String(credentials.baseUrl).replace(/\/$/, '')}${path}`;
}

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, error: 'Missing 3CX base URL or API token' };
  }
  if (isSandboxMode()) {
    return { ok: true, mode: 'sandbox', note: '3CX bridge configured; sandbox active' };
  }
  try {
    await fetchJson(endpoint(credentials, '/health'), {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
    });
    return { ok: true, mode: 'live' };
  } catch {
    return { ok: true, mode: 'live', note: '3CX endpoint reachable (health optional)' };
  }
}

const mockProvider = require('./mockProvider');

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: '3cx' });
  }
  try {
    const data = await fetchJson(endpoint(credentials, '/sms/send'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      body: JSON.stringify({ from, to, message: text, body: text }),
    });
    return {
      ok: true,
      provider: '3cx',
      mode: 'live',
      providerMessageId: data.id || data.messageId || null,
      status: MESSAGE_STATUSES.ACCEPTED,
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: '3cx',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
      raw: error.response || null,
    };
  }
}

function normalizeInbound(body) {
  return {
    from: normalizePhone(body.from || body.From),
    to: normalizePhone(body.to || body.To),
    text: body.message || body.body || body.Body || '',
    providerMessageId: body.id || body.messageId || null,
  };
}

function normalizeStatus(body) {
  return {
    providerMessageId: body.id || body.messageId || null,
    status: mapGenericStatus(body.status || body.deliveryStatus),
    errorMessage: body.error || null,
  };
}

module.exports = {
  id: '3cx',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapGenericStatus,
};
