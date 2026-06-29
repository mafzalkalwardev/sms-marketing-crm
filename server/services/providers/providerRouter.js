const { queryOne } = require('../../config/database');
const { decryptSecret } = require('../../utils/crypto');
const vonageProvider = require('./vonageProvider');
const twilioProvider = require('./twilioProvider');
const mockProvider = require('./mockProvider');

const ADAPTERS = {
  mock: mockProvider,
  vonage: vonageProvider,
  twilio: twilioProvider,
};

function parseExtraConfig(row) {
  if (!row?.encrypted_extra_config) return {};
  try {
    return JSON.parse(decryptSecret(row.encrypted_extra_config));
  } catch {
    return {};
  }
}

async function getProviderRow(providerId) {
  if (!providerId) return null;
  return queryOne('SELECT * FROM providers WHERE id = $1 AND is_enabled = TRUE', [providerId]);
}

async function getDefaultProviderRow() {
  return queryOne(
    "SELECT * FROM providers WHERE is_enabled = TRUE AND status = 'active' ORDER BY is_default DESC, id ASC LIMIT 1"
  );
}

async function resolveCredentials(providerRow) {
  if (!providerRow) {
    return {
      providerId: null,
      providerKey: 'mock',
      adapter: mockProvider,
      credentials: {},
    };
  }

  const providerKey = providerRow.provider;
  const adapter = ADAPTERS[providerKey] || mockProvider;
  let credentials = {};

  if (providerRow.encrypted_api_key && providerRow.encrypted_api_secret) {
    try {
      credentials = {
        apiKey: decryptSecret(providerRow.encrypted_api_key),
        apiSecret: decryptSecret(providerRow.encrypted_api_secret),
        ...parseExtraConfig(providerRow),
      };
      if (credentials.accountSid) {
        credentials.authToken = credentials.apiSecret;
      }
    } catch {
      credentials = {};
    }
  }

  if (providerKey === 'vonage' && !credentials.apiKey) {
    credentials = {
      apiKey: process.env.VONAGE_API_KEY,
      apiSecret: process.env.VONAGE_API_SECRET,
    };
  }
  if (providerKey === 'twilio' && !credentials.accountSid) {
    credentials = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
    };
  }

  return { providerId: providerRow.id, providerKey, adapter, credentials, adapterType: providerRow.adapter_type || 'api' };
}

async function resolveForNumber(fromNumber) {
  const number = await queryOne(
    "SELECT * FROM numbers WHERE phone_number = $1 AND status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1",
    [fromNumber]
  );

  if (number?.provider_id) {
    const row = await getProviderRow(number.provider_id);
    if (row) return resolveCredentials(row);
  }

  if (number?.provider && ADAPTERS[number.provider]) {
    const envRow = { provider: number.provider, adapter_type: 'api', is_enabled: true, status: 'active' };
    return resolveCredentials(envRow);
  }

  if (number) {
    if (vonageProvider.configuredForLive()) {
      return { providerId: null, providerKey: 'vonage', adapter: vonageProvider, credentials: {}, adapterType: 'api' };
    }
    return { providerId: null, providerKey: 'mock', adapter: mockProvider, credentials: {}, adapterType: 'api' };
  }

  const defaultRow = await getDefaultProviderRow();
  if (defaultRow) return resolveCredentials(defaultRow);

  if (vonageProvider.configuredForLive()) {
    return { providerId: null, providerKey: 'vonage', adapter: vonageProvider, credentials: {}, adapterType: 'api' };
  }

  return { providerId: null, providerKey: 'mock', adapter: mockProvider, credentials: {}, adapterType: 'api' };
}

async function sendViaResolved(resolved, { to, from, text }) {
  if (resolved.adapterType === 'browser') {
    const browserLane = require('./browserLaneDispatcher');
    return browserLane.sendViaBrowser({ profileId: resolved.providerId, to, text });
  }

  if (resolved.providerKey === 'vonage') {
    if (!vonageProvider.configuredForLive()) return mockProvider.sendSms({ to, from, text });
    return vonageProvider.sendSms({ to, from, text });
  }

  if (resolved.providerKey === 'twilio') {
    if (!twilioProvider.isConfigured(resolved.credentials)) return mockProvider.sendSms({ to, from, text });
    return twilioProvider.sendSms({ to, from, text, credentials: resolved.credentials });
  }

  return mockProvider.sendSms({ to, from, text });
}

module.exports = {
  ADAPTERS,
  resolveForNumber,
  sendViaResolved,
  getDefaultProviderRow,
};
