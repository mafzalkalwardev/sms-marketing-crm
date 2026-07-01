const { MESSAGE_STATUSES } = require('./ProviderAdapter');

function mockSend({ provider } = {}) {
  return {
    ok: true,
    provider: provider || 'mock',
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
  sendSms: async (params = {}) => mockSend(params),
  normalizeInbound: (body) => ({
    from: body.from,
    to: body.to,
    text: body.text || body.message || '',
    providerMessageId: body.messageId || body.id || null,
  }),
  normalizeStatus: (body) => ({
    providerMessageId: body.messageId || body.id || null,
    status: body.status || MESSAGE_STATUSES.DELIVERED,
    errorMessage: body.error || null,
  }),
  mapStatus: (status) => {
    const value = String(status ?? '').toLowerCase();
    if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
    if (value === 'failed') return MESSAGE_STATUSES.FAILED;
    return MESSAGE_STATUSES.SENT;
  },
};
