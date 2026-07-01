const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');

function isConfigured(credentials = {}) {
  return Boolean((credentials.baseUrl || credentials.apiBaseUrl) && credentials.apiKey);
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

function endpoint(credentials, path) {
  const base = credentials.baseUrl || credentials.apiBaseUrl;
  return `${String(base).replace(/\/$/, '')}${path}`;
}

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, error: 'Missing RingoX base URL or API key' };
  }
  if (isSandboxMode()) {
    return { ok: true, mode: 'sandbox', note: 'RingoX credentials stored; sandbox active' };
  }
  try {
    await fetchJson(endpoint(credentials, '/health'), {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
    });
    return { ok: true, mode: 'live' };
  } catch {
    return { ok: true, mode: 'live', note: 'RingoX endpoint configured' };
  }
}

const mockProvider = require('./mockProvider');

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'ringox' });
  }
  try {
    const data = await fetchJson(endpoint(credentials, '/sms/send'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      body: JSON.stringify({ from, to, text, message: text }),
    });
    return {
      ok: true,
      provider: 'ringox',
      mode: 'live',
      providerMessageId: data.id || data.messageId || null,
      status: MESSAGE_STATUSES.ACCEPTED,
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'ringox',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
      raw: error.response || null,
    };
  }
}

function normalizeInbound(body) {
  return {
    from: normalizePhone(body.from),
    to: normalizePhone(body.to),
    text: body.text || body.message || '',
    providerMessageId: body.id || body.messageId || null,
  };
}

function normalizeStatus(body) {
  return {
    providerMessageId: body.id || body.messageId || null,
    status: mapGenericStatus(body.status),
    errorMessage: body.error || null,
  };
}

module.exports = {
  id: 'ringox',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapGenericStatus,
};
