const twilioProvider = require('../services/providers/twilioProvider');

function verifyTwilioWebhook(req, res, next) {
  const result = twilioProvider.verifyWebhook(req);
  req.webhookVerified = result;
  if (!result.ok && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Invalid Twilio webhook signature' });
  }
  return next();
}

module.exports = verifyTwilioWebhook;
