const express = require('express');
const { queryOne } = require('../../config/database');
const browserProfileService = require('../../services/browserProfileService');
const {
  defaultSelectorsForAdapter,
  GOOGLE_VOICE_SELECTORS,
  ADVERTISER_SELECTORS,
} = require('../../services/browser/selectorTemplates');
const browserLane = require('../../services/providers/browserLaneDispatcher');

const router = express.Router();

router.get('/templates', (req, res) => {
  res.json({
    templates: {
      google_voice: { baseUrl: 'https://voice.google.com', selectors: GOOGLE_VOICE_SELECTORS },
      advertiser: { baseUrl: '', selectors: ADVERTISER_SELECTORS },
    },
  });
});

router.get('/', async (req, res, next) => {
  try {
    const profiles = await browserProfileService.listProfiles();
    res.json({ profiles });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const profile = await browserProfileService.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Browser profile not found' });
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { provider_id, adapter_id, label, base_url, engine, selectors } = req.body;
    if (!provider_id || !adapter_id) {
      return res.status(400).json({ error: 'provider_id and adapter_id are required' });
    }
    const provider = await queryOne('SELECT * FROM providers WHERE id = $1', [provider_id]);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const profile = await browserProfileService.createProfileForProvider({
      providerId: provider_id,
      adapterId: adapter_id,
      label: label || provider.label,
      baseUrl: base_url,
      engine: engine || 'playwright_persistent',
      selectors: selectors || defaultSelectorsForAdapter(adapter_id),
    });
    res.status(201).json(profile);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const profile = await browserProfileService.updateProfile(req.params.id, req.body);
    if (!profile) return res.status(404).json({ error: 'Browser profile not found' });
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/migrate-selectors', async (req, res, next) => {
  try {
    const { targetVersion } = req.body;
    if (!targetVersion) return res.status(400).json({ error: 'targetVersion is required (e.g. v2)' });
    const profile = await browserProfileService.migrateProfileSelectors(Number(req.params.id), targetVersion);
    res.json({ ok: true, profile });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/login', async (req, res, next) => {
  try {
    const result = await browserLane.startLoginSession(Number(req.params.id));
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/poll', async (req, res, next) => {
  try {
    const poll = await browserLane.pollInbound(Number(req.params.id));
    const inboundProcessor = require('../../services/inboundProcessor');
    const processed = [];
    for (const event of poll.inbound || []) {
      const { status, body } = await inboundProcessor.processInboundWebhook(
        poll.adapterId || 'browser',
        {
          from: event.from,
          to: event.to,
          text: event.text,
          messageId: event.providerMessageId || event.id,
        },
        { verified: true }
      );
      processed.push({ status, body });
    }
    res.json({ ...poll, processedCount: processed.length, processed });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/session', async (req, res, next) => {
  try {
    const result = await browserLane.getSessionStatus(Number(req.params.id));
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/test-send', async (req, res, next) => {
  try {
    const profile = await browserProfileService.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Browser profile not found' });
    const result = await browserLane.sendViaBrowser({
      profileId: profile.id,
      providerId: profile.provider_id,
      to: req.body.to,
      text: req.body.message || req.body.text || 'SignalMint browser lane test',
    });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
