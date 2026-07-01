const express = require('express');
const { requireWorkerToken } = require('../../middleware/workerAuth');
const browserProfileService = require('../../services/browserProfileService');
const browserLane = require('../../services/providers/browserLaneDispatcher');

const router = express.Router();
router.use(requireWorkerToken);

router.get('/health', async (req, res) => {
  const worker = await browserLane.checkWorkerHealth();
  res.json({ ok: true, node: true, worker });
});

router.get('/profiles/:id', async (req, res, next) => {
  try {
    const profile = await browserProfileService.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const payload = browserProfileService.buildWorkerPayload(profile, { to: '', text: '' });
    res.json({ profile: payload });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
