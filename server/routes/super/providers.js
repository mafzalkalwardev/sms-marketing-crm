const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../../config/database');
const { encryptSecret } = require('../../utils/crypto');
const { getProviderStatus, sendTextMessage, normalizePhone } = require('../../services/smsService');
const { listCatalog, getCatalogEntry } = require('../../services/providers/providerCatalog');
const { catalogWithWebhooks, allWebhookUrls } = require('../../services/providers/providerRegistry');
const {
  testProviderConnection,
  sendWarmupMessage,
  connectProvider,
  WARMUP_MESSAGE,
} = require('../../services/providerConnectionService');
const { getLiveReadiness } = require('../../services/liveReadinessService');

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

router.get('/catalog', (req, res) => {
  res.json({ catalog: catalogWithWebhooks(), webhooks: allWebhookUrls() });
});

router.get('/', async (req, res, next) => {
  try {
    const providers = await queryAll(
      'SELECT id, provider, label, adapter_type, status, is_default, is_enabled, health_ok, health_checked_at, health_error, health_mode, created_at FROM providers ORDER BY created_at DESC'
    );
    const enriched = providers.map((row) => ({
      ...row,
      catalog: getCatalogEntry(row.provider),
    }));
    res.json({ providers: enriched, platform: getProviderStatus(), vonage: vonageStatusPayload() });
  } catch (e) {
    next(e);
  }
});

router.get('/status', (req, res) => {
  res.json({
    platform: getProviderStatus(),
    liveReadiness: getLiveReadiness(),
    vonage: vonageStatusPayload(),
  });
});

function buildExtraConfig(provider, body) {
  const { account_sid, base_url, application_id, account_id, extra_config } = body;
  if (extra_config) return extra_config;
  if (provider === 'bandwidth') {
    return JSON.stringify({
      accountId: account_id || account_sid,
      applicationId: application_id,
    });
  }
  if (provider === 'zoom') {
    return JSON.stringify({ accountId: account_id || account_sid });
  }
  if (['3cx', 'ringox'].includes(provider) && base_url) {
    return JSON.stringify({ baseUrl: base_url });
  }
  if (account_sid) return JSON.stringify({ accountSid: account_sid });
  if (base_url) return JSON.stringify({ baseUrl: base_url });
  return '';
}

router.post('/', async (req, res, next) => {
  try {
    const {
      provider,
      label,
      api_key,
      api_secret,
      extra_config,
      account_sid,
      account_id,
      application_id,
      adapter_type,
      base_url,
      warmup_to,
      warmup_from,
      send_warmup,
      warmup_message,
    } = req.body;
    const catalog = getCatalogEntry(provider);
    if (!provider || !catalog) return res.status(400).json({ error: 'Unknown provider type' });

    const lane = adapter_type || catalog.lane || 'api';
    if (lane === 'api' && provider === 'telnyx' && !api_key) {
      return res.status(400).json({ error: 'Telnyx API key is required' });
    }
    if (lane === 'api' && ['3cx', 'ringox'].includes(provider) && (!api_key || !base_url)) {
      return res.status(400).json({ error: 'API token and base URL are required for this dialer' });
    }
    if (lane === 'api' && !['telnyx', '3cx', 'ringox'].includes(provider) && (!api_key || !api_secret)) {
      return res.status(400).json({ error: 'API key and secret are required for API dialers' });
    }
    if (lane === 'browser' && !base_url) {
      return res.status(400).json({ error: 'Base URL is required for browser dialers' });
    }

    const extra = buildExtraConfig(provider, {
      account_sid,
      account_id,
      application_id,
      base_url,
      extra_config,
    });
    const encryptedKey = api_key ? encryptSecret(api_key) : '';
    const encryptedSecret = api_secret ? encryptSecret(api_secret) : (api_key && lane === 'browser' ? encryptSecret('browser-profile') : '');
    const encryptedExtra = extra ? encryptSecret(extra) : '';

    const existingCount = await queryOne('SELECT COUNT(*)::int AS count FROM providers');
    const makeDefault = (existingCount?.count || 0) === 0;

    const providerRecord = await queryOne(
      `INSERT INTO providers (provider, label, adapter_type, encrypted_api_key, encrypted_api_secret, encrypted_extra_config, status, is_default, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
       RETURNING id, provider, label, adapter_type, status, is_default, is_enabled, created_at`,
      [provider, label || catalog.label, lane, encryptedKey, encryptedSecret, encryptedExtra, makeDefault, req.user.id]
    );

    const fullRow = await queryOne('SELECT * FROM providers WHERE id = $1', [providerRecord.id]);

    let browserProfile = null;
    if (lane === 'browser') {
      const browserProfileService = require('../../services/browserProfileService');
      browserProfile = await browserProfileService.createProfileForProvider({
        providerId: providerRecord.id,
        adapterId: provider,
        label: label || catalog.label,
        baseUrl: base_url,
        engine: req.body.engine || 'playwright_persistent',
        selectors: req.body.selectors,
      });
    }

    const connection = await testProviderConnection(fullRow);

    const shouldWarmup = send_warmup !== false && Boolean(warmup_to);
    let warmup = null;
    if (shouldWarmup) {
      try {
        const warmupResult = await sendWarmupMessage({
          user: req.user,
          providerId: providerRecord.id,
          to: warmup_to,
          from: warmup_from,
          message: warmup_message || WARMUP_MESSAGE,
        });
        warmup = { ...warmupResult.warmup, ok: warmupResult.ok };
      } catch (error) {
        warmup = { ok: false, error: error.message };
      }
    }

    res.status(connection.ok ? 201 : 502).json({
      ...providerRecord,
      catalog,
      connection,
      warmup,
      browserProfile,
    });
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

router.post('/:id/connect', async (req, res, next) => {
  try {
    const result = await connectProvider({
      user: req.user,
      providerId: Number(req.params.id),
      warmupTo: req.body.warmup_to,
      from: req.body.warmup_from || req.body.from,
      message: req.body.warmup_message || req.body.message,
      skipWarmup: req.body.skip_warmup === true,
    });
    res.status(result.connection.ok ? 200 : 502).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/warmup', async (req, res, next) => {
  try {
    const result = await sendWarmupMessage({
      user: req.user,
      providerId: Number(req.params.id),
      to: req.body.to || req.body.warmup_to,
      from: req.body.from || req.body.warmup_from,
      message: req.body.message || req.body.warmup_message,
    });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    next(error);
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

    const connection = await testProviderConnection(provider);
    res.status(connection.ok ? 200 : 502).json(connection);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
