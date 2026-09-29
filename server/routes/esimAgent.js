const express = require('express');
const esimService = require('../services/esimService');
const { processInboundWebhook } = require('../services/inboundProcessor');
const { normalizePhone } = require('../lib/sms');

const router = express.Router();

async function requireAgent(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-esim-agent-token'] || '');
    const profile = await esimService.authenticateAgent(token);
    if (!profile) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }
    req.esimProfile = profile;
    next();
  } catch (error) {
    next(error);
  }
}

router.post('/pair', async (req, res, next) => {
  try {
    const { pairingCode, pairing_code: pairingCodeAlt, deviceId, device_id: deviceIdAlt } = req.body || {};
    const result = await esimService.pairAgent({
      pairingCode: pairingCode || pairingCodeAlt,
      deviceId: deviceId || deviceIdAlt,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/jobs', requireAgent, async (req, res, next) => {
  try {
    const jobs = await esimService.claimJobs(req.esimProfile, { limit: req.query.limit });
    res.json({
      jobs,
      phoneNumber: req.esimProfile.phone_number,
      profileId: req.esimProfile.id,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/jobs/:id/status', requireAgent, async (req, res, next) => {
  try {
    const result = await esimService.completeJob(req.esimProfile, Number(req.params.id), {
      status: req.body?.status,
      errorMessage: req.body?.error || req.body?.errorMessage || null,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/inbound', requireAgent, async (req, res, next) => {
  try {
    const from = normalizePhone(req.body?.from);
    const to = normalizePhone(req.body?.to || req.esimProfile.phone_number);
    const text = String(req.body?.text || req.body?.message || req.body?.body || '');
    const providerMessageId = req.body?.providerMessageId || req.body?.messageId || `esim_in_${Date.now()}`;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required' });
    }

    const result = await processInboundWebhook('esim', {
      from,
      to,
      text,
      providerMessageId,
      id: providerMessageId,
    }, { verified: true });

    res.status(result.status || 200).json(result.body || result);
  } catch (error) {
    next(error);
  }
});

router.get('/health', requireAgent, async (req, res) => {
  res.json({
    ok: true,
    profileId: req.esimProfile.id,
    phoneNumber: req.esimProfile.phone_number,
    status: req.esimProfile.status,
    lastSeenAt: req.esimProfile.last_seen_at,
  });
});

module.exports = router;
