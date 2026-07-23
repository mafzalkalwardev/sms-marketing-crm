const vonageProvider = require('./providers/vonageProvider');
const twilioProvider = require('./providers/twilioProvider');
const { getWebhookBaseUrl } = require('./providers/providerRegistry');
const { resolvePublicBackendUrl } = require('../lib/publicUrl');

function envFlag(name, defaultTrue = true) {
  const value = process.env[name];
  if (value === undefined) return defaultTrue;
  return value !== 'false' && value !== '0';
}

function checkPublicBackendUrl() {
  const { ok, value, raw } = resolvePublicBackendUrl();
  return {
    ok,
    value,
    hint: ok
      ? null
      : 'Set PUBLIC_BACKEND_URL to your public API URL (e.g. https://signalmint-api.vercel.app)',
    source: ok && raw === process.env.RENDER_EXTERNAL_URL ? 'render' : (ok && raw.startsWith('https://') && process.env.VERCEL_URL ? 'vercel' : 'env'),
  };
}

function getLiveReadiness() {
  const sandboxMode = envFlag('SMS_SANDBOX_MODE', true);
  const publicBackendUrl = checkPublicBackendUrl();
  const vonageConfigured = vonageProvider.isConfigured({});
  const twilioConfigured = twilioProvider.isConfigured({});
  const vonageLive = vonageProvider.configuredForLive({});
  const twilioLive = twilioProvider.configuredForLive({});
  const vonageSignature = Boolean(process.env.VONAGE_SIGNATURE_SECRET);
  const twilioToken = Boolean(process.env.TWILIO_AUTH_TOKEN);
  const twilioFrom = Boolean(process.env.TWILIO_DEFAULT_FROM || process.env.AUTH_SMS_FROM);

  const vonageReady = vonageLive && vonageSignature && publicBackendUrl.ok && !sandboxMode;
  const twilioReady = twilioLive && twilioToken && twilioFrom && publicBackendUrl.ok && !sandboxMode;

  const blockers = [];
  if (sandboxMode) blockers.push('SMS_SANDBOX_MODE is on — set SMS_SANDBOX_MODE=false for live delivery');
  if (!publicBackendUrl.ok) blockers.push('PUBLIC_BACKEND_URL missing or placeholder');
  if (!vonageConfigured && !twilioConfigured) blockers.push('No live provider credentials (Vonage or Twilio)');
  if (vonageConfigured && !vonageSignature) blockers.push('VONAGE_SIGNATURE_SECRET missing for signed webhooks');
  if (twilioConfigured && !twilioToken) blockers.push('TWILIO_AUTH_TOKEN missing');
  if (twilioConfigured && !twilioFrom) blockers.push('TWILIO_DEFAULT_FROM missing — buy/assign an SMS number in Twilio');

  return {
    sandboxMode,
    deliveryMode: sandboxMode ? 'sandbox' : (vonageReady || twilioReady ? 'live' : 'partial'),
    publicBackendUrl,
    webhookBaseUrl: getWebhookBaseUrl(),
    vonage: {
      credentials: vonageConfigured,
      signatureSecret: vonageSignature,
      ready: vonageReady,
    },
    twilio: {
      credentials: twilioConfigured,
      authToken: twilioToken,
      defaultFrom: twilioFrom,
      ready: twilioReady,
    },
    readyForLive: !sandboxMode && (vonageReady || twilioReady),
    blockers: [...new Set(blockers)],
  };
}

module.exports = { getLiveReadiness, checkPublicBackendUrl };
