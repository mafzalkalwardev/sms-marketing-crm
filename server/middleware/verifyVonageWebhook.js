const vonageProvider = require('../services/providers/vonageProvider');

function verifyVonageWebhook(req, res, next) {
  const result = vonageProvider.verifySignedWebhook(req);
  req.webhookVerified = result;

  if (result.ok) {
    if (result.reason === 'missing_secret') {
      console.warn('Vonage webhook signature secret missing; allowing webhook only outside production.');
    }
    return next();
  }

  return res.status(401).json({ error: 'Invalid Vonage webhook signature' });
}

module.exports = verifyVonageWebhook;
