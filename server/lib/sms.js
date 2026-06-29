const smsService = require('../services/smsService');
const vonageProvider = require('../services/providers/vonageProvider');
const providerRouter = require('../services/providers/providerRouter');

async function sendSms({ to, from, text }) {
  const resolved = await providerRouter.resolveForNumber(from);
  const result = await providerRouter.sendViaResolved(resolved, { to, from, text });
  return {
    mode: result.mode || 'mock',
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
