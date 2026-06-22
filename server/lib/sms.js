const smsService = require('../services/smsService');
const vonageProvider = require('../services/providers/vonageProvider');

async function sendSms({ to, from, text }) {
  if (!vonageProvider.configuredForLive()) {
    return {
      mode: 'mock',
      messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'sent_mock',
    };
  }

  const result = await vonageProvider.sendSms({ to, from, text });
  return {
    mode: result.mode,
    messageId: result.providerMessageId,
    status: result.status || (result.ok ? 'accepted' : 'failed'),
    error: result.error,
    raw: result.raw,
  };
}

module.exports = {
  normalizePhone: smsService.normalizePhone,
  isValidPhone: smsService.isValidPhone,
  countSegments: smsService.countSegments,
  estimateCost: smsService.estimateCost,
  vonageConfigured: vonageProvider.configuredForLive,
  sendSms,
};
