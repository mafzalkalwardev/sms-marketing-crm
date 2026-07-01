const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');

function isConfigured(credentials = {}) {
  return Boolean(credentials.apiKey && credentials.apiSecret && (credentials.accountId || credentials.applicationId));
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

function authHeader(credentials) {
  const token = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function testConnection(credentials = {}) {
  if (!credentials.apiKey || !credentials.apiSecret) {
    return { ok: false, error: 'Missing Bandwidth API token or secret' };
  }
  if (isSandboxMode()) {
    return { ok: true, mode: 'sandbox', note: 'Bandwidth credentials stored; sandbox active' };
  }
  if (!credentials.accountId) {
    return { ok: false, error: 'Missing Bandwidth account ID in extra config' };
  }
  return { ok: true, mode: 'live', note: 'Bandwidth credentials present' };
}

const mockProvider = require('./mockProvider');

async function sendSms({ to, from, text, credentials = {} }) {
  if (!configuredForLive(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'bandwidth' });
  }
  const accountId = credentials.accountId;
  const applicationId = credentials.applicationId;
  if (!accountId || !applicationId) {
    return {
      ok: false,
      provider: 'bandwidth',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: 'Bandwidth accountId and applicationId are required in extra config',
    };
  }
  try {
    const data = await fetchJson(
      `https://messaging.bandwidth.com/api/v2/users/${accountId}/messages`,
      {
        method: 'POST',
        headers: authHeader(credentials),
        body: JSON.stringify({
          applicationId,
          to: [to],
          from,
          text,
        }),
      }
    );
    return {
      ok: true,
      provider: 'bandwidth',
      mode: 'live',
      providerMessageId: data.id || null,
      status: MESSAGE_STATUSES.ACCEPTED,
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'bandwidth',
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
      raw: error.response || null,
    };
  }
}

function normalizeInbound(body) {
  const message = body.message || body[0] || body;
  return {
    from: normalizePhone(message.from),
    to: normalizePhone(message.to),
    text: message.text || message.message || '',
    providerMessageId: message.id || null,
  };
}

function normalizeStatus(body) {
  const message = body.message || body[0] || body;
  return {
    providerMessageId: message.id || null,
    status: mapGenericStatus(message.state || message.type),
    errorMessage: message.description || null,
  };
}

module.exports = {
  id: 'bandwidth',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapGenericStatus,
};
