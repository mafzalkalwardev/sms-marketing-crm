const { queryOne } = require('../../config/database');
const { decryptSecret } = require('../../utils/crypto');
const { getCatalogEntry } = require('./providerCatalog');
const { ADAPTERS } = require('./providerRegistry');
const vonageProvider = require('./vonageProvider');
const twilioProvider = require('./twilioProvider');
const mockProvider = require('./mockProvider');
const { shouldUseMockSend } = require('./sandbox');

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
      adapterType: 'api',
    };
  }

  const providerKey = providerRow.provider;
  const catalog = getCatalogEntry(providerKey);
  const adapterType = providerRow.adapter_type || catalog?.lane || 'api';
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
        credentials.authToken = credentials.apiSecret || credentials.apiKey;
      }
    } catch {
      credentials = {};
    }
  } else if (providerRow.encrypted_api_key) {
    try {
      credentials = {
        apiKey: decryptSecret(providerRow.encrypted_api_key),
        ...parseExtraConfig(providerRow),
      };
    } catch {
      credentials = {};
    }
  } else {
    credentials = { ...parseExtraConfig(providerRow) };
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

  return { providerId: providerRow.id, providerKey, adapter, credentials, adapterType };
}

function pickLiveAdapter() {
  if (vonageProvider.configuredForLive()) return { providerKey: 'vonage', adapter: vonageProvider, credentials: {} };
  if (twilioProvider.isConfigured({})) {
    return {
      providerKey: 'twilio',
      adapter: twilioProvider,
      credentials: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
      },
    };
  }
  return null;
}

async function resolveForProviderId(providerId) {
  const row = await getProviderRow(providerId);
  if (!row) {
    const error = new Error('Provider not found');
    error.status = 404;
    throw error;
  }
  return resolveCredentials(row);
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
    const envRow = {
      provider: number.provider,
      adapter_type: getCatalogEntry(number.provider)?.lane || 'api',
      is_enabled: true,
      status: 'active',
    };
    return resolveCredentials(envRow);
  }

  if (number) {
    const live = pickLiveAdapter();
    if (live) return { providerId: null, adapterType: 'api', ...live };
    return { providerId: null, providerKey: 'mock', adapter: mockProvider, credentials: {}, adapterType: 'api' };
  }

  const defaultRow = await getDefaultProviderRow();
  if (defaultRow) return resolveCredentials(defaultRow);

  const live = pickLiveAdapter();
  if (live) return { providerId: null, adapterType: 'api', ...live };

  return { providerId: null, providerKey: 'mock', adapter: mockProvider, credentials: {}, adapterType: 'api' };
}

async function sendViaResolved(resolved, { to, from, text }) {
  if (shouldUseMockSend(resolved)) {
    const mock = await mockProvider.sendSms({ to, from, text, provider: resolved.providerKey });
    return mock;
  }

  if (resolved.adapterType === 'browser') {
    const browserLane = require('./browserLaneDispatcher');
    return browserLane.sendViaBrowser({
      providerId: resolved.providerId,
      to,
      text,
    });
  }

  return resolved.adapter.sendSms({
    to,
    from,
    text,
    credentials: resolved.credentials,
  });
}

module.exports = {
  ADAPTERS,
  resolveForNumber,
  resolveForProviderId,
  resolveCredentials,
  getProviderRow,
  sendViaResolved,
  getDefaultProviderRow,
  pickLiveAdapter,
};
