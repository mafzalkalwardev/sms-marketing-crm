const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../../config/database');
const { encryptSecret } = require('../../utils/crypto');
const { getProviderStatus, sendTextMessage, normalizePhone } = require('../../services/smsService');

const router = express.Router();

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

router.get('/', async (req, res, next) => {
  try {
    const providers = await queryAll(
      'SELECT id, provider, label, status, is_default, created_at FROM providers ORDER BY created_at DESC'
    );
    res.json({ providers, vonage: vonageStatusPayload() });
  } catch (e) {
    next(e);
  }
});

router.get('/status', (req, res) => {
  res.json({ vonage: vonageStatusPayload() });
});

router.post('/', async (req, res, next) => {
  try {
    const { provider, label, api_key, api_secret, extra_config, account_sid } = req.body;
    if (!provider || !api_key || !api_secret) return res.status(400).json({ error: 'Provider type, API key, and secret are required' });

    const extra = account_sid ? JSON.stringify({ accountSid: account_sid }) : (extra_config || '');
    const encryptedKey = encryptSecret(api_key);
    const encryptedSecret = encryptSecret(api_secret);
    const encryptedExtra = extra ? encryptSecret(extra) : '';

    const providerRecord = await queryOne(
      `INSERT INTO providers (provider, label, encrypted_api_key, encrypted_api_secret, encrypted_extra_config, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)
       RETURNING id, provider, label, status, is_default, created_at`,
      [provider, label || provider, encryptedKey, encryptedSecret, encryptedExtra, req.user.id]
    );
    res.json(providerRecord);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { label, status, is_default, api_key, api_secret, extra_config, account_sid } = req.body;
    const provider = await queryOne('SELECT * FROM providers WHERE id = $1', [req.params.id]);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const updates = [];
    const values = [];
    let idx = 1;

    if (label) {
      updates.push(`label = $${idx}`);
      values.push(label);
      idx += 1;
    }
    if (status) {
      updates.push(`status = $${idx}`);
      values.push(status);
      idx += 1;
    }
    if (typeof is_default === 'boolean') {
      updates.push(`is_default = $${idx}`);
      values.push(is_default);
      idx += 1;
    }
    if (api_key) {
      updates.push(`encrypted_api_key = $${idx}`);
      values.push(encryptSecret(api_key));
      idx += 1;
    }
    if (api_secret) {
      updates.push(`encrypted_api_secret = $${idx}`);
      values.push(encryptSecret(api_secret));
      idx += 1;
    }
    if (account_sid || extra_config) {
      const extra = account_sid ? JSON.stringify({ accountSid: account_sid }) : (extra_config || '');
      updates.push(`encrypted_extra_config = $${idx}`);
      values.push(extra ? encryptSecret(extra) : '');
      idx += 1;
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await query(`UPDATE providers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);

    const updated = await queryOne(
      'SELECT id, provider, label, status, is_default, created_at FROM providers WHERE id = $1',
      [req.params.id]
    );
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM providers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/set-default', async (req, res, next) => {
  try {
    await withTransaction(async (tx) => {
      await tx.query('UPDATE providers SET is_default = FALSE');
      await tx.query('UPDATE providers SET is_default = TRUE WHERE id = $1', [req.params.id]);
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
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

router.post('/:id/test', async (req, res, next) => {
  try {
    const provider = await queryOne('SELECT * FROM providers WHERE id = $1', [req.params.id]);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    if (provider.provider === 'vonage') {
      res.json({ ok: true, provider: 'vonage', ...vonageStatusPayload() });
    } else if (provider.provider === 'twilio') {
      res.json({ ok: true, status: 'configured', note: 'Test connection - check Twilio console for API status', mock: true });
    } else {
      res.json({ ok: true, status: 'configured', note: 'Test connection placeholder for custom provider', mock: true });
    }
  } catch (e) {
    next(e);
  }
});

module.exports = router;
