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
  const sandboxMode = envFlag('SMS_SANDBOX_MODE', true) || vonageProvider.isMockMode();
  const publicBackendUrl = checkPublicBackendUrl();
  const vonageLive = vonageProvider.configuredForLive({});
  const twilioLive = twilioProvider.configuredForLive({});
  const vonageSignature = Boolean(process.env.VONAGE_SIGNATURE_SECRET);
  const twilioToken = Boolean(process.env.TWILIO_AUTH_TOKEN);

  const vonageReady = vonageLive && vonageSignature && publicBackendUrl.ok && !sandboxMode;
  const twilioReady = twilioLive && twilioToken && publicBackendUrl.ok && !sandboxMode;

  const blockers = [];
  if (sandboxMode) blockers.push('SMS_SANDBOX_MODE is on — set SMS_SANDBOX_MODE=false for live delivery');
  if (!publicBackendUrl.ok) blockers.push('PUBLIC_BACKEND_URL missing or placeholder');
  if (!vonageLive && !twilioLive) blockers.push('No live provider credentials (Vonage or Twilio)');
  if (vonageLive && !vonageSignature) blockers.push('VONAGE_SIGNATURE_SECRET missing for signed webhooks');
  if (twilioLive && !twilioToken) blockers.push('TWILIO_AUTH_TOKEN missing');

  return {
    sandboxMode,
    deliveryMode: sandboxMode ? 'sandbox' : (vonageReady || twilioReady ? 'live' : 'partial'),
    publicBackendUrl,
    webhookBaseUrl: getWebhookBaseUrl(),
    vonage: {
      credentials: vonageLive,
      signatureSecret: vonageSignature,
      ready: vonageReady,
    },
    twilio: {
      credentials: twilioLive,
      authToken: twilioToken,
      ready: twilioReady,
    },
    readyForLive: blockers.length === 0 || (!sandboxMode && (vonageReady || twilioReady)),
    blockers,
  };
}

module.exports = { getLiveReadiness, checkPublicBackendUrl };
