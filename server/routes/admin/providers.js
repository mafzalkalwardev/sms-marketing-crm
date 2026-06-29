const express = require('express');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { getProviderStatus } = require('../../services/smsService');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

function maskValue(value, visible = 4) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= visible) return '*'.repeat(text.length);
  return `${'*'.repeat(Math.max(4, text.length - visible))}${text.slice(-visible)}`;
}

function vonageStatusPayload() {
  const status = getProviderStatus();
  const configuredPublicUrl = process.env.PUBLIC_BACKEND_URL || '';
  const publicUrlIsPlaceholder = configuredPublicUrl.includes('your-ngrok-url');
  const baseUrl = (publicUrlIsPlaceholder ? '' : configuredPublicUrl || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
  return {
    ...status,
    status: status.configured ? 'configured' : 'not_configured',
    apiKeyMasked: maskValue(process.env.VONAGE_API_KEY),
    defaultSenderMasked: maskValue(process.env.VONAGE_DEFAULT_FROM, 4),
    publicBackendUrlConfigured: Boolean(configuredPublicUrl && !publicUrlIsPlaceholder),
    webhookUrls: {
      inbound: `${baseUrl}/webhooks/vonage/inbound`,
      status: `${baseUrl}/webhooks/vonage/status`,
    },
  };
}

router.get('/status', (req, res) => {
  res.json({ vonage: vonageStatusPayload() });
});

module.exports = router;
