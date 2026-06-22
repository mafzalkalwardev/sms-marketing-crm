const express = require('express');
const { db } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { encryptSecret } = require('../../utils/crypto');
const { getProviderStatus, sendTextMessage, normalizePhone } = require('../../services/smsService');

const router = express.Router();
router.use(authenticate);

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

router.use(adminOnly);

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

router.get('/', (req, res) => {
  const providers = db.prepare('SELECT id, provider, label, status, is_default, created_at FROM providers ORDER BY created_at DESC').all();
  res.json({ providers, vonage: vonageStatusPayload() });
});

router.get('/status', (req, res) => {
  res.json({ vonage: vonageStatusPayload() });
});

router.post('/', (req, res) => {
  const { provider, label, api_key, api_secret, extra_config, account_sid } = req.body;
  if (!provider || !api_key || !api_secret) return res.status(400).json({ error: 'Provider type, API key, and secret are required' });

  const extra = account_sid ? JSON.stringify({ accountSid: account_sid }) : (extra_config || '');

  try {
    const encryptedKey = encryptSecret(api_key);
    const encryptedSecret = encryptSecret(api_secret);
    const encryptedExtra = extra ? encryptSecret(extra) : '';
    const result = db.prepare(
      'INSERT INTO providers (provider, label, encrypted_api_key, encrypted_api_secret, encrypted_extra_config, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(provider, label || provider, encryptedKey, encryptedSecret, encryptedExtra, 'active', req.user.id);
    const providerRecord = db.prepare('SELECT id, provider, label, status, is_default, created_at FROM providers WHERE id = ?').get(result.lastInsertRowid);
    res.json(providerRecord);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save provider: ' + error.message });
  }
});

router.put('/:id', (req, res) => {
  const { label, status, is_default, api_key, api_secret, extra_config, account_sid } = req.body;
  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  const updates = [];
  const values = [];

  if (label) { updates.push('label = ?'); values.push(label); }
  if (status) { updates.push('status = ?'); values.push(status); }
  if (typeof is_default === 'boolean') { updates.push('is_default = ?'); values.push(is_default ? 1 : 0); }
  if (api_key) { updates.push('encrypted_api_key = ?'); values.push(encryptSecret(api_key)); }
  if (api_secret) { updates.push('encrypted_api_secret = ?'); values.push(encryptSecret(api_secret)); }
  if (account_sid || extra_config) {
    const extra = account_sid ? JSON.stringify({ accountSid: account_sid }) : (extra_config || '');
    updates.push('encrypted_extra_config = ?');
    values.push(extra ? encryptSecret(extra) : '');
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE providers SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT id, provider, label, status, is_default, created_at FROM providers WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM providers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/set-default', (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('UPDATE providers SET is_default = 0').run();
    db.prepare('UPDATE providers SET is_default = 1 WHERE id = ?').run(req.params.id);
  });
  tx();
  res.json({ ok: true });
});

router.post('/vonage/test', (req, res) => {
  res.json({ ok: true, provider: 'vonage', ...vonageStatusPayload() });
});

router.post('/vonage/test-sms', async (req, res, next) => {
  try {
    const providerStatus = getProviderStatus();
    const from = normalizePhone(req.body.from || process.env.VONAGE_DEFAULT_FROM || '+15550009999');
    const result = await sendTextMessage({
      user: req.user,
      to: req.body.to,
      from,
      message: req.body.message || 'SignalMint Vonage live test',
      contactName: 'Vonage live test',
      workspaceId: 1,
      allowEnvSender: true,
      isTest: true,
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: providerStatus.mode === 'live' ? result.mode : 'mock',
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      message: result.message,
      error: result.error,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test', (req, res) => {
  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  if (provider.provider === 'vonage') {
    res.json({ ok: true, provider: 'vonage', ...vonageStatusPayload() });
  } else if (provider.provider === 'twilio') {
    res.json({ ok: true, status: 'configured', note: 'Test connection - check Twilio console for API status', mock: true });
  } else {
    res.json({ ok: true, status: 'configured', note: 'Test connection placeholder for custom provider', mock: true });
  }
});

module.exports = router;
