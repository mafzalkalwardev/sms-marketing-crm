const vonageProvider = require('./providers/vonageProvider');
const twilioProvider = require('./providers/twilioProvider');
const { normalizePhone } = require('../lib/sms');

async function sendAuthSms({ to, message }) {
  const phone = normalizePhone(to);
  if (!phone) throw new Error('Invalid phone for SMS OTP');

  if (process.env.NODE_ENV !== 'production' || process.env.OTP_LOG_TO_CONSOLE === 'true') {
    console.log(`[sms:otp:dev] To: ${phone} | ${message}`);
    return { ok: true, channel: 'console' };
  }

  const from = process.env.AUTH_SMS_FROM || process.env.VONAGE_DEFAULT_FROM || process.env.TWILIO_DEFAULT_FROM;
  if (!from) {
    console.log(`[sms:otp:fallback] To: ${phone} | ${message}`);
    return { ok: true, channel: 'console' };
  }

  if (vonageProvider.configuredForLive({})) {
    const result = await vonageProvider.sendSms({
      credentials: {
        apiKey: process.env.VONAGE_API_KEY,
        apiSecret: process.env.VONAGE_API_SECRET,
      },
      from,
      to: phone,
      text: message,
    });
    return { ok: result.ok, channel: 'vonage', error: result.error };
  }

  if (twilioProvider.configuredForLive({})) {
    const result = await twilioProvider.sendSms({
      credentials: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
      },
      from,
      to: phone,
      text: message,
    });
    return { ok: result.ok, channel: 'twilio', error: result.error };
  }

  console.log(`[sms:otp:fallback] To: ${phone} | ${message}`);
  return { ok: true, channel: 'console' };
}

module.exports = { sendAuthSms };
