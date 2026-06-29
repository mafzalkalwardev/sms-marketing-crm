const express = require('express');
const { queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sanitizeSendResult, sanitizeMessages } = require('../lib/sanitize');
const { normalizePhone, sendTextMessage } = require('../services/smsService');

const router = express.Router();
router.use(authenticate);

router.post('/send', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const to = normalizePhone(req.body.to);
    const message = String(req.body.message || '').trim();
    const result = await sendTextMessage({
      user: req.user,
      to,
      from: req.body.from,
      message,
      contactName: req.body.name,
      country: req.body.country || 'US',
      workspaceId,
    });

    res.status(result.ok ? 200 : 502).json(sanitizeSendResult(result));
  } catch (error) {
    next(error);
  }
});

router.get('/history/:phone', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const rows = await queryAll(
      `SELECT * FROM messages
       WHERE user_id = $1 AND (to_number = $2 OR from_number = $2)
       ORDER BY created_at ASC, id ASC`,
      [req.user.id, phone]
    );
    res.json(sanitizeMessages(rows));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
