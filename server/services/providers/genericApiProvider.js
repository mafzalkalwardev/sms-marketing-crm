const { MESSAGE_STATUSES } = require('./ProviderAdapter');

function createGenericProvider(id, label) {
  return {
    id,
    lane: 'api',
    label,
    isConfigured: (credentials = {}) => Boolean(credentials.apiKey || credentials.accountSid),
    configuredForLive: () => false,
    sendSms: async () => ({
      ok: false,
      provider: id,
      mode: 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: `${label} adapter is registered but live send is not configured yet. Use Vonage or Twilio for production SMS.`,
    }),
  };
}

module.exports = { createGenericProvider };
