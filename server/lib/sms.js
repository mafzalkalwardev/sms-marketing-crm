const { Vonage } = require('@vonage/server-sdk');

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^\d+]/g, '');
}

function isValidPhone(phone) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(phone));
}

function countSegments(text) {
  const message = String(text || '');
  const isUnicode = /[^\x00-\x7F]/.test(message);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;
  if (message.length <= singleLimit) return 1;
  return Math.ceil(message.length / multiLimit);
}

function estimateCost(segments, country = 'US') {
  const rates = { US: 0.008, UK: 0.045 };
  return Number((segments * (rates[country] || rates.US)).toFixed(4));
}

function vonageConfigured() {
  return Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET);
}

async function sendSms({ to, from, text }) {
  if (!vonageConfigured()) {
    return {
      mode: 'mock',
      messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'sent_mock',
    };
  }

  const vonage = new Vonage({
    apiKey: process.env.VONAGE_API_KEY,
    apiSecret: process.env.VONAGE_API_SECRET,
  });

  const response = await vonage.sms.send({ to, from, text });
  const message = response?.messages?.[0] || response;
  return {
    mode: 'vonage',
    messageId: message?.['message-id'] || message?.messageId || `vonage_${Date.now()}`,
    status: message?.status === '0' || message?.status === 0 ? 'sent' : 'accepted',
    raw: response,
  };
}

module.exports = {
  normalizePhone,
  isValidPhone,
  countSegments,
  estimateCost,
  vonageConfigured,
  sendSms,
};
