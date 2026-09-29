const vonageProvider = require('./vonageProvider');
const twilioProvider = require('./twilioProvider');
const telnyxProvider = require('./telnyxProvider');
const clicksendProvider = require('./clicksendProvider');
const bandwidthProvider = require('./bandwidthProvider');
const zoomProvider = require('./zoomProvider');
const tcxProvider = require('./tcxProvider');
const ringoxProvider = require('./ringoxProvider');
const sentProvider = require('./sentProvider');
const mockProvider = require('./mockProvider');
const esimProvider = require('./esimProvider');
const { createBrowserDialerProvider } = require('./browserDialerProvider');
const { listCatalog } = require('./providerCatalog');
const { resolvePublicBackendUrl } = require('../../lib/publicUrl');

const googleVoiceProvider = createBrowserDialerProvider('google_voice', 'Google Voice');
const advertiserProvider = createBrowserDialerProvider('advertiser', 'Advertiser Web Dialer');

const ADAPTERS = {
  mock: mockProvider,
  vonage: vonageProvider,
  twilio: twilioProvider,
  telnyx: telnyxProvider,
  clicksend: clicksendProvider,
  bandwidth: bandwidthProvider,
  zoom: zoomProvider,
  ringox: ringoxProvider,
  '3cx': tcxProvider,
  sent: sentProvider,
  google_voice: googleVoiceProvider,
  advertiser: advertiserProvider,
  esim: esimProvider,
};

const API_WEBHOOK_PROVIDERS = [
  'vonage',
  'twilio',
  'telnyx',
  'clicksend',
  'bandwidth',
  'zoom',
  'ringox',
  '3cx',
  'sent',
  'mock',
];

function getAdapter(providerId) {
  return ADAPTERS[providerId] || null;
}

function getWebhookBaseUrl() {
  const { ok, value } = resolvePublicBackendUrl();
  if (!ok) {
    return `http://localhost:${process.env.PORT || 5000}`;
  }
  return value;
}

function webhookUrlsForProvider(providerId) {
  const base = getWebhookBaseUrl();
  return {
    inbound: `${base}/webhooks/${providerId}/inbound`,
    status: `${base}/webhooks/${providerId}/status`,
  };
}

function allWebhookUrls() {
  return API_WEBHOOK_PROVIDERS.reduce((acc, providerId) => {
    acc[providerId] = webhookUrlsForProvider(providerId);
    return acc;
  }, {});
}

function catalogWithWebhooks() {
  return listCatalog().map((entry) => ({
    ...entry,
    webhooks: entry.lane === 'api' ? webhookUrlsForProvider(entry.id) : null,
  }));
}

module.exports = {
  ADAPTERS,
  API_WEBHOOK_PROVIDERS,
  getAdapter,
  getWebhookBaseUrl,
  webhookUrlsForProvider,
  allWebhookUrls,
  catalogWithWebhooks,
};
