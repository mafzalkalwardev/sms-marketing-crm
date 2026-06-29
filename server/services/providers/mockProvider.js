const { MESSAGE_STATUSES } = require('./ProviderAdapter');

function mockSend() {
  return {
    ok: true,
    provider: 'mock',
    mode: 'mock',
    providerMessageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: MESSAGE_STATUSES.SENT_MOCK,
  };
}

module.exports = {
  id: 'mock',
  lane: 'api',
  isConfigured: () => true,
  configuredForLive: () => false,
  sendSms: async () => mockSend(),
};
