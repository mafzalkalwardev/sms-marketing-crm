const express = require('express');
const { authenticate } = require('../middleware/auth');
const esimService = require('../services/esimService');

const router = express.Router();
router.use(authenticate);

router.get('/profiles', async (req, res, next) => {
  try {
    const profiles = await esimService.listProfilesForUser(req.user.id);
    res.json({ profiles });
  } catch (error) {
    next(error);
  }
});

router.post('/profiles', async (req, res, next) => {
  try {
    const { phone_number: phoneNumber, phoneNumber: phoneNumberAlt, lpa, label, qrImageBase64 } = req.body || {};
    let qrBuffer = null;

    if (qrImageBase64) {
      const raw = String(qrImageBase64).replace(/^data:image\/\w+;base64,/, '');
      qrBuffer = Buffer.from(raw, 'base64');
      if (!qrBuffer.length) {
        return res.status(400).json({ error: 'Invalid QR image data' });
      }
    }

    const profile = await esimService.createProfile(req.user, {
      phoneNumber: phoneNumber || phoneNumberAlt,
      lpa,
      label,
      qrBuffer,
    });
    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
});

router.post('/profiles/:id/pairing-code', async (req, res, next) => {
  try {
    const result = await esimService.mintPairingCode(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/profiles/:id', async (req, res, next) => {
  try {
    const result = await esimService.disableProfile(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
