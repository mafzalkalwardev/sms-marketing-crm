const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
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

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: result.mode,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      message: result.message,
      status: result.status,
      conversationId: result.conversation.id,
      error: result.error,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history/:phone', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const phone = normalizePhone(req.params.phone);
  const rows = db.prepare(
    `SELECT * FROM messages
     WHERE user_id = ? AND (to_number = ? OR from_number = ?)
     ORDER BY datetime(created_at) ASC, id ASC`
  ).all(req.user.id, phone, phone);
  res.json(rows);
});

module.exports = router;
